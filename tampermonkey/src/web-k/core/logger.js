import { runtime } from './runtime.js';

export function debugLog(message, data) {
  if (!runtime.debugEnabled) return;
  if (data === undefined) console.debug(`[Telegram Media Continuity] ${message}`);
  else console.debug(`[Telegram Media Continuity] ${message}`, data);
}
