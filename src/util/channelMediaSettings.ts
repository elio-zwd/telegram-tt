export const CHANNEL_MEDIA_SETTINGS_STORAGE_KEY = 'tt.channelMediaSettings.v1';
export const MAX_CHANNEL_MEDIA_SETTINGS_ENTRIES = 500;

const STORAGE_VERSION = 1;
const MIN_IMAGE_DURATION_SECONDS = 2;
const MAX_IMAGE_DURATION_SECONDS = 300;
const MIN_VIDEO_SIZE_MB = 1;
const MAX_VIDEO_SIZE_MB = 4096;

export type ChannelMediaType = 'all' | 'photo' | 'video';
export type ChannelMediaDirection = 'forward' | 'backward';
export type ChannelMediaEndBehavior = 'stop' | 'wait' | 'loop';

export type ChannelMediaSettings = {
  isContinuousBrowsingEnabled: boolean;
  imageDurationSeconds: number;
  mediaType: ChannelMediaType;
  direction: ChannelMediaDirection;
  shouldPreloadNext: boolean;
  isAutoSaveEnabled: boolean;
  shouldSavePhotos: boolean;
  shouldSaveVideos: boolean;
  shouldSaveGifs: boolean;
  maxVideoSizeMb: number;
  endBehavior: ChannelMediaEndBehavior;
};

export type ChannelMediaSettingsOverride = Partial<ChannelMediaSettings>;

export type ChannelMediaSettingsPatch = {
  [Key in keyof ChannelMediaSettings]?: ChannelMediaSettings[Key] | null;
};

export type ChannelMediaSettingsEntry = {
  accountId: string;
  chatId: string;
  threadId: string;
  settings: ChannelMediaSettingsOverride;
  updatedAt: number;
};

export type ChannelMediaSettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type StoredChannelMediaSettings = {
  version: typeof STORAGE_VERSION;
  entries: ChannelMediaSettingsEntry[];
};

type ChannelMediaSettingsKey = {
  accountId: string;
  chatId: string;
  threadId?: string | number;
};

type UpdateChannelMediaSettingsInput = ChannelMediaSettingsKey & {
  settings: ChannelMediaSettingsPatch;
};

const BOOLEAN_KEYS: Array<keyof Pick<
  ChannelMediaSettings,
  | 'isContinuousBrowsingEnabled'
  | 'shouldPreloadNext'
  | 'isAutoSaveEnabled'
  | 'shouldSavePhotos'
  | 'shouldSaveVideos'
  | 'shouldSaveGifs'
>> = [
  'isContinuousBrowsingEnabled',
  'shouldPreloadNext',
  'isAutoSaveEnabled',
  'shouldSavePhotos',
  'shouldSaveVideos',
  'shouldSaveGifs',
];

function getStorage(storage?: ChannelMediaSettingsStorage) {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return undefined;

  return localStorage;
}

function normalizeThreadId(threadId?: string | number) {
  return threadId === undefined ? '' : String(threadId);
}

function isMediaType(value: unknown): value is ChannelMediaType {
  return value === 'all' || value === 'photo' || value === 'video';
}

function isDirection(value: unknown): value is ChannelMediaDirection {
  return value === 'forward' || value === 'backward';
}

