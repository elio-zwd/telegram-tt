export function addEventListenerCleanup(cleanupList, target, type, listener, options) {
  target.addEventListener(type, listener, options);
  cleanupList.push(() => target.removeEventListener(type, listener, options));
}

export function runCleanupList(cleanupList) {
  for (const cleanup of cleanupList.splice(0)) cleanup();
}

export function clearTimeoutId(timerId) {
  if (timerId) window.clearTimeout(timerId);
  return 0;
}

export function clearIntervalId(timerId) {
  if (timerId) window.clearInterval(timerId);
  return 0;
}

export function disconnectObserver(observer) {
  observer?.disconnect();
}
