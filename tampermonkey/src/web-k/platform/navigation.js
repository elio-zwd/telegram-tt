import { debugLog } from '../core/logger.js';
import { describeElement, isElementVisible } from './dom.js';

const PREVIOUS_SELECTOR = '.media-viewer-switcher-left';
const NEXT_SELECTOR = '.media-viewer-switcher-right';
const NAVIGATION_SELECTOR = `${PREVIOUS_SELECTOR}, ${NEXT_SELECTOR}`;

export function getNavigationButton(viewer, direction) {
  const selector = direction > 0 ? NEXT_SELECTOR : PREVIOUS_SELECTOR;
  const button = viewer.querySelector(selector);
  if (!isElementVisible(button)) return undefined;
  if (button.classList.contains('hide')) return undefined;
  return button;
}

export function navigationAvailability(viewer) {
  return {
    previous: Boolean(getNavigationButton(viewer, -1)),
    next: Boolean(getNavigationButton(viewer, 1)),
  };
}

export function dispatchNavigation(viewer, direction) {
  const button = getNavigationButton(viewer, direction);
  if (!button) return false;
  debugLog('触发 Web K 官方方向控件', {
    direction,
    button: describeElement(button),
  });
  button.click();
  return true;
}

export function getNavigationDirectionFromTarget(viewer, target) {
  if (!(target instanceof Element)) return 0;
  const button = target.closest(NAVIGATION_SELECTOR);
  if (!button || !viewer.contains(button)) return 0;
  return button.matches(NEXT_SELECTOR) ? 1 : -1;
}
