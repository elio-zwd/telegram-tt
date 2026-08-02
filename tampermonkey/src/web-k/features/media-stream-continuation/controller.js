import { debugLog } from '../../core/logger.js';
import { dispatchCloseMediaViewer, findMediaViewer } from '../../platform/media-viewer.js';
import {
  cloneMediaTarget,
  createChatMediaSnapshot,
  dispatchOpenMediaTarget,
  findContinuationMediaTarget,
  getMediaTargetKey,
  requestChatMediaLoad,
} from '../../platform/message-list.js';

const CONTINUATION_TIMEOUT_MS = 20000;
const FILTER_SEQUENCE_TIMEOUT_MS = 15000;
const MAX_SCROLL_ATTEMPTS = 8;
const CLOSE_TIMEOUT_MS = 3000;
const OPEN_TIMEOUT_MS = 3000;
const LOAD_CHANGE_TIMEOUT_MS = 1800;
const POLL_INTERVAL_MS = 100;

export class MediaStreamContinuationController {
  constructor() {
    this.nextOperationId = 1;
    this.operation = undefined;
  }

  start({ viewer, direction, anchorTarget, filterSequence, onFailure }) {
    if (!(viewer instanceof Element) || !viewer.isConnected || !direction) return false;
    const anchor = cloneMediaTarget(anchorTarget);
    if (!anchor?.peerKey || !anchor.messageKey) return false;
    const snapshot = createChatMediaSnapshot(anchor.peerKey);
    if (!snapshot || (snapshot.activePeerKey && snapshot.activePeerKey !== anchor.peerKey)) return false;

    this.cancel('replaced');
    const operation = {
      id: this.nextOperationId,
      viewer,
      direction: direction > 0 ? 1 : -1,
      anchorTarget: anchor,
      filterSequence: cloneFilterSequence(filterSequence),
      onFailure,
      startedAt: Date.now(),
      state: 'closing',
      scrollAttempts: 0,
      previousTargetKeys: snapshot.targetKeys,
      attemptedTargetKeys: new Set(),
      sessionContext: undefined,
      closeTimer: 0,
      cancelWait: undefined,
      cleanup: [],
    };
    this.nextOperationId += 1;
    this.operation = operation;

    if (!dispatchCloseMediaViewer(viewer)) {
      this.failBeforeClose(operation, '无法安全关闭当前媒体查看器，连续浏览已暂停');
      return false;
    }
    this.installUserTakeover(operation);

    operation.closeTimer = window.setTimeout(() => {
      operation.closeTimer = 0;
      if (!this.isCurrent(operation) || operation.state !== 'closing') return;
      const activeViewer = findMediaViewer();
      if (!activeViewer || activeViewer !== viewer) {
        this.handleViewerClosed(viewer);
        return;
      }
      this.failBeforeClose(operation, '媒体查看器关闭超时，连续浏览已暂停');
    }, CLOSE_TIMEOUT_MS);

    debugLog('开始同频道媒体续流', {
      operationId: operation.id,
      direction: operation.direction,
    });
    return true;
  }

  shouldSkipClosePosition(viewer) {
    const operation = this.operation;
    return Boolean(operation
      && operation.viewer === viewer
      && operation.state !== 'cancelled');
  }

  handleViewerClosed(viewer) {
    const operation = this.operation;
    if (!operation || operation.viewer !== viewer || operation.state !== 'closing') return false;
    window.clearTimeout(operation.closeTimer);
    operation.closeTimer = 0;
    operation.state = 'searching';
    void this.run(operation);
    return true;
  }

  takeSessionContext(viewer) {
    const operation = this.operation;
    if (!operation || operation.state !== 'opening' || !(viewer instanceof Element)) return undefined;
    const context = operation.sessionContext;
    this.finish(operation, 'resumed');
    return context;
  }

  cancel(reason = 'cancelled') {
    const operation = this.operation;
    if (!operation) return;
    this.finish(operation, reason);
  }

  async run(operation) {
    const deadlineAt = Math.min(
      operation.startedAt + CONTINUATION_TIMEOUT_MS,
      operation.filterSequence
        ? operation.filterSequence.startedAt + FILTER_SEQUENCE_TIMEOUT_MS
        : Number.POSITIVE_INFINITY,
    );

    while (this.isCurrent(operation) && Date.now() < deadlineAt) {
      const snapshot = createChatMediaSnapshot(operation.anchorTarget.peerKey);
      if (!snapshot || (snapshot.activePeerKey && snapshot.activePeerKey !== operation.anchorTarget.peerKey)) {
        this.finish(operation, 'peer-changed');
        return;
      }

      const candidate = findContinuationMediaTarget(
        operation.anchorTarget,
        operation.direction,
        operation.previousTargetKeys,
        operation.attemptedTargetKeys,
      );
      if (candidate) {
        const opened = await this.openTarget(operation, candidate, undefined);
        if (!this.isCurrent(operation) || opened) return;
        operation.attemptedTargetKeys.add(getMediaTargetKey(candidate));
        break;
      }

      if (operation.scrollAttempts >= MAX_SCROLL_ATTEMPTS) break;
      const before = snapshot;
      if (!requestChatMediaLoad(operation.anchorTarget.peerKey, operation.direction)) break;
      operation.scrollAttempts += 1;
      operation.previousTargetKeys = before.targetKeys;
      await this.waitForListChange(operation, before);
    }

    if (!this.isCurrent(operation)) return;
    const filterTimedOut = Boolean(operation.filterSequence
      && Date.now() >= operation.filterSequence.startedAt + FILTER_SEQUENCE_TIMEOUT_MS);
    const status = filterTimedOut
      ? '筛选跳过超过总时限，连续浏览已暂停'
      : (operation.direction > 0
        ? '未找到更多更新媒体，连续浏览已暂停'
        : '未找到更多历史媒体，连续浏览已暂停');
    const reopened = await this.openTarget(operation, operation.anchorTarget, status);
    if (!this.isCurrent(operation) || reopened) return;
    this.finish(operation, 'no-more-media');
  }