function isEndBehavior(value: unknown): value is ChannelMediaEndBehavior {
  return value === 'stop' || value === 'wait' || value === 'loop';
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function sanitizeSettings(value: unknown): ChannelMediaSettingsOverride {
  if (!value || typeof value !== 'object') return {};

  const input = value as Partial<Record<keyof ChannelMediaSettings, unknown>>;
  const settings: ChannelMediaSettingsOverride = {};

  BOOLEAN_KEYS.forEach((key) => {
    if (typeof input[key] === 'boolean') {
      settings[key] = input[key] as never;
    }
  });

  if (isIntegerInRange(input.imageDurationSeconds, MIN_IMAGE_DURATION_SECONDS, MAX_IMAGE_DURATION_SECONDS)) {
    settings.imageDurationSeconds = input.imageDurationSeconds;
  }

  if (isMediaType(input.mediaType)) {
    settings.mediaType = input.mediaType;
  }

  if (isDirection(input.direction)) {
    settings.direction = input.direction;
  }

  if (isIntegerInRange(input.maxVideoSizeMb, MIN_VIDEO_SIZE_MB, MAX_VIDEO_SIZE_MB)) {
    settings.maxVideoSizeMb = input.maxVideoSizeMb;
  }

  if (isEndBehavior(input.endBehavior)) {
    settings.endBehavior = input.endBehavior;
  }

  return settings;
}

function isValidEntryIdentity(value: unknown): value is Omit<ChannelMediaSettingsEntry, 'settings'> & { settings: unknown } {
  if (!value || typeof value !== 'object') return false;

  const entry = value as Partial<ChannelMediaSettingsEntry>;

  return typeof entry.accountId === 'string'
    && Boolean(entry.accountId)
    && typeof entry.chatId === 'string'
    && Boolean(entry.chatId)
    && typeof entry.threadId === 'string'
    && Number.isFinite(entry.updatedAt)
    && entry.updatedAt! > 0;
}

function getEntryKey(entry: Pick<ChannelMediaSettingsEntry, 'accountId' | 'chatId' | 'threadId'>) {
  return `${entry.accountId}\u0000${entry.chatId}\u0000${entry.threadId}`;
}

function isSameEntryKey(
  entry: ChannelMediaSettingsEntry,
  accountId: string,
  chatId: string,
  threadId: string,
) {
  return entry.accountId === accountId
    && entry.chatId === chatId
    && entry.threadId === threadId;
}

function writeEntries(storage: ChannelMediaSettingsStorage, entries: ChannelMediaSettingsEntry[]) {
  const state: StoredChannelMediaSettings = {
    version: STORAGE_VERSION,
    entries,
  };

  try {
    storage.setItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function removeStoredState(storage: ChannelMediaSettingsStorage) {
  try {
    storage.removeItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY);
  } catch {
    // Storage support is optional. Settings failures must not block the media viewer.
  }
}

function readEntries(storage?: ChannelMediaSettingsStorage): ChannelMediaSettingsEntry[] {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return [];

  let rawState: string | null;

  try {
    rawState = targetStorage.getItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY);
  } catch {
    return [];
  }

  if (!rawState) return [];

  let parsedState: Partial<StoredChannelMediaSettings>;

  try {
    parsedState = JSON.parse(rawState) as Partial<StoredChannelMediaSettings>;
  } catch {
    removeStoredState(targetStorage);
    return [];
  }

  if (parsedState.version !== STORAGE_VERSION || !Array.isArray(parsedState.entries)) {
    removeStoredState(targetStorage);
    return [];
  }

  const deduplicatedEntries = new Map<string, ChannelMediaSettingsEntry>();

  parsedState.entries
    .filter(isValidEntryIdentity)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .forEach((entry) => {
      const settings = sanitizeSettings(entry.settings);
      if (!Object.keys(settings).length) return;

      const normalizedEntry: ChannelMediaSettingsEntry = {
        accountId: entry.accountId,
        chatId: entry.chatId,
        threadId: entry.threadId,
        settings,
        updatedAt: entry.updatedAt,
      };
      const key = getEntryKey(normalizedEntry);

      if (!deduplicatedEntries.has(key)) {
        deduplicatedEntries.set(key, normalizedEntry);
      }
    });

  const entries = Array.from(deduplicatedEntries.values())
    .slice(0, MAX_CHANNEL_MEDIA_SETTINGS_ENTRIES);

  if (JSON.stringify(entries) !== JSON.stringify(parsedState.entries)) {
    writeEntries(targetStorage, entries);
  }

  return entries;
}

function applyPatch(
  currentSettings: ChannelMediaSettingsOverride,
  patch: ChannelMediaSettingsPatch,
) {
  const nextSettings: ChannelMediaSettingsOverride = { ...currentSettings };

  Object.entries(patch).forEach(([rawKey, value]) => {
    const key = rawKey as keyof ChannelMediaSettings;

    if (value === null || value === undefined) {
      delete nextSettings[key];
      return;
    }

    const sanitizedValue = sanitizeSettings({ [key]: value })[key];
    if (sanitizedValue !== undefined) {
      nextSettings[key] = sanitizedValue as never;
    }
  });

  return nextSettings;
}

export function getChannelMediaSettingsOverride(
  accountId: string,
  chatId: string,
  threadId?: string | number,
  storage?: ChannelMediaSettingsStorage,
) {
  const normalizedThreadId = normalizeThreadId(threadId);

  return readEntries(storage).find((entry) => (
    isSameEntryKey(entry, accountId, chatId, normalizedThreadId)
  ))?.settings;
}

export function resolveChannelMediaSettings(
  globalSettings: ChannelMediaSettings,
  channelOverride?: ChannelMediaSettingsOverride,
): ChannelMediaSettings {
  return {
    ...globalSettings,
    ...sanitizeSettings(channelOverride),
  };
}

export function updateChannelMediaSettingsOverride(
  input: UpdateChannelMediaSettingsInput,
  storage?: ChannelMediaSettingsStorage,
  updatedAt = Date.now(),
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  const threadId = normalizeThreadId(input.threadId);
  const entries = readEntries(targetStorage);
  const currentEntry = entries.find((entry) => (
    isSameEntryKey(entry, input.accountId, input.chatId, threadId)
  ));
  const nextSettings = applyPatch(currentEntry?.settings || {}, input.settings);
  const remainingEntries = entries.filter((entry) => (
    !isSameEntryKey(entry, input.accountId, input.chatId, threadId)
  ));

  if (!Object.keys(nextSettings).length) {
    return writeEntries(targetStorage, remainingEntries);
  }

  if (!input.accountId || !input.chatId || !Number.isFinite(updatedAt) || updatedAt <= 0) {
    return false;
  }

  const nextEntry: ChannelMediaSettingsEntry = {
    accountId: input.accountId,
    chatId: input.chatId,
    threadId,
    settings: nextSettings,
    updatedAt,
  };

  return writeEntries(
    targetStorage,
    [nextEntry, ...remainingEntries].slice(0, MAX_CHANNEL_MEDIA_SETTINGS_ENTRIES),
  );
}

export function clearChannelMediaSettingsOverride(
  accountId: string,
  chatId: string,
  threadId?: string | number,
  storage?: ChannelMediaSettingsStorage,
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  const normalizedThreadId = normalizeThreadId(threadId);
  const entries = readEntries(targetStorage);
  const remainingEntries = entries.filter((entry) => (
    !isSameEntryKey(entry, accountId, chatId, normalizedThreadId)
  ));

  if (remainingEntries.length === entries.length) return true;

  return writeEntries(targetStorage, remainingEntries);
}

export function clearAccountChannelMediaSettings(
  accountId: string,
  storage?: ChannelMediaSettingsStorage,
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  const entries = readEntries(targetStorage);
  const remainingEntries = entries.filter((entry) => entry.accountId !== accountId);

  if (remainingEntries.length === entries.length) return true;

  return writeEntries(targetStorage, remainingEntries);
}

export function clearAllChannelMediaSettings(storage?: ChannelMediaSettingsStorage) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  try {
    targetStorage.removeItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
