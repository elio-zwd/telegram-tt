export const DEFAULT_MEDIA_FILENAME_TEMPLATE = '{channel}_{date}_{messageId}_{mediaIndex}.{ext}';

export const MEDIA_FILENAME_TEMPLATE_TOKENS = [
  'channel',
  'date',
  'time',
  'messageId',
  'mediaIndex',
  'originalName',
  'ext',
] as const;

type MediaFilenameTemplateToken = typeof MEDIA_FILENAME_TEMPLATE_TOKENS[number];

export type MediaDownloadFilenameContext = {
  channelTitle?: string;
  messageDate: Date;
  messageId: number;
  /** Zero-based index inside an album or paid-media collection */
  mediaIndex?: number;
  originalFilename?: string;
  extension?: string;
};

export type MediaDownloadFilenameOptions = {
  template?: string;
  fallbackBaseName?: string;
  maxLength?: number;
};

export type MediaFilenameTemplateValidation = {
  isValid: boolean;
  unknownTokens: string[];
  hasFilenameContent: boolean;
};

const MEDIA_FILENAME_TEMPLATE_STORAGE_KEY = 'tt-media-filename-template-v1';
const TOKEN_REGEXP = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;
const WINDOWS_RESERVED_NAME_REGEXP = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const INVALID_FILENAME_CHARACTERS_REGEXP = /[<>:"/\\|?*\u0000-\u001F]/g;
const TRAILING_DOTS_AND_SPACES_REGEXP = /[. ]+$/g;
const REPEATED_SEPARATOR_REGEXP = /[_\s-]{2,}/g;
const DEFAULT_MAX_FILENAME_LENGTH = 180;
const DEFAULT_FALLBACK_BASE_NAME = 'telegram-media';

export function loadMediaFilenameTemplate() {
  try {
    return localStorage.getItem(MEDIA_FILENAME_TEMPLATE_STORAGE_KEY)?.trim()
      || DEFAULT_MEDIA_FILENAME_TEMPLATE;
  } catch {
    return DEFAULT_MEDIA_FILENAME_TEMPLATE;
  }
}

export function storeMediaFilenameTemplate(template: string) {
  const normalizedTemplate = template.trim() || DEFAULT_MEDIA_FILENAME_TEMPLATE;
  if (!validateMediaFilenameTemplate(normalizedTemplate).isValid) return false;

  try {
    localStorage.setItem(MEDIA_FILENAME_TEMPLATE_STORAGE_KEY, normalizedTemplate);
    return true;
  } catch {
    return false;
  }
}

export function validateMediaFilenameTemplate(template: string): MediaFilenameTemplateValidation {
  const unknownTokens = Array.from(template.matchAll(TOKEN_REGEXP))
    .map((match) => match[1])
    .filter((token, index, tokens) => (
      !MEDIA_FILENAME_TEMPLATE_TOKENS.includes(token as MediaFilenameTemplateToken)
      && tokens.indexOf(token) === index
    ));
  const textWithoutTokens = template.replace(TOKEN_REGEXP, '').replace(/[._\s-]/g, '');
  const knownTokenCount = Array.from(template.matchAll(TOKEN_REGEXP))
    .filter((match) => MEDIA_FILENAME_TEMPLATE_TOKENS.includes(match[1] as MediaFilenameTemplateToken))
    .length;
  const hasFilenameContent = Boolean(textWithoutTokens || knownTokenCount);

  return {
    isValid: unknownTokens.length === 0 && hasFilenameContent,
    unknownTokens,
    hasFilenameContent,
  };
}

export function buildMediaDownloadFilename(
  context: MediaDownloadFilenameContext,
  options: MediaDownloadFilenameOptions = {},
) {
  const template = options.template?.trim() || DEFAULT_MEDIA_FILENAME_TEMPLATE;
  const extension = normalizeExtension(getFilenameExtension(context.originalFilename) || context.extension);
  const originalName = getFilenameBaseName(context.originalFilename);
  const replacements: Record<MediaFilenameTemplateToken, string> = {
    channel: context.channelTitle || '',
    date: formatDate(context.messageDate),
    time: formatTime(context.messageDate),
    messageId: String(context.messageId),
    mediaIndex: String((context.mediaIndex ?? 0) + 1).padStart(2, '0'),
    originalName,
    ext: extension,
  };

  let filename = template.replace(TOKEN_REGEXP, (_placeholder, token: string) => {
    return MEDIA_FILENAME_TEMPLATE_TOKENS.includes(token as MediaFilenameTemplateToken)
      ? replacements[token as MediaFilenameTemplateToken]
      : '';
  });

  if (extension && !template.includes('{ext}')) {
    filename = `${filename}.${extension}`;
  }

  filename = sanitizeMediaFilename(filename);

  if (!filename || filename === `.${extension}`) {
    const fallbackBaseName = sanitizeMediaFilename(options.fallbackBaseName || DEFAULT_FALLBACK_BASE_NAME)
      || DEFAULT_FALLBACK_BASE_NAME;
    filename = extension ? `${fallbackBaseName}.${extension}` : fallbackBaseName;
  }

  return truncateFilename(filename, options.maxLength || DEFAULT_MAX_FILENAME_LENGTH);
}

function sanitizeMediaFilename(value: string) {
  let sanitized = value
    .replace(INVALID_FILENAME_CHARACTERS_REGEXP, '_')
    .replace(REPEATED_SEPARATOR_REGEXP, '_')
    .replace(TRAILING_DOTS_AND_SPACES_REGEXP, '')
    .trim();

  if (WINDOWS_RESERVED_NAME_REGEXP.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  return sanitized;
}

function formatDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatTime(date: Date) {
  return [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('-');
}

function getFilenameExtension(filename?: string) {
  if (!filename) return '';

  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex === filename.length - 1) return '';

  return filename.slice(lastDotIndex + 1);
}

function getFilenameBaseName(filename?: string) {
  if (!filename) return '';

  const normalizedFilename = filename.replace(/\\/g, '/').split('/').pop() || '';
  const lastDotIndex = normalizedFilename.lastIndexOf('.');

  return lastDotIndex > 0 ? normalizedFilename.slice(0, lastDotIndex) : normalizedFilename;
}

function normalizeExtension(extension?: string) {
  return (extension || '')
    .replace(/^\.+/, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase();
}

function truncateFilename(filename: string, requestedMaxLength: number) {
  const maxLength = Math.max(32, requestedMaxLength);
  if (filename.length <= maxLength) return filename;

  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex <= 0) return filename.slice(0, maxLength).replace(TRAILING_DOTS_AND_SPACES_REGEXP, '');

  const extension = filename.slice(lastDotIndex);
  const baseName = filename.slice(0, lastDotIndex);
  const availableBaseNameLength = Math.max(1, maxLength - extension.length);

  return `${baseName.slice(0, availableBaseNameLength)}${extension}`;
}
