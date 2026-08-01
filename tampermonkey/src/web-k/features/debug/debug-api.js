import { runtime } from '../../core/runtime.js';
import { loadSettings } from '../../core/settings.js';
import { describeElement } from '../../platform/dom.js';
import {
  findActiveMedia,
  findMediaRoot,
  findMediaViewer,
  isMediaZoomed,
} from '../../platform/media-viewer.js';
import {
  dispatchNavigation,
  getNavigationButton,
  navigationAvailability,
} from '../../platform/navigation.js';
import { WEB_K_VERSION } from '../../version.js';

function describeLastConfirmedTarget() {
  const target = runtime.session?.getLastConfirmedMediaTarget();
  return target
    ? {
      peerKey: target.peerKey,
      messageKey: target.messageKey,
      albumIndex: target.albumIndex,
    }
    : undefined;
}

export function installDebugApi({ scheduleScan, scriptId, probes }) {
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
        hostMounted: Boolean(document.getElementById(scriptId)),
        sourceProbeCaptured: Boolean(runtime.lastSourceProbe),
        closeProbeStatus: runtime.closeProbe?.status || 'idle',
        locationStatus: runtime.lastLocationResult?.status || 'idle',
        lastConfirmedTarget: describeLastConfirmedTarget(),
      };
      console.log('[Telegram Media Continuity] Web K DOM 探测结果', result);
      return result;
    },
    inspectMessageMapping: probes.inspectMessageMapping,
    armCloseFlowProbe: probes.armCloseFlowProbe,
    getCloseFlowProbe() {
      return runtime.closeProbe;
    },
    getLastLocationResult() {
      return runtime.lastLocationResult;
    },
    cancelCloseFlowProbe() {
      probes.clearCloseProbe();
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
        version: WEB_K_VERSION,
        client: 'web-k',
        settings: loadSettings(),
        viewerDetected: Boolean(viewer),
        navigation: viewer ? navigationAvailability(viewer) : { previous: false, next: false },
        sourceProbeCaptured: Boolean(runtime.lastSourceProbe),
        closeProbeStatus: runtime.closeProbe?.status || 'idle',
        locationStatus: runtime.lastLocationResult?.status || 'idle',
        lastConfirmedTarget: describeLastConfirmedTarget(),
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
