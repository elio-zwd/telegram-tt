import { debugLog } from '../../core/logger.js';
import { runtime } from '../../core/runtime.js';
import { isMediaSuccessfullyDisplayed } from '../../platform/media-viewer.js';
import {
  captureSourceTarget,
  cloneMediaTarget,
  findAdjacentMediaTarget,
  getMessageIdentity,
} from '../../platform/message-list.js';
import { clearLocationTimers } from './message-locator.js';

const SOURCE_TARGET_MAX_AGE_MS = 5000;
const TARGET_NAVIGATION_TIMEOUT_MS = 3000;

export function captureSourceProbe(event, scriptId) {
  const captured = captureSourceTarget(event, scriptId);
  if (!captured) return;
  clearLocationTimers();
  runtime.activeLocationSequenceId += 1;
  if (!captured.probe) return;
  runtime.lastSourceProbe = captured.probe;
  runtime.lastSourceTarget = captured.target;
}

function takeRecentSourceTarget() {
  const target = runtime.lastSourceTarget;
  runtime.lastSourceTarget = undefined;
  if (!target || Date.now() - target.capturedAt > SOURCE_TARGET_MAX_AGE_MS) return undefined;
  if (!(target.sourceMessageNode instanceof Element) || !target.sourceMessageNode.isConnected) return undefined;
  const identity = getMessageIdentity(target.sourceMessageNode);
  if (!identity || identity.messageId !== target.messageKey || identity.peerId !== target.peerKey) return undefined;
  return cloneMediaTarget(target);
}

export class MediaTargetTracker {
  constructor({ getCurrentFingerprint }) {
    this.getCurrentFingerprint = getCurrentFingerprint;
    this.pendingNavigationTimer = 0;
    this.pendingMediaTarget = takeRecentSourceTarget();
    this.lastConfirmedMediaTarget = undefined;
    this.currentMappingLost = false;
  }

  prepareNavigationTarget(direction) {
    const currentFingerprint = this.getCurrentFingerprint();
    const currentTarget = this.pendingMediaTarget || this.lastConfirmedMediaTarget;
    const adjacentTarget = findAdjacentMediaTarget(currentTarget, direction);
    window.clearTimeout(this.pendingNavigationTimer);
    this.pendingNavigationTimer = 0;
    if (!adjacentTarget) {
      this.pendingMediaTarget = undefined;
      return false;
    }
    adjacentTarget.fromFingerprint = currentFingerprint;
    this.pendingMediaTarget = adjacentTarget;
    this.pendingNavigationTimer = window.setTimeout(() => {
      if (this.pendingMediaTarget?.fromFingerprint === this.getCurrentFingerprint()) {
        this.pendingMediaTarget = undefined;
      }
      this.pendingNavigationTimer = 0;
    }, TARGET_NAVIGATION_TIMEOUT_MS);
    return true;
  }

  clearPendingNavigation() {
    window.clearTimeout(this.pendingNavigationTimer);
    this.pendingNavigationTimer = 0;
    this.pendingMediaTarget = undefined;
  }

  confirmCurrentMediaTarget(currentMedia) {
    const currentFingerprint = this.getCurrentFingerprint();
    if (!isMediaSuccessfullyDisplayed(currentMedia)) return false;
    const pending = this.pendingMediaTarget;
    const pendingMatchesMedia = pending
      && (pending.fromFingerprint === undefined || pending.fromFingerprint !== currentFingerprint);
    if (pendingMatchesMedia) {
      window.clearTimeout(this.pendingNavigationTimer);
      this.pendingNavigationTimer = 0;
      this.lastConfirmedMediaTarget = {
        ...cloneMediaTarget(pending),
        confirmedAt: Date.now(),
        mediaFingerprint: currentFingerprint,
      };
      this.pendingMediaTarget = undefined;
      this.currentMappingLost = false;
      debugLog('已确认媒体消息映射', {
        peerKey: this.lastConfirmedMediaTarget.peerKey,
        messageKey: this.lastConfirmedMediaTarget.messageKey,
        albumIndex: this.lastConfirmedMediaTarget.albumIndex,
      });
      return true;
    }
    if (this.lastConfirmedMediaTarget?.mediaFingerprint !== currentFingerprint) {
      this.currentMappingLost = true;
    }
    return false;
  }

  createCloseSnapshot() {
    const sequenceId = runtime.closeSequenceId + 1;
    runtime.closeSequenceId = sequenceId;
    if (this.currentMappingLost) {
      return { sequenceId, target: undefined, reason: 'unmapped-current-media', capturedAt: Date.now() };
    }
    const target = cloneMediaTarget(this.lastConfirmedMediaTarget);
    return {
      sequenceId,
      target: target?.confidence === 'high' ? target : undefined,
      reason: target ? '' : 'no-confirmed-target',
      capturedAt: Date.now(),
    };
  }

  getLastConfirmedMediaTarget() {
    return this.lastConfirmedMediaTarget;
  }

  destroy() {
    this.clearPendingNavigation();
  }
}
