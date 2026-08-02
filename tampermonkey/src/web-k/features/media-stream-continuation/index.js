import { runtime } from '../../core/runtime.js';
import { cloneMediaTarget } from '../../platform/message-list.js';
import { ContinuationViewerSession } from './continuation-viewer-session.js';
import { MediaStreamContinuationController } from './controller.js';

export function createMediaStreamContinuation() {
  return new MediaStreamContinuationController();
}

export function prepareContinuationSessionContext(context) {
  const target = cloneMediaTarget(context?.target);
  if (!target) return;
  runtime.lastSourceTarget = {
    ...target,
    capturedAt: Date.now(),
  };
}

export { ContinuationViewerSession };
