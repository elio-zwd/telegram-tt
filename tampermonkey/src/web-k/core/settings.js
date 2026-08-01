import { debugLog } from './logger.js';

const STORAGE_KEY = 'tt.mediaContinuity.v1';

export const DURATIONS = [2000, 3000, 5000, 8000, 10000, 15000, 30000];
export const BROWSE_DIRECTIONS = Object.freeze(['forward', 'backward']);

const DEFAULT_SETTINGS = Object.freeze({
  continuousEnabled: false,
  photoDurationMs: 5000,
  browseDirection: 'forward',
  panelCollapsed: false,
});

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function validateSettings(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    continuousEnabled: typeof source.continuousEnabled === 'boolean'
      ? source.continuousEnabled
      : DEFAULT_SETTINGS.continuousEnabled,
    photoDurationMs: DURATIONS.includes(source.photoDurationMs)
      ? source.photoDurationMs
      : DEFAULT_SETTINGS.photoDurationMs,
    browseDirection: BROWSE_DIRECTIONS.includes(source.browseDirection)
      ? source.browseDirection
      : DEFAULT_SETTINGS.browseDirection,
    panelCollapsed: typeof source.panelCollapsed === 'boolean'
      ? source.panelCollapsed
      : DEFAULT_SETTINGS.panelCollapsed,
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (isPlainObject(parsed) && isPlainObject(parsed.settings)) {
      return validateSettings(parsed.settings);
    }
    return validateSettings(parsed);
  } catch (error) {
    debugLog('读取本地设置失败', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const nextState = isPlainObject(parsed) ? parsed : {};
    nextState.settings = validateSettings(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return nextState.settings;
  } catch (error) {
    debugLog('写入本地设置失败', error);
    return validateSettings(settings);
  }
}

export function updateSettings(current, patch) {
  return saveSettings({ ...current, ...patch });
}
