export const MEDIA_VIEWER_RESUME_STORAGE_KEY = 'tt.mediaViewerResume.v1';
export const MAX_MEDIA_VIEWER_RESUME_POSITIONS = 100;

const STORAGE_VERSION = 1;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type MediaViewerResumePosition = {
  accountId: string;
  chatId: string;
  threadId: string;
  messageId: number;
  mediaIndex: number;
  updatedAt: number;
};

export type MediaViewerResumePositionInput = {
  accountId: string;
  chatId: string;
  threadId?: string | number;
  messageId: number;
  mediaIndex?: number;
};

type StoredResumeState = {
  version: typeof STORAGE_VERSION;
  entries: MediaViewerResumePosition[];
};

function getStorage(storage?: StorageLike) {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return undefined;

  return localStorage;
}

function normalizeThreadId(threadId?: string | number) {
  return threadId === undefined ? '' : String(threadId);
}

function isValidPosition(value: unknown): value is MediaViewerResumePosition {
  if (!value || typeof value !== 'object') return false;

  const position = value as Partial<MediaViewerResumePosition>;

  return typeof position.accountId === 'string'
    && Boolean(position.accountId)
    && typeof position.chatId === 'string'
    && Boolean(position.chatId)
    && typeof position.threadId === 'string'
    && Number.isInteger(position.messageId)
    && position.messageId! > 0
    && Number.isInteger(position.mediaIndex)
    && position.mediaIndex! >= 0
    && Number.isFinite(position.updatedAt)
    && position.updatedAt! > 0;
}

function isSamePositionKey(
  position: MediaViewerResumePosition,
  accountId: string,
  chatId: string,
  threadId: string,
) {
  return position.accountId === accountId
    && position.chatId === chatId
    && position.threadId === threadId;
}

function writeState(storage: StorageLike, entries: MediaViewerResumePosition[]) {
  const state: StoredResumeState = {
    version: STORAGE_VERSION,
    entries,
  };

  try {
    storage.setItem(MEDIA_VIEWER_RESUME_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function readState(storage?: StorageLike): MediaViewerResumePosition[] {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return [];

  let rawState: string | null;

  try {
    rawState = targetStorage.getItem(MEDIA_VIEWER_RESUME_STORAGE_KEY);
  } catch {
    return [];
  }

  if (!rawState) return [];

  let parsedState: Partial<StoredResumeState>;

  try {
    parsedState = JSON.parse(rawState) as Partial<StoredResumeState>;
  } catch {
    try {
      targetStorage.removeItem(MEDIA_VIEWER_RESUME_STORAGE_KEY);
    } catch {
      // Ignore storage failures. Resume support must never block the media viewer.
    }

    return [];
  }

  if (parsedState.version !== STORAGE_VERSION || !Array.isArray(parsedState.entries)) {
    try {
      targetStorage.removeItem(MEDIA_VIEWER_RESUME_STORAGE_KEY);
    } catch {
      // Ignore storage failures. Resume support must never block the media viewer.
    }

    return [];
  }

  const validEntries = parsedState.entries
    .filter(isValidPosition)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_MEDIA_VIEWER_RESUME_POSITIONS);

  if (validEntries.length !== parsedState.entries.length) {
    writeState(targetStorage, validEntries);
  }

  return validEntries;
}

export function getMediaViewerResumePosition(
  accountId: string,
  chatId: string,
  threadId?: string | number,
  storage?: StorageLike,
) {
  const normalizedThreadId = normalizeThreadId(threadId);

  return readState(storage).find((position) => (
    isSamePositionKey(position, accountId, chatId, normalizedThreadId)
  ));
}

export function saveMediaViewerResumePosition(
  input: MediaViewerResumePositionInput,
  storage?: StorageLike,
  updatedAt = Date.now(),
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  const position: MediaViewerResumePosition = {
    accountId: input.accountId,
    chatId: input.chatId,
    threadId: normalizeThreadId(input.threadId),
    messageId: input.messageId,
    mediaIndex: input.mediaIndex ?? 0,
    updatedAt,
  };

  if (!isValidPosition(position)) return false;

  const entries = readState(targetStorage)
    .filter((entry) => !isSamePositionKey(
      entry,
      position.accountId,
      position.chatId,
      position.threadId,
    ));

  return writeState(targetStorage, [position, ...entries].slice(0, MAX_MEDIA_VIEWER_RESUME_POSITIONS));
}

export function clearMediaViewerResumePosition(
  accountId: string,
  chatId: string,
  threadId?: string | number,
  storage?: StorageLike,
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  const normalizedThreadId = normalizeThreadId(threadId);
  const entries = readState(targetStorage);
  const remainingEntries = entries.filter((position) => (
    !isSamePositionKey(position, accountId, chatId, normalizedThreadId)
  ));

  if (remainingEntries.length === entries.length) return true;

  return writeState(targetStorage, remainingEntries);
}

export function clearAllMediaViewerResumePositions(storage?: StorageLike) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  try {
    targetStorage.removeItem(MEDIA_VIEWER_RESUME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
