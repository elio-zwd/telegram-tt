import {
  addEventListenerCleanup,
  clearIntervalId,
  clearTimeoutId,
  disconnectObserver,
  runCleanupList,
} from '../../core/cleanup.js';
import { debugLog } from '../../core/logger.js';
import {
  isValidPhotoDurationMs,
  isValidVideoPlaybackRate,
  isValidVideoVolume,
  loadSettings,
  normalizeVideoVolume,
  updateSettings,
} from '../../core/settings.js';
import { describeElement, isElementVisible } from '../../platform/dom.js';
import {
  findActiveMedia,
  getMediaType,
  isLoopMedia,
  isMediaSuccessfullyDisplayed,
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
const FILTER_SKIP_DELAY_MS = 80;
const FILTER_SEQUENCE_MAX_SKIPS = 50;
const FILTER_SEQUENCE_TIMEOUT_MS = 15000;
const BUFFERING_WARNING_MS = 15000;
const EDITABLE_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
].join(', ');

const PAUSE_REASONS = Object.freeze({
  USER: 'user',
  PAGE: 'page',
  FULLSCREEN: 'fullscreen',
  PICTURE_IN_PICTURE: 'picture-in-picture',
  OFFLINE: 'offline',
  BUFFERING: 'buffering',
  USER_ACTION_REQUIRED: 'user-action-required',
  FAILURE: 'failure',
  NODE_INVALID: 'node-invalid',
  MEDIA_CONFLICT: 'media-conflict',
  FILTER: 'filter',
  HOVER: 'hover',
  INTERACTION: 'interaction',
  ZOOM: 'zoom',
});

const MANUAL_PAUSE_REASONS = Object.freeze([
  PAUSE_REASONS.USER,
  PAUSE_REASONS.FILTER,
  PAUSE_REASONS.USER_ACTION_REQUIRED,
  PAUSE_REASONS.FAILURE,
  PAUSE_REASONS.NODE_INVALID,
  PAUSE_REASONS.MEDIA_CONFLICT,
]);

const MEDIA_SCOPED_PAUSE_REASONS = Object.freeze([
  PAUSE_REASONS.BUFFERING,
  PAUSE_REASONS.USER_ACTION_REQUIRED,
  PAUSE_REASONS.FAILURE,
  PAUSE_REASONS.NODE_INVALID,
  PAUSE_REASONS.MEDIA_CONFLICT,
  PAUSE_REASONS.HOVER,
]);

const PAUSE_STATUS = Object.freeze({
  [PAUSE_REASONS.USER]: '连续浏览已暂停',
  [PAUSE_REASONS.PAGE]: '页面失焦，自动切换暂停',
  [PAUSE_REASONS.FULLSCREEN]: '全屏期间自动切换暂停',
  [PAUSE_REASONS.PICTURE_IN_PICTURE]: '画中画期间自动切换暂停',
  [PAUSE_REASONS.OFFLINE]: '网络离线，自动切换暂停',
  [PAUSE_REASONS.BUFFERING]: '媒体缓冲中，自动切换暂停',
  [PAUSE_REASONS.USER_ACTION_REQUIRED]: '点击视频开始播放',
  [PAUSE_REASONS.FAILURE]: '媒体加载失败，请手动处理',
  [PAUSE_REASONS.NODE_INVALID]: '等待有效媒体节点',
  [PAUSE_REASONS.MEDIA_CONFLICT]: '媒体状态发生变化，连续浏览已暂停',
  [PAUSE_REASONS.FILTER]: '媒体筛选已暂停',
  [PAUSE_REASONS.HOVER]: '鼠标悬停，倒计时暂停',
  [PAUSE_REASONS.INTERACTION]: '正在操作媒体，倒计时暂停',
  [PAUSE_REASONS.ZOOM]: '正在查看图片，倒计时暂停',
});

const PAUSE_STATUS_PRIORITY = Object.freeze([
  PAUSE_REASONS.FAILURE,
  PAUSE_REASONS.MEDIA_CONFLICT,
  PAUSE_REASONS.USER_ACTION_REQUIRED,
  PAUSE_REASONS.OFFLINE,
  PAUSE_REASONS.FULLSCREEN,
  PAUSE_REASONS.PICTURE_IN_PICTURE,
  PAUSE_REASONS.PAGE,
  PAUSE_REASONS.BUFFERING,
  PAUSE_REASONS.USER,
  PAUSE_REASONS.FILTER,
  PAUSE_REASONS.NODE_INVALID,
  PAUSE_REASONS.ZOOM,
  PAUSE_REASONS.INTERACTION,
  PAUSE_REASONS.HOVER,
]);

const MEDIA_TYPE_LABELS = Object.freeze({
  images: '图片',
  videos: '视频',
});

