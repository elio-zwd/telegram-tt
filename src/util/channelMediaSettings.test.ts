import { describe, expect, it } from 'vitest';

import {
  CHANNEL_MEDIA_SETTINGS_STORAGE_KEY,
  clearAccountChannelMediaSettings,
  clearAllChannelMediaSettings,
  clearChannelMediaSettingsOverride,
  getChannelMediaSettingsOverride,
  MAX_CHANNEL_MEDIA_SETTINGS_ENTRIES,
  resolveChannelMediaSettings,
  type ChannelMediaSettings,
  type ChannelMediaSettingsStorage,
  updateChannelMediaSettingsOverride,
} from './channelMediaSettings';

class MemoryStorage implements ChannelMediaSettingsStorage {
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

const GLOBAL_SETTINGS: ChannelMediaSettings = {
  isContinuousBrowsingEnabled: false,
  imageDurationSeconds: 5,
  mediaType: 'all',
  direction: 'forward',
  shouldPreloadNext: true,
  isAutoSaveEnabled: false,
  shouldSavePhotos: true,
  shouldSaveVideos: true,
  shouldSaveGifs: false,
  maxVideoSizeMb: 200,
  endBehavior: 'stop',
};

describe('channelMediaSettings', () => {
  it('stores and reads a partial channel override', () => {
    const storage = new MemoryStorage();

    expect(updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: {
        mediaType: 'photo',
        imageDurationSeconds: 8,
      },
    }, storage, 1000)).toBe(true);

    expect(getChannelMediaSettingsOverride('10001', '-100100', undefined, storage)).toEqual({
      imageDurationSeconds: 8,
      mediaType: 'photo',
    });
  });

  it('merges channel overrides with global settings', () => {
    const resolved = resolveChannelMediaSettings(GLOBAL_SETTINGS, {
      isContinuousBrowsingEnabled: true,
      imageDurationSeconds: 10,
      mediaType: 'video',
    });

    expect(resolved).toEqual({
      ...GLOBAL_SETTINGS,
      isContinuousBrowsingEnabled: true,
      imageDurationSeconds: 10,
      mediaType: 'video',
    });
  });

