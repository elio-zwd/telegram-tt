import { createKeyboardShortcuts } from './keyboard-shortcuts.js';

export function createShortcutSession(session, { isViewerVisible }) {
  let destroyed = false;
  const shortcuts = createKeyboardShortcuts({
    viewer: session.viewer,
    isViewerVisible,
    onToggleContinuous: () => session.toggleContinuous(),
    onTogglePause: () => session.togglePause(),
  });

  return Object.freeze({
    viewer: session.viewer,
    requestRefresh: () => session.requestRefresh(),
    createCloseSnapshot: () => session.createCloseSnapshot(),
    getLastConfirmedMediaTarget: () => session.getLastConfirmedMediaTarget(),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      shortcuts.destroy();
      session.destroy();
    },
  });
}
