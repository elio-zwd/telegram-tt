import {
  addEventListenerCleanup,
  clearIntervalId,
  clearTimeoutId,
  disconnectObserver,
  runCleanupList,
} from '../../core/cleanup.js';
import { debugLog } from '../../core/logger.js';
import { loadSettings, updateSettings } from '../../core/settings.js';
import { describeElement, isElementVisible } from '../../platform/dom.js';
import {
  findActiveMedia,
  isMediaZoomed,
  mediaFingerprint,
} from '../../platform/media-viewer.js';
import {
  dispatchNavigation,
  getNavigationButton,
  getNavigationDirectionFromTarget,
  navigationAvailability,
} from '../../platform/navigation.js';
import { MediaTargetTracker } from '../close-position/index.js';

const NAVIGATION_TIMEOUT_MS = 3000;
const INTERACTION_COOLDOWN_MS = 900;
const REFRESH_DELAY_MS = 80;
const NAVIGATION_POLL_MS = 100;
const COUNTDOWN_REFRESH_MS = 200;

export class ViewerSession {
  constructor(viewer, { controlPanelHostId, createControlPanel }) {
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
    this.targetTracker = new MediaTargetTracker({
      getCurrentFingerprint: () => this.currentFingerprint,
    });

    this.panel = createControlPanel({
      hostId: controlPanelHostId,
      onToggleContinuous: () => this.toggleContinuous(),
      onTogglePause: () => this.togglePause(),
      onNavigate: (direction, automatic) => this.navigate(direction, automatic),
      onSetPhotoDuration: (duration) => this.setPhotoDuration(duration),
      onSetBrowseDirection: (direction) => this.setBrowseDirection(direction),
      onSetPanelCollapsed: (collapsed) => this.setPanelCollapsed(collapsed),
    });
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
      browseDirection: this.settings.browseDirection,
      canPrevious: availability.previous,
      canNext: availability.next,
    };
  }

  getAutomaticDirection() {
    return this.settings.browseDirection === 'backward' ? -1 : 1;
  }

  requestRefresh() {
    if (this.destroyed || this.refreshTimer) return;
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = 0;
      this.refresh();
    }, REFRESH_DELAY_MS);
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
    return this.targetTracker.prepareNavigationTarget(direction);
  }

  clearPendingNavigation() {
    this.targetTracker.clearPendingNavigation();
  }

  confirmCurrentMediaTarget() {
    return this.targetTracker.confirmCurrentMediaTarget(this.currentMedia);
  }

  createCloseSnapshot() {
    return this.targetTracker.createCloseSnapshot();
  }

  getLastConfirmedMediaTarget() {
    return this.targetTracker.getLastConfirmedMediaTarget();
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
        if (this.active && !this.paused) this.navigate(this.getAutomaticDirection(), true);
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

    const automaticDirection = this.getAutomaticDirection();
    const automaticDirectionLabel = automaticDirection > 0 ? '下一项' : '上一项';

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
        this.panel.setStatus(`视频结束后自动切换${automaticDirectionLabel}`);
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
      this.panel.setStatus(`图片 ${(remaining / 1000).toFixed(1)} 秒后切换${automaticDirectionLabel}`);
    };
    updateCountdown();
    this.countdownId = window.setInterval(updateCountdown, COUNTDOWN_REFRESH_MS);
    this.timerId = window.setTimeout(() => {
      this.clearTimer();
      this.navigate(automaticDirection, true);
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

  setBrowseDirection(direction) {
    this.settings = updateSettings(this.settings, { browseDirection: direction });
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
      if (automatic) this.finish(direction > 0 ? '已到当前媒体末尾' : '已到当前媒体开头');
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
      window.setTimeout(poll, NAVIGATION_POLL_MS);
    };
    window.setTimeout(poll, NAVIGATION_POLL_MS);
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
    this.targetTracker.destroy();
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
