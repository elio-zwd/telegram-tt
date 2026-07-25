import { describe, expect, it } from 'vitest';

import {
  clearMediaViewerHistoryEntry,
  getMediaViewerHistoryEntry,
  isSameMediaViewerHistoryPosition,
  MAX_MEDIA_VIEWER_HISTORY_ENTRIES,
  saveMediaViewerHistoryEntry,
} from './mediaViewerHistory';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const STORAGE_KEY_PREFIX = 'telegram-tt-media-viewer-history-v1';

function buildStorageKey(accountId: string) {
  return `${STORAGE_KEY_PREFIX}:${accountId}`;
}

describe('mediaViewerHistory', () => {
  it('stores and restores a channel position for the current account', () => {
    const storage = new MemoryStorage();
    const entry = {
      chatId: '-1001',
      threadId: 42,
      messageId: 123,
      mediaIndex: 2,
      updatedAt: 1_000,
    };

    saveMediaViewerHistoryEntry(entry, 'account-a', storage);

    expect(getMediaViewerHistoryEntry(entry.chatId, 'account-a', storage)).toEqual(entry);
  });

  it('keeps histories isolated between accounts', () => {
    const storage = new MemoryStorage();
    const entry = {
      chatId: '-1001',
      messageId: 123,
      mediaIndex: 0,
      updatedAt: 1_000,
    };

    saveMediaViewerHistoryEntry(entry, 'account-a', storage);

    expect(getMediaViewerHistoryEntry(entry.chatId, 'account-b', storage)).toBeUndefined();
  });

  it('removes corrupted storage data instead of throwing', () => {
    const storage = new MemoryStorage();
    const storageKey = buildStorageKey('account-a');
    storage.setItem(storageKey, '{broken-json');

    expect(getMediaViewerHistoryEntry('-1001', 'account-a', storage)).toBeUndefined();
    expect(storage.getItem(storageKey)).toBeNull();
  });

  it('drops invalid entries while retaining valid positions', () => {
    const storage = new MemoryStorage();
    const storageKey = buildStorageKey('account-a');
    storage.setItem(storageKey, JSON.stringify({
      '-1001': {
        chatId: '-1001',
        messageId: 123,
        mediaIndex: 0,
        updatedAt: 1_000,
      },
      '-1002': {
        chatId: '-1002',
        messageId: 'invalid',
        mediaIndex: 0,
        updatedAt: 1_000,
      },
    }));

    expect(getMediaViewerHistoryEntry('-1001', 'account-a', storage)?.messageId).toBe(123);
    expect(getMediaViewerHistoryEntry('-1002', 'account-a', storage)).toBeUndefined();
  });

  it('keeps only the most recently updated channel positions', () => {
    const storage = new MemoryStorage();

    for (let index = 1; index <= MAX_MEDIA_VIEWER_HISTORY_ENTRIES + 1; index++) {
      saveMediaViewerHistoryEntry({
        chatId: String(index),
        messageId: index,
        mediaIndex: 0,
        updatedAt: index,
      }, 'account-a', storage);
    }

    expect(getMediaViewerHistoryEntry('1', 'account-a', storage)).toBeUndefined();
    expect(getMediaViewerHistoryEntry(String(MAX_MEDIA_VIEWER_HISTORY_ENTRIES + 1), 'account-a', storage)).toBeDefined();
  });

  it('clears a single channel without affecting other channels', () => {
    const storage = new MemoryStorage();
    saveMediaViewerHistoryEntry({
      chatId: '-1001',
      messageId: 123,
      mediaIndex: 0,
      updatedAt: 1_000,
    }, 'account-a', storage);
    saveMediaViewerHistoryEntry({
      chatId: '-1002',
      messageId: 456,
      mediaIndex: 0,
      updatedAt: 2_000,
    }, 'account-a', storage);

    clearMediaViewerHistoryEntry('-1001', 'account-a', storage);

    expect(getMediaViewerHistoryEntry('-1001', 'account-a', storage)).toBeUndefined();
    expect(getMediaViewerHistoryEntry('-1002', 'account-a', storage)?.messageId).toBe(456);
  });

  it('compares positions without considering their update time', () => {
    const previousPosition = {
      chatId: '-1001',
      messageId: 123,
      mediaIndex: 2,
      updatedAt: 1_000,
    };

    expect(isSameMediaViewerHistoryPosition(previousPosition, {
      chatId: '-1001',
      messageId: 123,
      mediaIndex: 2,
    })).toBe(true);
    expect(isSameMediaViewerHistoryPosition(previousPosition, {
      chatId: '-1001',
      messageId: 124,
      mediaIndex: 2,
    })).toBe(false);
  });
});
