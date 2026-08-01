import { isElementVisible } from './dom.js';

const mediaNodeIds = new WeakMap();
let nextMediaNodeId = 1;

export function findMediaViewer() {
  const viewer = document.querySelector('.media-viewer-whole');
  return isElementVisible(viewer) ? viewer : undefined;
}

export function findMediaRoot(viewer) {
  return viewer.querySelector('.media-viewer-movers') || viewer;
}

function mediaScore(media, rootRect) {
  if (!isElementVisible(media)) return -Infinity;
  const rect = media.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 60) return -Infinity;
  const rootCenterX = rootRect.left + rootRect.width / 2;
  const rootCenterY = rootRect.top + rootRect.height / 2;
  const mediaCenterX = rect.left + rect.width / 2;
  const mediaCenterY = rect.top + rect.height / 2;
  const distance = Math.hypot(mediaCenterX - rootCenterX, mediaCenterY - rootCenterY);
  let score = Math.min((rect.width * rect.height) / 1000, 1200) - distance;
  if (media instanceof HTMLVideoElement && !media.paused) score += 300;
  if (rect.left <= rootCenterX && rect.right >= rootCenterX
    && rect.top <= rootCenterY && rect.bottom >= rootCenterY) {
    score += 500;
  }
  return score;
}

export function findActiveMedia(viewer) {
  const root = findMediaRoot(viewer);
  const rootRect = root.getBoundingClientRect();
  let best;
  let bestScore = -Infinity;
  for (const media of root.querySelectorAll('img, video')) {
    const score = mediaScore(media, rootRect);
    if (score > bestScore) {
      bestScore = score;
      best = media;
    }
  }
  return best;
}

export function getMediaType(media) {
  if (media instanceof HTMLImageElement) return 'images';
  if (media instanceof HTMLVideoElement) return 'videos';
  return undefined;
}

function getMediaNodeId(media) {
  if (!mediaNodeIds.has(media)) {
    mediaNodeIds.set(media, nextMediaNodeId);
    nextMediaNodeId += 1;
  }
  return mediaNodeIds.get(media);
}

export function mediaFingerprint(media) {
  if (!media) return 'none';
  const source = media.currentSrc || media.src || '';
  const size = media instanceof HTMLVideoElement
    ? `${media.videoWidth}x${media.videoHeight}`
    : `${media.naturalWidth}x${media.naturalHeight}`;
  return `${media.tagName}|${getMediaNodeId(media)}|${size}|${source.slice(-120)}`;
}

export function isMediaSuccessfullyDisplayed(media) {
  if (!isElementVisible(media)) return false;
  if (media instanceof HTMLImageElement) {
    return media.complete && media.naturalWidth > 0;
  }
  if (media instanceof HTMLVideoElement) {
    return media.readyState >= HTMLMediaElement.HAVE_METADATA
      || media.videoWidth > 0
      || media.videoHeight > 0;
  }
  return false;
}

export function isMediaZoomed(viewer) {
  return viewer.classList.contains('is-zooming');
}
