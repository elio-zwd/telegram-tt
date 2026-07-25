const MEDIA_VIEWER_RESUME_STORAGE_KEY = 'tt.mediaViewerResume.v1';
const MAX_MEDIA_VIEWER_RESUME_POSITIONS = 100;

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

type UncheckedStoredResumeState = {
  version: unknown;
  entries: unknown[];
};

function getStorage() {
  if (typeof localStorage === 'undefined') return undefined;

  return localStorage;
}

function normalizeThreadId(threadId?: string | number) {
  return threadId === undefined ? '' : String(threadId);
}

function isValidPosition(value: unknown): value is MediaViewerResumePosition {
  if (!isRecord(value)) return false;

  const {
    accountId, chatId, threadId, messageId, mediaIndex, updatedAt,
  } = value;

  return typeof accountId === 'string'
    && Boolean(accountId)
    && typeof chatId === 'string'
    && Boolean(chatId)
    && typeof threadId === 'string'
    && typeof messageId === 'number'
    && Number.isInteger(messageId)
    && messageId > 0
    && typeof mediaIndex === 'number'
    && Number.isInteger(mediaIndex)
    && mediaIndex >= 0
    && typeof updatedAt === 'number'
    && Number.isFinite(updatedAt)
    && updatedAt > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isUncheckedStoredResumeState(value: unknown): value is UncheckedStoredResumeState {
  return isRecord(value) && 'version' in value && Array.isArray(value.entries);
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

function readState(): MediaViewerResumePosition[] {
  const targetStorage = getStorage();
  if (!targetStorage) return [];

  let rawState: string | null;

  try {
    rawState = targetStorage.getItem(MEDIA_VIEWER_RESUME_STORAGE_KEY);
  } catch {
    return [];
  }

  if (!rawState) return [];

  let parsedState: unknown;

  try {
    parsedState = JSON.parse(rawState);
  } catch {
    try {
      targetStorage.removeItem(MEDIA_VIEWER_RESUME_STORAGE_KEY);
    } catch {
      // 存储异常不应阻断媒体查看器
    }

    return [];
  }

  if (!isUncheckedStoredResumeState(parsedState) || parsedState.version !== STORAGE_VERSION) {
    try {
      targetStorage.removeItem(MEDIA_VIEWER_RESUME_STORAGE_KEY);
    } catch {
      // 存储异常不应阻断媒体查看器
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
) {
  const normalizedThreadId = normalizeThreadId(threadId);

  return readState().find((position) => (
    isSamePositionKey(position, accountId, chatId, normalizedThreadId)
  ));
}

export function saveMediaViewerResumePosition(
  input: MediaViewerResumePositionInput,
) {
  const targetStorage = getStorage();
  if (!targetStorage) return false;

  const position: MediaViewerResumePosition = {
    accountId: input.accountId,
    chatId: input.chatId,
    threadId: normalizeThreadId(input.threadId),
    messageId: input.messageId,
    mediaIndex: input.mediaIndex ?? 0,
    updatedAt: Date.now(),
  };

  if (!isValidPosition(position)) return false;

  const entries = readState()
    .filter((entry) => !isSamePositionKey(
      entry,
      position.accountId,
      position.chatId,
      position.threadId,
    ));

  return writeState(targetStorage, [position, ...entries].slice(0, MAX_MEDIA_VIEWER_RESUME_POSITIONS));
}
