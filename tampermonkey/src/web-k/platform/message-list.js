import {
  MESSAGE_ID_ATTRIBUTES,
  PEER_ID_ATTRIBUTES,
  describeElement,
  isElementVisible,
} from './dom.js';
import { findMediaViewer } from './media-viewer.js';

const CHAT_SCROLL_SELECTOR = '.scrollable.scrollable-y.bubbles-scrollable';
const MEDIA_OPEN_SELECTORS = Object.freeze([
  '.media-photo-aspect',
  '.attachment',
]);

export function findMessageNode(target) {
  let current = target instanceof Element ? target : undefined;
  for (let depth = 0; current && depth < 14; depth += 1) {
    const hasMessageId = MESSAGE_ID_ATTRIBUTES.some((attributeName) => {
      const value = current.getAttribute(attributeName);
      return Boolean(value && /^-?\d+$/.test(value));
    });
    if (hasMessageId) return current;
    current = current.parentElement;
  }
  return undefined;
}

export function getMessageIdentity(messageNode) {
  if (!(messageNode instanceof Element)) return undefined;
  let messageId = '';
  let peerId = '';
  for (const attributeName of MESSAGE_ID_ATTRIBUTES) {
    const value = messageNode.getAttribute(attributeName);
    if (value && /^-?\d+$/.test(value)) {
      messageId = value;
      break;
    }
  }
  for (const attributeName of PEER_ID_ATTRIBUTES) {
    const value = messageNode.getAttribute(attributeName);
    if (value && /^-?\d+$/.test(value)) {
      peerId = value;
      break;
    }
  }
  return messageId ? { messageId, peerId } : undefined;
}

function findMediaFromTarget(target, messageNode, point) {
  if (!(target instanceof Element) || !(messageNode instanceof Element)) return undefined;
  if (target.matches('img, video')) return target;

  let current = target;
  while (current && current !== messageNode) {
    const media = current.querySelectorAll('img, video');
    if (media.length === 1) return media[0];
    current = current.parentElement;
  }

  const candidates = Array.from(messageNode.querySelectorAll('img, video'))
    .filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width >= 32 && rect.height >= 32;
    });
  if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
    const hit = candidates.find((item) => {
      const rect = item.getBoundingClientRect();
      return point.x >= rect.left && point.x <= rect.right
        && point.y >= rect.top && point.y <= rect.bottom;
    });
    if (hit) return hit;
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

function getProbeAlbumIndex(messageNode, media) {
  if (!(messageNode instanceof Element) || !(media instanceof Element)) return 0;
  const mediaItems = Array.from(messageNode.querySelectorAll('img, video'))
    .filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width >= 32 && rect.height >= 32;
    });
  const index = mediaItems.indexOf(media);
  return index >= 0 ? index : 0;
}

export function captureSourceTarget(event, scriptId) {
  const target = event.target;
  if (!(target instanceof Element) || target.closest(`#${scriptId}`) || findMediaViewer()) return undefined;
  const result = { shouldCancelLocation: true };
  const messageNode = findMessageNode(target);
  const identity = getMessageIdentity(messageNode);
  if (!messageNode || !identity) return result;
  const media = findMediaFromTarget(target, messageNode, { x: event.clientX, y: event.clientY });
  if (!media) return result;

  const ancestorChain = [];
  let current = target;
  for (let depth = 0; current && current !== messageNode && depth < 6; depth += 1) {
    ancestorChain.push(describeElement(current));
    current = current.parentElement;
  }
  ancestorChain.push(describeElement(messageNode));

  const capturedAt = Date.now();
  const albumIndex = getProbeAlbumIndex(messageNode, media);
  return {
    ...result,
    probe: {
      capturedAt,
      identity,
      albumIndex,
      mediaTag: media.tagName.toLowerCase(),
      messageNode: describeElement(messageNode),
      targetAncestors: ancestorChain.filter(Boolean),
    },
    target: identity.peerId
      ? {
        capturedAt,
        peerKey: identity.peerId,
        messageKey: identity.messageId,
        albumIndex,
        source: 'source-message',
        confidence: 'high',
        sourceMessageNode: messageNode,
      }
      : undefined,
  };
}

export function cloneMediaTarget(target) {
  if (!target) return undefined;
  return {
    capturedAt: target.capturedAt || Date.now(),
    peerKey: String(target.peerKey || ''),
    messageKey: String(target.messageKey || ''),
    albumIndex: Number.isInteger(target.albumIndex) ? target.albumIndex : 0,
    mediaType: target.mediaType,
    source: target.source || 'source-message',
    confidence: target.confidence || 'high',
    confirmedAt: target.confirmedAt || 0,
    mediaFingerprint: target.mediaFingerprint || '',
    sourceMessageNode: target.sourceMessageNode,
  };
}

