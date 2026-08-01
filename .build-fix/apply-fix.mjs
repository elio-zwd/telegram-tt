import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, before, after) {
  const source = await readFile(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${path} 预期精确匹配 1 次，实际 ${count} 次`);
  }
  await writeFile(path, source.replace(before, after));
}

const viewerPath = 'tampermonkey/src/web-k/features/continuous-browsing/viewer-session.js';
const verifierPath = 'tampermonkey/build/verify-web-k-userscript.mjs';
const documentPath = 'docs/tampermonkey-web-k-v1-completion.md';

await replaceOnce(
  viewerPath,
  "    this.isBufferingSlow = false;\n    this.onlineRecoveryPending",
  "    this.isBufferingSlow = false;\n    this.bufferingRecovered = false;\n    this.onlineRecoveryPending",
);

await replaceOnce(
  viewerPath,
  "  PAUSE_REASONS.MEDIA_CONFLICT,\n  PAUSE_REASONS.FILTER,\n  PAUSE_REASONS.HOVER,",
  "  PAUSE_REASONS.MEDIA_CONFLICT,\n  PAUSE_REASONS.HOVER,",
);

await replaceOnce(
  viewerPath,
  "      paused: MANUAL_PAUSE_REASONS.some((reason) => this.hasPauseReason(reason)),",
  "      paused: this.hasManualPause(),",
);

await replaceOnce(
  viewerPath,
  "  hasAutomationPause() {\n    return this.pauseReasons.size > 0;\n  }",
  "  hasAutomationPause() {\n    return this.pauseReasons.size > 0;\n  }\n\n  hasManualPause() {\n    return MANUAL_PAUSE_REASONS.some((reason) => this.hasPauseReason(reason))\n      || (this.isBufferingSlow && this.hasPauseReason(PAUSE_REASONS.BUFFERING));\n  }",
);

await replaceOnce(
  viewerPath,
  "    this.isBufferingSlow = false;\n    this.bufferingTimer = clearTimeoutId(this.bufferingTimer);",
  "    this.isBufferingSlow = false;\n    this.bufferingRecovered = false;\n    this.bufferingTimer = clearTimeoutId(this.bufferingTimer);",
);

await replaceOnce(
  viewerPath,
  "        this.bufferingTimer = clearTimeoutId(this.bufferingTimer);\n        this.isBufferingSlow = false;\n        this.pauseReasons.delete(PAUSE_REASONS.BUFFERING);",
  "        this.bufferingTimer = clearTimeoutId(this.bufferingTimer);\n        this.bufferingRecovered = true;\n        if (!this.isBufferingSlow) {\n          this.pauseReasons.delete(PAUSE_REASONS.BUFFERING);\n        }",
);

await replaceOnce(
  viewerPath,
  "    this.isBufferingSlow = false;\n    this.addPauseReason(PAUSE_REASONS.BUFFERING);",
  "    this.isBufferingSlow = false;\n    this.bufferingRecovered = false;\n    this.addPauseReason(PAUSE_REASONS.BUFFERING);",
);

await replaceOnce(
  viewerPath,
  "    if (MANUAL_PAUSE_REASONS.some((reason) => this.hasPauseReason(reason))) {",
  "    if (this.hasManualPause()) {",
);

await replaceOnce(
  viewerPath,
  "  resumeFromManualPause() {\n    this.pauseReasons.delete(PAUSE_REASONS.USER);\n    if (this.hasPauseReason(PAUSE_REASONS.FILTER)) this.takeOverFilterSequence();\n",
  "  resumeFromManualPause() {\n    this.pauseReasons.delete(PAUSE_REASONS.USER);\n    if (this.hasPauseReason(PAUSE_REASONS.FILTER)) this.takeOverFilterSequence();\n\n    if (this.isBufferingSlow && this.hasPauseReason(PAUSE_REASONS.BUFFERING)) {\n      if (!this.bufferingRecovered) {\n        this.panel.render(this.viewState());\n        this.panel.setStatus('当前媒体仍在缓冲，请稍后重试');\n        return;\n      }\n      this.isBufferingSlow = false;\n      this.bufferingRecovered = false;\n      this.pauseReasons.delete(PAUSE_REASONS.BUFFERING);\n    }\n",
);

await replaceOnce(
  verifierPath,
  "  assertIncludes(viewerSession, 'this.pauseReasons.delete(reason)', '暂停恢复必须只清除对应原因');\n",
  "  assertIncludes(viewerSession, 'this.pauseReasons.delete(reason)', '暂停恢复必须只清除对应原因');\n  const mediaScopedPauseReasons = viewerSession.match(/const MEDIA_SCOPED_PAUSE_REASONS = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);/)?.[1] || '';\n  assertExcludes(mediaScopedPauseReasons, 'PAUSE_REASONS.FILTER', '筛选暂停不得因媒体节点替换自动解除');\n",
);

await replaceOnce(
  verifierPath,
  "  assertIncludes(viewerSession, '媒体加载较慢，连续浏览已暂停', '缺少缓冲慢提示');\n",
  "  assertIncludes(viewerSession, '媒体加载较慢，连续浏览已暂停', '缺少缓冲慢提示');\n  assertIncludes(viewerSession, 'this.bufferingRecovered = true;', '缓冲恢复必须记录可继续证据');\n  assertIncludes(viewerSession, 'this.isBufferingSlow && this.hasPauseReason(PAUSE_REASONS.BUFFERING)', '慢缓冲必须进入可手动继续的暂停状态');\n  assertIncludes(viewerSession, '当前媒体仍在缓冲，请稍后重试', '慢缓冲未恢复时不得错误继续');\n",
);

await replaceOnce(
  documentPath,
  "- 持续约 15 秒后提示“媒体加载较慢，连续浏览已暂停”；\n- 后续 `canplay`／`playing` 会解除缓冲原因，但不会解除用户暂停。",
  "- 持续约 15 秒后提示“媒体加载较慢，连续浏览已暂停”，并保持暂停；\n- 15 秒内恢复的 `canplay`／`playing` 可自动解除缓冲原因；\n- 超过 15 秒后即使媒体恢复，也等待用户按“继续”，避免静默恢复和意外跳过；\n- 用户按“继续”时若仍没有恢复证据，则提示“当前媒体仍在缓冲，请稍后重试”；\n- 缓冲恢复绝不会解除用户主动暂停或其他暂停原因。",
);

console.log('状态边界修正已应用。');