export class ViewerSession {
  constructor(viewer, { controlPanelHostId, createControlPanel }) {
    this.viewer = viewer;
    this.settings = loadSettings();
    this.active = this.settings.continuousEnabled;
    this.pauseReasons = new Set();
    this.isNavigating = false;
    this.destroyed = false;
    this.currentMedia = undefined;
    this.currentFingerprint = 'none';
    this.currentLoopState = undefined;
    this.currentVideoHasPlayed = false;
    this.isZoomed = isMediaZoomed(viewer);
    this.mediaSequenceId = 0;
    this.mediaCleanup = [];
    this.timerId = 0;
    this.countdownId = 0;
    this.refreshTimer = 0;
    this.interactionTimer = 0;
    this.navigationPollTimer = 0;
    this.navigationAttemptId = 0;
    this.filterSkipTimer = 0;
    this.filterSequenceId = 0;
    this.filterSequence = undefined;
    this.bufferingTimer = 0;
    this.isBufferingSlow = false;
    this.bufferingRecovered = false;
    this.onlineRecoveryPending = navigator.onLine === false;
    this.blockCurrentTargetConfirmation = false;
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
      onSetMediaFilter: (filter) => this.setMediaFilter(filter),
      onSetVideoMuted: (muted) => this.setVideoMuted(muted),
      onSetVideoVolume: (volume) => this.setVideoVolume(volume),
      onSetVideoPlaybackRate: (rate) => this.setVideoPlaybackRate(rate),
      onSetPanelCollapsed: (collapsed) => this.setPanelCollapsed(collapsed),
    });
    this.observer = new MutationObserver(() => this.requestRefresh());
    this.observer.observe(viewer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'src', 'loop', 'aria-hidden'],
    });

    this.handleVisibilityChange = () => this.syncPagePauseReason();
    this.handleFocusChange = () => this.syncPagePauseReason();
    this.handleOffline = () => this.suspendForOffline();
    this.handleOnline = () => this.prepareOnlineRecovery();
    this.handleFullscreenChange = () => this.syncFullscreenPauseReason();
    this.handlePictureInPictureChange = (event) => {
      if (event.type === 'enterpictureinpicture') {
        if (event.target === this.currentMedia || document.pictureInPictureElement === this.currentMedia) {
          this.addPauseReason(PAUSE_REASONS.PICTURE_IN_PICTURE);
        }
        return;
      }
      if (!document.pictureInPictureElement) {
        this.removePauseReason(PAUSE_REASONS.PICTURE_IN_PICTURE);
      }
    };
    this.handlePointerUp = () => {
      if (!this.hasPauseReason(PAUSE_REASONS.INTERACTION)) return;
      window.clearTimeout(this.interactionTimer);
      this.interactionTimer = window.setTimeout(() => {
        this.interactionTimer = 0;
        this.removePauseReason(PAUSE_REASONS.INTERACTION);
      }, INTERACTION_COOLDOWN_MS);
    };

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    document.addEventListener('enterpictureinpicture', this.handlePictureInPictureChange, true);
    document.addEventListener('leavepictureinpicture', this.handlePictureInPictureChange, true);
    window.addEventListener('focus', this.handleFocusChange);
    window.addEventListener('blur', this.handleFocusChange);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('pointerup', this.handlePointerUp, true);
    window.addEventListener('pointercancel', this.handlePointerUp, true);
    this.handleViewerPointerDown = (event) => {
      const direction = getNavigationDirectionFromTarget(this.viewer, event.target);
      if (!direction) return;
      this.takeOverFilterSequence();
      this.prepareNavigationTarget(direction);
    };
    this.handleViewerKeyDown = (event) => {
      if (event.repeat || !isElementVisible(this.viewer) || isEditableEventTarget(event)) return;
      if (event.key === 'ArrowRight') {
        this.takeOverFilterSequence();
        this.prepareNavigationTarget(1);
      } else if (event.key === 'ArrowLeft') {
        this.takeOverFilterSequence();
        this.prepareNavigationTarget(-1);
      }
    };
    this.viewer.addEventListener('pointerdown', this.handleViewerPointerDown, true);
    window.addEventListener('keydown', this.handleViewerKeyDown, true);

    this.syncPagePauseReason(false);
    this.syncFullscreenPauseReason(false);
    if (this.isZoomed) this.addPauseReason(PAUSE_REASONS.ZOOM, undefined, false);
    if (this.onlineRecoveryPending) this.addPauseReason(PAUSE_REASONS.OFFLINE, undefined, false);
    this.refresh();
    debugLog('Web K 媒体查看器会话开始', describeElement(viewer));
  }

  viewState() {
    const availability = navigationAvailability(this.viewer);
    return {
      active: this.active,
      paused: this.hasManualPause(),
      suspended: this.hasAutomationPause(),
      collapsed: this.settings.panelCollapsed,
      photoDurationMs: this.settings.photoDurationMs,
      browseDirection: this.settings.browseDirection,
      mediaFilter: this.settings.mediaFilter,
      videoMuted: this.settings.videoMuted,
      videoVolume: this.settings.videoVolume,
      videoPlaybackRate: this.settings.videoPlaybackRate,
      canPrevious: availability.previous,
      canNext: availability.next,
    };
  }

  getAutomaticDirection() {
    return this.settings.browseDirection === 'backward' ? -1 : 1;
  }

  hasPauseReason(reason) {
    return this.pauseReasons.has(reason);
  }

  hasAutomationPause() {
    return this.pauseReasons.size > 0;
  }

  hasManualPause() {
    return MANUAL_PAUSE_REASONS.some((reason) => this.hasPauseReason(reason))
      || (this.isBufferingSlow && this.hasPauseReason(PAUSE_REASONS.BUFFERING));
  }

  getPauseStatus() {
    if (this.isBufferingSlow && this.hasPauseReason(PAUSE_REASONS.BUFFERING)) {
      return '媒体加载较慢，连续浏览已暂停';
    }
    const reason = PAUSE_STATUS_PRIORITY.find((candidate) => this.hasPauseReason(candidate));
    return reason ? PAUSE_STATUS[reason] : '';
  }

  addPauseReason(reason, status, shouldRender = true) {
    this.pauseReasons.add(reason);
    this.clearTimer();
    this.filterSkipTimer = clearTimeoutId(this.filterSkipTimer);
    if (shouldRender) this.panel.render(this.viewState());
    this.panel.setStatus(status || this.getPauseStatus());
  }

  removePauseReason(reason, shouldResume = true) {
    if (!this.pauseReasons.delete(reason)) return;
    this.panel.render(this.viewState());
    if (shouldResume) this.resumeCurrentMedia();
  }

  clearMediaPauseReasons() {
    for (const reason of MEDIA_SCOPED_PAUSE_REASONS) this.pauseReasons.delete(reason);
    this.isBufferingSlow = false;
    this.bufferingRecovered = false;
    this.bufferingTimer = clearTimeoutId(this.bufferingTimer);
  }

  resumeCurrentMedia() {
    if (this.destroyed) return;
    if (this.hasAutomationPause()) {
      this.clearTimer();
      this.panel.setStatus(this.getPauseStatus());
      return;
    }
    if (this.handleFilterSequenceForCurrentMedia()) return;
    this.confirmCurrentMediaTarget();
    this.scheduleForCurrentMedia(true);
  }

  syncPagePauseReason(shouldResume = true) {
    const shouldPause = document.hidden || !document.hasFocus();
    if (shouldPause) {
      this.addPauseReason(PAUSE_REASONS.PAGE, undefined, shouldResume);
      return;
    }
    this.removePauseReason(PAUSE_REASONS.PAGE, shouldResume);
  }

  syncFullscreenPauseReason(shouldResume = true) {
    if (document.fullscreenElement) {
      this.addPauseReason(PAUSE_REASONS.FULLSCREEN, undefined, shouldResume);
      return;
    }
    if (!this.hasPauseReason(PAUSE_REASONS.FULLSCREEN)) return;
    this.pauseReasons.delete(PAUSE_REASONS.FULLSCREEN);
    this.panel.render(this.viewState());
    const previousMediaSequenceId = this.mediaSequenceId;
    this.refresh();
    if (shouldResume && previousMediaSequenceId === this.mediaSequenceId) this.resumeCurrentMedia();
  }

  suspendForOffline() {
    this.onlineRecoveryPending = true;
    this.addPauseReason(PAUSE_REASONS.OFFLINE);
  }

  prepareOnlineRecovery() {
    if (!this.hasPauseReason(PAUSE_REASONS.OFFLINE)) return;
    this.onlineRecoveryPending = true;
    if (this.currentMedia instanceof HTMLImageElement
      && isMediaSuccessfullyDisplayed(this.currentMedia)
      && this.isCurrentMedia(this.currentMedia, this.mediaSequenceId)) {
      this.confirmOnlineRecovery(this.currentMedia, this.mediaSequenceId, 'load');
      return;
    }
    this.panel.setStatus('网络已恢复，等待当前媒体重新就绪');
  }

  confirmOnlineRecovery(media, mediaSequenceId, eventType, shouldResume = true) {
    if (!this.onlineRecoveryPending || navigator.onLine === false) return false;
    if (!this.isCurrentMedia(media, mediaSequenceId)) return false;
    if (media instanceof HTMLVideoElement && eventType !== 'canplay' && eventType !== 'playing') return false;
    if (media instanceof HTMLImageElement && eventType !== 'load' && !isMediaSuccessfullyDisplayed(media)) return false;
    this.onlineRecoveryPending = false;
    this.removePauseReason(PAUSE_REASONS.OFFLINE, shouldResume);
    return true;
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
    if (hasZoomChanged && isZoomed) this.addPauseReason(PAUSE_REASONS.ZOOM, undefined, false);
    else if (hasZoomChanged) this.removePauseReason(PAUSE_REASONS.ZOOM, false);

    if (!media) {
      this.invalidateCurrentMedia();
      this.panel.render(this.viewState());
      this.panel.setStatus(this.getPauseStatus() || '等待媒体加载');
      return;
    }

    const nextFingerprint = mediaFingerprint(media);
    if (media !== this.currentMedia || nextFingerprint !== this.currentFingerprint) {
      this.bindMedia(media, nextFingerprint);
      return;
    }
    if (media instanceof HTMLVideoElement && media.loop !== this.currentLoopState) {
      this.addPauseReason(PAUSE_REASONS.MEDIA_CONFLICT);
      return;
    }
    this.panel.render(this.viewState());
    if (hasZoomChanged && !isZoomed) this.resumeCurrentMedia();
  }

  invalidateCurrentMedia() {
    if (!this.currentMedia && this.hasPauseReason(PAUSE_REASONS.NODE_INVALID)) return;
    this.clearTimer();
    this.releaseMediaListeners();
    this.completeNavigationAttempt();
    this.mediaSequenceId += 1;
    this.currentMedia = undefined;
    this.currentFingerprint = 'none';
    this.currentLoopState = undefined;
    this.currentVideoHasPlayed = false;
    this.addPauseReason(PAUSE_REASONS.NODE_INVALID, undefined, false);
  }

  prepareNavigationTarget(direction) {
    return this.targetTracker.prepareNavigationTarget(direction);
  }

  clearPendingNavigation() {
    this.targetTracker.clearPendingNavigation();
  }

  confirmCurrentMediaTarget() {
    if (this.blockCurrentTargetConfirmation
      || this.hasPauseReason(PAUSE_REASONS.FAILURE)
      || this.hasPauseReason(PAUSE_REASONS.NODE_INVALID)
      || this.hasPauseReason(PAUSE_REASONS.MEDIA_CONFLICT)) {
      return false;
    }
    return this.targetTracker.confirmCurrentMediaTarget(this.currentMedia);
  }

  createCloseSnapshot() {
    return this.targetTracker.createCloseSnapshot();
  }

  getLastConfirmedMediaTarget() {
    return this.targetTracker.getLastConfirmedMediaTarget();
  }

  isCurrentMedia(media, mediaSequenceId) {
    return !this.destroyed
      && mediaSequenceId === this.mediaSequenceId
      && this.currentMedia === media
      && media.isConnected
      && this.viewer.isConnected
      && this.viewer.contains(media);
  }

  bindMedia(media, nextFingerprint) {
    this.clearTimer();
    this.releaseMediaListeners();
    this.completeNavigationAttempt();
    this.clearMediaPauseReasons();
    this.mediaSequenceId += 1;
    const mediaSequenceId = this.mediaSequenceId;
    this.currentMedia = media;
    this.currentFingerprint = nextFingerprint;
    this.currentLoopState = media instanceof HTMLVideoElement ? media.loop : undefined;
    this.currentVideoHasPlayed = media instanceof HTMLVideoElement
      && !media.paused
      && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    this.blockCurrentTargetConfirmation = false;

    const add = (target, type, listener, options) => {
      addEventListenerCleanup(this.mediaCleanup, target, type, listener, options);
    };

    add(media, 'pointerenter', () => {
      if (!this.isCurrentMedia(media, mediaSequenceId)) return;
      this.addPauseReason(PAUSE_REASONS.HOVER);
    });
    add(media, 'pointerleave', () => {
      if (!this.isCurrentMedia(media, mediaSequenceId)) return;
      this.removePauseReason(PAUSE_REASONS.HOVER);
    });
    add(media, 'pointerdown', () => {
      if (!this.isCurrentMedia(media, mediaSequenceId)) return;
      this.addPauseReason(PAUSE_REASONS.INTERACTION);
    }, true);
    add(media, 'wheel', () => {
      if (!this.isCurrentMedia(media, mediaSequenceId)) return;
      this.addPauseReason(PAUSE_REASONS.INTERACTION);
      window.clearTimeout(this.interactionTimer);
      this.interactionTimer = window.setTimeout(() => {
        this.interactionTimer = 0;
        this.removePauseReason(PAUSE_REASONS.INTERACTION);
      }, INTERACTION_COOLDOWN_MS);
    }, { passive: true });

    if (media instanceof HTMLImageElement) {
      add(media, 'load', () => {
        if (!this.isCurrentMedia(media, mediaSequenceId)) return;
        this.confirmOnlineRecovery(media, mediaSequenceId, 'load', false);
        this.confirmCurrentMediaTarget();
        this.scheduleForCurrentMedia(true);
      });
      add(media, 'error', () => {
        this.handleMediaError(media, mediaSequenceId, '图片加载失败，请手动处理');
      });
    } else if (media instanceof HTMLVideoElement) {
      this.applyVideoPreferences(media);
      const confirmVideo = () => {
        if (!this.isCurrentMedia(media, mediaSequenceId)) return;
        this.confirmCurrentMediaTarget();
      };
      const handleVideoReady = (eventType) => {
        if (!this.isCurrentMedia(media, mediaSequenceId)) return;
        this.bufferingTimer = clearTimeoutId(this.bufferingTimer);
        this.bufferingRecovered = true;
        if (!this.isBufferingSlow) {
          this.pauseReasons.delete(PAUSE_REASONS.BUFFERING);
        }
        if (eventType === 'playing') {
          this.currentVideoHasPlayed = true;
          this.pauseReasons.delete(PAUSE_REASONS.USER_ACTION_REQUIRED);
        }
        this.confirmOnlineRecovery(media, mediaSequenceId, eventType, false);
        this.confirmCurrentMediaTarget();
        this.panel.render(this.viewState());
        this.resumeCurrentMedia();
      };
      add(media, 'loadedmetadata', confirmVideo);
      add(media, 'loadeddata', confirmVideo);
      add(media, 'canplay', () => handleVideoReady('canplay'));
      add(media, 'playing', () => handleVideoReady('playing'));
      add(media, 'waiting', () => this.handleBuffering(media, mediaSequenceId));
      add(media, 'stalled', () => this.handleBuffering(media, mediaSequenceId));
      add(media, 'ended', () => {
        if (!this.isCurrentMedia(media, mediaSequenceId) || isLoopMedia(media)) return;
        if (this.active && !this.hasAutomationPause() && !this.blockCurrentTargetConfirmation) {
          this.navigate(this.getAutomaticDirection(), true);
        }
      });
      add(media, 'error', () => {
        if (!media.error || !Number.isInteger(media.error.code) || media.error.code <= 0) return;
        this.handleMediaError(media, mediaSequenceId, '视频播放失败，请手动处理');
      });
      add(media, 'volumechange', () => this.syncVideoPreferencesFromMedia(media, mediaSequenceId));
      add(media, 'ratechange', () => this.syncVideoPreferencesFromMedia(media, mediaSequenceId));
      if (document.pictureInPictureElement === media) {
        this.addPauseReason(PAUSE_REASONS.PICTURE_IN_PICTURE, undefined, false);
      }
    }

    this.panel.render(this.viewState());
    if (this.handleFilterSequenceForCurrentMedia()) return;
    this.confirmCurrentMediaTarget();
    if (media instanceof HTMLImageElement && this.onlineRecoveryPending && isMediaSuccessfullyDisplayed(media)) {
      this.confirmOnlineRecovery(media, mediaSequenceId, 'load', false);
    }
    this.scheduleForCurrentMedia(true);
  }

  handleMediaError(media, mediaSequenceId, message) {
    if (!this.isCurrentMedia(media, mediaSequenceId)) return;
    this.cancelFilterSequence();
    this.blockCurrentTargetConfirmation = true;
    this.clearPendingNavigation();
    this.addPauseReason(PAUSE_REASONS.FAILURE, message);
  }

  handleBuffering(media, mediaSequenceId) {
    if (!this.isCurrentMedia(media, mediaSequenceId)) return;
    if (this.hasPauseReason(PAUSE_REASONS.BUFFERING)) return;
    this.isBufferingSlow = false;
    this.bufferingRecovered = false;
    this.addPauseReason(PAUSE_REASONS.BUFFERING);
    this.bufferingTimer = window.setTimeout(() => {
      this.bufferingTimer = 0;
      if (!this.isCurrentMedia(media, mediaSequenceId)
        || !this.hasPauseReason(PAUSE_REASONS.BUFFERING)) return;
      this.isBufferingSlow = true;
      this.panel.setStatus('媒体加载较慢，连续浏览已暂停');
    }, BUFFERING_WARNING_MS);
  }

  applyVideoPreferences(media) {
    if (!(media instanceof HTMLVideoElement) || isLoopMedia(media)) return;
    if (media.muted !== this.settings.videoMuted) media.muted = this.settings.videoMuted;
    if (media.volume !== this.settings.videoVolume) media.volume = this.settings.videoVolume;
    if (media.playbackRate !== this.settings.videoPlaybackRate) {
      media.playbackRate = this.settings.videoPlaybackRate;
    }
  }

  syncVideoPreferencesFromMedia(media, mediaSequenceId) {
    if (!this.isCurrentMedia(media, mediaSequenceId) || isLoopMedia(media)) return;
    const videoVolume = normalizeVideoVolume(media.volume);
    if (videoVolume === undefined) return;
    const patch = {};
    if (media.muted !== this.settings.videoMuted) patch.videoMuted = media.muted;
    if (videoVolume !== this.settings.videoVolume) patch.videoVolume = videoVolume;
    if (!isValidVideoPlaybackRate(media.playbackRate)) {
      media.playbackRate = this.settings.videoPlaybackRate;
    } else if (media.playbackRate !== this.settings.videoPlaybackRate) {
      patch.videoPlaybackRate = media.playbackRate;
    }
    if (!Object.keys(patch).length) return;
    this.settings = updateSettings(this.settings, patch);
    this.panel.render(this.viewState());
  }

  handleFilterSequenceForCurrentMedia() {
    const sequence = this.filterSequence;
    if (!this.isFilterSequenceCurrent(sequence)) return false;

    if (this.hasFilterSequenceTimedOut(sequence)) {
      this.blockCurrentTargetConfirmation = true;
      this.pauseFilterSequence('筛选跳过超过总时限，连续浏览已暂停');
      return true;
    }

    const mediaType = getMediaType(this.currentMedia);
    if (!mediaType) {
      this.blockCurrentTargetConfirmation = true;
      this.pauseFilterSequence('无法可靠判断媒体类型，连续浏览已暂停');
      return true;
    }
    if (mediaType === sequence.filter) {
      this.cancelFilterSequence();
      this.blockCurrentTargetConfirmation = false;
      return false;
    }

    this.blockCurrentTargetConfirmation = true;
    if (sequence.lastFingerprint !== this.currentFingerprint) {
      sequence.lastFingerprint = this.currentFingerprint;
      sequence.skipped += 1;
    }
    if (sequence.skipped >= FILTER_SEQUENCE_MAX_SKIPS) {
      this.pauseFilterSequence(`已连续跳过 ${FILTER_SEQUENCE_MAX_SKIPS} 项，连续浏览已暂停`);
      return true;
    }
    if (this.hasAutomationPause()) {
      this.panel.setStatus(this.getPauseStatus());
      return true;
    }
    const typeLabel = MEDIA_TYPE_LABELS[mediaType] || '媒体';
    this.panel.setStatus(`正在跳过${typeLabel}（${sequence.skipped}/${FILTER_SEQUENCE_MAX_SKIPS}）`);
    this.filterSkipTimer = window.setTimeout(() => {
      this.filterSkipTimer = 0;
      this.continueFilterSequence(sequence);
    }, FILTER_SKIP_DELAY_MS);
    return true;
  }

  continueFilterSequence(sequence) {
    if (!this.isFilterSequenceCurrent(sequence) || this.hasAutomationPause()) return;
    if (this.hasFilterSequenceTimedOut(sequence)) {
      this.pauseFilterSequence('筛选跳过超过总时限，连续浏览已暂停');
      return;
    }
    this.navigateOnce(sequence.direction, true, sequence);
  }

  startFilterSequence(direction) {
    this.cancelFilterSequence();
    this.filterSequenceId += 1;
    this.filterSequence = {
      id: this.filterSequenceId,
      direction,
      filter: this.settings.mediaFilter,
      startedAt: Date.now(),
      skipped: 0,
      lastFingerprint: undefined,
    };
    return this.filterSequence;
  }

  isFilterSequenceCurrent(sequence) {
    return Boolean(sequence
      && this.filterSequence === sequence
      && sequence.id === this.filterSequenceId
      && sequence.filter === this.settings.mediaFilter
      && sequence.direction === this.getAutomaticDirection()
      && this.active
      && !this.destroyed);
  }

  hasFilterSequenceTimedOut(sequence) {
    return Date.now() - sequence.startedAt >= FILTER_SEQUENCE_TIMEOUT_MS;
  }

  cancelFilterSequence() {
    this.filterSkipTimer = clearTimeoutId(this.filterSkipTimer);
    this.filterSequence = undefined;
  }

  takeOverFilterSequence() {
    if (!this.filterSequence && !this.blockCurrentTargetConfirmation
      && !this.hasPauseReason(PAUSE_REASONS.FILTER)) return;
    this.cancelFilterSequence();
    this.filterSequenceId += 1;
    this.pauseReasons.delete(PAUSE_REASONS.FILTER);
    this.blockCurrentTargetConfirmation = false;
    this.confirmCurrentMediaTarget();
  }

  pauseFilterSequence(message) {
    this.cancelFilterSequence();
    this.filterSequenceId += 1;
    this.blockCurrentTargetConfirmation = true;
    this.addPauseReason(PAUSE_REASONS.FILTER, message);
  }

  releaseMediaListeners() {
    runCleanupList(this.mediaCleanup);
  }

  clearTimer() {
    this.timerId = clearTimeoutId(this.timerId);
    this.countdownId = clearIntervalId(this.countdownId);
  }

  completeNavigationAttempt() {
    this.navigationPollTimer = clearTimeoutId(this.navigationPollTimer);
    this.navigationAttemptId += 1;
    this.isNavigating = false;
  }

  canRunTimedMedia() {
    if (!this.active || this.hasAutomationPause() || !this.currentMedia || this.timerId) return false;
    if (this.currentMedia instanceof HTMLImageElement) {
      return this.currentMedia.complete && this.currentMedia.naturalWidth > 0;
    }
    return isLoopMedia(this.currentMedia)
      && this.currentVideoHasPlayed
      && !this.currentMedia.paused
      && !this.currentMedia.ended;
  }

  scheduleForCurrentMedia(forceRestart = false) {
    if (this.destroyed || !this.currentMedia || this.blockCurrentTargetConfirmation) return;
    if (!this.isCurrentMedia(this.currentMedia, this.mediaSequenceId)) {
      this.invalidateCurrentMedia();
      return;
    }
    if (forceRestart) this.clearTimer();
    if (this.hasAutomationPause()) {
      this.clearTimer();
      this.panel.setStatus(this.getPauseStatus());
      return;
    }

    const automaticDirection = this.getAutomaticDirection();
    const automaticDirectionLabel = automaticDirection > 0 ? '下一项' : '上一项';

    if (this.currentMedia instanceof HTMLVideoElement) {
      if (!this.active) {
        this.clearTimer();
        this.panel.setStatus('连续浏览已关闭');
        return;
      }
      if (this.currentMedia.ended && !isLoopMedia(this.currentMedia)) {
        this.clearTimer();
        this.panel.setStatus('视频已结束，请手动切换');
        return;
      }
      if (this.currentMedia.paused) {
        this.clearTimer();
        this.attemptVideoPlayback(this.currentMedia, this.mediaSequenceId);
        return;
      }
      if (isLoopMedia(this.currentMedia)) {
        if (!this.currentVideoHasPlayed) {
          this.clearTimer();
          this.panel.setStatus('等待循环媒体开始播放');
          return;
        }
        this.startTimedMediaCountdown('循环媒体', automaticDirectionLabel);
        return;
      }
      this.clearTimer();
      this.panel.setStatus(`视频结束后自动切换${automaticDirectionLabel}`);
      return;
    }

    if (!(this.currentMedia instanceof HTMLImageElement)) {
      this.clearTimer();
      this.panel.setStatus('当前媒体类型暂不支持');
      return;
    }
    if (!this.currentMedia.complete || this.currentMedia.naturalWidth <= 0) {
      this.panel.setStatus('等待图片加载');
      return;
    }
    if (!this.active) {
      this.panel.setStatus('连续浏览已关闭');
      return;
    }
    this.startTimedMediaCountdown('图片', automaticDirectionLabel);
  }

  startTimedMediaCountdown(mediaLabel, automaticDirectionLabel) {
    if (!this.canRunTimedMedia()) return;
    const media = this.currentMedia;
    const mediaSequenceId = this.mediaSequenceId;
    const duration = this.settings.photoDurationMs;
    const startedAt = Date.now();
    const updateCountdown = () => {
      if (!this.isCurrentMedia(media, mediaSequenceId)) return;
      const remaining = Math.max(0, duration - (Date.now() - startedAt));
      this.panel.setStatus(`${mediaLabel} ${(remaining / 1000).toFixed(1)} 秒后切换${automaticDirectionLabel}`);
    };
    updateCountdown();
    this.countdownId = window.setInterval(updateCountdown, COUNTDOWN_REFRESH_MS);
    this.timerId = window.setTimeout(() => {
      if (!this.isCurrentMedia(media, mediaSequenceId) || this.hasAutomationPause()) return;
      this.clearTimer();
      this.navigate(this.getAutomaticDirection(), true);
    }, duration);
  }

  attemptVideoPlayback(media, mediaSequenceId) {
    const playPromise = media.play();
    if (!playPromise || typeof playPromise.catch !== 'function') {
      this.panel.setStatus('等待视频播放');
      return;
    }
    playPromise.catch((error) => {
      if (!this.isCurrentMedia(media, mediaSequenceId)) return;
      const isNotAllowed = error && error.name === 'NotAllowedError';
      const status = isNotAllowed ? '点击视频开始播放' : '视频暂时无法播放，请手动处理';
      this.addPauseReason(PAUSE_REASONS.USER_ACTION_REQUIRED, status);
    });
  }

  toggleContinuous() {
    this.takeOverFilterSequence();
    this.active = !this.active;
    if (this.active) {
      this.pauseReasons.delete(PAUSE_REASONS.USER);
      this.pauseReasons.delete(PAUSE_REASONS.FILTER);
    } else {
      this.clearTimer();
    }
    this.settings = updateSettings(this.settings, { continuousEnabled: this.active });
    this.panel.render(this.viewState());
    this.resumeCurrentMedia();
  }

  togglePause() {
    if (!this.active) return;
    if (this.hasManualPause()) {
      this.resumeFromManualPause();
      return;
    }
    this.takeOverFilterSequence();
    this.addPauseReason(PAUSE_REASONS.USER);
  }

  resumeFromManualPause() {
    this.pauseReasons.delete(PAUSE_REASONS.USER);
    if (this.hasPauseReason(PAUSE_REASONS.FILTER)) this.takeOverFilterSequence();

    if (this.isBufferingSlow && this.hasPauseReason(PAUSE_REASONS.BUFFERING)) {
      if (!this.bufferingRecovered) {
        this.panel.render(this.viewState());
        this.panel.setStatus('当前媒体仍在缓冲，请稍后重试');
        return;
      }
      this.isBufferingSlow = false;
      this.bufferingRecovered = false;
      this.pauseReasons.delete(PAUSE_REASONS.BUFFERING);
    }

    if (this.hasPauseReason(PAUSE_REASONS.NODE_INVALID)) {
      const previousMediaSequenceId = this.mediaSequenceId;
      this.refresh();
      if (previousMediaSequenceId !== this.mediaSequenceId) return;
      if (!this.currentMedia) {
        this.panel.setStatus('等待有效媒体节点');
        return;
      }
      this.pauseReasons.delete(PAUSE_REASONS.NODE_INVALID);
    }

    if (this.hasPauseReason(PAUSE_REASONS.MEDIA_CONFLICT)) {
      if (!(this.currentMedia instanceof HTMLVideoElement)) return;
      this.currentLoopState = this.currentMedia.loop;
      this.pauseReasons.delete(PAUSE_REASONS.MEDIA_CONFLICT);
    }

    if (this.hasPauseReason(PAUSE_REASONS.FAILURE)) {
      const videoHasError = this.currentMedia instanceof HTMLVideoElement
        && this.currentMedia.error
        && Number.isInteger(this.currentMedia.error.code)
        && this.currentMedia.error.code > 0;
      if (videoHasError || !isMediaSuccessfullyDisplayed(this.currentMedia)) {
        this.panel.render(this.viewState());
        this.panel.setStatus('当前媒体仍不可用，请手动切换或重试');
        return;
      }
      this.pauseReasons.delete(PAUSE_REASONS.FAILURE);
      this.blockCurrentTargetConfirmation = false;
    }

    this.pauseReasons.delete(PAUSE_REASONS.USER_ACTION_REQUIRED);
    this.panel.render(this.viewState());
    this.resumeCurrentMedia();
  }

  setPhotoDuration(duration) {
    if (!isValidPhotoDurationMs(duration)) return false;
    this.settings = updateSettings(this.settings, { photoDurationMs: duration });
    this.panel.render(this.viewState());
    if (this.currentMedia instanceof HTMLImageElement || isLoopMedia(this.currentMedia)) {
      this.scheduleForCurrentMedia(true);
    }
    return true;
  }

  setBrowseDirection(direction) {
    this.takeOverFilterSequence();
    this.settings = updateSettings(this.settings, { browseDirection: direction });
    this.panel.render(this.viewState());
    this.scheduleForCurrentMedia(true);
  }

  setMediaFilter(filter) {
    this.takeOverFilterSequence();
    this.settings = updateSettings(this.settings, { mediaFilter: filter });
    this.panel.render(this.viewState());
    this.scheduleForCurrentMedia(true);
  }

  setVideoMuted(muted) {
    if (typeof muted !== 'boolean') return false;
    this.settings = updateSettings(this.settings, { videoMuted: muted });
    if (this.currentMedia instanceof HTMLVideoElement && !isLoopMedia(this.currentMedia)) {
      this.applyVideoPreferences(this.currentMedia);
    }
    this.panel.render(this.viewState());
    return true;
  }

  setVideoVolume(volume) {
    if (!isValidVideoVolume(volume)) return false;
    const videoVolume = normalizeVideoVolume(volume);
    this.settings = updateSettings(this.settings, { videoVolume });
    if (this.currentMedia instanceof HTMLVideoElement && !isLoopMedia(this.currentMedia)) {
      this.applyVideoPreferences(this.currentMedia);
    }
    this.panel.render(this.viewState());
    return true;
  }

  setVideoPlaybackRate(rate) {
    if (!isValidVideoPlaybackRate(rate)) return false;
    this.settings = updateSettings(this.settings, { videoPlaybackRate: rate });
    if (this.currentMedia instanceof HTMLVideoElement && !isLoopMedia(this.currentMedia)) {
      this.applyVideoPreferences(this.currentMedia);
    }
    this.panel.render(this.viewState());
    return true;
  }

  setPanelCollapsed(collapsed) {
    this.settings = updateSettings(this.settings, { panelCollapsed: collapsed });
    this.panel.render(this.viewState());
  }

  navigate(direction, automatic) {
    if (this.destroyed) return;
    if (automatic && (!this.active || this.hasAutomationPause())) return;

    if (!automatic) {
      this.takeOverFilterSequence();
      this.navigateOnce(direction, false);
      return;
    }
    if (this.settings.mediaFilter === 'all') {
      this.cancelFilterSequence();
      this.navigateOnce(direction, true);
      return;
    }

    const sequence = this.startFilterSequence(direction);
    this.navigateOnce(direction, true, sequence);
  }

  navigateOnce(direction, automatic, filterSequence) {
    if (this.destroyed || this.isNavigating) return;
    if (automatic && (!this.active || this.hasAutomationPause())) return;
    if (filterSequence && !this.isFilterSequenceCurrent(filterSequence)) return;
    if (filterSequence && this.hasFilterSequenceTimedOut(filterSequence)) {
      this.pauseFilterSequence('筛选跳过超过总时限，连续浏览已暂停');
      return;
    }
    if (!getNavigationButton(this.viewer, direction)) {
      if (automatic) {
        const message = filterSequence
          ? (direction > 0 ? '已到当前媒体末尾，未找到更多匹配媒体' : '已到当前媒体开头，未找到更多匹配媒体')
          : (direction > 0 ? '已到当前媒体末尾' : '已到当前媒体开头');
        this.finish(message);
      } else {
        this.panel.setStatus(direction > 0 ? '没有可用的下一项' : '没有可用的上一项');
      }
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
      if (filterSequence) this.pauseFilterSequence('官方切换控件未触发，连续浏览已暂停');
      else this.panel.setStatus('官方切换控件未触发');
      this.panel.render(this.viewState());
      return;
    }

    const attemptId = this.navigationAttemptId + 1;
    this.navigationAttemptId = attemptId;
    const startedAt = Date.now();
    const poll = () => {
      if (this.destroyed || attemptId !== this.navigationAttemptId) return;
      const media = findActiveMedia(this.viewer);
      const after = mediaFingerprint(media);
      if (media && after !== before) {
        this.bindMedia(media, after);
        return;
      }
      if (filterSequence
        && this.isFilterSequenceCurrent(filterSequence)
        && this.hasFilterSequenceTimedOut(filterSequence)) {
        this.clearPendingNavigation();
        this.completeNavigationAttempt();
        this.pauseFilterSequence('筛选跳过超过总时限，连续浏览已暂停');
        return;
      }
      if (Date.now() - startedAt >= NAVIGATION_TIMEOUT_MS) {
        this.clearPendingNavigation();
        this.completeNavigationAttempt();
        if (filterSequence) {
          if (this.isFilterSequenceCurrent(filterSequence)) {
            this.pauseFilterSequence('媒体未变化，筛选已暂停');
          }
        } else {
          this.panel.setStatus('媒体未变化，请执行调试检查');
        }
        this.panel.render(this.viewState());
        return;
      }
      this.navigationPollTimer = window.setTimeout(poll, NAVIGATION_POLL_MS);
    };
    this.navigationPollTimer = window.setTimeout(poll, NAVIGATION_POLL_MS);
  }

  finish(message) {
    this.cancelFilterSequence();
    this.filterSequenceId += 1;
    this.active = false;
    this.pauseReasons.delete(PAUSE_REASONS.USER);
    this.pauseReasons.delete(PAUSE_REASONS.FILTER);
    this.settings = updateSettings(this.settings, { continuousEnabled: false });
    this.clearTimer();
    this.panel.render(this.viewState());
    this.panel.setStatus(message);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimer();
    this.cancelFilterSequence();
    this.completeNavigationAttempt();
    this.bufferingTimer = clearTimeoutId(this.bufferingTimer);
    clearTimeoutId(this.refreshTimer);
    clearTimeoutId(this.interactionTimer);
    this.targetTracker.destroy();
    this.releaseMediaListeners();
    disconnectObserver(this.observer);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    document.removeEventListener('enterpictureinpicture', this.handlePictureInPictureChange, true);
    document.removeEventListener('leavepictureinpicture', this.handlePictureInPictureChange, true);
    window.removeEventListener('focus', this.handleFocusChange);
    window.removeEventListener('blur', this.handleFocusChange);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('pointerup', this.handlePointerUp, true);
    window.removeEventListener('pointercancel', this.handlePointerUp, true);
    this.viewer.removeEventListener('pointerdown', this.handleViewerPointerDown, true);
    window.removeEventListener('keydown', this.handleViewerKeyDown, true);
    this.panel.destroy();
    debugLog('Web K 媒体查看器会话结束');
  }
}

function isEditableEventTarget(event) {
  const eventPath = typeof event.composedPath === 'function'
    ? event.composedPath()
    : [event.target];

  return eventPath.some((target) => target instanceof Element
    && target.matches(EDITABLE_TARGET_SELECTOR));
}
