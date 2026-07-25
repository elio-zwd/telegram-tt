export const CHANNEL_MEDIA_VIEW_HISTORY_STORAGE_KEY = 'tt.channelMediaViewHistory.v1';
export const MAX_CHANNEL_MEDIA_VIEW_HISTORY_ENTRIES = 20000;
export const CHANNEL_MEDIA_UNVIEWED_ONLY_STORAGE_KEY = 'tt.channelMediaUnviewedOnly.v1';

const STORAGE_VERSION = 1;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function getShouldOnlyShowUnviewedMedia(storage?: StorageLike) {
  const targetStorage = storage || (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!targetStorage) return false;

  try {
    return targetStorage.getItem(CHANNEL_MEDIA_UNVIEWED_ONLY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setShouldOnlyShowUnviewedMedia(value: boolean, storage?: StorageLike) {
  const targetStorage = storage || (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!targetStorage) return false;

  try {
    if (value) {
      targetStorage.setItem(CHANNEL_MEDIA_UNVIEWED_ONLY_STORAGE_KEY, 'true');
    } else {
      targetStorage.removeItem(CHANNEL_MEDIA_UNVIEWED_ONLY_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export type ChannelMediaIdentity = {
  accountId: string;
  chatId: string;
  threadId?: string | number;
  messageId: number;
  mediaIndex?: number;
};

export type ChannelMediaViewRecord = {
  accountId: string;
  chatId: string;
  threadId: string;
  messageId: number;
  mediaIndex: number;
  viewedAt: number;
};

type StoredChannelMediaViewHistory = {
  version: typeof STORAGE_VERSION;
  entries: ChannelMediaViewRecord[];
};

function getStorage(storage?: StorageLike) {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return undefined;

  return localStorage;
}

function normalizeThreadId(threadId?: string | number) {
  return threadId === undefined ? '' : String(threadId);
}

function normalizeMediaIndex(mediaIndex?: number) {
  return mediaIndex ?? 0;
}

function isValidIdentity(identity: ChannelMediaIdentity) {
  const mediaIndex = normalizeMediaIndex(identity.mediaIndex);

  return Boolean(identity.accountId)
    && Boolean(identity.chatId)
    && Number.isInteger(identity.messageId)
    && identity.messageId > 0
    && Number.isInteger(mediaIndex)
    && mediaIndex >= 0;
}

function isValidRecord(value: unknown): value is ChannelMediaViewRecord {
  if (!value || typeof value !== 'object') return false;

  const record = value as Partial<ChannelMediaViewRecord>;

  return typeof record.accountId === 'string'
    && Boolean(record.accountId)
    && typeof record.chatId === 'string'
    && Boolean(record.chatId)
    && typeof record.threadId === 'string'
    && Number.isInteger(record.messageId)
    && record.messageId! > 0
    && Number.isInteger(record.mediaIndex)
    && record.mediaIndex! >= 0
    && Number.isFinite(record.viewedAt)
    && record.viewedAt! > 0;
}

function buildRecord(identity: ChannelMediaIdentity, viewedAt: number): ChannelMediaViewRecord {
  return {
    accountId: identity.accountId,
    chatId: identity.chatId,
    threadId: normalizeThreadId(identity.threadId),
    messageId: identity.messageId,
    mediaIndex: normalizeMediaIndex(identity.mediaIndex),
    viewedAt,
  };
}

function getRecordKey(record: Pick<
  ChannelMediaViewRecord,
  'accountId' | 'chatId' | 'threadId' | 'messageId' | 'mediaIndex'
>) {
  return [
    record.accountId, record.chatId, record.threadId, record.messageId, record.mediaIndex,
  ].join('\u0000');
}

function getIdentityKey(identity: ChannelMediaIdentity) {
  return [
    identity.accountId,
    identity.chatId,
    normalizeThreadId(identity.threadId),
    identity.messageId,
    normalizeMediaIndex(identity.mediaIndex),
  ].join('\u0000');
}

function removeStoredHistory(storage: StorageLike) {
  try {
    storage.removeItem(CHANNEL_MEDIA_VIEW_HISTORY_STORAGE_KEY);
  } catch {
    // Storage support is optional
  }
}

function writeRecords(storage: StorageLike, entries: ChannelMediaViewRecord[]) {
  const state: StoredChannelMediaViewHistory = {
    version: STORAGE_VERSION,
    entries,
  };

  try {
    storage.setItem(CHANNEL_MEDIA_VIEW_HISTORY_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function readRecords(storage?: StorageLike): ChannelMediaViewRecord[] {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return [];

  let rawState;

  try {
    rawState = targetStorage.getItem(CHANNEL_MEDIA_VIEW_HISTORY_STORAGE_KEY);
  } catch {
    return [];
  }

  if (!rawState) return [];

  let parsedState: Partial<StoredChannelMediaViewHistory>;

  try {
    parsedState = JSON.parse(rawState) as Partial<StoredChannelMediaViewHistory>;
  } catch {
    removeStoredHistory(targetStorage);
    return [];
  }

  if (parsedState.version !== STORAGE_VERSION || !Array.isArray(parsedState.entries)) {
    removeStoredHistory(targetStorage);
    return [];
  }

  const recordsByKey = new Map<string, ChannelMediaViewRecord>();

  parsedState.entries
    .filter(isValidRecord)
    .sort((left, right) => right.viewedAt - left.viewedAt)
    .forEach((record) => {
      const key = getRecordKey(record);
      if (!recordsByKey.has(key)) {
        recordsByKey.set(key, record);
      }
    });

  const records = Array.from(recordsByKey.values())
    .slice(0, MAX_CHANNEL_MEDIA_VIEW_HISTORY_ENTRIES);

  if (JSON.stringify(records) !== JSON.stringify(parsedState.entries)) {
    writeRecords(targetStorage, records);
  }

  return records;
}

export function isChannelMediaViewed(
  identity: ChannelMediaIdentity,
  storage?: StorageLike,
) {
  if (!isValidIdentity(identity)) return false;

  const targetKey = getIdentityKey(identity);

  return readRecords(storage).some((entry) => getRecordKey(entry) === targetKey);
}

export function createChannelMediaViewedChecker(storage?: StorageLike) {
  const viewedKeys = new Set(readRecords(storage).map(getRecordKey));

  return (identity: ChannelMediaIdentity) => (
    isValidIdentity(identity) && viewedKeys.has(getIdentityKey(identity))
  );
}

export function filterUnviewedChannelMedia<Item>(
  items: Item[],
  getIdentity: (item: Item) => ChannelMediaIdentity,
  storage?: StorageLike,
) {
  const viewedKeys = new Set(readRecords(storage).map(getRecordKey));

  return items.filter((item) => {
    const identity = getIdentity(item);
    if (!isValidIdentity(identity)) return true;

    return !viewedKeys.has(getIdentityKey(identity));
  });
}

export function markChannelMediaViewed(
  identity: ChannelMediaIdentity,
  storage?: StorageLike,
  viewedAt = Date.now(),
) {
  return markChannelMediaBatchViewed([identity], storage, viewedAt);
}

export function markChannelMediaBatchViewed(
  identities: ChannelMediaIdentity[],
  storage?: StorageLike,
  viewedAt = Date.now(),
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage || !Number.isFinite(viewedAt) || viewedAt <= 0) return false;

  const newRecordsByKey = new Map<string, ChannelMediaViewRecord>();

  identities.filter(isValidIdentity).forEach((identity) => {
    const record = buildRecord(identity, viewedAt);
    newRecordsByKey.set(getRecordKey(record), record);
  });

  const newRecords = Array.from(newRecordsByKey.values());
  if (!newRecords.length) return false;

  const newKeys = new Set(newRecordsByKey.keys());
  const existingRecords = readRecords(targetStorage)
    .filter((record) => !newKeys.has(getRecordKey(record)));

  return writeRecords(
    targetStorage,
    [...newRecords, ...existingRecords].slice(0, MAX_CHANNEL_MEDIA_VIEW_HISTORY_ENTRIES),
  );
}

export function markChannelMediaUnviewed(
  identity: ChannelMediaIdentity,
  storage?: StorageLike,
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage || !isValidIdentity(identity)) return false;

  const targetKey = getIdentityKey(identity);
  const records = readRecords(targetStorage);
  const remainingRecords = records.filter((record) => getRecordKey(record) !== targetKey);

  if (remainingRecords.length === records.length) return true;

  return writeRecords(targetStorage, remainingRecords);
}

export function clearThreadMediaViewHistory(
  accountId: string,
  chatId: string,
  threadId: string | number,
  storage?: StorageLike,
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  const normalizedThreadId = normalizeThreadId(threadId);
  const records = readRecords(targetStorage);
  const remainingRecords = records.filter((record) => (
    record.accountId !== accountId
    || record.chatId !== chatId
    || record.threadId !== normalizedThreadId
  ));

  if (remainingRecords.length === records.length) return true;

  return writeRecords(targetStorage, remainingRecords);
}

export function clearChannelMediaViewHistory(
  accountId: string,
  chatId: string,
  storage?: StorageLike,
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  const records = readRecords(targetStorage);
  const remainingRecords = records.filter((record) => (
    record.accountId !== accountId || record.chatId !== chatId
  ));

  if (remainingRecords.length === records.length) return true;

  return writeRecords(targetStorage, remainingRecords);
}

export function clearAccountMediaViewHistory(
  accountId: string,
  storage?: StorageLike,
) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  const records = readRecords(targetStorage);
  const remainingRecords = records.filter((record) => record.accountId !== accountId);

  if (remainingRecords.length === records.length) return true;

  return writeRecords(targetStorage, remainingRecords);
}

export function clearAllChannelMediaViewHistory(storage?: StorageLike) {
  const targetStorage = getStorage(storage);
  if (!targetStorage) return false;

  try {
    targetStorage.removeItem(CHANNEL_MEDIA_VIEW_HISTORY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
