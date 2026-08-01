// ==UserScript==
// @name         Telegram Web K 媒体续播（兼容验证版）
// @namespace    telegram-air/media-continuity
// @version      0.4.0-k5
// @description  为 Telegram Web K 提供图片和视频连续浏览能力
// @match        https://web.telegram.org/k/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

import {
  addEventListenerCleanup,
  clearIntervalId,
  clearTimeoutId,
  disconnectObserver,
  runCleanupList,
} from './core/cleanup.js';
import { createLifecycle } from './core/lifecycle.js';
import { debugLog } from './core/logger.js';
import { runtime } from './core/runtime.js';
import { DURATIONS, loadSettings, updateSettings } from './core/settings.js';
import {
  describeControl,
  describeElement,
  findScrollableAncestor,
  isElementVisible,
} from './platform/dom.js';
import {
  findActiveMedia,
  findMediaRoot,
  findMediaViewer,
  isMediaSuccessfullyDisplayed,
  isMediaZoomed,
  mediaFingerprint,
} from './platform/media-viewer.js';
import {
  captureSourceTarget,
  cloneMediaTarget,
  collectMessageNodes,
  findAdjacentMediaTarget,
  findExactMessageNode,
  getMessageIdentity,
} from './platform/message-list.js';
import {
  dispatchNavigation,
  getNavigationButton,
  getNavigationDirectionFromTarget,
  navigationAvailability,
} from './platform/navigation.js';

