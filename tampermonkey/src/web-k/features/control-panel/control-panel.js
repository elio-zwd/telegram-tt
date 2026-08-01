import { BROWSE_DIRECTIONS, DURATIONS, MEDIA_FILTERS } from '../../core/settings.js';

const BROWSE_DIRECTION_LABELS = Object.freeze({
  forward: '正向',
  backward: '反向',
});
const MEDIA_FILTER_LABELS = Object.freeze({
  all: '图片和视频',
  images: '仅图片',
  videos: '仅视频',
});

export class ControlPanel {
  constructor({
    hostId,
    onToggleContinuous,
    onTogglePause,
    onNavigate,
    onSetPhotoDuration,
    onSetBrowseDirection,
    onSetMediaFilter,
    onSetPanelCollapsed,
  }) {
    this.host = document.createElement('div');
    this.host.id = hostId;
    this.host.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;pointer-events:none;';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel, .launcher {
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #fff;
          pointer-events: auto;
          user-select: none;
        }
        .panel {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 7px;
          max-width: min(94vw, 960px);
          min-height: 46px;
          padding: 7px 9px;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 15px;
          background: rgba(20,24,32,.9);
          box-shadow: 0 10px 32px rgba(0,0,0,.35);
          backdrop-filter: blur(14px);
        }
        button, select {
          box-sizing: border-box;
          min-height: 32px;
          border: 0;
          border-radius: 9px;
          background: rgba(255,255,255,.12);
          color: inherit;
          font: inherit;
        }
        button { padding: 0 11px; cursor: pointer; }
        button:hover { background: rgba(255,255,255,.2); }
        button:disabled { cursor: not-allowed; opacity: .42; }
        button.primary[data-active="true"] { background: #2aabee; }
        button[hidden], .panel[hidden], .launcher[hidden] { display: none !important; }
        select { padding: 0 8px; }
        option { color: #111; }
        .status {
          min-width: 118px;
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 0 4px;
          color: rgba(255,255,255,.82);
          font-size: 13px;
        }
        .launcher {
          min-width: 50px;
          height: 38px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 19px;
          background: rgba(20,24,32,.9);
          box-shadow: 0 8px 24px rgba(0,0,0,.3);
          cursor: pointer;
        }
        @media (max-width: 720px) {
          .panel { gap: 5px; padding: 6px; }
          button { padding: 0 8px; }
          select { padding: 0 6px; }
          .status { min-width: 72px; max-width: 120px; }
        }
        @media (max-width: 480px) {
          .panel {
            max-width: calc(100vw - 12px);
            gap: 4px;
            padding: 5px;
          }
          button, select {
            min-height: 30px;
            font-size: 12px;
          }
          .status {
            order: 2;
            flex: 1 0 100%;
            min-width: 0;
            max-width: calc(100vw - 32px);
            text-align: center;
          }
        }
      </style>
      <div class="panel" role="toolbar" aria-label="Telegram Web K 连续媒体浏览">
        <button id="toggle" class="primary" type="button">连续浏览</button>
        <button id="pause" type="button">暂停</button>
        <button id="previous" type="button" aria-label="上一项">←</button>
        <button id="next" type="button" aria-label="下一项">→</button>
        <select id="filter" aria-label="自动浏览媒体类型">
          ${MEDIA_FILTERS.map((value) => `<option value="${value}">${MEDIA_FILTER_LABELS[value]}</option>`).join('')}
        </select>
        <select id="direction" aria-label="自动浏览方向">
          ${BROWSE_DIRECTIONS.map((value) => `<option value="${value}">${BROWSE_DIRECTION_LABELS[value]}</option>`).join('')}
        </select>
        <select id="duration" aria-label="图片停留时间">
          ${DURATIONS.map((value) => `<option value="${value}">${value / 1000} 秒</option>`).join('')}
        </select>
        <span id="status" class="status" aria-live="polite">已就绪</span>
        <button id="collapse" type="button" aria-label="收起控制条">×</button>
      </div>
      <button class="launcher" id="launcher" type="button" aria-label="展开控制条" hidden>TT</button>
    `;
    document.body.appendChild(this.host);

    this.panel = this.shadow.querySelector('.panel');
    this.launcher = this.shadow.querySelector('#launcher');
    this.toggle = this.shadow.querySelector('#toggle');
    this.pause = this.shadow.querySelector('#pause');
    this.previous = this.shadow.querySelector('#previous');
    this.next = this.shadow.querySelector('#next');
    this.status = this.shadow.querySelector('#status');
    this.filter = this.shadow.querySelector('#filter');
    this.direction = this.shadow.querySelector('#direction');
    this.duration = this.shadow.querySelector('#duration');

    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick']) {
      this.shadow.addEventListener(type, (event) => event.stopPropagation());
    }

    this.toggle.addEventListener('click', onToggleContinuous);
    this.pause.addEventListener('click', onTogglePause);
    this.previous.addEventListener('click', () => onNavigate(-1, false));
    this.next.addEventListener('click', () => onNavigate(1, false));
    this.filter.addEventListener('change', () => onSetMediaFilter(this.filter.value));
    this.direction.addEventListener('change', () => onSetBrowseDirection(this.direction.value));
    this.duration.addEventListener('change', () => onSetPhotoDuration(Number(this.duration.value)));
    this.shadow.querySelector('#collapse').addEventListener('click', () => onSetPanelCollapsed(true));
    this.launcher.addEventListener('click', () => onSetPanelCollapsed(false));
  }

  render(state) {
    this.toggle.dataset.active = String(state.active);
    this.toggle.textContent = state.active ? '连续浏览：开' : '连续浏览：关';
    this.pause.textContent = state.paused ? '继续' : '暂停';
    this.pause.disabled = !state.active;
    this.previous.disabled = !state.canPrevious;
    this.next.disabled = !state.canNext;
    this.filter.value = state.mediaFilter;
    this.direction.value = state.browseDirection;
    this.duration.value = String(state.photoDurationMs);
    this.panel.hidden = state.collapsed;
    this.launcher.hidden = !state.collapsed;
  }

  setStatus(value) {
    this.status.textContent = value || '已就绪';
    this.status.title = value || '';
  }

  destroy() {
    this.host.remove();
  }
}
