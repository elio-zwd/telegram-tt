import { debugLog } from '../../core/logger.js';
import { runtime } from '../../core/runtime.js';
import { findMediaViewer } from '../../platform/media-viewer.js';
import { findExactMessageNode } from '../../platform/message-list.js';

const LOCATION_WAIT_TIMEOUT_MS = 2400;
const LOCATION_POLL_MS = 80;
const LOCATION_REVIEW_DELAY_MS = 420;
const LOCATION_HIGHLIGHT_MS = 1200;
const LOCATION_STYLE_ID = 'telegram-media-continuity-location-style';
const LOCATION_HIGHLIGHT_CLASS = 'tt-media-continuity-location-highlight';
const LOCATION_NOTICE_ID = 'telegram-media-continuity-location-notice';

function ensureLocationStyle() {
  if (document.getElementById(LOCATION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LOCATION_STYLE_ID;
  style.textContent = `
    @keyframes ttMediaContinuityPulse {
      0% { box-shadow: 0 0 0 0 rgba(42, 171, 238, .7); }
      45% { box-shadow: 0 0 0 8px rgba(42, 171, 238, .18); }
      100% { box-shadow: 0 0 0 0 rgba(42, 171, 238, 0); }
    }
    .${LOCATION_HIGHLIGHT_CLASS} {
      animation: ttMediaContinuityPulse ${LOCATION_HIGHLIGHT_MS}ms ease-out !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function showLocationNotice(message) {
  document.getElementById(LOCATION_NOTICE_ID)?.remove();
  const notice = document.createElement('div');
  notice.id = LOCATION_NOTICE_ID;
  notice.setAttribute('role', 'status');
  notice.textContent = message;
  notice.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:24px',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'max-width:min(86vw,420px)',
    'padding:9px 14px',
    'border-radius:11px',
    'background:rgba(20,24,32,.92)',
    'color:#fff',
    'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'box-shadow:0 8px 28px rgba(0,0,0,.28)',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(notice);
  window.setTimeout(() => notice.remove(), 1800);
}

export function clearLocationTimers() {
  for (const timerId of runtime.locationTimers) window.clearTimeout(timerId);
  runtime.locationTimers.clear();
  for (const node of document.querySelectorAll(`.${LOCATION_HIGHLIGHT_CLASS}`)) {
    node.classList.remove(LOCATION_HIGHLIGHT_CLASS);
  }
}

function setLocationTimer(callback, delay) {
  const timerId = window.setTimeout(() => {
    runtime.locationTimers.delete(timerId);
    callback();
  }, delay);
  runtime.locationTimers.add(timerId);
  return timerId;
}

function recordLocationResult(sequenceId, status, target, extra = {}) {
  runtime.lastLocationResult = {
    sequenceId,
    status,
    finishedAt: Date.now(),
    target: target
      ? {
        peerKey: target.peerKey,
        messageKey: target.messageKey,
        albumIndex: target.albumIndex,
        confidence: target.confidence,
      }
      : undefined,
    ...extra,
  };
  debugLog('关闭后定位结果', runtime.lastLocationResult);
}

function centerAndHighlightMessage(node, container, sequenceId, target) {
  ensureLocationStyle();
  node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  node.classList.remove(LOCATION_HIGHLIGHT_CLASS);
  void node.offsetWidth;
  node.classList.add(LOCATION_HIGHLIGHT_CLASS);
  setLocationTimer(() => node.classList.remove(LOCATION_HIGHLIGHT_CLASS), LOCATION_HIGHLIGHT_MS);
  setLocationTimer(() => {
    if (runtime.activeLocationSequenceId !== sequenceId || !node.isConnected || !container.isConnected) return;
    const nodeRect = node.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const delta = (nodeRect.top + nodeRect.height / 2) - (containerRect.top + containerRect.height / 2);
    if (Math.abs(delta) > Math.min(120, containerRect.height * 0.18)) {
      container.scrollTop += delta;
    }
  }, LOCATION_REVIEW_DELAY_MS);
  recordLocationResult(sequenceId, 'located', target, { source: 'exact-dom-match' });
  showLocationNotice('已定位到最后查看消息');
}

export function locateMessageAfterClose(snapshot) {
  if (!snapshot) return;
  clearLocationTimers();
  runtime.activeLocationSequenceId = snapshot.sequenceId;
  const startedAt = performance.now();

  if (!snapshot.target) {
    recordLocationResult(snapshot.sequenceId, snapshot.reason || 'no-confirmed-target');
    showLocationNotice(snapshot.reason === 'unmapped-current-media'
      ? '无法确认媒体所属消息，已正常关闭'
      : '最后查看消息当前未加载');
    return;
  }

  const poll = () => {
    if (runtime.activeLocationSequenceId !== snapshot.sequenceId) return;
    if (findMediaViewer()) {
      if (performance.now() - startedAt >= LOCATION_WAIT_TIMEOUT_MS) {
        recordLocationResult(snapshot.sequenceId, 'viewer-still-visible', snapshot.target);
        return;
      }
      setLocationTimer(poll, LOCATION_POLL_MS);
      return;
    }

    const match = findExactMessageNode(snapshot.target);
    if (match.node && match.container) {
      centerAndHighlightMessage(match.node, match.container, snapshot.sequenceId, snapshot.target);
      return;
    }
    if (match.reason === 'peer-changed') {
      recordLocationResult(snapshot.sequenceId, 'cancelled-peer-changed', snapshot.target);
      return;
    }
    if (performance.now() - startedAt >= LOCATION_WAIT_TIMEOUT_MS) {
      recordLocationResult(snapshot.sequenceId, 'target-not-loaded', snapshot.target);
      showLocationNotice('最后查看消息当前未加载');
      return;
    }
    setLocationTimer(poll, LOCATION_POLL_MS);
  };

  requestAnimationFrame(() => requestAnimationFrame(poll));
}
