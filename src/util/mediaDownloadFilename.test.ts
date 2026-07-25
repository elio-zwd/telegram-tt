import { describe, expect, it } from 'vitest';

import {
  buildMediaDownloadFilename,
  DEFAULT_MEDIA_FILENAME_TEMPLATE,
  sanitizeMediaFilename,
  validateMediaFilenameTemplate,
} from './mediaDownloadFilename';

const MESSAGE_DATE = new Date(2026, 6, 25, 9, 7, 3);

describe('buildMediaDownloadFilename', () => {
  it('builds the default filename with a one-based media index', () => {
    const result = buildMediaDownloadFilename({
      channelTitle: '示例频道',
      messageDate: MESSAGE_DATE,
      messageId: 1582,
      mediaIndex: 1,
      extension: 'MP4',
    });

    expect(result).toBe('示例频道_2026-07-25_1582_02.mp4');
  });

  it('uses the original filename and infers its extension', () => {
    const result = buildMediaDownloadFilename({
      channelTitle: 'Photography',
      messageDate: MESSAGE_DATE,
      messageId: 9,
      originalFilename: 'camera/raw/My Photo.JPEG',
    }, {
      template: '{channel}_{originalName}_{time}.{ext}',
    });

    expect(result).toBe('Photography_My_Photo_09-07-03.jpeg');
  });

  it('appends the extension when the template omits the ext token', () => {
    const result = buildMediaDownloadFilename({
      messageDate: MESSAGE_DATE,
      messageId: 42,
      extension: '.webp',
    }, {
      template: 'telegram-{messageId}',
    });

    expect(result).toBe('telegram-42.webp');
  });

  it('removes unknown tokens without exposing raw placeholders', () => {
    const result = buildMediaDownloadFilename({
      channelTitle: 'Channel',
      messageDate: MESSAGE_DATE,
      messageId: 42,
      extension: 'jpg',
    }, {
      template: '{channel}_{unknown}_{messageId}.{ext}',
    });

    expect(result).toBe('Channel_42.jpg');
  });

  it('uses a fallback when the rendered template has no filename content', () => {
    const result = buildMediaDownloadFilename({
      messageDate: MESSAGE_DATE,
      messageId: 42,
      extension: 'jpg',
    }, {
      template: '{channel}.{ext}',
      fallbackBaseName: 'downloaded-media',
    });

    expect(result).toBe('downloaded-media.jpg');
  });

  it('preserves the extension while truncating long filenames', () => {
    const result = buildMediaDownloadFilename({
      channelTitle: 'A'.repeat(80),
      messageDate: MESSAGE_DATE,
      messageId: 42,
      extension: 'mp4',
    }, {
      template: '{channel}.{ext}',
      maxLength: 40,
    });

    expect(result).toHaveLength(40);
    expect(result.endsWith('.mp4')).toBe(true);
  });

  it('uses the documented template by default', () => {
    expect(DEFAULT_MEDIA_FILENAME_TEMPLATE).toBe('{channel}_{date}_{messageId}_{mediaIndex}.{ext}');
  });
});

describe('sanitizeMediaFilename', () => {
  it('removes path separators and Windows-invalid characters', () => {
    expect(sanitizeMediaFilename('Channel/A:B* C?.jpg')).toBe('Channel_A_B_C_.jpg');
  });

  it('protects Windows reserved filenames', () => {
    expect(sanitizeMediaFilename('CON.mp4')).toBe('_CON.mp4');
  });

  it('removes trailing dots and spaces', () => {
    expect(sanitizeMediaFilename('photo...   ')).toBe('photo');
  });
});

describe('validateMediaFilenameTemplate', () => {
  it('accepts a template containing supported tokens', () => {
    expect(validateMediaFilenameTemplate('{channel}_{date}_{messageId}.{ext}')).toEqual({
      isValid: true,
      unknownTokens: [],
      hasFilenameContent: true,
    });
  });

  it('reports unique unknown tokens', () => {
    expect(validateMediaFilenameTemplate('{channel}_{foo}_{foo}_{bar}.{ext}')).toEqual({
      isValid: false,
      unknownTokens: ['foo', 'bar'],
      hasFilenameContent: true,
    });
  });

  it('rejects a separator-only template', () => {
    expect(validateMediaFilenameTemplate('___...')).toEqual({
      isValid: false,
      unknownTokens: [],
      hasFilenameContent: false,
    });
  });
});
