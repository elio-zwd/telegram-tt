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
  "    this.currentVideoHasPlayed = media instanceof HTMLVideoElement\n      && !media.paused\n      && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;\n    this.blockCurrentTargetConfirmation = false;",
  "    this.currentVideoHasPlayed = media instanceof HTMLVideoElement\n      && !media.paused\n      && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;\n    if (!this.hasPauseReason(PAUSE_REASONS.FILTER)) {\n      this.blockCurrentTargetConfirmation = false;\n    }",
);

await replaceOnce(
  verifierPath,
  "  assertExcludes(mediaScopedPauseReasons, 'PAUSE_REASONS.FILTER', '筛选暂停不得因媒体节点替换自动解除');\n",
  "  assertExcludes(mediaScopedPauseReasons, 'PAUSE_REASONS.FILTER', '筛选暂停不得因媒体节点替换自动解除');\n  assertIncludes(viewerSession, 'if (!this.hasPauseReason(PAUSE_REASONS.FILTER))', '筛选暂停期间必须继续屏蔽关闭定位确认');\n",
);

await replaceOnce(
  documentPath,
  "- 失败媒体不会覆盖最后成功显示的关闭定位目标；\n",
  "- 失败媒体不会覆盖最后成功显示的关闭定位目标；\n- 筛选超时暂停即使遇到媒体节点替换，也继续保持暂停与关闭定位屏蔽，直到用户手动接管；\n",
);

console.log('筛选暂停期间的关闭定位屏蔽修正已应用。');
