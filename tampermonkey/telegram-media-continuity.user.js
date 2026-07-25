// ==UserScript==
// @name         Telegram Web A 媒体续播
// @namespace    telegram-air/media-continuity
// @version      0.2.1
// @description  为 Telegram Web A 提供频道媒体续播与自动连续播放能力
// @match        https://web.telegram.org/a/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const SCRIPT_ID = 'telegram-media-continuity';
  const STORAGE_KEY = 'tt.mediaContinuity.v1';
  const STORAGE_VERSION = 1;
  const MAX_POSITIONS = 100;
  const SCAN_DELAY_MS = 160;
  const NAVIGATION_TIMEOUT_MS = 2800;
  const INTERACTION_COOLDOWN_MS = 900;
  const DURATIONS = [2000, 3000, 5000, 8000, 10000, 15000, 30000];
  const DEFAULT_SETTINGS = Object.freeze({
    continuousEnabled: false,
    photoDurationMs: 5000,
    panelCollapsed: false,
  });

  const LABELS = Object.freeze({
    next: [
      'next', '下一', '下一个', '下一张', '下一项', 'след', 'далее', 'siguiente', 'suivant',
      'prochain', 'avanti', 'nächst', 'volgende', 'próximo', 'proximo', 'sonraki', 'التالي', 'بعدی',
    ],
    previous: [
      'previous', 'prev', '上一', '上一个', '上一张', '上一项', 'пред', 'назад', 'anterior',
      'précédent', 'precedent', 'indietro', 'zurück', 'vorige', 'önceki', 'السابق', 'قبلی',
    ],
    close: [
      'close', '关闭', '关掉', 'закры', 'cerrar', 'fermer', 'chiudi', 'schließen', 'sluiten',
      'fechar', 'kapat', 'إغلاق', 'بستن',
    ],
    channel: [
      'subscribers', 'subscriber', '订阅者', '訂閱者', 'подписчик', 'suscriptores', 'abonnés',
      'iscritti', 'abonnenten', 'assinantes', 'aboneler', 'مشترك', 'دنبال‌کننده',
    ],
  });

  const runtime = {
    session: undefined,
    rootObserver: undefined,
    scanTimer: 0,
    periodicTimer: 0,
    lastLocation: location.href,
    debugEnabled: false,
  };

  const mediaNodeIds = new WeakMap();
  let nextMediaNodeId = 1;

  function normalizeText(value) {
    return String(value || '').trim().toLocaleLowerCase();
  }

  function containsAny(value, tokens) {
    const normalized = normalizeText(value);
    return tokens.some((token) => normalized.includes(token));
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function debugLog(message, data) {
    if (!runtime.debugEnabled) return;
    if (data === undefined) console.debug(`[Telegram Media Continuity] ${message}`);
    else console.debug(`[Telegram Media Continuity] ${message}`, data);
  }

  function isElementVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && element.getAttribute('aria-hidden') !== 'true'
      && !element.hasAttribute('hidden');
  }

  function isClickable(element) {
    if (!(element instanceof HTMLElement) || !isElementVisible(element)) return false;
    if (element.matches(':disabled, [aria-disabled="true"]')) return false;
    return element.matches('button, a[href], [role="button"], [tabindex]')
      || typeof element.onclick === 'function';
  }

  function accessibleName(element) {
    if (!(element instanceof Element)) return '';
    return normalizeText([
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-tooltip'),
      element.textContent && element.textContent.length <= 80 ? element.textContent : '',
    ].filter(Boolean).join(' '));
  }

  function describeElement(element) {
    if (!(element instanceof Element)) return undefined;
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      title: element.getAttribute('title') || '',
      classNames: Array.from(element.classList).slice(0, 8),
      dataAttributes: Array.from(element.attributes)
        .filter((attribute) => attribute.name.startsWith('data-'))
        .slice(0, 8)
        .map((attribute) => attribute.name),
      rect: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      },
      buttonCount: element.querySelectorAll('button, [role="button"]').length,
      mediaCount: element.querySelectorAll('img, video').length,
    };
  }

  function safeUrl(href) {
    try {
      return new URL(href, location.href);
    } catch (error) {
      return undefined;
    }
  }

  function isSafeResumeUrl(href) {
    const url = safeUrl(href);
    return Boolean(url
      && url.protocol === 'https:'
      && ['t.me', 'telegram.me', 'web.telegram.org'].includes(url.hostname));
  }

  function threadKeyFromUrl(url) {
    const keys = ['thread', 'topic', 'threadId', 'topicId'];
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
    const queryIndex = url.hash.indexOf('?');
    if (queryIndex < 0) return '';
    const params = new URLSearchParams(url.hash.slice(queryIndex + 1));
    for (const key of keys) {
      const value = params.get(key);
      if (value) return value;
    }
    return '';
  }

  function parseMessageTarget(href) {
    const url = safeUrl(href);
    if (!url || !isSafeResumeUrl(url.href)) return undefined;

    if (url.hostname === 't.me' || url.hostname === 'telegram.me') {
      const parts = url.pathname.split('/').filter(Boolean);
      let channelKey;
      let messageKey;
      if (parts[0] === 'c' && /^\d+$/.test(parts[1] || '') && /^\d+$/.test(parts[2] || '')) {
        channelKey = `c:${parts[1]}`;
        messageKey = parts[2];
      } else if (/^[A-Za-z0-9_]+$/.test(parts[0] || '') && /^\d+$/.test(parts[1] || '')) {
        channelKey = `public:${parts[0].toLocaleLowerCase()}`;
        messageKey = parts[1];
      }
      if (!channelKey || !messageKey) return undefined;
      return {
        channelKey,
        topicKey: threadKeyFromUrl(url),
        messageKey,
        targetHref: url.href,
      };
    }

    const params = new URLSearchParams(url.search);
    const queryIndex = url.hash.indexOf('?');
    const hashParams = queryIndex >= 0
      ? new URLSearchParams(url.hash.slice(queryIndex + 1))
      : new URLSearchParams();
    const channel = params.get('channel') || params.get('chat')
      || hashParams.get('channel') || hashParams.get('chat');
    const message = params.get('message') || params.get('msg')
      || hashParams.get('message') || hashParams.get('msg');
    if (!channel || !/^\d+$/.test(message || '')) return undefined;
    return {
      channelKey: `web:${channel}`,
      topicKey: threadKeyFromUrl(url),
      messageKey: message,
      targetHref: url.href,
    };
  }

  function getAccountKey() {
    const url = safeUrl(location.href);
    const fromUrl = url && (url.searchParams.get('account') || url.searchParams.get('profile'));
    if (fromUrl && /^[A-Za-z0-9_-]{1,32}$/.test(fromUrl)) return `slot:${fromUrl}`;
    const element = document.querySelector(
      '[data-account-id][aria-current="true"], [data-account][aria-selected="true"]',
    );
    const value = element
      && (element.getAttribute('data-account-id') || element.getAttribute('data-account'));
    return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? `slot:${value}` : 'slot:default';
  }

  function defaultState() {
    return {
      version: STORAGE_VERSION,
      settings: { ...DEFAULT_SETTINGS },
      positions: [],
    };
  }

  function validateSettings(value) {
    const source = isPlainObject(value) ? value : {};
    return {
      continuousEnabled: typeof source.continuousEnabled === 'boolean'
        ? source.continuousEnabled
        : DEFAULT_SETTINGS.continuousEnabled,
      photoDurationMs: DURATIONS.includes(source.photoDurationMs)
        ? source.photoDurationMs
        : DEFAULT_SETTINGS.photoDurationMs,
      panelCollapsed: typeof source.panelCollapsed === 'boolean'
        ? source.panelCollapsed
        : DEFAULT_SETTINGS.panelCollapsed,
    };
  }

  function validatePosition(value) {
    if (!isPlainObject(value)) return undefined;
    const fields = ['scopeKey', 'accountKey', 'channelKey', 'topicKey', 'messageKey', 'targetHref'];
    if (fields.some((field) => typeof value[field] !== 'string')) return undefined;
    if (!value.scopeKey || !value.channelKey || !value.messageKey || !isSafeResumeUrl(value.targetHref)) {
      return undefined;
    }
    if (!Number.isInteger(value.albumIndex) || value.albumIndex < 0) return undefined;
    if (!Number.isFinite(value.updatedAt) || value.updatedAt <= 0) return undefined;
    return {
      scopeKey: value.scopeKey,
      accountKey: value.accountKey,
      channelKey: value.channelKey,
      topicKey: value.topicKey,
      messageKey: value.messageKey,
      albumIndex: value.albumIndex,
      targetHref: value.targetHref,
      updatedAt: value.updatedAt,
    };
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      debugLog('本地存储写入失败');
      return false;
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed) || parsed.version !== STORAGE_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        return defaultState();
      }
      const positions = Array.isArray(parsed.positions)
        ? parsed.positions.map(validatePosition).filter(Boolean)
        : [];
      const unique = new Map();
      positions
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .forEach((position) => {
          if (!unique.has(position.scopeKey)) unique.set(position.scopeKey, position);
        });
      const state = {
        version: STORAGE_VERSION,
        settings: validateSettings(parsed.settings),
        positions: Array.from(unique.values()).slice(0, MAX_POSITIONS),
      };
      if (state.positions.length !== positions.length) saveState(state);
      return state;
    } catch (error) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (removeError) {
        debugLog('清理损坏存储失败');
      }
      return defaultState();
    }
  }

  function updateSettings(patch) {
    const state = loadState();
    state.settings = validateSettings({ ...state.settings, ...patch });
    saveState(state);
    return state.settings;
  }

  function scopeKey(context) {
    return `${context.accountKey}|${context.channelKey}|${context.topicKey || ''}`;
  }

  function savePosition(context) {
    if (!context || !context.isConfirmedChannel || !context.targetHref) return false;
    const state = loadState();
    const position = {
      scopeKey: scopeKey(context),
      accountKey: context.accountKey,
      channelKey: context.channelKey,
      topicKey: context.topicKey || '',
      messageKey: context.messageKey,
      albumIndex: context.albumIndex || 0,
      targetHref: context.targetHref,
      updatedAt: Date.now(),
    };
    state.positions = [position, ...state.positions.filter((item) => item.scopeKey !== position.scopeKey)]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_POSITIONS);
    return saveState(state);
  }

  function getResumePosition(context) {
    if (!context) return undefined;
    return loadState().positions.find((position) => position.scopeKey === scopeKey(context));
  }

  function candidateButtons(root) {
    return Array.from(root.querySelectorAll('button, a[href], [role="button"], [tabindex]'))
      .filter((element) => !element.closest(`#${SCRIPT_ID}-host`))
      .filter(isClickable);
  }

  function findCloseButton(viewer) {
    let best;
    let bestScore = -Infinity;
    for (const button of candidateButtons(viewer)) {
      const name = accessibleName(button);
      const classText = normalizeText(`${button.className || ''} ${button.getAttribute('data-testid') || ''}`);
      const hasCloseCue = containsAny(name, LABELS.close) || classText.includes('close');
      if (!hasCloseCue) continue;
      const rect = button.getBoundingClientRect();
      const viewerRect = viewer.getBoundingClientRect();
      let score = 100;
      if (rect.top < viewerRect.top + 140) score += 6;
      if (rect.left < viewerRect.left + 180 || rect.right > viewerRect.right - 180) score += 4;
      if (score > bestScore) {
        bestScore = score;
        best = button;
      }
    }
    return best;
  }

  function findNavigationButton(viewer, direction) {
    const viewerRect = viewer.getBoundingClientRect();
    const expected = direction > 0 ? LABELS.next : LABELS.previous;
    const opposite = direction > 0 ? LABELS.previous : LABELS.next;
    let best;
    let bestScore = -Infinity;
    for (const button of candidateButtons(viewer)) {
      const name = accessibleName(button);
      const classText = normalizeText(`${button.className || ''} ${button.getAttribute('data-testid') || ''}`);
      const rect = button.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      let score = 0;
      if (containsAny(name, expected)) score += 100;
      if (containsAny(name, opposite) || containsAny(name, LABELS.close)) score -= 100;
      if (direction > 0 ? classText.includes('next') : classText.includes('prev')) score += 80;
      if (direction > 0
        ? centerX > viewerRect.left + viewerRect.width * 0.7
        : centerX < viewerRect.left + viewerRect.width * 0.3) score += 12;
      if (centerY > viewerRect.top + viewerRect.height * 0.2
        && centerY < viewerRect.bottom - viewerRect.height * 0.2) score += 8;
      if (rect.width <= 160 && rect.height <= 160) score += 3;
      if (rect.top < viewerRect.top + 120) score -= 8;
      if (score > bestScore) {
        bestScore = score;
        best = button;
      }
    }
    return bestScore >= 18 ? best : undefined;
  }

  function mediaScore(media, viewerRect) {
    if (!isElementVisible(media)) return -Infinity;
    const rect = media.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 90) return -Infinity;
    const centerX = viewerRect.left + viewerRect.width / 2;
    const centerY = viewerRect.top + viewerRect.height / 2;
    const mediaCenterX = rect.left + rect.width / 2;
    const mediaCenterY = rect.top + rect.height / 2;
    const maxDistance = Math.hypot(viewerRect.width, viewerRect.height) || 1;
    let score = Math.min((rect.width * rect.height) / 1000, 1000)
      - (Math.hypot(mediaCenterX - centerX, mediaCenterY - centerY) / maxDistance) * 500;
    if (media instanceof HTMLVideoElement && !media.paused) score += 300;
    if (rect.left <= centerX && rect.right >= centerX && rect.top <= centerY && rect.bottom >= centerY) {
      score += 400;
    }
    return score;
  }

  function findActiveMedia(viewer) {
    const viewerRect = viewer.getBoundingClientRect();
    let best;
    let bestScore = -Infinity;
    for (const media of viewer.querySelectorAll('img, video')) {
      const score = mediaScore(media, viewerRect);
      if (score > bestScore) {
        bestScore = score;
        best = media;
      }
    }
    return bestScore > -Infinity ? best : undefined;
  }

  function viewerScore(candidate) {
    if (!(candidate instanceof HTMLElement) || !isElementVisible(candidate)) return -Infinity;
    if (candidate.closest(`#${SCRIPT_ID}-host`)) return -Infinity;
    const rect = candidate.getBoundingClientRect();
    const coverage = (rect.width * rect.height) / Math.max(1, innerWidth * innerHeight);
    if (coverage < 0.28) return -Infinity;
    const style = getComputedStyle(candidate);
    let score = 0;
    if (candidate.tagName === 'DIALOG' || candidate.getAttribute('role') === 'dialog') score += 8;
    if (candidate.classList.contains('MediaViewer')) score += 8;
    if (style.position === 'fixed' || style.position === 'absolute') score += 4;
    if (coverage > 0.55) score += 5;
    if (findActiveMedia(candidate)) score += 8;
    if (findCloseButton(candidate)) score += 3;
    return score;
  }

  function findMediaViewer() {
    const candidates = new Set(document.querySelectorAll('dialog[open], [role="dialog"], .MediaViewer'));
    for (const media of document.querySelectorAll('img, video')) {
      if (!isElementVisible(media)) continue;
      const rect = media.getBoundingClientRect();
      if (rect.width * rect.height < innerWidth * innerHeight * 0.12) continue;
      let ancestor = media.parentElement;
      for (let depth = 0; ancestor && depth < 8; depth += 1) {
        const ancestorRect = ancestor.getBoundingClientRect();
        const style = getComputedStyle(ancestor);
        if (ancestor.tagName === 'DIALOG'
          || ancestor.getAttribute('role') === 'dialog'
          || style.position === 'fixed'
          || (ancestorRect.width > innerWidth * 0.7 && ancestorRect.height > innerHeight * 0.7)) {
          candidates.add(ancestor);
        }
        ancestor = ancestor.parentElement;
      }
    }
    let best;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const score = viewerScore(candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return bestScore >= 12 ? best : undefined;
  }

  function albumIndex(viewer, activeMedia) {
    const attributes = ['data-index', 'data-media-index', 'aria-posinset'];
    let current = activeMedia;
    for (let depth = 0; current && current !== viewer && depth < 5; depth += 1) {
      for (const attribute of attributes) {
        const value = Number.parseInt(current.getAttribute && current.getAttribute(attribute), 10);
        if (Number.isInteger(value) && value >= 0) {
          return attribute === 'aria-posinset' ? Math.max(0, value - 1) : value;
        }
      }
      current = current.parentElement;
    }
    for (const element of viewer.querySelectorAll('[aria-label], [title], span, div')) {
      if (!isElementVisible(element)) continue;
      const text = String(element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim();
      if (text.length > 24) continue;
      const match = text.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (match) return Math.max(0, Number.parseInt(match[1], 10) - 1);
    }
    return 0;
  }

  function messageIdFromAncestors(activeMedia, viewer) {
    const attributes = ['data-message-id', 'data-mid', 'data-msg-id', 'data-message'];
    let current = activeMedia;
    for (let depth = 0; current && current !== viewer && depth < 8; depth += 1) {
      for (const attribute of attributes) {
        const value = current.getAttribute && current.getAttribute(attribute);
        if (value && /^\d+$/.test(value)) return value;
      }
      const match = String(current.id || '').match(/(?:message|msg|media)[_-]?(\d+)/i);
      if (match) return match[1];
      current = current.parentElement;
    }
    return '';
  }

  function confirmedChannelContext() {
    const explicit = document.querySelector(
      '[data-peer-type="channel"], [data-chat-type="channel"], [data-type="channel"]',
    );
    if (explicit && isElementVisible(explicit)) return true;
    const headers = document.querySelectorAll(
      'header, [class*="ChatInfo"], [class*="chat-info"], [class*="MiddleHeader"], [class*="middle-header"]',
    );
    for (const header of Array.from(headers).slice(0, 24)) {
      if (!isElementVisible(header)) continue;
      if (containsAny(normalizeText(header.textContent).slice(0, 500), LABELS.channel)) return true;
    }
    return false;
  }

  function detectMediaContext(viewer, activeMedia) {
    const ancestorMessageId = messageIdFromAncestors(activeMedia, viewer);
    const viewerCandidates = Array.from(viewer.querySelectorAll('a[href]'))
      .map((anchor) => ({ anchor, parsed: parseMessageTarget(anchor.href) }))
      .filter((item) => item.parsed);

    let target;
    if (viewerCandidates.length) {
      const exact = ancestorMessageId
        ? viewerCandidates.find((item) => item.parsed.messageKey === ancestorMessageId)
        : undefined;
      target = (exact || viewerCandidates.find((item) => isElementVisible(item.anchor)) || viewerCandidates[0]).parsed;
    } else if (ancestorMessageId) {
      const documentCandidates = Array.from(
        document.querySelectorAll('a[href*="t.me/"], a[href*="telegram.me/"]'),
      ).slice(-400);
      for (const anchor of documentCandidates) {
        const parsed = parseMessageTarget(anchor.href);
        if (parsed && parsed.messageKey === ancestorMessageId) {
          target = parsed;
          break;
        }
      }
    }

    if (!target) return undefined;
    return {
      accountKey: getAccountKey(),
      channelKey: target.channelKey,
      topicKey: target.topicKey || '',
      messageKey: target.messageKey,
      albumIndex: albumIndex(viewer, activeMedia),
      targetHref: target.targetHref,
      isConfirmedChannel: confirmedChannelContext(),
    };
  }

  function mediaNodeId(media) {
    if (!mediaNodeIds.has(media)) {
      mediaNodeIds.set(media, nextMediaNodeId);
      nextMediaNodeId += 1;
    }
    return mediaNodeIds.get(media);
  }

  function fingerprint(media, context) {
    if (!media) return 'none';
    const source = media.currentSrc || media.src || '';
    return [
      media.tagName,
      mediaNodeId(media),
      context ? context.messageKey : '',
      context ? context.albumIndex : '',
      source.slice(-160),
    ].join('|');
  }

  function findMessageContainer(messageKey, targetHref) {
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(messageKey) : messageKey;
    for (const selector of [
      `[data-message-id="${escaped}"]`,
      `[data-mid="${escaped}"]`,
      `[data-msg-id="${escaped}"]`,
      `#message-${escaped}`,
      `#msg-${escaped}`,
    ]) {
      try {
        const element = document.querySelector(selector);
        if (element) return element;
      } catch (error) {
        // 选择器失效时继续使用官方消息链接回退。
      }
    }
    const expected = parseMessageTarget(targetHref);
    for (const anchor of document.querySelectorAll('a[href]')) {
      const parsed = parseMessageTarget(anchor.href);
      if (!parsed || parsed.messageKey !== messageKey) continue;
      if (expected && parsed.channelKey !== expected.channelKey) continue;
      return anchor.closest('[data-message-id], [data-mid], article, [class*="Message"], [class*="message"]')
        || anchor.parentElement;
    }
    return undefined;
  }

  function findResumeTarget(position) {
    if (!position || !isSafeResumeUrl(position.targetHref)) return undefined;
    const container = findMessageContainer(position.messageKey, position.targetHref);
    if (!container || !container.isConnected) return undefined;
    const mediaItems = Array.from(container.querySelectorAll('img, video')).filter((media) => {
      const rect = media.getBoundingClientRect();
      return rect.width >= 40 && rect.height >= 40;
    });
    const media = mediaItems[position.albumIndex] || mediaItems[0];
    return media && (media.closest('button, a[href], [role="button"], [tabindex]') || media);
  }

  function isMediaScaled(media, viewer) {
    let current = media;
    for (let depth = 0; current && current !== viewer && depth < 3; depth += 1) {
      const transform = getComputedStyle(current).transform;
      const match = transform && transform.match(/^matrix\(([^)]+)\)$/);
      if (match) {
        const values = match[1].split(',').map((value) => Number.parseFloat(value.trim()));
        const scaleX = Math.hypot(values[0], values[1]);
        const scaleY = Math.hypot(values[2], values[3]);
        if (Math.abs(scaleX - 1) > 0.08 || Math.abs(scaleY - 1) > 0.08) return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  function dispatchViewerEdgeClick(viewer, direction) {
    const slides = viewer.querySelector('.MediaViewerSlides') || viewer;
    const rect = slides.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100) return false;
    const clientX = direction > 0 ? rect.right - Math.max(18, rect.width * 0.06) : rect.left + Math.max(18, rect.width * 0.06);
    const clientY = rect.top + rect.height * 0.5;
    return slides.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      view: window,
    }));
  }

  function triggerOfficialNavigation(viewer, direction) {
    const button = findNavigationButton(viewer, direction);
    if (button && !button.matches(':disabled, [aria-disabled="true"]')) {
      button.click();
      return { triggered: true, usedButton: true };
    }
    return { triggered: dispatchViewerEdgeClick(viewer, direction), usedButton: false };
  }

  class ControlPanel {
    constructor(session) {
      this.session = session;
      this.host = document.createElement('div');
      this.host.id = `${SCRIPT_ID}-host`;
      this.host.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;pointer-events:none;';
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this.shadow.innerHTML = `
        <style>
          :host { all: initial; }
          .panel, .launcher {
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #fff;
            pointer-events: auto;
            user-select: none;
          }
          .panel {
            display: flex;
            align-items: center;
            gap: 7px;
            max-width: min(94vw, 920px);
            min-height: 46px;
            padding: 7px 9px;
            border: 1px solid rgba(255,255,255,.18);
            border-radius: 15px;
            background: rgba(20,24,32,.88);
            box-shadow: 0 10px 32px rgba(0,0,0,.35);
            backdrop-filter: blur(14px);
          }
          button, select {
            box-sizing: border-box;
            min-height: 32px;
            border: 0;
            border-radius: 9px;
            background: rgba(255,255,255,.12);
            color: inherit;
            font: inherit;
          }
          button { padding: 0 11px; cursor: pointer; }
          button:hover { background: rgba(255,255,255,.2); }
          button:focus-visible, select:focus-visible { outline: 2px solid #7cc8ff; outline-offset: 2px; }
          button.primary[data-active="true"] { background: #2aabee; }
          button[hidden], .panel[hidden], .launcher[hidden] { display: none !important; }
          select { padding: 0 8px; }
          option { color: #111; }
          .status {
            min-width: 118px;
            max-width: 250px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding: 0 4px;
            color: rgba(255,255,255,.82);
            font-size: 13px;
          }
          .launcher {
            min-width: 50px;
            height: 38px;
            border: 1px solid rgba(255,255,255,.2);
            border-radius: 19px;
            background: rgba(20,24,32,.88);
            box-shadow: 0 8px 24px rgba(0,0,0,.3);
            cursor: pointer;
          }
          @media (max-width: 720px) {
            .panel { gap: 5px; padding: 6px; }
            button { padding: 0 8px; }
            .status { min-width: 72px; max-width: 120px; }
          }
        </style>
        <div class="panel" role="toolbar" aria-label="Telegram TT 连续媒体浏览">
          <button id="toggle" class="primary" type="button">连续浏览</button>
          <button id="pause" type="button">暂停</button>
          <button id="previous" type="button" aria-label="上一项">←</button>
          <button id="next" type="button" aria-label="下一项">→</button>
          <select id="duration" aria-label="图片停留时间">
            ${DURATIONS.map((value) => `<option value="${value}">${value / 1000} 秒</option>`).join('')}
          </select>
          <button id="resume" type="button" hidden>继续上次位置</button>
          <span id="status" class="status" aria-live="polite">已就绪</span>
          <button id="collapse" type="button" aria-label="收起控制条">×</button>
        </div>
        <button class="launcher" id="launcher" type="button" aria-label="展开 Telegram TT 控制条" hidden>TT</button>
      `;
      document.body.appendChild(this.host);

      this.panel = this.shadow.querySelector('.panel');
      this.launcher = this.shadow.querySelector('#launcher');
      this.toggle = this.shadow.querySelector('#toggle');
      this.pause = this.shadow.querySelector('#pause');
      this.resume = this.shadow.querySelector('#resume');
      this.status = this.shadow.querySelector('#status');
      this.duration = this.shadow.querySelector('#duration');

      const stopPropagation = (event) => event.stopPropagation();
      this.shadow.addEventListener('pointerdown', stopPropagation);
      this.shadow.addEventListener('click', stopPropagation);
      this.toggle.addEventListener('click', () => session.toggleContinuous());
      this.pause.addEventListener('click', () => session.togglePause());
      this.shadow.querySelector('#previous').addEventListener('click', () => session.navigate(-1, false));
      this.shadow.querySelector('#next').addEventListener('click', () => session.navigate(1, false));
      this.duration.addEventListener('change', () => session.setPhotoDuration(Number(this.duration.value)));
      this.resume.addEventListener('click', () => session.resumeLastPosition());
      this.shadow.querySelector('#collapse').addEventListener('click', () => session.setPanelCollapsed(true));
      this.launcher.addEventListener('click', () => session.setPanelCollapsed(false));
    }

    render(state) {
      this.toggle.dataset.active = String(state.active);
      this.toggle.textContent = state.active ? '连续浏览：开' : '连续浏览：关';
      this.pause.textContent = state.paused ? '继续' : '暂停';
      this.pause.disabled = !state.active;
      this.duration.value = String(state.photoDurationMs);
      this.panel.hidden = state.collapsed;
      this.launcher.hidden = !state.collapsed;
    }

    setStatus(value) {
      this.status.textContent = value || '已就绪';
      this.status.title = value || '';
    }

    setResumeVisible(visible) {
      this.resume.hidden = !visible;
    }

    destroy() {
      this.host.remove();
    }
  }

  class ViewerSession {
    constructor(viewer) {
      this.viewer = viewer;
      this.settings = loadState().settings;
      this.active = this.settings.continuousEnabled;
      this.paused = false;
      this.hovered = false;
      this.interacting = false;
      this.isNavigating = false;
      this.destroyed = false;
      this.lastMediaInteractionAt = 0;
      this.mediaCleanup = [];
      this.timerId = 0;
      this.countdownId = 0;
      this.refreshTimer = 0;
      this.interactionTimer = 0;
      this.currentMedia = undefined;
      this.currentContext = undefined;
      this.currentFingerprint = 'none';
      this.panel = new ControlPanel(this);
      this.panel.render(this.viewState());
      this.panel.setStatus('正在识别媒体');

      this.observer = new MutationObserver(() => this.requestRefresh());
      this.observer.observe(viewer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled', 'src'],
      });
      this.handleVisibility = () => this.onAmbientStateChanged();
      this.handlePointerUp = () => {
        this.interacting = false;
        this.requestRefresh();
      };
      document.addEventListener('visibilitychange', this.handleVisibility);
      window.addEventListener('focus', this.handleVisibility);
      window.addEventListener('blur', this.handleVisibility);
      window.addEventListener('pointerup', this.handlePointerUp, true);
      window.addEventListener('pointercancel', this.handlePointerUp, true);
      this.refresh();
      debugLog('建立媒体查看器会话', describeElement(viewer));
    }

    viewState() {
      return {
        active: this.active,
        paused: this.paused,
        photoDurationMs: this.settings.photoDurationMs,
        collapsed: this.settings.panelCollapsed,
      };
    }

    requestRefresh() {
      if (this.destroyed || this.refreshTimer) return;
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = 0;
        this.refresh();
      }, 80);
    }

    refresh() {
      if (this.destroyed) return;
      if (!this.viewer.isConnected || !isElementVisible(this.viewer)) {
        scheduleScan();
        return;
      }
      const media = findActiveMedia(this.viewer);
      if (!media) {
        this.clearTimer();
        this.panel.setStatus('未找到活动媒体');
        return;
      }
      const context = detectMediaContext(this.viewer, media);
      const nextFingerprint = fingerprint(media, context);
      if (media !== this.currentMedia || nextFingerprint !== this.currentFingerprint) {
        this.bindMedia(media, context, nextFingerprint);
      } else {
        this.currentContext = context || this.currentContext;
        this.updateResumeButton();
        this.scheduleForCurrentMedia();
      }
    }

    bindMedia(media, context, nextFingerprint) {
      this.clearTimer();
      this.releaseMediaListeners();
      this.currentMedia = media;
      this.currentContext = context;
      this.currentFingerprint = nextFingerprint;
      this.isNavigating = false;

      const add = (target, type, listener, options) => {
        target.addEventListener(type, listener, options);
        this.mediaCleanup.push(() => target.removeEventListener(type, listener, options));
      };
      add(media, 'pointerenter', () => {
        this.hovered = true;
        this.clearTimer();
        this.panel.setStatus('鼠标悬停，倒计时暂停');
      });
      add(media, 'pointerleave', () => {
        this.hovered = false;
        this.scheduleForCurrentMedia(true);
      });
      add(media, 'pointerdown', () => {
        this.lastMediaInteractionAt = Date.now();
        this.interacting = true;
        this.clearTimer();
      }, true);
      add(media, 'wheel', () => {
        this.lastMediaInteractionAt = Date.now();
        this.interacting = true;
        this.clearTimer();
        window.clearTimeout(this.interactionTimer);
        this.interactionTimer = window.setTimeout(() => {
          this.interacting = false;
          this.scheduleForCurrentMedia(true);
        }, INTERACTION_COOLDOWN_MS);
      }, { passive: true });

      if (media instanceof HTMLImageElement) {
        add(media, 'load', () => this.scheduleForCurrentMedia(true), { once: true });
        add(media, 'error', () => {
          this.clearTimer();
          this.panel.setStatus('图片加载失败，请手动处理');
        }, { once: true });
      } else if (media instanceof HTMLVideoElement) {
        add(media, 'ended', () => {
          if (this.active && !this.paused) this.navigate(1, true);
        });
        add(media, 'play', () => {
          if (this.active) this.panel.setStatus('视频播放中');
        });
        add(media, 'pause', () => {
          if (this.isNavigating || media.ended) return;
          if (Date.now() - this.lastMediaInteractionAt < 1400 && media.currentTime > 0) {
            this.paused = true;
            this.clearTimer();
            this.panel.render(this.viewState());
            this.panel.setStatus('已跟随用户暂停');
          }
        });
        add(media, 'error', () => this.panel.setStatus('视频播放失败，请手动处理'));
      }

      this.updateResumeButton();
      this.panel.render(this.viewState());
      this.scheduleForCurrentMedia(true);
    }

    releaseMediaListeners() {
      for (const cleanup of this.mediaCleanup.splice(0)) cleanup();
    }

    clearTimer() {
      if (this.timerId) window.clearTimeout(this.timerId);
      if (this.countdownId) window.clearInterval(this.countdownId);
      this.timerId = 0;
      this.countdownId = 0;
    }

    canRunPhotoTimer() {
      return this.active
        && !this.paused
        && this.currentMedia instanceof HTMLImageElement
        && this.currentMedia.complete
        && this.currentMedia.naturalWidth > 0
        && !document.hidden
        && document.hasFocus()
        && !this.hovered
        && !this.interacting
        && !isMediaScaled(this.currentMedia, this.viewer);
    }

    scheduleForCurrentMedia(forceRestart = false) {
      if (this.destroyed || !this.currentMedia) return;
      if (forceRestart) this.clearTimer();

      if (this.currentMedia instanceof HTMLVideoElement) {
        this.clearTimer();
        if (!this.active) return this.panel.setStatus('连续浏览已关闭');
        if (this.paused) return this.panel.setStatus('连续浏览已暂停');
        if (this.currentMedia.loop) return this.panel.setStatus('循环视频需手动切换');
        if (this.currentMedia.paused && !this.currentMedia.ended) {
          const playPromise = this.currentMedia.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => this.panel.setStatus('点击视频继续播放'));
          }
        } else {
          this.panel.setStatus('视频结束后自动切换');
        }
        return undefined;
      }

      if (!(this.currentMedia instanceof HTMLImageElement)) {
        this.clearTimer();
        return this.panel.setStatus('当前媒体类型暂不支持');
      }
      if (!this.currentMedia.complete || this.currentMedia.naturalWidth <= 0) {
        return this.panel.setStatus('等待图片加载');
      }
      if (!this.active) return this.panel.setStatus('连续浏览已关闭');
      if (this.paused) return this.panel.setStatus('连续浏览已暂停');
      if (document.hidden || !document.hasFocus()) return this.panel.setStatus('页面失焦，倒计时暂停');
      if (this.hovered || this.interacting || isMediaScaled(this.currentMedia, this.viewer)) {
        return this.panel.setStatus('正在查看图片，倒计时暂停');
      }
      if (!this.canRunPhotoTimer() || this.timerId) return undefined;

      const duration = this.settings.photoDurationMs;
      const startedAt = Date.now();
      const updateCountdown = () => {
        const remaining = Math.max(0, duration - (Date.now() - startedAt));
        this.panel.setStatus(`图片 ${(remaining / 1000).toFixed(1)} 秒后切换`);
      };
      updateCountdown();
      this.countdownId = window.setInterval(updateCountdown, 200);
      this.timerId = window.setTimeout(() => {
        this.clearTimer();
        this.navigate(1, true);
      }, duration);
      return undefined;
    }

    onAmbientStateChanged() {
      this.clearTimer();
      this.scheduleForCurrentMedia(true);
    }

    toggleContinuous() {
      this.active = !this.active;
      if (this.active) this.paused = false;
      this.settings = updateSettings({ continuousEnabled: this.active });
      this.clearTimer();
      this.panel.render(this.viewState());
      this.scheduleForCurrentMedia(true);
    }

    togglePause() {
      if (!this.active) return;
      this.paused = !this.paused;
      this.clearTimer();
      this.panel.render(this.viewState());
      this.scheduleForCurrentMedia(true);
    }

    setPhotoDuration(duration) {
      this.settings = updateSettings({ photoDurationMs: duration });
      this.panel.render(this.viewState());
      this.clearTimer();
      this.scheduleForCurrentMedia(true);
    }

    setPanelCollapsed(collapsed) {
      this.settings = updateSettings({ panelCollapsed: collapsed });
      this.panel.render(this.viewState());
    }

    navigate(direction, automatic) {
      if (this.destroyed || this.isNavigating) return;
      if (automatic && (!this.active || this.paused)) return;
      this.clearTimer();
      const before = this.currentFingerprint;
      this.isNavigating = true;
      this.panel.setStatus(direction > 0 ? '正在切换下一项' : '正在切换上一项');

      let result;
      try {
        result = triggerOfficialNavigation(this.viewer, direction);
      } catch (error) {
        result = { triggered: false, usedButton: false };
      }
      if (!result.triggered) {
        this.isNavigating = false;
        if (automatic) this.finish('已到当前媒体末尾');
        else this.panel.setStatus(direction > 0 ? '没有可用的下一项' : '没有可用的上一项');
        return;
      }

      const startedAt = Date.now();
      const poll = () => {
        if (this.destroyed) return;
        const media = findActiveMedia(this.viewer);
        const context = media && detectMediaContext(this.viewer, media);
        const after = fingerprint(media, context);
        if (media && after !== before) {
          this.isNavigating = false;
          this.bindMedia(media, context, after);
          return;
        }
        if (Date.now() - startedAt >= NAVIGATION_TIMEOUT_MS) {
          this.isNavigating = false;
          if (automatic) this.finish('已到当前媒体末尾');
          else this.panel.setStatus('媒体未变化，可能已到末尾或页面结构已变化');
          return;
        }
        window.setTimeout(poll, 100);
      };
      window.setTimeout(poll, 100);
    }

    finish(message) {
      this.active = false;
      this.paused = false;
      this.settings = updateSettings({ continuousEnabled: false });
      this.clearTimer();
      this.panel.render(this.viewState());
      this.panel.setStatus(message);
    }

    updateResumeButton() {
      const position = getResumePosition(this.currentContext);
      const different = Boolean(position && this.currentContext && (
        position.messageKey !== this.currentContext.messageKey
        || position.albumIndex !== this.currentContext.albumIndex
      ));
      const target = different ? findResumeTarget(position) : undefined;
      this.resumePosition = target ? position : undefined;
      this.resumeTarget = target;
      this.panel.setResumeVisible(Boolean(target));
    }

    resumeLastPosition() {
      if (!this.resumePosition || !this.resumeTarget || !this.resumeTarget.isConnected) {
        this.updateResumeButton();
        this.panel.setStatus('上次位置当前不可打开');
        return;
      }
      const target = this.resumeTarget;
      const closeButton = findCloseButton(this.viewer);
      this.panel.setStatus('正在返回上次位置');
      if (closeButton) {
        closeButton.click();
        window.setTimeout(() => {
          if (target.isConnected) target.click();
        }, 280);
      } else {
        target.click();
      }
    }

    saveCurrentPosition() {
      if (this.currentContext) savePosition(this.currentContext);
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.saveCurrentPosition();
      this.clearTimer();
      window.clearTimeout(this.refreshTimer);
      window.clearTimeout(this.interactionTimer);
      this.releaseMediaListeners();
      this.observer.disconnect();
      document.removeEventListener('visibilitychange', this.handleVisibility);
      window.removeEventListener('focus', this.handleVisibility);
      window.removeEventListener('blur', this.handleVisibility);
      window.removeEventListener('pointerup', this.handlePointerUp, true);
      window.removeEventListener('pointercancel', this.handlePointerUp, true);
      this.panel.destroy();
      debugLog('媒体查看器会话结束');
    }
  }

  function scanPage() {
    runtime.scanTimer = 0;
    if (runtime.session && (!runtime.session.viewer.isConnected || !isElementVisible(runtime.session.viewer))) {
      runtime.session.destroy();
      runtime.session = undefined;
    }
    const viewer = findMediaViewer();
    if (!viewer) return;
    if (runtime.session && runtime.session.viewer === viewer) {
      runtime.session.requestRefresh();
      return;
    }
    if (runtime.session) runtime.session.destroy();
    runtime.session = new ViewerSession(viewer);
  }

  function scheduleScan() {
    if (runtime.scanTimer) return;
    runtime.scanTimer = window.setTimeout(scanPage, SCAN_DELAY_MS);
  }

  function installDebugApi() {
    const api = Object.freeze({
      inspect() {
        const viewer = findMediaViewer();
        const media = viewer && findActiveMedia(viewer);
        const result = {
          viewer: describeElement(viewer),
          activeMedia: describeElement(media),
          nextButton: describeElement(viewer && findNavigationButton(viewer, 1)),
          previousButton: describeElement(viewer && findNavigationButton(viewer, -1)),
          closeButton: describeElement(viewer && findCloseButton(viewer)),
          edgeClickFallbackAvailable: Boolean(viewer),
          hasConfirmedChannelContext: Boolean(
            viewer && media && detectMediaContext(viewer, media)?.isConfirmedChannel,
          ),
        };
        console.table(result);
        return result;
      },
      enableDebug(enabled = true) {
        runtime.debugEnabled = Boolean(enabled);
        console.info(`[Telegram Media Continuity] DOM 探测日志已${runtime.debugEnabled ? '开启' : '关闭'}`);
      },
      rescan: scheduleScan,
      resetStorage() {
        try {
          localStorage.removeItem(STORAGE_KEY);
          console.info('[Telegram Media Continuity] 本地设置和位置记录已清除');
        } catch (error) {
          console.warn('[Telegram Media Continuity] 清除本地存储失败');
        }
      },
      getSummary() {
        const state = loadState();
        return {
          version: state.version,
          settings: { ...state.settings },
          positionCount: state.positions.length,
          viewerDetected: Boolean(findMediaViewer()),
        };
      },
    });
    Object.defineProperty(window, 'TelegramMediaContinuity', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: api,
    });
  }

  function initializeScript() {
    const attribute = `data-${SCRIPT_ID}`;
    if (document.documentElement.hasAttribute(attribute)) return;
    document.documentElement.setAttribute(attribute, 'ready');
    runtime.debugEnabled = /(?:[?#&])ttMediaDebug=1(?:&|$)/.test(location.href);
    installDebugApi();

    runtime.rootObserver = new MutationObserver(scheduleScan);
    runtime.rootObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    runtime.periodicTimer = window.setInterval(() => {
      if (runtime.lastLocation !== location.href) {
        runtime.lastLocation = location.href;
        scheduleScan();
      } else if (runtime.session) {
        runtime.session.requestRefresh();
      }
    }, 1000);

    window.addEventListener('pagehide', () => runtime.session?.saveCurrentPosition());
    window.addEventListener('beforeunload', () => runtime.session?.saveCurrentPosition());
    window.addEventListener('popstate', scheduleScan);
    window.addEventListener('hashchange', scheduleScan);
    scheduleScan();
    console.info('[Telegram Media Continuity] Script initialized');
  }

  initializeScript();
})();