  async openTarget(operation, target, pauseStatus) {
    if (!this.isCurrent(operation)) return false;
    operation.state = 'opening';
    operation.sessionContext = {
      target: cloneMediaTarget(target),
      filterSequence: pauseStatus ? undefined : cloneFilterSequence(operation.filterSequence),
      pauseStatus,
    };

    if (!dispatchOpenMediaTarget(target)) {
      operation.state = 'searching';
      operation.sessionContext = undefined;
      return false;
    }

    const viewer = await this.waitForViewer(operation);
    if (!this.isCurrent(operation)) return Boolean(viewer);
    if (viewer) return true;
    operation.state = 'searching';
    operation.sessionContext = undefined;
    return false;
  }

  waitForListChange(operation, before) {
    return new Promise((resolve) => {
      if (!this.isCurrent(operation)) {
        resolve(undefined);
        return;
      }
      let settled = false;
      let pollTimer = 0;
      let timeoutTimer = 0;
      const observer = new MutationObserver(check);

      const finishWait = (result) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        window.clearTimeout(pollTimer);
        window.clearTimeout(timeoutTimer);
        if (operation.cancelWait === cancelWait) operation.cancelWait = undefined;
        resolve(result);
      };
      const cancelWait = () => finishWait(undefined);
      operation.cancelWait = cancelWait;

      function check() {
        window.clearTimeout(pollTimer);
        pollTimer = 0;
        if (!operation || operation.state === 'cancelled') {
          finishWait(undefined);
          return;
        }
        const after = createChatMediaSnapshot(operation.anchorTarget.peerKey);
        if (!after) return;
        const keysChanged = after.targetKeys.length !== before.targetKeys.length
          || after.targetKeys.some((key, index) => key !== before.targetKeys[index]);
        if (keysChanged || after.scrollHeight !== before.scrollHeight) {
          finishWait(after);
          return;
        }
        pollTimer = window.setTimeout(check, POLL_INTERVAL_MS);
      }

      observer.observe(before.container, { childList: true, subtree: true });
      pollTimer = window.setTimeout(check, POLL_INTERVAL_MS);
      timeoutTimer = window.setTimeout(() => {
        finishWait(createChatMediaSnapshot(operation.anchorTarget.peerKey));
      }, LOAD_CHANGE_TIMEOUT_MS);
    });
  }

  waitForViewer(operation) {
    return new Promise((resolve) => {
      if (!this.isCurrent(operation)) {
        resolve(undefined);
        return;
      }
      let settled = false;
      let pollTimer = 0;
      let timeoutTimer = 0;
      const observer = new MutationObserver(check);

      const finishWait = (viewer) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        window.clearTimeout(pollTimer);
        window.clearTimeout(timeoutTimer);
        if (operation.cancelWait === cancelWait) operation.cancelWait = undefined;
        resolve(viewer);
      };
      const cancelWait = () => finishWait(undefined);
      operation.cancelWait = cancelWait;

      function check() {
        window.clearTimeout(pollTimer);
        pollTimer = 0;
        const viewer = findMediaViewer();
        if (viewer) {
          finishWait(viewer);
          return;
        }
        if (!operation || operation.state === 'cancelled') {
          finishWait(undefined);
          return;
        }
        pollTimer = window.setTimeout(check, POLL_INTERVAL_MS);
      }

      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
      pollTimer = window.setTimeout(check, POLL_INTERVAL_MS);
      timeoutTimer = window.setTimeout(() => finishWait(undefined), OPEN_TIMEOUT_MS);
    });
  }

  installUserTakeover(operation) {
    const cancelForUser = () => {
      if (!this.isCurrent(operation)) return;
      this.finish(operation, 'user-takeover');
    };
    document.addEventListener('pointerdown', cancelForUser, true);
    window.addEventListener('keydown', cancelForUser, true);
    window.addEventListener('popstate', cancelForUser);
    window.addEventListener('hashchange', cancelForUser);
    operation.cleanup.push(
      () => document.removeEventListener('pointerdown', cancelForUser, true),
      () => window.removeEventListener('keydown', cancelForUser, true),
      () => window.removeEventListener('popstate', cancelForUser),
      () => window.removeEventListener('hashchange', cancelForUser),
    );
  }

  failBeforeClose(operation, message) {
    if (this.isCurrent(operation) && typeof operation.onFailure === 'function') {
      operation.onFailure(message);
    }
    this.finish(operation, 'close-failed');
  }

  isCurrent(operation) {
    return Boolean(operation && this.operation === operation && operation.state !== 'cancelled');
  }

  finish(operation, reason) {
    if (!operation || this.operation !== operation) return;
    operation.state = 'cancelled';
    window.clearTimeout(operation.closeTimer);
    operation.cancelWait?.();
    operation.cancelWait = undefined;
    while (operation.cleanup.length) operation.cleanup.pop()();
    this.operation = undefined;
    debugLog('结束同频道媒体续流', {
      operationId: operation.id,
      reason,
      scrollAttempts: operation.scrollAttempts,
    });
  }
}

function cloneFilterSequence(sequence) {
  if (!sequence || !Number.isFinite(sequence.startedAt)) return undefined;
  return {
    direction: sequence.direction > 0 ? 1 : -1,
    filter: sequence.filter,
    startedAt: sequence.startedAt,
    skipped: Number.isInteger(sequence.skipped) ? sequence.skipped : 0,
  };
}
