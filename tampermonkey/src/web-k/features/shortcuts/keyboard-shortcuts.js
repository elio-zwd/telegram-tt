const EDITABLE_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
].join(', ');

const SHORTCUT_ACTIONS = Object.freeze({
  toggleContinuous: 'toggle-continuous',
  togglePause: 'toggle-pause',
});

export function createKeyboardShortcuts({
  viewer,
  isViewerVisible,
  onToggleContinuous,
  onTogglePause,
}) {
  let destroyed = false;

  function handleKeyDown(event) {
    if (destroyed || event.defaultPrevented || event.repeat || event.isComposing) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (!viewer.isConnected || !isViewerVisible()) return;
    if (isEditableEventTarget(event)) return;

    const action = getShortcutAction(event);
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();

    if (action === SHORTCUT_ACTIONS.togglePause) onTogglePause();
    else onToggleContinuous();
  }

  window.addEventListener('keydown', handleKeyDown, true);

  return Object.freeze({
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('keydown', handleKeyDown, true);
    },
  });
}

function getShortcutAction(event) {
  if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') {
    return SHORTCUT_ACTIONS.togglePause;
  }
  if (event.code === 'KeyA' || event.key.toLowerCase() === 'a') {
    return SHORTCUT_ACTIONS.toggleContinuous;
  }
  return undefined;
}

function isEditableEventTarget(event) {
  const eventPath = typeof event.composedPath === 'function'
    ? event.composedPath()
    : [event.target];

  return eventPath.some((target) => target instanceof Element
    && target.matches(EDITABLE_TARGET_SELECTOR));
}