  it('updates only supplied fields and preserves other overrides', () => {
    const storage = new MemoryStorage();

    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: {
        mediaType: 'photo',
        imageDurationSeconds: 8,
      },
    }, storage, 1000);
    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: {
        isAutoSaveEnabled: true,
      },
    }, storage, 2000);

    expect(getChannelMediaSettingsOverride('10001', '-100100', undefined, storage)).toEqual({
      imageDurationSeconds: 8,
      mediaType: 'photo',
      isAutoSaveEnabled: true,
    });
  });

  it('uses null to remove one override and fall back to the global value', () => {
    const storage = new MemoryStorage();

    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: {
        imageDurationSeconds: 8,
        mediaType: 'photo',
      },
    }, storage, 1000);
    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: {
        imageDurationSeconds: null,
      },
    }, storage, 2000);

    const channelOverride = getChannelMediaSettingsOverride('10001', '-100100', undefined, storage);
    expect(channelOverride).toEqual({ mediaType: 'photo' });
    expect(resolveChannelMediaSettings(GLOBAL_SETTINGS, channelOverride).imageDurationSeconds).toBe(5);
  });

  it('removes the stored entry when all override fields are cleared', () => {
    const storage = new MemoryStorage();

    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: { mediaType: 'photo' },
    }, storage, 1000);
    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: { mediaType: null },
    }, storage, 2000);

    expect(getChannelMediaSettingsOverride('10001', '-100100', undefined, storage)).toBeUndefined();
  });

  it('keeps accounts, chats, and topics isolated', () => {
    const storage = new MemoryStorage();

    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      threadId: 1,
      settings: { mediaType: 'photo' },
    }, storage, 1000);
    updateChannelMediaSettingsOverride({
      accountId: '10002',
      chatId: '-100100',
      threadId: 1,
      settings: { mediaType: 'video' },
    }, storage, 2000);
    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100200',
      threadId: 1,
      settings: { imageDurationSeconds: 10 },
    }, storage, 3000);
    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      threadId: 2,
      settings: { direction: 'backward' },
    }, storage, 4000);

    expect(getChannelMediaSettingsOverride('10001', '-100100', 1, storage)).toEqual({ mediaType: 'photo' });
    expect(getChannelMediaSettingsOverride('10002', '-100100', 1, storage)).toEqual({ mediaType: 'video' });
    expect(getChannelMediaSettingsOverride('10001', '-100200', 1, storage)).toEqual({ imageDurationSeconds: 10 });
    expect(getChannelMediaSettingsOverride('10001', '-100100', 2, storage)).toEqual({ direction: 'backward' });
  });

  it('ignores invalid values instead of persisting them', () => {
    const storage = new MemoryStorage();

    expect(updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: {
        imageDurationSeconds: 1,
        maxVideoSizeMb: 5000,
        mediaType: 'invalid' as never,
        direction: 'sideways' as never,
      },
    }, storage, 1000)).toBe(true);

    expect(getChannelMediaSettingsOverride('10001', '-100100', undefined, storage)).toBeUndefined();
  });

  it('repairs malformed JSON and incompatible versions', () => {
    const malformedStorage = new MemoryStorage();
    malformedStorage.setItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY, '{not-json');

    expect(getChannelMediaSettingsOverride('10001', '-100100', undefined, malformedStorage)).toBeUndefined();
    expect(malformedStorage.getItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY)).toBeNull();

    const incompatibleStorage = new MemoryStorage();
    incompatibleStorage.setItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 2,
      entries: [],
    }));

    expect(getChannelMediaSettingsOverride('10001', '-100100', undefined, incompatibleStorage)).toBeUndefined();
    expect(incompatibleStorage.getItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('filters invalid records, deduplicates keys, and keeps the newest entry', () => {
    const storage = new MemoryStorage();
    storage.setItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      entries: [
        {
          accountId: '10001',
          chatId: '-100100',
          threadId: '',
          settings: { mediaType: 'photo' },
          updatedAt: 1000,
        },
        {
          accountId: '10001',
          chatId: '-100100',
          threadId: '',
          settings: { mediaType: 'video' },
          updatedAt: 2000,
        },
        {
          accountId: '',
          chatId: '-100200',
          threadId: '',
          settings: { mediaType: 'photo' },
          updatedAt: 3000,
        },
        {
          accountId: '10001',
          chatId: '-100300',
          threadId: '',
          settings: { imageDurationSeconds: 999 },
          updatedAt: 4000,
        },
      ],
    }));

    expect(getChannelMediaSettingsOverride('10001', '-100100', undefined, storage)).toEqual({
      mediaType: 'video',
    });

    const repairedState = JSON.parse(storage.getItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY)!);
    expect(repairedState.entries).toHaveLength(1);
    expect(repairedState.entries[0].updatedAt).toBe(2000);
  });

  it('limits stored settings and evicts the oldest entries', () => {
    const storage = new MemoryStorage();

    for (let index = 0; index <= MAX_CHANNEL_MEDIA_SETTINGS_ENTRIES; index++) {
      updateChannelMediaSettingsOverride({
        accountId: '10001',
        chatId: String(index),
        settings: { mediaType: 'photo' },
      }, storage, index + 1);
    }

    expect(getChannelMediaSettingsOverride('10001', '0', undefined, storage)).toBeUndefined();
    expect(getChannelMediaSettingsOverride(
      '10001',
      String(MAX_CHANNEL_MEDIA_SETTINGS_ENTRIES),
      undefined,
      storage,
    )).toEqual({ mediaType: 'photo' });

    const state = JSON.parse(storage.getItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY)!);
    expect(state.entries).toHaveLength(MAX_CHANNEL_MEDIA_SETTINGS_ENTRIES);
  });

  it('clears one channel, one account, or all settings', () => {
    const storage = new MemoryStorage();

    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: { mediaType: 'photo' },
    }, storage, 1000);
    updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100200',
      settings: { mediaType: 'video' },
    }, storage, 2000);
    updateChannelMediaSettingsOverride({
      accountId: '10002',
      chatId: '-100100',
      settings: { direction: 'backward' },
    }, storage, 3000);

    expect(clearChannelMediaSettingsOverride('10001', '-100100', undefined, storage)).toBe(true);
    expect(getChannelMediaSettingsOverride('10001', '-100100', undefined, storage)).toBeUndefined();

    expect(clearAccountChannelMediaSettings('10001', storage)).toBe(true);
    expect(getChannelMediaSettingsOverride('10001', '-100200', undefined, storage)).toBeUndefined();
    expect(getChannelMediaSettingsOverride('10002', '-100100', undefined, storage)).toEqual({
      direction: 'backward',
    });

    expect(clearAllChannelMediaSettings(storage)).toBe(true);
    expect(storage.getItem(CHANNEL_MEDIA_SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('degrades safely when storage throws', () => {
    const storage: ChannelMediaSettingsStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };

    expect(getChannelMediaSettingsOverride('10001', '-100100', undefined, storage)).toBeUndefined();
    expect(updateChannelMediaSettingsOverride({
      accountId: '10001',
      chatId: '-100100',
      settings: { mediaType: 'photo' },
    }, storage, 1000)).toBe(false);
    expect(clearAllChannelMediaSettings(storage)).toBe(false);
  });
});
