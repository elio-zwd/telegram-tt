import { WEB_K_VERSION } from '../src/web-k/version.js';

export const WEB_K_MATCH = 'https://web.telegram.org/k/*';

export function createWebKUserscriptMetadata() {
  return [
    '// ==UserScript==',
    '// @name         Telegram Web K 媒体续播（兼容验证版）',
    '// @namespace    telegram-air/media-continuity',
    `// @version      ${WEB_K_VERSION}`,
    '// @description  为 Telegram Web K 提供图片和视频连续浏览能力',
    `// @match        ${WEB_K_MATCH}`,
    '// @run-at       document-idle',
    '// @grant        none',
    '// ==/UserScript==',
  ].join('\n');
}