(() => {
  'use strict';

  const SCRIPT_ID = 'telegram-media-continuity-host';
  const NAVIGATION_TIMEOUT_MS = 3000;
  const INTERACTION_COOLDOWN_MS = 900;
  const CLOSE_PROBE_TIMEOUT_MS = 6000;
  const CLOSE_PROBE_POLL_MS = 50;
  const SOURCE_TARGET_MAX_AGE_MS = 5000;
  const LOCATION_WAIT_TIMEOUT_MS = 2400;
  const LOCATION_POLL_MS = 80;
  const LOCATION_REVIEW_DELAY_MS = 420;
  const LOCATION_HIGHLIGHT_MS = 1200;
  const LOCATION_STYLE_ID = 'telegram-media-continuity-location-style';
  const LOCATION_HIGHLIGHT_CLASS = 'tt-media-continuity-location-highlight';
  const LOCATION_NOTICE_ID = 'telegram-media-continuity-location-notice';

  function captureSourceProbe(event) {
    const captured = captureSourceTarget(event, SCRIPT_ID);
    if (!captured) return;
    clearLocationTimers();
    runtime.activeLocationSequenceId += 1;
    if (!captured.probe) return;
    runtime.lastSourceProbe = captured.probe;
    runtime.lastSourceTarget = captured.target;
  }

  function takeRecentSourceTarget() {
    const target = runtime.lastSourceTarget;
    runtime.lastSourceTarget = undefined;
    if (!target || Date.now() - target.capturedAt > SOURCE_TARGET_MAX_AGE_MS) return undefined;
    if (!(target.sourceMessageNode instanceof Element) || !target.sourceMessageNode.isConnected) return undefined;
    const identity = getMessageIdentity(target.sourceMessageNode);
    if (!identity || identity.messageId !== target.messageKey || identity.peerId !== target.peerKey) return undefined;
    return cloneMediaTarget(target);
  }

  function ensureLocationStyle() {
    if (document.getElementById(LOCATION_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = LOCATION_STYLE_ID;
    style.textContent = `
      @keyframes ttMediaContinuityPulse {
        0% { box-shadow: 0 0 0 0 rgba(42, 171, 238, .7); }
        45% { box-shadow: 0 0 0 8px rgba(42, 171, 238, .18); }
        100% { box-shadow: 0 0 0 0 rgba(42, 171, 238, 0); }
      }
      .${LOCATION_HIGHLIGHT_CLASS} {
        animation: ttMediaContinuityPulse ${LOCATION_HIGHLIGHT_MS}ms ease-out !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function showLocationNotice(message) {
    document.getElementById(LOCATION_NOTICE_ID)?.remove();
    const notice = document.createElement('div');
    notice.id = LOCATION_NOTICE_ID;
    notice.setAttribute('role', 'status');
    notice.textContent = message;
    notice.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:24px',
      'transform:translateX(-50%)',
      'z-index:2147483647',
      'max-width:min(86vw,420px)',
      'padding:9px 14px',
      'border-radius:11px',
      'background:rgba(20,24,32,.92)',
      'color:#fff',
      'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 8px 28px rgba(0,0,0,.28)',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(notice);
    window.setTimeout(() => notice.remove(), 1800);
  }

  function clearLocationTimers() {
    for (const timerId of runtime.locationTimers) window.clearTimeout(timerId);
    runtime.locationTimers.clear();
    for (const node of document.querySelectorAll(`.${LOCATION_HIGHLIGHT_CLASS}`)) {
      node.classList.remove(LOCATION_HIGHLIGHT_CLASS);
    }
  }

  function setLocationTimer(callback, delay) {
    const timerId = window.setTimeout(() => {
      runtime.locationTimers.delete(timerId);
      callback();
    }, delay);
    runtime.locationTimers.add(timerId);
    return timerId;
  }

  function recordLocationResult(sequenceId, status, target, extra = {}) {
    runtime.lastLocationResult = {
      sequenceId,
      status,
      finishedAt: Date.now(),
      target: target
        ? {
          peerKey: target.peerKey,
          messageKey: target.messageKey,
          albumIndex: target.albumIndex,
          confidence: target.confidence,
        }
        : undefined,
      ...extra,
    };
    debugLog('关闭后定位结果', runtime.lastLocationResult);
  }

  function centerAndHighlightMessage(node, container, sequenceId, target) {
    ensureLocationStyle();
    node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    node.classList.remove(LOCATION_HIGHLIGHT_CLASS);
    void node.offsetWidth;
    node.classList.add(LOCATION_HIGHLIGHT_CLASS);
    setLocationTimer(() => node.classList.remove(LOCATION_HIGHLIGHT_CLASS), LOCATION_HIGHLIGHT_MS);
    setLocationTimer(() => {
      if (runtime.activeLocationSequenceId !== sequenceId || !node.isConnected || !container.isConnected) return;
      const nodeRect = node.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const delta = (nodeRect.top + nodeRect.height / 2) - (containerRect.top + containerRect.height / 2);
      if (Math.abs(delta) > Math.min(120, containerRect.height * 0.18)) {
        container.scrollTop += delta;
      }
    }, LOCATION_REVIEW_DELAY_MS);
    recordLocationResult(sequenceId, 'located', target, { source: 'exact-dom-match' });
    showLocationNotice('已定位到最后查看消息');
  }

  function locateMessageAfterClose(snapshot) {
    if (!snapshot) return;
    clearLocationTimers();
    runtime.activeLocationSequenceId = snapshot.sequenceId;
    const startedAt = performance.now();

    if (!snapshot.target) {
      recordLocationResult(snapshot.sequenceId, snapshot.reason || 'no-confirmed-target');
      showLocationNotice(snapshot.reason === 'unmapped-current-media'
        ? '无法确认媒体所属消息，已正常关闭'
        : '最后查看消息当前未加载');
      return;
    }

    const poll = () => {
      if (runtime.activeLocationSequenceId !== snapshot.sequenceId) return;
      if (findMediaViewer()) {
        if (performance.now() - startedAt >= LOCATION_WAIT_TIMEOUT_MS) {
          recordLocationResult(snapshot.sequenceId, 'viewer-still-visible', snapshot.target);
          return;
        }
        setLocationTimer(poll, LOCATION_POLL_MS);
        return;
      }

      const match = findExactMessageNode(snapshot.target);
      if (match.node && match.container) {
        centerAndHighlightMessage(match.node, match.container, snapshot.sequenceId, snapshot.target);
        return;
      }
      if (match.reason === 'peer-changed') {
        recordLocationResult(snapshot.sequenceId, 'cancelled-peer-changed', snapshot.target);
        return;
      }
      if (performance.now() - startedAt >= LOCATION_WAIT_TIMEOUT_MS) {
        recordLocationResult(snapshot.sequenceId, 'target-not-loaded', snapshot.target);
        showLocationNotice('最后查看消息当前未加载');
        return;
      }
      setLocationTimer(poll, LOCATION_POLL_MS);
    };

    requestAnimationFrame(() => requestAnimationFrame(poll));
  }

  function collectScrollSnapshots(messageNodes) {
    const snapshots = [];
    const seen = new Set();
    for (const messageNode of messageNodes) {
      if (!isElementVisible(messageNode)) continue;
      const container = findScrollableAncestor(messageNode);
      if (!container || seen.has(container)) continue;
      seen.add(container);
      snapshots.push({
        node: container,
        scrollTop: Math.round(container.scrollTop),
        scrollHeight: Math.round(container.scrollHeight),
        clientHeight: Math.round(container.clientHeight),
      });
      if (snapshots.length >= 8) break;
    }
    return snapshots;
  }

  function describeScrollSnapshots(snapshots) {
    return snapshots.map((snapshot, index) => ({
      index,
      element: describeElement(snapshot.node),
      scrollTop: snapshot.scrollTop,
      scrollHeight: snapshot.scrollHeight,
      clientHeight: snapshot.clientHeight,
    }));
  }

  function collectChatProbe() {
    const messageNodes = collectMessageNodes();
    const visibleNodes = messageNodes.filter(isElementVisible);
    const sample = visibleNodes.slice(0, 12).map((element) => ({
      identity: getMessageIdentity(element),
      element: describeElement(element),
    }));
    const scrollSnapshots = collectScrollSnapshots(messageNodes);
    return {
      messageNodeCount: messageNodes.length,
      visibleMessageNodeCount: visibleNodes.length,
      messageNodesWithPeerId: messageNodes.filter((element) => getMessageIdentity(element)?.peerId).length,
      sample,
      scrollContainers: describeScrollSnapshots(scrollSnapshots),
    };
  }

  function collectMediaAncestors(viewer, media) {
    const result = [];
    let current = media;
    for (let depth = 0; current && depth < 12; depth += 1) {
      result.push(describeElement(current));
      if (current === viewer) break;
      current = current.parentElement;
    }
    return result.filter(Boolean);
  }

  function collectViewerControls(viewer) {
    if (!(viewer instanceof Element)) return [];
    const viewerRect = viewer.getBoundingClientRect();
    const controls = [];
    for (const element of viewer.querySelectorAll('button, a[href], [role="button"], [tabindex]')) {
      if (!isElementVisible(element) || element.closest(`#${SCRIPT_ID}`)) continue;
      const rect = element.getBoundingClientRect();
      let score = 0;
      if (rect.top < viewerRect.top + Math.min(180, viewerRect.height * 0.25)) score += 12;
      if (rect.left < viewerRect.left + 220 || rect.right > viewerRect.right - 220) score += 8;
      if (element instanceof HTMLAnchorElement) score += 4;
      const classText = Array.from(element.classList).join(' ').toLocaleLowerCase();
      if (/(close|back|author|date|message|viewer)/.test(classText)) score += 10;
      controls.push({ element, score });
    }
    controls.sort((left, right) => right.score - left.score);
    return controls.slice(0, 24).map(({ element, score }, index) => ({
      index,
      score,
      element: describeControl(element),
    }));
  }

  function inspectMessageMapping() {
    const viewer = findMediaViewer();
    const media = viewer && findActiveMedia(viewer);
    const result = {
      client: 'web-k',
      viewer: describeElement(viewer),
      activeMedia: describeElement(media),
      mediaAncestors: viewer && media ? collectMediaAncestors(viewer, media) : [],
      viewerControls: viewer ? collectViewerControls(viewer) : [],
      sourceClick: runtime.lastSourceProbe
        ? { ...runtime.lastSourceProbe, ageMs: Date.now() - runtime.lastSourceProbe.capturedAt }
        : undefined,
      chat: collectChatProbe(),
      privacy: {
        includesTextContent: false,
        includesRawHref: false,
        includesMediaUrl: false,
        includesChannelName: false,
        includesUserName: false,
      },
    };
    console.log('[Telegram Media Continuity] Web K 消息映射脱敏探测', result);
    return result;
  }

  function clearCloseProbe() {
    runtime.closeProbeTimer = clearTimeoutId(runtime.closeProbeTimer);
    runCleanupList(runtime.closeProbeCleanup);
    runtime.closeProbeInternal = undefined;
  }

  function compareScrollSnapshots(before, after) {
    const result = [];
    for (let index = 0; index < before.length; index += 1) {
      const beforeSnapshot = before[index];
      const afterSnapshot = after.find((snapshot) => snapshot.node === beforeSnapshot.node);
      result.push({
        index,
        stillConnected: beforeSnapshot.node.isConnected,
        beforeScrollTop: beforeSnapshot.scrollTop,
        afterScrollTop: afterSnapshot ? afterSnapshot.scrollTop : undefined,
        delta: afterSnapshot ? afterSnapshot.scrollTop - beforeSnapshot.scrollTop : undefined,
      });
    }
    return result;
  }

  function finalizeCloseProbe(status, viewerClosedAt) {
    const internal = runtime.closeProbeInternal;
    if (!internal) return runtime.closeProbe;
    const messageNodes = collectMessageNodes();
    const afterScrolls = collectScrollSnapshots(messageNodes);
    const now = performance.now();
    runtime.closeProbe = {
      ...runtime.closeProbe,
      status,
      finishedAt: Date.now(),
      elapsedMs: Math.round(now - internal.startedAt),
      closeElapsedFromIntentMs: internal.intentAt
        ? Math.round((viewerClosedAt || now) - internal.intentAt)
        : undefined,
      viewerConnectedAfter: internal.viewer.isConnected,
      viewerVisibleAfter: isElementVisible(internal.viewer),
      afterChat: {
        messageNodeCount: messageNodes.length,
        visibleMessageNodeCount: messageNodes.filter(isElementVisible).length,
        scrollContainers: describeScrollSnapshots(afterScrolls),
      },
      scrollChanges: compareScrollSnapshots(internal.beforeScrolls, afterScrolls),
    };
    clearCloseProbe();
    console.log('[Telegram Media Continuity] Web K 关闭流程脱敏探测', runtime.closeProbe);
    return runtime.closeProbe;
  }

  function armCloseFlowProbe() {
    clearCloseProbe();
    const viewer = findMediaViewer();
    if (!viewer) {
      runtime.closeProbe = {
        status: 'no-visible-viewer',
        armedAt: Date.now(),
      };
      console.warn('[Telegram Media Continuity] 未发现可见媒体查看器');
      return runtime.closeProbe;
    }

    const messageNodes = collectMessageNodes();
    const beforeScrolls = collectScrollSnapshots(messageNodes);
    const startedAt = performance.now();
    runtime.closeProbe = {
      status: 'armed',
      armedAt: Date.now(),
      viewer: describeElement(viewer),
      candidateControls: collectViewerControls(viewer),
      beforeChat: {
        messageNodeCount: messageNodes.length,
        visibleMessageNodeCount: messageNodes.filter(isElementVisible).length,
        scrollContainers: describeScrollSnapshots(beforeScrolls),
      },
      intent: undefined,
    };
    runtime.closeProbeInternal = {
      viewer,
      startedAt,
      intentAt: 0,
      beforeScrolls,
    };

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || !runtime.closeProbeInternal) return;
      runtime.closeProbeInternal.intentAt = performance.now();
      runtime.closeProbe.intent = {
        type: 'escape',
        elapsedMs: Math.round(runtime.closeProbeInternal.intentAt - startedAt),
        repeat: Boolean(event.repeat),
      };
    };
    const handlePointerDown = (event) => {
      if (!runtime.closeProbeInternal || !(event.target instanceof Element)) return;
      if (!viewer.contains(event.target)) return;
      runtime.closeProbeInternal.intentAt = performance.now();
      runtime.closeProbe.intent = {
        type: 'viewer-pointer',
        elapsedMs: Math.round(runtime.closeProbeInternal.intentAt - startedAt),
        target: describeControl(event.target.closest('button, a[href], [role="button"], [tabindex]') || event.target),
      };
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('pointerdown', handlePointerDown, true);
    runtime.closeProbeCleanup.push(
      () => window.removeEventListener('keydown', handleKeyDown, true),
      () => window.removeEventListener('pointerdown', handlePointerDown, true),
    );

    const poll = () => {
      const internal = runtime.closeProbeInternal;
      if (!internal) return;
      const elapsed = performance.now() - internal.startedAt;
      if (!internal.viewer.isConnected) {
        const closedAt = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => finalizeCloseProbe('viewer-removed', closedAt)));
        return;
      }
      if (!isElementVisible(internal.viewer)) {
        const closedAt = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => finalizeCloseProbe('viewer-hidden', closedAt)));
        return;
      }
      if (elapsed >= CLOSE_PROBE_TIMEOUT_MS) {
        finalizeCloseProbe('timeout');
        return;
      }
      runtime.closeProbeTimer = window.setTimeout(poll, CLOSE_PROBE_POLL_MS);
    };
    runtime.closeProbeTimer = window.setTimeout(poll, CLOSE_PROBE_POLL_MS);
    console.info('[Telegram Media Continuity] 关闭流程探测已布防，请手动点击官方关闭按钮或按 Esc');
    return runtime.closeProbe;
  }

  class ControlPanel {
    constructor(session) {
      this.session = session;
      this.host = document.createElement('div');
      this.host.id = SCRIPT_ID;
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
            background: rgba(20,24,32,.9);
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
          button:disabled { cursor: not-allowed; opacity: .42; }
          button.primary[data-active="true"] { background: #2aabee; }
          button[hidden], .panel[hidden], .launcher[hidden] { display: none !important; }
          select { padding: 0 8px; }
          option { color: #111; }
          .status {
            min-width: 118px;
            max-width: 260px;
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
            background: rgba(20,24,32,.9);
            box-shadow: 0 8px 24px rgba(0,0,0,.3);
            cursor: pointer;
          }
          @media (max-width: 720px) {
            .panel { gap: 5px; padding: 6px; }
            button { padding: 0 8px; }
            .status { min-width: 72px; max-width: 120px; }
          }
        </style>
        <div class="panel" role="toolbar" aria-label="Telegram Web K 连续媒体浏览">
          <button id="toggle" class="primary" type="button">连续浏览</button>
          <button id="pause" type="button">暂停</button>
          <button id="previous" type="button" aria-label="上一项">←</button>
          <button id="next" type="button" aria-label="下一项">→</button>
          <select id="duration" aria-label="图片停留时间">
            ${DURATIONS.map((value) => `<option value="${value}">${value / 1000} 秒</option>`).join('')}
          </select>
          <span id="status" class="status" aria-live="polite">已就绪</span>
          <button id="collapse" type="button" aria-label="收起控制条">×</button>
        </div>
        <button class="launcher" id="launcher" type="button" aria-label="展开控制条" hidden>TT</button>
      `;
      document.body.appendChild(this.host);

      this.panel = this.shadow.querySelector('.panel');
      this.launcher = this.shadow.querySelector('#launcher');
      this.toggle = this.shadow.querySelector('#toggle');
      this.pause = this.shadow.querySelector('#pause');
      this.previous = this.shadow.querySelector('#previous');
      this.next = this.shadow.querySelector('#next');
      this.status = this.shadow.querySelector('#status');
      this.duration = this.shadow.querySelector('#duration');

      for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick']) {
        this.shadow.addEventListener(type, (event) => event.stopPropagation());
      }

      this.toggle.addEventListener('click', () => session.toggleContinuous());
      this.pause.addEventListener('click', () => session.togglePause());
      this.previous.addEventListener('click', () => session.navigate(-1, false));
      this.next.addEventListener('click', () => session.navigate(1, false));
      this.duration.addEventListener('change', () => session.setPhotoDuration(Number(this.duration.value)));
      this.shadow.querySelector('#collapse').addEventListener('click', () => session.setPanelCollapsed(true));
      this.launcher.addEventListener('click', () => session.setPanelCollapsed(false));
    }

    render(state) {
      this.toggle.dataset.active = String(state.active);
      this.toggle.textContent = state.active ? '连续浏览：开' : '连续浏览：关';
      this.pause.textContent = state.paused ? '继续' : '暂停';
      this.pause.disabled = !state.active;
      this.previous.disabled = !state.canPrevious;
      this.next.disabled = !state.canNext;
      this.duration.value = String(state.photoDurationMs);
      this.panel.hidden = state.collapsed;
      this.launcher.hidden = !state.collapsed;
    }

    setStatus(value) {
      this.status.textContent = value || '已就绪';
      this.status.title = value || '';
    }

    destroy() {
      this.host.remove();
    }
  }

  class ViewerSession {
    constructor(viewer) {
      this.viewer = viewer;
      this.settings = loadSettings();
      this.active = this.settings.continuousEnabled;
      this.paused = false;
      this.hovered = false;
      this.interacting = false;
      this.isNavigating = false;
      this.isZoomed = isMediaZoomed(viewer);
      this.destroyed = false;
      this.currentMedia = undefined;
      this.currentFingerprint = 'none';
      this.mediaCleanup = [];
      this.timerId = 0;
      this.countdownId = 0;
      this.refreshTimer = 0;
      this.interactionTimer = 0;
      this.pendingNavigationTimer = 0;
      this.pendingMediaTarget = takeRecentSourceTarget();
      this.lastConfirmedMediaTarget = undefined;
      this.currentMappingLost = false;

      this.panel = new ControlPanel(this);
      this.observer = new MutationObserver(() => this.requestRefresh());
      this.observer.observe(viewer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'src', 'aria-hidden'],
      });

      this.handleVisibilityChange = () => this.scheduleForCurrentMedia(true);
      this.handleFocusChange = () => this.scheduleForCurrentMedia(true);
      this.handlePointerUp = () => {
        if (!this.interacting) return;
        window.clearTimeout(this.interactionTimer);
        this.interactionTimer = window.setTimeout(() => {
          this.interacting = false;
          this.scheduleForCurrentMedia(true);
        }, INTERACTION_COOLDOWN_MS);
      };

      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      window.addEventListener('focus', this.handleFocusChange);
      window.addEventListener('blur', this.handleFocusChange);
      window.addEventListener('pointerup', this.handlePointerUp, true);
      window.addEventListener('pointercancel', this.handlePointerUp, true);
      this.handleViewerPointerDown = (event) => {
        const direction = getNavigationDirectionFromTarget(this.viewer, event.target);
        if (direction) this.prepareNavigationTarget(direction);
      };
      this.handleViewerKeyDown = (event) => {
        if (event.repeat || !isElementVisible(this.viewer)) return;
        if (event.key === 'ArrowRight') this.prepareNavigationTarget(1);
        else if (event.key === 'ArrowLeft') this.prepareNavigationTarget(-1);
      };
      this.viewer.addEventListener('pointerdown', this.handleViewerPointerDown, true);
      window.addEventListener('keydown', this.handleViewerKeyDown, true);

      this.refresh();
      debugLog('Web K 媒体查看器会话开始', describeElement(viewer));
    }

    viewState() {
      const availability = navigationAvailability(this.viewer);
      return {
        active: this.active,
        paused: this.paused,
        collapsed: this.settings.panelCollapsed,
        photoDurationMs: this.settings.photoDurationMs,
        canPrevious: availability.previous,
        canNext: availability.next,
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
      if (this.destroyed || !this.viewer.isConnected) return;
      const media = findActiveMedia(this.viewer);
      const isZoomed = isMediaZoomed(this.viewer);
      const hasZoomChanged = isZoomed !== this.isZoomed;
      this.isZoomed = isZoomed;
      this.panel.render(this.viewState());
      if (!media) {
        this.panel.setStatus('等待媒体加载');
        return;
      }
      const nextFingerprint = mediaFingerprint(media);
      if (media !== this.currentMedia || nextFingerprint !== this.currentFingerprint) {
        this.bindMedia(media, nextFingerprint);
      } else if (hasZoomChanged) {
        this.scheduleForCurrentMedia(true);
      }
    }

    prepareNavigationTarget(direction) {
      const currentTarget = this.pendingMediaTarget || this.lastConfirmedMediaTarget;
      const adjacentTarget = findAdjacentMediaTarget(currentTarget, direction);
      window.clearTimeout(this.pendingNavigationTimer);
      this.pendingNavigationTimer = 0;
      if (!adjacentTarget) {
        this.pendingMediaTarget = undefined;
        return false;
      }
      adjacentTarget.fromFingerprint = this.currentFingerprint;
      this.pendingMediaTarget = adjacentTarget;
      this.pendingNavigationTimer = window.setTimeout(() => {
        if (this.pendingMediaTarget?.fromFingerprint === this.currentFingerprint) {
          this.pendingMediaTarget = undefined;
        }
        this.pendingNavigationTimer = 0;
      }, NAVIGATION_TIMEOUT_MS);
      return true;
    }

    clearPendingNavigation() {
      window.clearTimeout(this.pendingNavigationTimer);
      this.pendingNavigationTimer = 0;
      this.pendingMediaTarget = undefined;
    }

    confirmCurrentMediaTarget() {
      if (!isMediaSuccessfullyDisplayed(this.currentMedia)) return false;
      const pending = this.pendingMediaTarget;
      const pendingMatchesMedia = pending
        && (pending.fromFingerprint === undefined || pending.fromFingerprint !== this.currentFingerprint);
      if (pendingMatchesMedia) {
        window.clearTimeout(this.pendingNavigationTimer);
        this.pendingNavigationTimer = 0;
        this.lastConfirmedMediaTarget = {
          ...cloneMediaTarget(pending),
          confirmedAt: Date.now(),
          mediaFingerprint: this.currentFingerprint,
        };
        this.pendingMediaTarget = undefined;
        this.currentMappingLost = false;
        debugLog('已确认媒体消息映射', {
          peerKey: this.lastConfirmedMediaTarget.peerKey,
          messageKey: this.lastConfirmedMediaTarget.messageKey,
          albumIndex: this.lastConfirmedMediaTarget.albumIndex,
        });
        return true;
      }
      if (this.lastConfirmedMediaTarget?.mediaFingerprint !== this.currentFingerprint) {
        this.currentMappingLost = true;
      }
      return false;
    }

    createCloseSnapshot() {
      const sequenceId = runtime.closeSequenceId + 1;
      runtime.closeSequenceId = sequenceId;
      if (this.currentMappingLost) {
        return { sequenceId, target: undefined, reason: 'unmapped-current-media', capturedAt: Date.now() };
      }
      const target = cloneMediaTarget(this.lastConfirmedMediaTarget);
      return {
        sequenceId,
        target: target?.confidence === 'high' ? target : undefined,
        reason: target ? '' : 'no-confirmed-target',
        capturedAt: Date.now(),
      };
    }

    bindMedia(media, nextFingerprint) {
      this.clearTimer();
      this.releaseMediaListeners();
      this.currentMedia = media;
      this.currentFingerprint = nextFingerprint;
      this.isNavigating = false;

      const add = (target, type, listener, options) => {
        addEventListenerCleanup(this.mediaCleanup, target, type, listener, options);
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
        this.interacting = true;
        this.clearTimer();
      }, true);
      add(media, 'wheel', () => {
        this.interacting = true;
        this.clearTimer();
        window.clearTimeout(this.interactionTimer);
        this.interactionTimer = window.setTimeout(() => {
          this.interacting = false;
          this.scheduleForCurrentMedia(true);
        }, INTERACTION_COOLDOWN_MS);
      }, { passive: true });

      if (media instanceof HTMLImageElement) {
        add(media, 'load', () => {
          this.confirmCurrentMediaTarget();
          this.scheduleForCurrentMedia(true);
        }, { once: true });
        add(media, 'error', () => {
          this.clearTimer();
          this.clearPendingNavigation();
          this.panel.setStatus('图片加载失败，请手动处理');
        }, { once: true });
      } else if (media instanceof HTMLVideoElement) {
        const confirmVideo = () => this.confirmCurrentMediaTarget();
        add(media, 'loadedmetadata', confirmVideo);
        add(media, 'loadeddata', confirmVideo);
        add(media, 'canplay', confirmVideo);
        add(media, 'playing', confirmVideo);
        add(media, 'ended', () => {
          if (this.active && !this.paused) this.navigate(1, true);
        });
        add(media, 'error', () => {
          this.clearPendingNavigation();
          this.panel.setStatus('视频播放失败，请手动处理');
        });
      }

      this.panel.render(this.viewState());
      this.confirmCurrentMediaTarget();
      this.scheduleForCurrentMedia(true);
    }

    releaseMediaListeners() {
      runCleanupList(this.mediaCleanup);
    }

    clearTimer() {
      this.timerId = clearTimeoutId(this.timerId);
      this.countdownId = clearIntervalId(this.countdownId);
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
        && !this.isZoomed;
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
            playPromise.catch(() => this.panel.setStatus('点击视频开始播放'));
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
      if (this.hovered || this.interacting || this.isZoomed) {
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

    toggleContinuous() {
      this.active = !this.active;
      if (this.active) this.paused = false;
      this.settings = updateSettings(this.settings, { continuousEnabled: this.active });
      this.panel.render(this.viewState());
      this.scheduleForCurrentMedia(true);
    }

    togglePause() {
      if (!this.active) return;
      this.paused = !this.paused;
      this.panel.render(this.viewState());
      this.scheduleForCurrentMedia(true);
    }

    setPhotoDuration(duration) {
      this.settings = updateSettings(this.settings, { photoDurationMs: duration });
      this.panel.render(this.viewState());
      this.scheduleForCurrentMedia(true);
    }

    setPanelCollapsed(collapsed) {
      this.settings = updateSettings(this.settings, { panelCollapsed: collapsed });
      this.panel.render(this.viewState());
    }

    navigate(direction, automatic) {
      if (this.destroyed || this.isNavigating) return;
      if (automatic && (!this.active || this.paused)) return;
      if (!getNavigationButton(this.viewer, direction)) {
        if (automatic) this.finish('已到当前媒体末尾');
        else this.panel.setStatus(direction > 0 ? '没有可用的下一项' : '没有可用的上一项');
        this.panel.render(this.viewState());
        return;
      }

      this.clearTimer();
      this.prepareNavigationTarget(direction);
      const before = this.currentFingerprint;
      this.isNavigating = true;
      this.panel.setStatus(direction > 0 ? '正在切换下一项' : '正在切换上一项');

      if (!dispatchNavigation(this.viewer, direction)) {
        this.clearPendingNavigation();
        this.isNavigating = false;
        this.panel.setStatus('官方切换控件未触发');
        this.panel.render(this.viewState());
        return;
      }

      const startedAt = Date.now();
      const poll = () => {
        if (this.destroyed) return;
        const media = findActiveMedia(this.viewer);
        const after = mediaFingerprint(media);
        if (media && after !== before) {
          this.bindMedia(media, after);
          return;
        }
        if (Date.now() - startedAt >= NAVIGATION_TIMEOUT_MS) {
          this.clearPendingNavigation();
          this.isNavigating = false;
          this.panel.setStatus('媒体未变化，请执行调试检查');
          this.panel.render(this.viewState());
          return;
        }
        window.setTimeout(poll, 100);
      };
      window.setTimeout(poll, 100);
    }

    finish(message) {
      this.active = false;
      this.paused = false;
      this.settings = updateSettings(this.settings, { continuousEnabled: false });
      this.clearTimer();
      this.panel.render(this.viewState());
      this.panel.setStatus(message);
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.clearTimer();
      clearTimeoutId(this.refreshTimer);
      clearTimeoutId(this.interactionTimer);
      clearTimeoutId(this.pendingNavigationTimer);
      this.releaseMediaListeners();
      disconnectObserver(this.observer);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      window.removeEventListener('focus', this.handleFocusChange);
      window.removeEventListener('blur', this.handleFocusChange);
      window.removeEventListener('pointerup', this.handlePointerUp, true);
      window.removeEventListener('pointercancel', this.handlePointerUp, true);
      this.viewer.removeEventListener('pointerdown', this.handleViewerPointerDown, true);
      window.removeEventListener('keydown', this.handleViewerKeyDown, true);
      this.panel.destroy();
      debugLog('Web K 媒体查看器会话结束');
    }
  }

  function installDebugApi(scheduleScan) {
    const api = Object.freeze({
      inspect() {
        const viewer = findMediaViewer();
        const media = viewer && findActiveMedia(viewer);
        const result = {
          client: 'web-k',
          viewer: describeElement(viewer),
          mediaRoot: describeElement(viewer && findMediaRoot(viewer)),
          activeMedia: describeElement(media),
          previousButton: describeElement(viewer && getNavigationButton(viewer, -1)),
          nextButton: describeElement(viewer && getNavigationButton(viewer, 1)),
          navigation: viewer ? navigationAvailability(viewer) : { previous: false, next: false },
          isZoomed: Boolean(viewer && isMediaZoomed(viewer)),
          hostMounted: Boolean(document.getElementById(SCRIPT_ID)),
          sourceProbeCaptured: Boolean(runtime.lastSourceProbe),
          closeProbeStatus: runtime.closeProbe?.status || 'idle',
          locationStatus: runtime.lastLocationResult?.status || 'idle',
          lastConfirmedTarget: runtime.session?.lastConfirmedMediaTarget
            ? {
              peerKey: runtime.session.lastConfirmedMediaTarget.peerKey,
              messageKey: runtime.session.lastConfirmedMediaTarget.messageKey,
              albumIndex: runtime.session.lastConfirmedMediaTarget.albumIndex,
            }
            : undefined,
        };
        console.log('[Telegram Media Continuity] Web K DOM 探测结果', result);
        return result;
      },
      inspectMessageMapping,
      armCloseFlowProbe,
      getCloseFlowProbe() {
        return runtime.closeProbe;
      },
      getLastLocationResult() {
        return runtime.lastLocationResult;
      },
      cancelCloseFlowProbe() {
        clearCloseProbe();
        runtime.closeProbe = { status: 'cancelled', finishedAt: Date.now() };
        return runtime.closeProbe;
      },
      enableDebug(enabled = true) {
        runtime.debugEnabled = Boolean(enabled);
        console.info(`[Telegram Media Continuity] 调试日志已${runtime.debugEnabled ? '开启' : '关闭'}`);
      },
      testPrevious() {
        const viewer = findMediaViewer();
        return Boolean(viewer && dispatchNavigation(viewer, -1));
      },
      testNext() {
        const viewer = findMediaViewer();
        return Boolean(viewer && dispatchNavigation(viewer, 1));
      },
      rescan() {
        scheduleScan();
      },
      getSummary() {
        const viewer = findMediaViewer();
        return {
          version: '0.4.0-k5',
          client: 'web-k',
          settings: loadSettings(),
          viewerDetected: Boolean(viewer),
          navigation: viewer ? navigationAvailability(viewer) : { previous: false, next: false },
          sourceProbeCaptured: Boolean(runtime.lastSourceProbe),
          closeProbeStatus: runtime.closeProbe?.status || 'idle',
          locationStatus: runtime.lastLocationResult?.status || 'idle',
          lastConfirmedTarget: runtime.session?.lastConfirmedMediaTarget
            ? {
              peerKey: runtime.session.lastConfirmedMediaTarget.peerKey,
              messageKey: runtime.session.lastConfirmedMediaTarget.messageKey,
              albumIndex: runtime.session.lastConfirmedMediaTarget.albumIndex,
            }
            : undefined,
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

  const lifecycle = createLifecycle({
    captureSourceTarget: captureSourceProbe,
    clearCloseProbe,
    clearLocationTimers,
    createSession: (viewer) => new ViewerSession(viewer),
    findMediaViewer,
    installDebugApi,
    isElementVisible,
    locateMessageAfterClose,
  });

  lifecycle.initializeScript();
})();
