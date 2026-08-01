import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WEB_K_VERSION } from '../src/web-k/version.js';
import { WEB_K_MATCH, createWebKUserscriptMetadata } from './web-k-userscript-metadata.js';

const BUILD_DIR = dirname(fileURLToPath(import.meta.url));
const TAMPERMONKEY_DIR = resolve(BUILD_DIR, '..');
const SOURCE_DIR = resolve(TAMPERMONKEY_DIR, 'src/web-k');
const OUTPUT_FILE_NAME = 'telegram-media-continuity-web-k.user.js';
const OUTPUT_PATH = resolve(TAMPERMONKEY_DIR, OUTPUT_FILE_NAME);
const LEGACY_MAIN_PATH = resolve(SOURCE_DIR, 'legacy-main.js');
const GENERATED_NOTICE = '// 此文件由构建生成，请勿直接手工修改。';
const REQUIRED_MODULE_PATHS = Object.freeze([
  'version.js',
  'app.js',
  'entry.js',
  'core/runtime.js',
  'core/lifecycle.js',
  'core/cleanup.js',
  'core/settings.js',
  'core/logger.js',
  'platform/dom.js',
  'platform/media-viewer.js',
  'platform/message-list.js',
  'platform/navigation.js',
  'features/continuous-browsing/viewer-session.js',
  'features/continuous-browsing/index.js',
  'features/close-position/target-tracker.js',
  'features/close-position/message-locator.js',
  'features/close-position/index.js',
  'features/control-panel/control-panel.js',
  'features/control-panel/index.js',
  'features/debug/debug-api.js',
  'features/debug/probes.js',
  'features/debug/index.js',
]);
const CORE_FORBIDDEN_TOKENS = Object.freeze([
  '.media-viewer-',
  'data-mid',
  'data-peer-id',
  'album-item',
  'bubbles-scrollable',
]);
const FEATURE_FORBIDDEN_SELECTORS = Object.freeze([
  '.media-viewer-whole',
  '.media-viewer-movers',
  '.media-viewer-switcher-left',
  '.media-viewer-switcher-right',
  '.scrollable.scrollable-y.bubbles-scrollable',
  '[data-mid][data-peer-id]',
]);

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    return false;
  }
}

async function readRequiredModules() {
  const entries = await Promise.all(REQUIRED_MODULE_PATHS.map(async (modulePath) => {
    const content = await readFile(resolve(SOURCE_DIR, modulePath), 'utf8');
    return [modulePath, content];
  }));
  return new Map(entries);
}

