import { describe, expect, it } from 'vitest';

import {
  clearAllMediaViewerResumePositions,
  clearMediaViewerResumePosition,
  getMediaViewerResumePosition,
  MAX_MEDIA_VIEWER_RESUME_POSITIONS,
  MEDIA_VIEWER_RESUME_STORAGE_KEY,
  saveMediaViewerResumePosition,
} from './mediaViewerResume';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();

  getItem(key: string) {
    return this.data.get(key) || null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }
}

const BASE_POSITION = {
  accountId: '10001',
  chatId: '-100100',
  threadId: 1,
  messageId: 321,
  mediaIndex: 2,
};

describe('mediaViewerResume', () => {
  it('stores and reads a position', () => {
    const storage = new MemoryStorage();

    expect(saveMediaViewerResumePosition(BASE_POSITION, storage, 1000)).toBe(true);
    expect(getMediaViewerResumePosition('10001', '-100100', 1, storage)).toEqual({
      ...BASE_POSITION,
      threadId: '1',
      updatedAt: 1000,
    });
  });

  it('keeps accounts, chats, and threads isolated', () => {
    const storage = new MemoryStorage();

    saveMediaViewerResumePosition(BASE_POSITION, storage, 1000);
    saveMediaViewerResumePosition({
      ...BASE_POSITION,
      accountId: '10002',
      messageId: 400,
    }, storage, 2000);
    saveMediaViewerResumePosition({
      ...BASE_POSITION,
      chatId: '-100200',
      messageId: 500,
    }, storage, 3000);
    saveMediaViewerResumePosition({
      ...BASE_POSITION,
      threadId: 2,
      messageId: 600,
    }, storage, 4000);

    expect(getMediaViewerResumePosition('10001', '-100100', 1, storage)?.messageId).toBe(321);
    expect(getMediaViewerResumePosition('10002', '-100100', 1, storage)?.messageId).toBe(400);
    expect(getMediaViewerResumePosition('10001', '-100200', 1, storage)?.messageId).toBe(500);
    expect(getMediaViewerResumePosition('10001', '-100100', 2, storage)?.messageId).toBe(600);
  });

  it('replaces the previous position for the same channel thread', () => {
    const storage = new MemoryStorage();

    saveMediaViewerResumePosition(BASE_POSITION, storage, 1000);
    saveMediaViewerResumePosition({
      ...BASE_POSITION,
      messageId: 999,
      mediaIndex: 0,
    }, storage, 2000);

    expect(getMediaViewerResumePosition('10001', '-100100', 1, storage)).toEqual({
      ...BASE_POSITION,
      threadId: '1',
      messageId: 999,
      mediaIndex: 0,
      updatedAt: 2000,
    });
  });

  it('retains only the 100 most recently updated channel positions', () => {
    const storage = new MemoryStorage();

    for (let index = 0; index <= MAX_MEDIA_VIEWER_RESUME_POSITIONS; index++) {
      saveMediaViewerResumePosition({
        accountId: '10001',
        chatId: `chat-${index}`,
        messageId: index + 1,
      }, storage, index + 1);
    }

    expect(getMediaViewerResumePosition('10001', 'chat-0', undefined, storage)).toBeUndefined();
    expect(getMediaViewerResumePosition(
      '10001',
      `chat-${MAX_MEDIA_VIEWER_RESUME_POSITIONS}`,
      undefined,
      storage,
    )?.messageId).toBe(MAX_MEDIA_VIEWER_RESUME_POSITIONS + 1);
  });

  it('removes corrupted JSON without throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(MEDIA_VIEWER_RESUME_STORAGE_KEY, '{not-json');

    expect(getMediaViewerResumePosition('10001', '-100100', 1, storage)).toBeUndefined();
    expect(storage.getItem(MEDIA_VIEWER_RESUME_STORAGE_KEY)).toBeNull();
  });

  it('filters invalid entries while preserving valid data', () => {
    const storage = new MemoryStorage();
    storage.setItem(MEDIA_VIEWER_RESUME_STORAGE_KEY, JSON.stringify({
      version: 1,
      entries: [
        {
          accountId: '10001',
          chatId: '-100100',
          threadId: '1',
          messageId: 321,
          mediaIndex: 0,
          updatedAt: 1000,
        },
        {
          accountId: '',
          chatId: '-100200',
          threadId: '',
          messageId: -1,
          mediaIndex: -1,
          updatedAt: 0,
        },
      ],
    }));

    expect(getMediaViewerResumePosition('10001', '-100100', 1, storage)?.messageId).toBe(321);

    const persisted = JSON.parse(storage.getItem(MEDIA_VIEWER_RESUME_STORAGE_KEY)!);
    expect(persisted.entries).toHaveLength(1);
  });

  it('clears one position without affecting other channels', () => {
    const storage = new MemoryStorage();

    saveMediaViewerResumePosition(BASE_POSITION, storage, 1000);
    saveMediaViewerResumePosition({
      ...BASE_POSITION,
      chatId: '-100200',
      messageId: 400,
    }, storage, 2000);

    expect(clearMediaViewerResumePosition('10001', '-100100', 1, storage)).toBe(true);
    expect(getMediaViewerResumePosition('10001', '-100100', 1, storage)).toBeUndefined();
    expect(getMediaViewerResumePosition('10001', '-100200', 1, storage)?.messageId).toBe(400);
  });

  it('clears every saved position', () => {
    const storage = new MemoryStorage();

    saveMediaViewerResumePosition(BASE_POSITION, storage, 1000);

    expect(clearAllMediaViewerResumePositions(storage)).toBe(true);
    expect(storage.getItem(MEDIA_VIEWER_RESUME_STORAGE_KEY)).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    const failingStorage: StorageLike = {
      getItem() {
        throw new Error('storage unavailable');
      },
      setItem() {
        throw new Error('storage unavailable');
      },
      removeItem() {
        throw new Error('storage unavailable');
      },
    };

    expect(saveMediaViewerResumePosition(BASE_POSITION, failingStorage, 1000)).toBe(false);
    expect(getMediaViewerResumePosition('10001', '-100100', 1, failingStorage)).toBeUndefined();
    expect(clearAllMediaViewerResumePositions(failingStorage)).toBe(false);
  });
});