export function getMediaTargetKey(target) {
  if (!target?.peerKey || !target.messageKey) return '';
  return `${target.peerKey}:${target.messageKey}:${Number.isInteger(target.albumIndex) ? target.albumIndex : 0}`;
}

function isChatMediaNode(node) {
  if (!(node instanceof Element) || node.classList.contains('pinned-message')) return false;
  const identity = getMessageIdentity(node);
  if (!identity?.peerId || !node.closest(CHAT_SCROLL_SELECTOR)) return false;
  if (node.classList.contains('album-item')) return true;
  if (!node.classList.contains('bubble')) return false;
  if (node.querySelector(':scope .album-item[data-mid][data-peer-id]')) return false;
  return node.classList.contains('photo')
    || node.classList.contains('video')
    || node.classList.contains('is-gif')
    || node.classList.contains('document');
}

function getAlbumItemIndex(node) {
  if (!(node instanceof Element) || !node.classList.contains('album-item')) return 0;
  const parent = node.parentElement;
  if (!parent) return 0;
  const items = Array.from(parent.children).filter((item) => item.classList?.contains('album-item'));
  const index = items.indexOf(node);
  return index >= 0 ? index : 0;
}

function getMessageMediaType(node) {
  if (!(node instanceof Element)) return undefined;
  if (node.classList.contains('video')
    || node.classList.contains('is-gif')
    || node.querySelector('video, .video, .is-gif')) {
    return 'videos';
  }
  if (node.classList.contains('photo')
    || node.querySelector('img, .media-photo-aspect')) {
    return 'images';
  }
  return undefined;
}

function createTargetFromMessageNode(node) {
  const identity = getMessageIdentity(node);
  if (!identity?.messageId || !identity.peerId) return undefined;
  return {
    capturedAt: Date.now(),
    peerKey: identity.peerId,
    messageKey: identity.messageId,
    albumIndex: getAlbumItemIndex(node),
    mediaType: getMessageMediaType(node),
    source: 'source-message',
    confidence: 'high',
    confirmedAt: 0,
    mediaFingerprint: '',
    sourceMessageNode: node,
  };
}

export function findActiveChatScrollContainer() {
  const candidates = Array.from(document.querySelectorAll(CHAT_SCROLL_SELECTOR)).filter(isElementVisible);
  candidates.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
  });
  return candidates[0];
}