function verifyModuleBoundaries(modules) {
  for (const [modulePath, content] of modules) {
    if (modulePath.startsWith('core/')) {
      for (const token of CORE_FORBIDDEN_TOKENS) {
        assertCondition(!content.includes(token), `核心模块包含 Telegram DOM 标记：${modulePath} -> ${token}`);
      }
    }
    if (modulePath.startsWith('features/')) {
      for (const selector of FEATURE_FORBIDDEN_SELECTORS) {
        assertCondition(!content.includes(selector), `功能模块仍直接包含 Telegram 平台选择器：${modulePath} -> ${selector}`);
      }
    }
  }

  const settings = modules.get('core/settings.js');
  assertCondition(settings.includes("const STORAGE_KEY = 'tt.mediaContinuity.v1';"), '设置模块未保留原 storage key');
  assertCondition(settings.includes("browseDirection: 'forward'"), '设置模块缺少默认正向浏览方向');
  assertCondition(
    settings.includes('BROWSE_DIRECTIONS.includes(source.browseDirection)'),
    '设置模块未校验正向和反向浏览方向',
  );

  const mediaViewer = modules.get('platform/media-viewer.js');
  assertCondition(mediaViewer.includes("document.querySelector('.media-viewer-whole')"), '媒体查看器选择器未集中到平台层');
  assertCondition(mediaViewer.includes("viewer.querySelector('.media-viewer-movers')"), '媒体 root 选择器未集中到平台层');

  const navigation = modules.get('platform/navigation.js');
  assertCondition(navigation.includes("'.media-viewer-switcher-left'"), '上一项选择器未集中到导航平台层');
  assertCondition(navigation.includes("'.media-viewer-switcher-right'"), '下一项选择器未集中到导航平台层');

  const messageList = modules.get('platform/message-list.js');
  assertCondition(messageList.includes("'.scrollable.scrollable-y.bubbles-scrollable'"), '聊天滚动容器选择器未集中到消息列表平台层');
  assertCondition(messageList.includes("'[data-mid][data-peer-id]'"), '消息身份选择器未集中到消息列表平台层');

  const controlPanel = modules.get('features/control-panel/control-panel.js');
  assertCondition(!controlPanel.includes('../../platform/'), '控制面板不得依赖 platform 模块');
  assertCondition(!controlPanel.includes('document.querySelector('), '控制面板不得查询 Telegram 页面 DOM');
  assertCondition(controlPanel.includes('id="direction"'), '控制面板缺少自动浏览方向选择框');
  assertCondition(controlPanel.includes('onSetBrowseDirection'), '控制面板缺少方向回调');
  assertCondition(controlPanel.includes('onNavigate(-1, false)'), '控制面板上一项必须保持 -1');
  assertCondition(controlPanel.includes('onNavigate(1, false)'), '控制面板下一项必须保持 1');

  const viewerSession = modules.get('features/continuous-browsing/viewer-session.js');
  assertCondition(viewerSession.includes("from '../../platform/navigation.js'"), '连续浏览模块必须通过 platform/navigation.js 导航');
  assertCondition(viewerSession.includes('getAutomaticDirection()'), '连续浏览模块缺少统一自动方向方法');
  assertCondition(
    viewerSession.includes("return this.settings.browseDirection === 'backward' ? -1 : 1;"),
    '自动方向方法未保持 forward=1、backward=-1',
  );
  assertCondition(
    (viewerSession.match(/this\.navigate\((?:this\.getAutomaticDirection\(\)|automaticDirection), true\)/g) || []).length >= 2,
    '图片和视频自动切换未统一使用自动方向',
  );
  assertCondition(
    viewerSession.includes("if (event.key === 'ArrowRight') this.prepareNavigationTarget(1);"),
    'ArrowRight 必须继续保持方向 1',
  );
  assertCondition(
    viewerSession.includes("else if (event.key === 'ArrowLeft') this.prepareNavigationTarget(-1);"),
    'ArrowLeft 必须继续保持方向 -1',
  );
  assertCondition(
    viewerSession.includes('this.prepareNavigationTarget(direction);'),
    '导航前必须使用实际方向准备关闭定位目标',
  );

  const debugApi = modules.get('features/debug/debug-api.js');
  const publicApiNames = [
    'inspect',
    'inspectMessageMapping',
    'armCloseFlowProbe',
    'getCloseFlowProbe',
    'getLastLocationResult',
    'cancelCloseFlowProbe',
    'enableDebug',
    'testPrevious',
    'testNext',
    'rescan',
    'getSummary',
  ];
  for (const apiName of publicApiNames) {
    assertCondition(new RegExp(`\\b${apiName}\\b`).test(debugApi), `调试 API 缺少公开方法：${apiName}`);
  }
  assertCondition(debugApi.includes('version: WEB_K_VERSION'), '调试摘要版本未使用 version.js');

  const app = modules.get('app.js');
  for (const featurePath of [
    './features/continuous-browsing/index.js',
    './features/close-position/index.js',
    './features/control-panel/index.js',
    './features/debug/index.js',
  ]) {
    assertCondition(app.includes(featurePath), `应用装配层缺少功能模块依赖：${featurePath}`);
  }
  assertCondition(app.includes("from './core/lifecycle.js'"), '应用装配层未装配 lifecycle');

  const entry = modules.get('entry.js');
  assertCondition(entry.includes("from './app.js'"), 'entry.js 未从 app.js 启动');
  assertCondition(entry.includes('createApp().start();'), 'entry.js 未直接启动 createApp()');
  assertCondition(!entry.includes('./features/') && !entry.includes('./platform/') && !entry.includes('./core/'), 'entry.js 不得直接装配具体模块');
}

async function verifyGeneratedOutput() {
  const [generated, topLevelEntries, modules, hasLegacyMain] = await Promise.all([
    readFile(OUTPUT_PATH, 'utf8'),
    readdir(TAMPERMONKEY_DIR, { withFileTypes: true }),
    readRequiredModules(),
    pathExists(LEGACY_MAIN_PATH),
  ]);

  assertCondition(!hasLegacyMain, 'legacy-main.js 必须在 M3 删除');

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
  assertCondition(generated.includes('browseDirection'), '生成文件缺少浏览方向设置');

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

  verifyModuleBoundaries(modules);

  console.log([
    '[check:tampermonkey:web-k] 通过',
    `version=${WEB_K_VERSION}`,
    `match=${WEB_K_MATCH}`,
    `modules=${modules.size}`,
    'legacy=removed',
    `output=${OUTPUT_FILE_NAME}`,
  ].join('\n'));
}

verifyGeneratedOutput().catch((error) => {
  console.error(`[check:tampermonkey:web-k] 失败：${error.message}`);
  process.exitCode = 1;
});
