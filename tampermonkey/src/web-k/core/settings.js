import { debugLog } from './logger.js';

const STORAGE_KEY = 'tt.mediaContinuity.v1';

export const DURATIONS = [2000, 3000, 5000, 8000, 10000, 15000, 30000];
export const BROWSE_DIRECTIONS = Object.freeze(['forward', 'backward']);
export const MEDIA_FILTERS = Object.freeze(['all', 'images', 'videos']);

const DEFAULT_SETTINGS = Object.freeze({
  continuousEnabled: false,
  photoDurationMs: 5000,
  browseDirection: 'forward',
  mediaFilter: 'all',
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
    mediaFilter: MEDIA_FILTERS.includes(source.mediaFilter)
      ? source.mediaFilter
      : DEFAULT_SETTINGS.mediaFilter,
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
  const validatedSettings = validateSettings(settings);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let nextState = {};
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (isPlainObject(parsed)) nextState = parsed;
      } catch (error) {
        debugLog('修复损坏的本地设置', error);
      }
    }
    nextState.settings = validatedSettings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return nextState.settings;
  } catch (error) {
    debugLog('写入本地设置失败', error);
    return validatedSettings;
  }
}

export function updateSettings(current, patch) {
  return saveSettings({ ...current, ...patch });
}
