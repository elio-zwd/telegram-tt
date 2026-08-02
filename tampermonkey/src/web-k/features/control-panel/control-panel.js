import {
  BROWSE_DIRECTIONS,
  DURATIONS,
  MEDIA_FILTERS,
  VIDEO_PLAYBACK_RATES,
  formatPhotoDurationMs,
  isPresetPhotoDurationMs,
  parsePhotoDurationSeconds,
} from '../../core/settings.js';

const CUSTOM_DURATION_VALUE = 'custom';
const CUSTOM_DURATION_ERROR = '请输入 1～300 秒，最多一位小数';
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
    onSetVideoMuted,
    onSetVideoVolume,
    onSetVideoPlaybackRate,
    onSetPanelCollapsed,
  }) {
    this.isCustomDurationOpen = false;
    this.currentPhotoDurationMs = DURATIONS[0];
    this.currentVideoMuted = false;
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
          gap: 6px;
          max-width: min(96vw, 1080px);
          min-height: 46px;
          padding: 7px 9px;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 15px;
          background: rgba(20,24,32,.9);
          box-shadow: 0 10px 32px rgba(0,0,0,.35);
          backdrop-filter: blur(14px);
        }
        button, select, input {
          box-sizing: border-box;
          min-height: 32px;
          border: 0;
          border-radius: 9px;
          background: rgba(255,255,255,.12);
          color: inherit;
          font: inherit;
        }
        button { padding: 0 10px; cursor: pointer; }
        button:hover { background: rgba(255,255,255,.2); }
        button:disabled { cursor: not-allowed; opacity: .42; }
        button.primary[data-active="true"] { background: #2aabee; }
        button[aria-pressed="true"] { background: rgba(42,171,238,.78); }
        button[hidden], .panel[hidden], .launcher[hidden], .custom-duration[hidden] { display: none !important; }
        select { padding: 0 7px; }
        input[type="text"] {
          width: 68px;
          padding: 0 7px;
          outline: none;
          user-select: text;
        }
        input[type="range"] {
          width: 88px;
          min-height: 24px;
          padding: 0;
          cursor: pointer;
          accent-color: #2aabee;
        }
        input:focus, select:focus, button:focus-visible { box-shadow: 0 0 0 2px rgba(42,171,238,.72); outline: none; }
        input[aria-invalid="true"] { box-shadow: 0 0 0 2px rgba(255,92,92,.78); }
        option { color: #111; }
        .duration-group, .custom-duration, .video-preferences {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }
        .duration-unit, .volume-value {
          font-size: 12px;
          color: rgba(255,255,255,.82);
        }
        .volume-value { min-width: 34px; text-align: right; }
        .status {
          min-width: 138px;
          max-width: 280px;
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
        @media (max-width: 820px) {
          .panel { gap: 5px; padding: 6px; }
          button { padding: 0 8px; }
          select { padding: 0 6px; }
          .status { min-width: 92px; max-width: 160px; }
        }
        @media (max-width: 560px) {
          .panel {
            max-width: calc(100vw - 12px);
            gap: 4px;
            padding: 5px;
          }
          button, select, input {
            min-height: 30px;
            font-size: 12px;
          }
          .duration-group, .video-preferences { justify-content: center; }
          .status {
            order: 3;
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
        <select id="direction" aria-label="自动浏览方向">
          ${BROWSE_DIRECTIONS.map((value) => `<option value="${value}">${BROWSE_DIRECTION_LABELS[value]}</option>`).join('')}
        </select>
        <select id="filter" aria-label="自动浏览媒体类型">
          ${MEDIA_FILTERS.map((value) => `<option value="${value}">${MEDIA_FILTER_LABELS[value]}</option>`).join('')}
        </select>
        <div class="duration-group">
          <select id="duration" aria-label="图片和循环媒体停留时间">
            ${DURATIONS.map((value) => `<option value="${value}">${formatPhotoDurationMs(value)} 秒</option>`).join('')}
            <option id="custom-duration-option" value="${CUSTOM_DURATION_VALUE}">自定义…</option>
          </select>
          <div id="custom-duration" class="custom-duration" hidden>
            <input
              id="custom-duration-input"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              aria-label="自定义图片停留秒数"
            >
            <span class="duration-unit" aria-hidden="true">秒</span>
            <button id="apply-duration" type="button">应用</button>
          </div>
        </div>
        <div class="video-preferences" aria-label="视频播放偏好">
          <button id="video-muted" type="button" aria-label="切换视频静音" aria-pressed="false">声音</button>
          <input id="video-volume" type="range" min="0" max="1" step="0.05" aria-label="视频音量">
          <span id="video-volume-value" class="volume-value" aria-hidden="true">100%</span>
          <select id="video-rate" aria-label="视频播放倍速">
            ${VIDEO_PLAYBACK_RATES.map((value) => `<option value="${value}">${value}x</option>`).join('')}
          </select>
        </div>
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
    this.customDuration = this.shadow.querySelector('#custom-duration');
    this.customDurationInput = this.shadow.querySelector('#custom-duration-input');
    this.customDurationOption = this.shadow.querySelector('#custom-duration-option');
    this.videoMuted = this.shadow.querySelector('#video-muted');
    this.videoVolume = this.shadow.querySelector('#video-volume');
    this.videoVolumeValue = this.shadow.querySelector('#video-volume-value');
    this.videoRate = this.shadow.querySelector('#video-rate');

    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick']) {
      this.shadow.addEventListener(type, (event) => event.stopPropagation());
    }

    this.toggle.addEventListener('click', onToggleContinuous);
    this.pause.addEventListener('click', onTogglePause);
    this.previous.addEventListener('click', () => onNavigate(-1, false));
    this.next.addEventListener('click', () => onNavigate(1, false));
    this.filter.addEventListener('change', () => onSetMediaFilter(this.filter.value));
    this.direction.addEventListener('change', () => onSetBrowseDirection(this.direction.value));
    this.duration.addEventListener('change', () => {
      if (this.duration.value === CUSTOM_DURATION_VALUE) {
        this.isCustomDurationOpen = true;
        this.renderCustomDuration();
        this.customDurationInput.focus();
        this.customDurationInput.select();
        return;
      }
      this.isCustomDurationOpen = false;
      this.renderCustomDuration();
      onSetPhotoDuration(Number(this.duration.value));
    });
    this.customDurationInput.addEventListener('input', () => {
      this.customDurationInput.removeAttribute('aria-invalid');
    });
    this.customDurationInput.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.applyCustomPhotoDuration(onSetPhotoDuration);
    });
    this.shadow.querySelector('#apply-duration').addEventListener('click', () => {
      this.applyCustomPhotoDuration(onSetPhotoDuration);
    });
    this.videoMuted.addEventListener('click', () => onSetVideoMuted(!this.currentVideoMuted));
    this.videoVolume.addEventListener('input', () => this.renderVolumeValue(Number(this.videoVolume.value)));
    this.videoVolume.addEventListener('change', () => onSetVideoVolume(Number(this.videoVolume.value)));
    this.videoRate.addEventListener('change', () => onSetVideoPlaybackRate(Number(this.videoRate.value)));
    this.shadow.querySelector('#collapse').addEventListener('click', () => onSetPanelCollapsed(true));
    this.launcher.addEventListener('click', () => onSetPanelCollapsed(false));
  }

  applyCustomPhotoDuration(onSetPhotoDuration) {
    const durationMs = parsePhotoDurationSeconds(this.customDurationInput.value);
    if (durationMs === undefined) {
      this.customDurationInput.setAttribute('aria-invalid', 'true');
      this.setStatus(CUSTOM_DURATION_ERROR);
      return;
    }

    this.currentPhotoDurationMs = durationMs;
    this.isCustomDurationOpen = true;
    this.customDurationInput.removeAttribute('aria-invalid');
    this.customDurationInput.value = formatPhotoDurationMs(durationMs);
    this.customDurationOption.textContent = `自定义（${formatPhotoDurationMs(durationMs)} 秒）`;
    onSetPhotoDuration(durationMs);
  }

  renderCustomDuration() {
    this.customDuration.hidden = !this.isCustomDurationOpen;
    this.duration.value = this.isCustomDurationOpen
      ? CUSTOM_DURATION_VALUE
      : String(this.currentPhotoDurationMs);
  }

  renderVolumeValue(volume) {
    this.videoVolumeValue.textContent = `${Math.round(volume * 100)}%`;
  }

  render(state) {
    this.currentPhotoDurationMs = state.photoDurationMs;
    this.currentVideoMuted = state.videoMuted;
    const isPresetDuration = isPresetPhotoDurationMs(state.photoDurationMs);
    if (!isPresetDuration) this.isCustomDurationOpen = true;

    const displayDuration = formatPhotoDurationMs(state.photoDurationMs);
    this.customDurationOption.textContent = isPresetDuration
      ? '自定义…'
      : `自定义（${displayDuration} 秒）`;
    if (this.shadow.activeElement !== this.customDurationInput) {
      this.customDurationInput.value = displayDuration;
      this.customDurationInput.removeAttribute('aria-invalid');
    }

    this.toggle.dataset.active = String(state.active);
    this.toggle.textContent = state.active ? '连续浏览：开' : '连续浏览：关';
    this.pause.textContent = state.paused ? '继续' : '暂停';
    this.pause.disabled = !state.active;
    this.previous.disabled = !state.canPrevious;
    this.next.disabled = !state.canNext;
    this.filter.value = state.mediaFilter;
    this.direction.value = state.browseDirection;
    this.videoMuted.setAttribute('aria-pressed', String(state.videoMuted));
    this.videoMuted.textContent = state.videoMuted ? '静音' : '声音';
    if (this.shadow.activeElement !== this.videoVolume) {
      this.videoVolume.value = String(state.videoVolume);
      this.renderVolumeValue(state.videoVolume);
    }
    this.videoRate.value = String(state.videoPlaybackRate);
    this.renderCustomDuration();
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
