// ==UserScript==
// @name         Telegram Web K 媒体续播（兼容验证版）
// @namespace    telegram-air/media-continuity
// @version      0.3.0-k3
// @description  为 Telegram Web K 提供图片和视频连续浏览能力
// @match        https://web.telegram.org/k/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const SCRIPT_ID = 'telegram-media-continuity-host';
  const STORAGE_KEY = 'tt.mediaContinuity.v1';
  const SCAN_DELAY_MS = 160;
  const NAVIGATION_TIMEOUT_MS = 3000;
  const INTERACTION_COOLDOWN_MS = 900;
  const DURATIONS = [2000, 3000, 5000, 8000, 10000, 15000, 30000];
  const DEFAULT_SETTINGS = Object.freeze({
    continuousEnabled: false,
    photoDurationMs: 5000,
    panelCollapsed: false,
  });

  const runtime = {
    session: undefined,
    observer: undefined,
    scanTimer: 0,
    periodicTimer: 0,
    debugEnabled: false,
  };

  const mediaNodeIds = new WeakMap();
  let nextMediaNodeId = 1;

  function debugLog(message, data) {
    if (!runtime.debugEnabled) return;
    if (data === undefined) console.debug(`[Telegram Media Continuity] ${message}`);
    else console.debug(`[Telegram Media Continuity] ${message}`, data);
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

  function describeElement(element) {
    if (!(element instanceof Element)) return undefined;
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      classNames: Array.from(element.classList).slice(0, 12),
      role: element.getAttribute('role') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      rect: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      },
      imageCount: element.querySelectorAll('img').length,
      videoCount: element.querySelectorAll('video').length,
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

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      if (isPlainObject(parsed) && isPlainObject(parsed.settings)) {
        return validateSettings(parsed.settings);
      }
      return validateSettings(parsed);
    } catch (error) {
      debugLog('读取本地设置失败', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const nextState = isPlainObject(parsed) ? parsed : {};
      nextState.settings = validateSettings(settings);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      return nextState.settings;
    } catch (error) {
      debugLog('写入本地设置失败', error);
      return validateSettings(settings);
    }
  }

  function updateSettings(current, patch) {
    return saveSettings({ ...current, ...patch });
  }

  function findMediaViewer() {
    const viewer = document.querySelector('.media-viewer-whole');
    return isElementVisible(viewer) ? viewer : undefined;
  }

  function findMediaRoot(viewer) {
    return viewer.querySelector('.media-viewer-movers') || viewer;
  }

  function getNavigationButton(viewer, direction) {
    const selector = direction > 0
      ? '.media-viewer-switcher-right'
      : '.media-viewer-switcher-left';
    const button = viewer.querySelector(selector);
    if (!isElementVisible(button)) return undefined;
    if (button.classList.contains('hide')) return undefined;
    return button;
  }

  function navigationAvailability(viewer) {
    return {
      previous: Boolean(getNavigationButton(viewer, -1)),
      next: Boolean(getNavigationButton(viewer, 1)),
    };
  }

  function mediaScore(media, rootRect) {
    if (!isElementVisible(media)) return -Infinity;
    const rect = media.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 60) return -Infinity;
    const rootCenterX = rootRect.left + rootRect.width / 2;
    const rootCenterY = rootRect.top + rootRect.height / 2;
    const mediaCenterX = rect.left + rect.width / 2;
    const mediaCenterY = rect.top + rect.height / 2;
    const distance = Math.hypot(mediaCenterX - rootCenterX, mediaCenterY - rootCenterY);
    let score = Math.min((rect.width * rect.height) / 1000, 1200) - distance;
    if (media instanceof HTMLVideoElement && !media.paused) score += 300;
    if (rect.left <= rootCenterX && rect.right >= rootCenterX
      && rect.top <= rootCenterY && rect.bottom >= rootCenterY) {
      score += 500;
    }
    return score;
  }

  function findActiveMedia(viewer) {
    const root = findMediaRoot(viewer);
    const rootRect = root.getBoundingClientRect();
    let best;
    let bestScore = -Infinity;
    for (const media of root.querySelectorAll('img, video')) {
      const score = mediaScore(media, rootRect);
      if (score > bestScore) {
        bestScore = score;
        best = media;
      }
    }
    return best;
  }

  function getMediaNodeId(media) {
    if (!mediaNodeIds.has(media)) {
      mediaNodeIds.set(media, nextMediaNodeId);
      nextMediaNodeId += 1;
    }
    return mediaNodeIds.get(media);
  }

  function mediaFingerprint(media) {
    if (!media) return 'none';
    const source = media.currentSrc || media.src || '';
    const size = media instanceof HTMLVideoElement
      ? `${media.videoWidth}x${media.videoHeight}`
      : `${media.naturalWidth}x${media.naturalHeight}`;
    return `${media.tagName}|${getMediaNodeId(media)}|${size}|${source.slice(-120)}`;
  }

  function isMediaZoomed(viewer) {
    return viewer.classList.contains('is-zooming');
  }

  function dispatchNavigation(viewer, direction) {
    const button = getNavigationButton(viewer, direction);
    if (!button) return false;
    debugLog('触发 Web K 官方方向控件', {
      direction,
      button: describeElement(button),
    });
    button.click();
    return true;
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

    bindMedia(media, nextFingerprint) {
      this.clearTimer();
      this.releaseMediaListeners();
      this.currentMedia = media;
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
        add(media, 'load', () => this.scheduleForCurrentMedia(true), { once: true });
        add(media, 'error', () => {
          this.clearTimer();
          this.panel.setStatus('图片加载失败，请手动处理');
        }, { once: true });
      } else if (media instanceof HTMLVideoElement) {
        add(media, 'ended', () => {
          if (this.active && !this.paused) this.navigate(1, true);
        });
        add(media, 'error', () => this.panel.setStatus('视频播放失败，请手动处理'));
      }

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
      const before = this.currentFingerprint;
      this.isNavigating = true;
      this.panel.setStatus(direction > 0 ? '正在切换下一项' : '正在切换上一项');

      if (!dispatchNavigation(this.viewer, direction)) {
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
      window.clearTimeout(this.refreshTimer);
      window.clearTimeout(this.interactionTimer);
      this.releaseMediaListeners();
      this.observer.disconnect();
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      window.removeEventListener('focus', this.handleFocusChange);
      window.removeEventListener('blur', this.handleFocusChange);
      window.removeEventListener('pointerup', this.handlePointerUp, true);
      window.removeEventListener('pointercancel', this.handlePointerUp, true);
      this.panel.destroy();
      debugLog('Web K 媒体查看器会话结束');
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
          client: 'web-k',
          viewer: describeElement(viewer),
          mediaRoot: describeElement(viewer && findMediaRoot(viewer)),
          activeMedia: describeElement(media),
          previousButton: describeElement(viewer && getNavigationButton(viewer, -1)),
          nextButton: describeElement(viewer && getNavigationButton(viewer, 1)),
          navigation: viewer ? navigationAvailability(viewer) : { previous: false, next: false },
          isZoomed: Boolean(viewer && isMediaZoomed(viewer)),
          hostMounted: Boolean(document.getElementById(SCRIPT_ID)),
        };
        console.log('[Telegram Media Continuity] Web K DOM 探测结果', result);
        return result;
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
          version: '0.3.0-k3',
          client: 'web-k',
          settings: loadSettings(),
          viewerDetected: Boolean(viewer),
          navigation: viewer ? navigationAvailability(viewer) : { previous: false, next: false },
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
    const marker = 'web-k-ready';
    if (document.documentElement.dataset.telegramMediaContinuity === marker) return;
    document.documentElement.dataset.telegramMediaContinuity = marker;
    runtime.debugEnabled = /(?:[?#&])ttMediaDebug=1(?:&|$)/.test(location.href);
    installDebugApi();

    runtime.observer = new MutationObserver(scheduleScan);
    runtime.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    runtime.periodicTimer = window.setInterval(() => {
      if (runtime.session) runtime.session.requestRefresh();
      else scheduleScan();
    }, 1000);

    window.addEventListener('pagehide', () => runtime.session?.destroy());
    window.addEventListener('popstate', scheduleScan);
    window.addEventListener('hashchange', scheduleScan);
    scheduleScan();
    console.info('[Telegram Media Continuity] Web K script initialized');
  }

  initializeScript();
})();
