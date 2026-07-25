import type { ThreadId } from '../types';

const STORAGE_KEY_PREFIX = 'telegram-tt-media-viewer-history-v1';

export const MAX_MEDIA_VIEWER_HISTORY_ENTRIES = 100;

export type MediaViewerHistoryEntry = {
  chatId: string;
  threadId?: ThreadId;
  messageId: number;
  mediaIndex: number;
  updatedAt: number;
};

type MediaViewerHistory = Record<string, MediaViewerHistoryEntry>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorageKey(accountId?: string) {
  return `${STORAGE_KEY_PREFIX}:${accountId || 'anonymous'}`;
}

function getDefaultStorage(): StorageLike | undefined {
  if (typeof localStorage === 'undefined') return undefined;

  return localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidEntry(value: unknown): value is MediaViewerHistoryEntry {
  if (!isRecord(value)) return false;

  return typeof value.chatId === 'string'
    && value.chatId.length > 0
    && Number.isSafeInteger(value.messageId)
    && Number(value.messageId) > 0
    && Number.isSafeInteger(value.mediaIndex)
    && Number(value.mediaIndex) >= 0
    && Number.isFinite(value.updatedAt)
    && Number(value.updatedAt) > 0;
}

function writeHistory(
  history: MediaViewerHistory,
  accountId?: string,
  storage: StorageLike | undefined = getDefaultStorage(),
) {
  if (!storage) return;

  const limitedHistory = Object.values(history)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_MEDIA_VIEWER_HISTORY_ENTRIES)
    .reduce<MediaViewerHistory>((result, entry) => {
      result[entry.chatId] = entry;
      return result;
    }, {});

  try {
    storage.setItem(getStorageKey(accountId), JSON.stringify(limitedHistory));
  } catch {
    // Storage can be unavailable in private browsing or when the quota is exhausted.
  }
}

function readHistory(
  accountId?: string,
  storage: StorageLike | undefined = getDefaultStorage(),
): MediaViewerHistory {
  if (!storage) return {};

  const storageKey = getStorageKey(accountId);

  try {
    const rawValue = storage.getItem(storageKey);
    if (!rawValue) return {};

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isRecord(parsedValue)) {
      storage.removeItem(storageKey);
      return {};
    }

    const history = Object.entries(parsedValue).reduce<MediaViewerHistory>((result, [chatId, entry]) => {
      if (isValidEntry(entry) && entry.chatId === chatId) {
        result[chatId] = entry;
      }
      return result;
    }, {});

    if (Object.keys(history).length !== Object.keys(parsedValue).length) {
      writeHistory(history, accountId, storage);
    }

    return history;
  } catch {
    try {
      storage.removeItem(storageKey);
    } catch {
      // Ignore storage access failures.
    }
    return {};
  }
}

export function getMediaViewerHistoryEntry(
  chatId: string,
  accountId?: string,
  storage?: StorageLike,
) {
  return readHistory(accountId, storage)[chatId];
}

export function saveMediaViewerHistoryEntry(
  entry: MediaViewerHistoryEntry,
  accountId?: string,
  storage?: StorageLike,
) {
  if (!isValidEntry(entry)) return;

  const history = readHistory(accountId, storage);
  history[entry.chatId] = entry;
  writeHistory(history, accountId, storage);
}

export function clearMediaViewerHistoryEntry(
  chatId: string,
  accountId?: string,
  storage?: StorageLike,
) {
  const history = readHistory(accountId, storage);
  if (!history[chatId]) return;

  delete history[chatId];
  writeHistory(history, accountId, storage);
}

export function isSameMediaViewerHistoryPosition(
  left: MediaViewerHistoryEntry,
  right: Pick<MediaViewerHistoryEntry, 'chatId' | 'messageId' | 'mediaIndex'>,
) {
  return left.chatId === right.chatId
    && left.messageId === right.messageId
    && left.mediaIndex === right.mediaIndex;
}
