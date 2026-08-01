import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEB_K_VERSION } from '../src/web-k/version.js';
import { WEB_K_MATCH, createWebKUserscriptMetadata } from './web-k-userscript-metadata.js';

const BUILD_DIR = dirname(fileURLToPath(import.meta.url));
const TAMPERMONKEY_DIR = resolve(BUILD_DIR, '..');
const OUTPUT_FILE_NAME = 'telegram-media-continuity-web-k.user.js';
const OUTPUT_PATH = resolve(TAMPERMONKEY_DIR, OUTPUT_FILE_NAME);
const LEGACY_MAIN_PATH = resolve(TAMPERMONKEY_DIR, 'src/web-k/legacy-main.js');
const EXPECTED_LEGACY_BLOB_SHA = 'bff54d20036894a2e4a17655856a6325f66a6748';
const GENERATED_NOTICE = '// 此文件由构建生成，请勿直接手工修改。';

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function createGitBlobSha(content) {
  const body = Buffer.from(content);
  return createHash('sha1')
    .update(`blob ${body.length}\0`)
    .update(body)
    .digest('hex');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function verifyGeneratedOutput() {
  const [generated, legacyMain, topLevelEntries] = await Promise.all([
    readFile(OUTPUT_PATH, 'utf8'),
    readFile(LEGACY_MAIN_PATH, 'utf8'),
    readdir(TAMPERMONKEY_DIR, { withFileTypes: true }),
  ]);

  const expectedMetadata = createWebKUserscriptMetadata();
  const metadataEndIndex = generated.indexOf('// ==/UserScript==');
  assertCondition(generated.startsWith(expectedMetadata), '生成文件顶部 metadata 不符合单一来源');
  assertCondition(metadataEndIndex >= 0, '生成文件缺少 metadata 结束标记');
  assertCondition(
    generated.slice(metadataEndIndex + '// ==/UserScript=='.length).trimStart().startsWith(GENERATED_NOTICE),
    '生成文件缺少禁止手工修改说明',
  );
  assertCondition(
    (generated.match(/\/\/ ==UserScript==/g) || []).length === 1,
    '生成文件包含重复 userscript metadata',
  );

  const metadataBlock = generated.slice(0, metadataEndIndex + '// ==/UserScript=='.length);
  const matchLines = metadataBlock.match(/^\/\/ @match\s+.+$/gm) || [];
  assertCondition(matchLines.length === 1, `metadata @match 数量异常：${matchLines.length}`);
  assertCondition(matchLines[0] === `// @match        ${WEB_K_MATCH}`, 'metadata 未唯一匹配 Telegram Web K');
  assertCondition(!metadataBlock.includes('web.telegram.org/a/'), 'metadata 禁止包含 Telegram Web A');
  assertCondition(metadataBlock.includes('// @grant        none'), 'metadata 必须保持 @grant none');

  const metadataVersion = metadataBlock.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
  assertCondition(metadataVersion === WEB_K_VERSION, 'metadata 版本与版本模块不一致');
  const escapedVersion = escapeRegExp(WEB_K_VERSION);
  assertCondition(
    new RegExp(`(?:const|let|var)\\s+WEB_K_VERSION\\s*=\\s*['"]${escapedVersion}['"]`).test(generated),
    '生成文件缺少运行时版本常量',
  );
  assertCondition(/version:\s*WEB_K_VERSION\b/.test(generated), '调试 API 未使用运行时版本常量');

  assertCondition(!/\bimport\s*\(/.test(generated), '生成文件禁止运行时动态 import');
  assertCondition(!/^\s*(?:import|export)\s/m.test(generated), '生成文件仍包含 ES Module 语句');
  assertCondition(!/sourceMappingURL/i.test(generated), '生成文件禁止包含 sourcemap 引用');
  assertCondition(
    /\(\(\)\s*=>\s*\{|\(function\s*\(\)\s*\{/.test(generated),
    '生成文件未检测到 IIFE 包装',
  );

  const unexpectedOutputs = topLevelEntries
    .filter((entry) => entry.isFile()
      && entry.name.startsWith('telegram-media-continuity-web-k')
      && entry.name !== OUTPUT_FILE_NAME)
    .map((entry) => entry.name);
  assertCondition(
    unexpectedOutputs.length === 0,
    `检测到额外 Web K 构建产物：${unexpectedOutputs.join(', ')}`,
  );

  const legacyBlobSha = createGitBlobSha(legacyMain);
  assertCondition(
    legacyBlobSha === EXPECTED_LEGACY_BLOB_SHA,
    `legacy-main.js 已偏离稳定脚本 Blob：${legacyBlobSha}`,
  );

  console.log([
    '[check:tampermonkey:web-k] 通过',
    `version=${WEB_K_VERSION}`,
    `match=${WEB_K_MATCH}`,
    `legacyBlob=${legacyBlobSha}`,
    `output=${OUTPUT_FILE_NAME}`,
  ].join('\n'));
}

verifyGeneratedOutput().catch((error) => {
  console.error(`[check:tampermonkey:web-k] 失败：${error.message}`);
  process.exitCode = 1;
});
