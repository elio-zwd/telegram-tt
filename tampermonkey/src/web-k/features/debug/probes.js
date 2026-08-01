import { clearTimeoutId, runCleanupList } from '../../core/cleanup.js';
import { runtime } from '../../core/runtime.js';
import {
  describeControl,
  describeElement,
  findScrollableAncestor,
  isElementVisible,
} from '../../platform/dom.js';
import { findActiveMedia, findMediaViewer } from '../../platform/media-viewer.js';
import { collectMessageNodes, getMessageIdentity } from '../../platform/message-list.js';

const CLOSE_PROBE_TIMEOUT_MS = 6000;
const CLOSE_PROBE_POLL_MS = 50;

export function createDebugProbes({ scriptId }) {
  function collectScrollSnapshots(messageNodes) {
    const snapshots = [];
    const seen = new Set();
    for (const messageNode of messageNodes) {
      if (!isElementVisible(messageNode)) continue;
      const container = findScrollableAncestor(messageNode);
      if (!container || seen.has(container)) continue;
      seen.add(container);
      snapshots.push({
        node: container,
        scrollTop: Math.round(container.scrollTop),
        scrollHeight: Math.round(container.scrollHeight),
        clientHeight: Math.round(container.clientHeight),
      });
      if (snapshots.length >= 8) break;
    }
    return snapshots;
  }

  function describeScrollSnapshots(snapshots) {
    return snapshots.map((snapshot, index) => ({
      index,
      element: describeElement(snapshot.node),
      scrollTop: snapshot.scrollTop,
      scrollHeight: snapshot.scrollHeight,
      clientHeight: snapshot.clientHeight,
    }));
  }

  function collectChatProbe() {
    const messageNodes = collectMessageNodes();
    const visibleNodes = messageNodes.filter(isElementVisible);
    const sample = visibleNodes.slice(0, 12).map((element) => ({
      identity: getMessageIdentity(element),
      element: describeElement(element),
    }));
    const scrollSnapshots = collectScrollSnapshots(messageNodes);
    return {
      messageNodeCount: messageNodes.length,
      visibleMessageNodeCount: visibleNodes.length,
      messageNodesWithPeerId: messageNodes.filter((element) => getMessageIdentity(element)?.peerId).length,
      sample,
      scrollContainers: describeScrollSnapshots(scrollSnapshots),
    };
  }

  function collectMediaAncestors(viewer, media) {
    const result = [];
    let current = media;
    for (let depth = 0; current && depth < 12; depth += 1) {
      result.push(describeElement(current));
      if (current === viewer) break;
      current = current.parentElement;
    }
    return result.filter(Boolean);
  }

  function collectViewerControls(viewer) {
    if (!(viewer instanceof Element)) return [];
    const viewerRect = viewer.getBoundingClientRect();
    const controls = [];
    for (const element of viewer.querySelectorAll('button, a[href], [role="button"], [tabindex]')) {
      if (!isElementVisible(element) || element.closest(`#${scriptId}`)) continue;
      const rect = element.getBoundingClientRect();
      let score = 0;
      if (rect.top < viewerRect.top + Math.min(180, viewerRect.height * 0.25)) score += 12;
      if (rect.left < viewerRect.left + 220 || rect.right > viewerRect.right - 220) score += 8;
      if (element instanceof HTMLAnchorElement) score += 4;
      const classText = Array.from(element.classList).join(' ').toLocaleLowerCase();
      if (/(close|back|author|date|message|viewer)/.test(classText)) score += 10;
      controls.push({ element, score });
    }
    controls.sort((left, right) => right.score - left.score);
    return controls.slice(0, 24).map(({ element, score }, index) => ({
      index,
      score,
      element: describeControl(element),
    }));
  }

  function inspectMessageMapping() {
    const viewer = findMediaViewer();
    const media = viewer && findActiveMedia(viewer);
    const result = {
      client: 'web-k',
      viewer: describeElement(viewer),
      activeMedia: describeElement(media),
      mediaAncestors: viewer && media ? collectMediaAncestors(viewer, media) : [],
      viewerControls: viewer ? collectViewerControls(viewer) : [],
      sourceClick: runtime.lastSourceProbe
        ? { ...runtime.lastSourceProbe, ageMs: Date.now() - runtime.lastSourceProbe.capturedAt }
        : undefined,
      chat: collectChatProbe(),
      privacy: {
        includesTextContent: false,
        includesRawHref: false,
        includesMediaUrl: false,
        includesChannelName: false,
        includesUserName: false,
      },
    };
    console.log('[Telegram Media Continuity] Web K 消息映射脱敏探测', result);
    return result;
  }

  function clearCloseProbe() {
    runtime.closeProbeTimer = clearTimeoutId(runtime.closeProbeTimer);
    runCleanupList(runtime.closeProbeCleanup);
    runtime.closeProbeInternal = undefined;
  }

  function compareScrollSnapshots(before, after) {
    const result = [];
    for (let index = 0; index < before.length; index += 1) {
      const beforeSnapshot = before[index];
      const afterSnapshot = after.find((snapshot) => snapshot.node === beforeSnapshot.node);
      result.push({
        index,
        stillConnected: beforeSnapshot.node.isConnected,
        beforeScrollTop: beforeSnapshot.scrollTop,
        afterScrollTop: afterSnapshot ? afterSnapshot.scrollTop : undefined,
        delta: afterSnapshot ? afterSnapshot.scrollTop - beforeSnapshot.scrollTop : undefined,
      });
    }
    return result;
  }

  function finalizeCloseProbe(status, viewerClosedAt) {
    const internal = runtime.closeProbeInternal;
    if (!internal) return runtime.closeProbe;
    const messageNodes = collectMessageNodes();
    const afterScrolls = collectScrollSnapshots(messageNodes);
    const now = performance.now();
    runtime.closeProbe = {
      ...runtime.closeProbe,
      status,
      finishedAt: Date.now(),
      elapsedMs: Math.round(now - internal.startedAt),
      closeElapsedFromIntentMs: internal.intentAt
        ? Math.round((viewerClosedAt || now) - internal.intentAt)
        : undefined,
      viewerConnectedAfter: internal.viewer.isConnected,
      viewerVisibleAfter: isElementVisible(internal.viewer),
      afterChat: {
        messageNodeCount: messageNodes.length,
        visibleMessageNodeCount: messageNodes.filter(isElementVisible).length,
        scrollContainers: describeScrollSnapshots(afterScrolls),
      },
      scrollChanges: compareScrollSnapshots(internal.beforeScrolls, afterScrolls),
    };
    clearCloseProbe();
    console.log('[Telegram Media Continuity] Web K 关闭流程脱敏探测', runtime.closeProbe);
    return runtime.closeProbe;
  }

  function armCloseFlowProbe() {
    clearCloseProbe();
    const viewer = findMediaViewer();
    if (!viewer) {
      runtime.closeProbe = {
        status: 'no-visible-viewer',
        armedAt: Date.now(),
      };
      console.warn('[Telegram Media Continuity] 未发现可见媒体查看器');
      return runtime.closeProbe;
    }

    const messageNodes = collectMessageNodes();
    const beforeScrolls = collectScrollSnapshots(messageNodes);
    const startedAt = performance.now();
    runtime.closeProbe = {
      status: 'armed',
      armedAt: Date.now(),
      viewer: describeElement(viewer),
      candidateControls: collectViewerControls(viewer),
      beforeChat: {
        messageNodeCount: messageNodes.length,
        visibleMessageNodeCount: messageNodes.filter(isElementVisible).length,
        scrollContainers: describeScrollSnapshots(beforeScrolls),
      },
      intent: undefined,
    };
    runtime.closeProbeInternal = {
      viewer,
      startedAt,
      intentAt: 0,
      beforeScrolls,
    };

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || !runtime.closeProbeInternal) return;
      runtime.closeProbeInternal.intentAt = performance.now();
      runtime.closeProbe.intent = {
        type: 'escape',
        elapsedMs: Math.round(runtime.closeProbeInternal.intentAt - startedAt),
        repeat: Boolean(event.repeat),
      };
    };
    const handlePointerDown = (event) => {
      if (!runtime.closeProbeInternal || !(event.target instanceof Element)) return;
      if (!viewer.contains(event.target)) return;
      runtime.closeProbeInternal.intentAt = performance.now();
      runtime.closeProbe.intent = {
        type: 'viewer-pointer',
        elapsedMs: Math.round(runtime.closeProbeInternal.intentAt - startedAt),
        target: describeControl(event.target.closest('button, a[href], [role="button"], [tabindex]') || event.target),
      };
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('pointerdown', handlePointerDown, true);
    runtime.closeProbeCleanup.push(
      () => window.removeEventListener('keydown', handleKeyDown, true),
      () => window.removeEventListener('pointerdown', handlePointerDown, true),
    );

    const poll = () => {
      const internal = runtime.closeProbeInternal;
      if (!internal) return;
      const elapsed = performance.now() - internal.startedAt;
      if (!internal.viewer.isConnected) {
        const closedAt = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => finalizeCloseProbe('viewer-removed', closedAt)));
        return;
      }
      if (!isElementVisible(internal.viewer)) {
        const closedAt = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => finalizeCloseProbe('viewer-hidden', closedAt)));
        return;
      }
      if (elapsed >= CLOSE_PROBE_TIMEOUT_MS) {
        finalizeCloseProbe('timeout');
        return;
      }
      runtime.closeProbeTimer = window.setTimeout(poll, CLOSE_PROBE_POLL_MS);
    };
    runtime.closeProbeTimer = window.setTimeout(poll, CLOSE_PROBE_POLL_MS);
    console.info('[Telegram Media Continuity] 关闭流程探测已布防，请手动点击官方关闭按钮或按 Esc');
    return runtime.closeProbe;
  }

  return Object.freeze({
    armCloseFlowProbe,
    clearCloseProbe,
    inspectMessageMapping,
  });
}
