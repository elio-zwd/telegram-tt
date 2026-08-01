import { createLifecycle } from './core/lifecycle.js';
import { captureSourceProbe, clearLocationTimers, locateMessageAfterClose } from './features/close-position/index.js';
import { createViewerSession } from './features/continuous-browsing/index.js';
import { createControlPanel } from './features/control-panel/index.js';
import { createDebugFeature } from './features/debug/index.js';
import { createShortcutSession } from './features/shortcuts/index.js';
import { isElementVisible } from './platform/dom.js';
import { findMediaViewer } from './platform/media-viewer.js';

const CONTROL_PANEL_HOST_ID = 'telegram-media-continuity-host';

export function createApp() {
  const debugFeature = createDebugFeature({ scriptId: CONTROL_PANEL_HOST_ID });
  const lifecycle = createLifecycle({
    captureSourceTarget: (event) => captureSourceProbe(event, CONTROL_PANEL_HOST_ID),
    clearCloseProbe: debugFeature.clearCloseProbe,
    clearLocationTimers,
    createSession: (viewer) => {
      const viewerSession = createViewerSession(viewer, {
        controlPanelHostId: CONTROL_PANEL_HOST_ID,
        createControlPanel,
      });
      return createShortcutSession(viewerSession, {
        isViewerVisible: () => isElementVisible(viewer),
      });
    },
    findMediaViewer,
    installDebugApi: debugFeature.installDebugApi,
    isElementVisible,
    locateMessageAfterClose,
  });

  return Object.freeze({
    start: lifecycle.initializeScript,
    scheduleScan: lifecycle.scheduleScan,
  });
}
