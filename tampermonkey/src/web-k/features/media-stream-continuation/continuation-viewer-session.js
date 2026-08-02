import { ViewerSession } from '../continuous-browsing/viewer-session.js';
import { isLoopMedia } from '../../platform/media-viewer.js';
import { cloneMediaTarget } from '../../platform/message-list.js';
import { getNavigationButton } from '../../platform/navigation.js';

const USER_PAUSE_REASON = 'user';
const HOVER_PAUSE_REASON = 'hover';

export class ContinuationViewerSession extends ViewerSession {
  constructor(viewer, { continuation, continuationContext, ...options }) {
    super(viewer, options);
    this.continuation = continuation;
    this.continuationReady = true;
    this.restoreContinuationContext(continuationContext);
    this.refresh();
  }

  refresh() {
    if (this.continuationReady !== true) return;
    super.refresh();
  }

  addPauseReason(reason, status, shouldRender = true) {
    if (reason === HOVER_PAUSE_REASON && isLoopMedia(this.currentMedia)) return;
    super.addPauseReason(reason, status, shouldRender);
  }

  restoreContinuationContext(context) {
    const sequence = context?.filterSequence;
    if (sequence
      && sequence.direction === this.getAutomaticDirection()
      && sequence.filter === this.settings.mediaFilter
      && Number.isFinite(sequence.startedAt)) {
      this.filterSequenceId += 1;
      this.filterSequence = {
        id: this.filterSequenceId,
        direction: sequence.direction,
        filter: sequence.filter,
        startedAt: sequence.startedAt,
        skipped: Number.isInteger(sequence.skipped) ? sequence.skipped : 0,
        lastFingerprint: undefined,
      };
      this.blockCurrentTargetConfirmation = true;
    }

    if (context?.pauseStatus) {
      this.addPauseReason(USER_PAUSE_REASON, context.pauseStatus, false);
    }
  }

  navigateOnce(direction, automatic, filterSequence) {
    const canRequestContinuation = automatic
      && !this.destroyed
      && !this.isNavigating
      && this.active
      && !this.hasAutomationPause()
      && (!filterSequence || this.isFilterSequenceCurrent(filterSequence))
      && !getNavigationButton(this.viewer, direction);

    if (!canRequestContinuation) {
      super.navigateOnce(direction, automatic, filterSequence);
      return;
    }

    if (filterSequence && this.hasFilterSequenceTimedOut(filterSequence)) {
      super.navigateOnce(direction, automatic, filterSequence);
      return;
    }

    const anchorTarget = cloneMediaTarget(
      this.targetTracker.pendingMediaTarget || this.getLastConfirmedMediaTarget(),
    );
    const continuationFilterSequence = filterSequence
      ? {
        direction: filterSequence.direction,
        filter: filterSequence.filter,
        startedAt: filterSequence.startedAt,
        skipped: filterSequence.skipped,
      }
      : undefined;
    const accepted = this.continuation?.start({
      viewer: this.viewer,
      direction,
      anchorTarget,
      filterSequence: continuationFilterSequence,
      onFailure: (message) => {
        if (!this.destroyed) this.addPauseReason(USER_PAUSE_REASON, message);
      },
    });

    if (!accepted) {
      const message = filterSequence
        ? (direction > 0
          ? '已到当前媒体末尾，未找到更多匹配媒体'
          : '已到当前媒体开头，未找到更多匹配媒体')
        : (direction > 0
          ? '未能开始加载更多更新媒体，连续浏览已暂停'
          : '未能开始加载更多历史媒体，连续浏览已暂停');
      this.addPauseReason(USER_PAUSE_REASON, message);
      return;
    }

    this.clearTimer();
    this.completeNavigationAttempt();
    this.cancelFilterSequence();
    this.filterSequenceId += 1;
    this.blockCurrentTargetConfirmation = true;
    this.panel.render(this.viewState());
    this.panel.setStatus(direction > 0 ? '正在加载更多更新媒体' : '正在加载更多历史媒体');
  }
}