export function collectOrderedChatMediaTargets(peerKey) {
  const container = findActiveChatScrollContainer();
  if (!container || !peerKey) return [];
  const nodes = Array.from(container.querySelectorAll('[data-mid][data-peer-id]'))
    .filter((node) => isChatMediaNode(node) && getMessageIdentity(node)?.peerId === peerKey);
  nodes.sort((left, right) => {
    if (left === right) return 0;
    const position = left.compareDocumentPosition(right);
    return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
  return nodes.map(createTargetFromMessageNode).filter(Boolean);
}

function findTargetIndex(targets, target) {
  if (!target) return -1;
  const nodeIndex = targets.findIndex((candidate) => candidate.sourceMessageNode === target.sourceMessageNode);
  if (nodeIndex >= 0) return nodeIndex;
  return targets.findIndex((candidate) => candidate.peerKey === target.peerKey
    && candidate.messageKey === target.messageKey
    && candidate.albumIndex === target.albumIndex);
}

export function findAdjacentMediaTarget(target, direction) {
  if (!target || !direction) return undefined;
  const targets = collectOrderedChatMediaTargets(target.peerKey);
  const index = findTargetIndex(targets, target);
  if (index < 0) return undefined;
  return cloneMediaTarget(targets[index + (direction > 0 ? 1 : -1)]);
}

function getActiveChatPeerKey(container) {
  if (!(container instanceof Element)) return '';
  const counts = new Map();
  for (const node of container.querySelectorAll('[data-mid][data-peer-id]')) {
    const identity = getMessageIdentity(node);
    if (!identity?.peerId || node.classList.contains('pinned-message')) continue;
    counts.set(identity.peerId, (counts.get(identity.peerId) || 0) + 1);
  }
  let bestKey = '';
  let bestCount = 0;
  for (const [peerKey, count] of counts) {
    if (count > bestCount) {
      bestKey = peerKey;
      bestCount = count;
    }
  }
  return bestKey;
}

export function createChatMediaSnapshot(peerKey) {
  const container = findActiveChatScrollContainer();
  if (!container) return undefined;
  const activePeerKey = getActiveChatPeerKey(container);
  if (peerKey && activePeerKey && peerKey !== activePeerKey) return undefined;
  const targets = collectOrderedChatMediaTargets(peerKey || activePeerKey);
  return {
    container,
    activePeerKey,
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    clientHeight: container.clientHeight,
    targets,
    targetKeys: targets.map(getMediaTargetKey).filter(Boolean),
  };
}

export function requestChatMediaLoad(peerKey, direction) {
  const snapshot = createChatMediaSnapshot(peerKey);
  if (!snapshot || !direction) return false;
  const top = direction > 0 ? snapshot.container.scrollHeight : 0;
  if (typeof snapshot.container.scrollTo === 'function') {
    snapshot.container.scrollTo({ top, behavior: 'auto' });
  } else {
    snapshot.container.scrollTop = top;
  }
  snapshot.container.dispatchEvent(new Event('scroll', { bubbles: true }));
  return true;
}

export function findContinuationMediaTarget(anchorTarget, direction, previousTargetKeys = [], attemptedTargetKeys = []) {
  if (!anchorTarget || !direction) return undefined;
  const targets = collectOrderedChatMediaTargets(anchorTarget.peerKey);
  const attempted = new Set(attemptedTargetKeys);
  const index = findTargetIndex(targets, anchorTarget);
  if (index >= 0) {
    const candidate = targets[index + (direction > 0 ? 1 : -1)];
    if (candidate && !attempted.has(getMediaTargetKey(candidate))) return cloneMediaTarget(candidate);
  }

  const previous = new Set(previousTargetKeys);
  const newTargets = targets.filter((candidate) => {
    const key = getMediaTargetKey(candidate);
    return key && !previous.has(key) && !attempted.has(key);
  });
  const fallback = direction > 0 ? newTargets[0] : newTargets[newTargets.length - 1];
  return cloneMediaTarget(fallback);
}

function findExactMediaTargetNode(target) {
  const targets = collectOrderedChatMediaTargets(target?.peerKey);
  return targets.find((candidate) => candidate.messageKey === target?.messageKey
    && candidate.albumIndex === target?.albumIndex)?.sourceMessageNode;
}

export function dispatchOpenMediaTarget(target) {
  const node = findExactMediaTargetNode(target);
  if (!(node instanceof HTMLElement) || !node.isConnected) return false;
  node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });

  let clickTarget;
  for (const selector of MEDIA_OPEN_SELECTORS) {
    const candidate = node.matches(selector) ? node : node.querySelector(selector);
    if (candidate instanceof HTMLElement) {
      clickTarget = candidate;
      break;
    }
  }
  if (!(clickTarget instanceof HTMLElement)) clickTarget = node;
  clickTarget.click();
  return true;
}

export function findExactMessageNode(target) {
  const container = findActiveChatScrollContainer();
  if (!container || !target?.messageKey) return { reason: 'chat-not-ready' };
  const activePeerKey = getActiveChatPeerKey(container);
  if (target.peerKey && activePeerKey && target.peerKey !== activePeerKey) {
    return { reason: 'peer-changed', container };
  }

  const sourceNode = target.sourceMessageNode;
  if (sourceNode instanceof Element && sourceNode.isConnected && container.contains(sourceNode)) {
    const identity = getMessageIdentity(sourceNode);
    if (identity?.messageId === target.messageKey
      && (!target.peerKey || identity.peerId === target.peerKey)) {
      return {
        node: sourceNode.classList.contains('album-item')
          ? sourceNode.closest('.bubble') || sourceNode
          : sourceNode,
        container,
        reason: 'source-node',
      };
    }
  }

  const escapedMessageKey = globalThis.CSS?.escape
    ? CSS.escape(target.messageKey)
    : target.messageKey.replace(/[^-\d]/g, '');
  const matches = Array.from(container.querySelectorAll(`[data-mid="${escapedMessageKey}"]`))
    .filter((node) => {
      const identity = getMessageIdentity(node);
      return identity?.messageId === target.messageKey
        && (!target.peerKey || identity.peerId === target.peerKey)
        && !node.classList.contains('pinned-message');
    });
  const identityNode = matches.find((node) => node.classList.contains('album-item'))
    || matches.find((node) => node.classList.contains('bubble'))
    || matches[0];
  const displayNode = identityNode?.classList.contains('album-item')
    ? identityNode.closest('.bubble') || identityNode
    : identityNode;
  return displayNode
    ? { node: displayNode, container, reason: 'exact-dom-match' }
    : { container, reason: 'not-loaded' };
}

export function collectMessageNodes() {
  const selector = MESSAGE_ID_ATTRIBUTES.map((name) => `[${name}]`).join(', ');
  const nodes = [];
  const seen = new Set();
  for (const element of document.querySelectorAll(selector)) {
    const identity = getMessageIdentity(element);
    if (!identity || seen.has(element)) continue;
    seen.add(element);
    nodes.push(element);
    if (nodes.length >= 600) break;
  }
  return nodes;
}
