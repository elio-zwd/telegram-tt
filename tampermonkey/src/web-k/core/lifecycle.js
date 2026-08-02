import { runtime } from './runtime.js';

const SCAN_DELAY_MS = 160;
const PERIODIC_SCAN_MS = 1000;
const INITIALIZED_MARKER = 'web-k-ready';

export function createLifecycle({
  captureSourceTarget,
  clearCloseProbe,
  clearLocationTimers,
  continuation,
  createSession,
  findMediaViewer,
  installDebugApi,
  isElementVisible,
  locateMessageAfterClose,
}) {
  function scanPage() {
    runtime.scanTimer = 0;
    if (runtime.session && (!runtime.session.viewer.isConnected || !isElementVisible(runtime.session.viewer))) {
      const closedViewer = runtime.session.viewer;
      const isContinuationClose = continuation?.shouldSkipClosePosition(closedViewer);
      const closeSnapshot = isContinuationClose ? undefined : runtime.session.createCloseSnapshot();
      runtime.session.destroy();
      runtime.session = undefined;
      if (isContinuationClose) continuation.handleViewerClosed(closedViewer);
      else locateMessageAfterClose(closeSnapshot);
    }

    const viewer = findMediaViewer();
    if (!viewer) return;
    if (runtime.session && runtime.session.viewer === viewer) {
      runtime.session.requestRefresh();
      return;
    }
    if (runtime.session) runtime.session.destroy();
    clearLocationTimers();
    runtime.activeLocationSequenceId += 1;
    const continuationContext = continuation?.takeSessionContext(viewer);
    runtime.session = createSession(viewer, continuationContext);
  }

  function scheduleScan() {
    if (runtime.scanTimer) return;
    runtime.scanTimer = window.setTimeout(scanPage, SCAN_DELAY_MS);
  }

  function handlePageHide() {
    continuation?.cancel('pagehide');
    clearCloseProbe();
    clearLocationTimers();
    runtime.activeLocationSequenceId += 1;
    document.removeEventListener('pointerdown', captureSourceTarget, true);
    runtime.session?.destroy();
  }

  function initializeScript() {
    if (document.documentElement.dataset.telegramMediaContinuity === INITIALIZED_MARKER) return;
    document.documentElement.dataset.telegramMediaContinuity = INITIALIZED_MARKER;
    runtime.debugEnabled = /(?:[?#&])ttMediaDebug=1(?:&|$)/.test(location.href);
    installDebugApi(scheduleScan);

    document.addEventListener('pointerdown', captureSourceTarget, true);
    runtime.observer = new MutationObserver(scheduleScan);
    runtime.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
    runtime.periodicTimer = window.setInterval(() => {
      if (runtime.session) runtime.session.requestRefresh();
      else scheduleScan();
    }, PERIODIC_SCAN_MS);

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('popstate', scheduleScan);
    window.addEventListener('hashchange', scheduleScan);
    scheduleScan();
    console.info('[Telegram Media Continuity] Web K script initialized');
  }

  return Object.freeze({ initializeScript, scheduleScan });
}
