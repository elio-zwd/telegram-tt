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
  'features/shortcuts/keyboard-shortcuts.js',
  'features/shortcuts/index.js',
  'features/media-stream-continuation/controller.js',
  'features/media-stream-continuation/continuation-viewer-session.js',
  'features/media-stream-continuation/index.js',
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

function assertIncludes(content, token, message) {
  assertCondition(content.includes(token), message);
}

function assertExcludes(content, token, message) {
  assertCondition(!content.includes(token), message);
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
        assertExcludes(content, token, `核心模块包含 Telegram DOM 标记：${modulePath} -> ${token}`);
      }
    }
    if (modulePath.startsWith('features/')) {
      for (const selector of FEATURE_FORBIDDEN_SELECTORS) {
        assertExcludes(content, selector, `功能模块仍直接包含 Telegram 平台选择器：${modulePath} -> ${selector}`);
      }
    }
  }

  verifySettings(modules.get('core/settings.js'));
  verifyPlatform(modules);
  verifyControlPanel(modules.get('features/control-panel/control-panel.js'));
  verifyViewerSession(modules.get('features/continuous-browsing/viewer-session.js'));
  verifyShortcuts(modules);
  verifyComposition(modules);
  verifyContinuation(modules);
}

function verifySettings(settings) {
  assertIncludes(settings, "const STORAGE_KEY = 'tt.mediaContinuity.v1';", '设置模块未保留唯一 storage key');
  assertCondition((settings.match(/tt\.mediaContinuity\.v1/g) || []).length === 1, '设置模块出现第二套 storage key');
  assertIncludes(settings, "browseDirection: 'forward'", '设置模块缺少默认正向浏览方向');
  assertIncludes(settings, 'BROWSE_DIRECTIONS.includes(source.browseDirection)', '设置模块未校验浏览方向');
  assertIncludes(settings, "mediaFilter: 'all'", '设置模块缺少默认全部媒体筛选');
  assertIncludes(settings, 'MEDIA_FILTERS.includes(source.mediaFilter)', '设置模块未校验媒体筛选值');
  assertCondition(/PHOTO_DURATION_MIN_MS\s*=\s*1000\b/.test(settings), '自定义时间最小值必须为 1 秒');
  assertCondition(/PHOTO_DURATION_MAX_MS\s*=\s*300000\b/.test(settings), '自定义时间最大值必须为 300 秒');
  assertCondition(/PHOTO_DURATION_STEP_MS\s*=\s*100\b/.test(settings), '自定义时间必须使用 100ms 精度');
  assertIncludes(settings, 'PHOTO_DURATION_INPUT_PATTERN = /^(\\d+)(?:\\.(\\d))?$/;', '自定义时间必须只接受普通十进制和一位小数');
  assertIncludes(settings, 'Number.isInteger(value)', '图片时间毫秒值必须为整数');
  assertIncludes(settings, 'value % PHOTO_DURATION_STEP_MS === 0', '图片时间必须限制为一位小数精度');
  assertIncludes(settings, 'isValidPhotoDurationMs(source.photoDurationMs)', '设置加载必须接受合法自定义时间');
  assertExcludes(settings, 'DURATIONS.includes(source.photoDurationMs)', '自定义时间不得回退到预设值');

  assertIncludes(settings, 'VIDEO_PLAYBACK_RATES = Object.freeze([0.5, 1, 1.25, 1.5, 2])', '视频倍速白名单不完整');
  assertIncludes(settings, 'videoMuted: false', '缺少默认视频静音设置');
  assertIncludes(settings, 'videoVolume: 1', '缺少默认视频音量设置');
  assertIncludes(settings, 'videoPlaybackRate: 1', '缺少默认视频倍速设置');
  assertIncludes(settings, 'Number.isFinite(value) && value >= 0 && value <= 1', '视频音量未限制在 0～1');
  assertIncludes(settings, 'Math.round(value * 100) / 100', '视频音量未规范为两位小数');
  assertIncludes(settings, 'VIDEO_PLAYBACK_RATES.includes(value)', '视频倍速未使用有限白名单');
  assertIncludes(settings, 'typeof source.videoMuted === \'boolean\'', '设置加载未校验静音值');
  assertIncludes(settings, 'isValidVideoVolume(source.videoVolume)', '设置加载未校验音量值');
  assertIncludes(settings, 'isValidVideoPlaybackRate(source.videoPlaybackRate)', '设置加载未校验倍速值');
  assertIncludes(settings, 'nextState.settings = validatedSettings', '设置保存未保留统一 settings 对象');
}

function verifyPlatform(modules) {
  const mediaViewer = modules.get('platform/media-viewer.js');
  assertIncludes(mediaViewer, "document.querySelector('.media-viewer-whole')", '媒体查看器选择器未集中到平台层');
  assertIncludes(mediaViewer, "viewer.querySelector('.media-viewer-movers')", '媒体 root 选择器未集中到平台层');
  assertIncludes(mediaViewer, 'export function getMediaType(media)', '平台层缺少媒体类型接口');
  assertIncludes(mediaViewer, "return 'images';", '平台层未把 img 归类为图片');
  assertIncludes(mediaViewer, "return 'videos';", '平台层未把 video 归类为视频');
  assertIncludes(mediaViewer, 'export function isLoopMedia(media)', '平台层缺少循环媒体接口');
  assertIncludes(
    mediaViewer,
    'return media instanceof HTMLVideoElement && media.loop === true;',
    '循环媒体必须只使用公开 video.loop 条件',
  );
  for (const forbidden of ['extension', 'fileName', 'webpack', 'indexedDB']) {
    assertExcludes(mediaViewer, forbidden, `循环媒体平台层不得依赖 ${forbidden}`);
  }

  const navigation = modules.get('platform/navigation.js');
  assertIncludes(navigation, "'.media-viewer-switcher-left'", '上一项选择器未集中到导航平台层');
  assertIncludes(navigation, "'.media-viewer-switcher-right'", '下一项选择器未集中到导航平台层');

  const messageList = modules.get('platform/message-list.js');
  assertIncludes(messageList, "'.scrollable.scrollable-y.bubbles-scrollable'", '聊天滚动容器选择器未集中到消息列表平台层');
  assertIncludes(messageList, "'[data-mid][data-peer-id]'", '消息身份选择器未集中到消息列表平台层');
}

function verifyControlPanel(controlPanel) {
  assertExcludes(controlPanel, '../../platform/', '控制面板不得依赖 platform 模块');
  assertExcludes(controlPanel, 'document.querySelector(', '控制面板不得查询 Telegram 页面 DOM');
  for (const [token, message] of [
    ['id="toggle"', '缺少连续浏览开关'],
    ['id="pause"', '缺少暂停按钮'],
    ['id="previous"', '缺少上一项按钮'],
    ['id="next"', '缺少下一项按钮'],
    ['id="direction"', '缺少浏览方向选择框'],
    ['id="filter"', '缺少媒体筛选框'],
    ['id="duration"', '缺少停留时间选择框'],
    ['id="custom-duration-input"', '缺少自定义时间输入框'],
    ['id="apply-duration"', '缺少自定义时间应用按钮'],
    ['id="video-muted"', '缺少视频静音按钮'],
    ['id="video-volume"', '缺少视频音量控件'],
    ['id="video-rate"', '缺少视频倍速控件'],
    ['id="status"', '缺少状态提示'],
    ['id="collapse"', '缺少收起按钮'],
    ['id="launcher"', '缺少展开按钮'],
  ]) assertIncludes(controlPanel, token, message);

  for (const callback of [
    'onSetBrowseDirection',
    'onSetMediaFilter',
    'onSetPhotoDuration',
    'onSetVideoMuted',
    'onSetVideoVolume',
    'onSetVideoPlaybackRate',
  ]) assertIncludes(controlPanel, callback, `控制面板缺少回调：${callback}`);

  assertIncludes(controlPanel, 'aria-label="自定义图片停留秒数"', '自定义时间输入框缺少可访问性标识');
  assertIncludes(controlPanel, 'aria-label="视频音量"', '音量控件缺少可访问性标识');
  assertIncludes(controlPanel, 'aria-label="视频播放倍速"', '倍速控件缺少可访问性标识');
  assertIncludes(controlPanel, "event.key !== 'Enter'", '自定义时间缺少 Enter 提交');
  assertIncludes(controlPanel, 'parsePhotoDurationSeconds(this.customDurationInput.value)', '自定义时间未使用统一解析函数');
  assertIncludes(controlPanel, 'durationMs === undefined', '非法自定义时间未被拒绝');
  assertIncludes(controlPanel, 'onNavigate(-1, false)', '上一项必须保持物理方向 -1');
  assertIncludes(controlPanel, 'onNavigate(1, false)', '下一项必须保持物理方向 1');
  assertIncludes(controlPanel, '@media (max-width: 560px)', '控制条缺少窄窗口换行规则');
  assertExcludes(controlPanel, '自动保存', '控制条不得新增自动保存入口');
  assertExcludes(controlPanel, '下载', '控制条不得新增下载入口');
}

function verifyViewerSession(viewerSession) {
  assertIncludes(viewerSession, "from '../../platform/navigation.js'", '连续浏览必须通过平台导航模块');
  assertIncludes(viewerSession, "return this.settings.browseDirection === 'backward' ? -1 : 1;", '自动方向映射错误');
  assertCondition(
    (viewerSession.match(/this\.navigate\((?:this\.getAutomaticDirection\(\)|automaticDirection), true\)/g) || []).length >= 2,
    '图片、循环媒体和普通视频未统一使用自动方向',
  );
  assertIncludes(viewerSession, "if (event.key === 'ArrowRight')", 'ArrowRight 跟踪缺失');
  assertIncludes(viewerSession, 'this.prepareNavigationTarget(1);', 'ArrowRight 必须准备方向 1');
  assertIncludes(viewerSession, "else if (event.key === 'ArrowLeft')", 'ArrowLeft 跟踪缺失');
  assertIncludes(viewerSession, 'this.prepareNavigationTarget(-1);', 'ArrowLeft 必须准备方向 -1');
  assertIncludes(viewerSession, 'this.prepareNavigationTarget(direction);', '导航前未准备关闭定位目标');

  assertIncludes(viewerSession, 'const FILTER_SEQUENCE_MAX_SKIPS = 50;', '媒体筛选缺少最大跳过次数');
  assertIncludes(viewerSession, 'const FILTER_SEQUENCE_TIMEOUT_MS = 15000;', '媒体筛选缺少总超时');
  assertIncludes(viewerSession, 'filterSequenceId', '媒体筛选缺少序列隔离');
  assertIncludes(viewerSession, 'blockCurrentTargetConfirmation', '筛选和失败未隔离关闭定位确认');
  assertIncludes(viewerSession, 'takeOverFilterSequence()', '手动操作缺少筛选接管入口');
  assertIncludes(viewerSession, "this.settings.mediaFilter === 'all'", '全部媒体模式未保持直接导航');

  const setPhotoDurationMethod = viewerSession.match(/setPhotoDuration\(duration\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assertIncludes(setPhotoDurationMethod, 'if (!isValidPhotoDurationMs(duration)) return false;', '会话未拒绝非法停留时间');
  assertIncludes(setPhotoDurationMethod, 'photoDurationMs: duration', '合法停留时间未使用统一设置保存');
  assertIncludes(setPhotoDurationMethod, 'this.currentMedia instanceof HTMLImageElement || isLoopMedia(this.currentMedia)', '图片和循环媒体修改时长后未重启');
  assertExcludes(setPhotoDurationMethod, 'takeOverFilterSequence', '修改停留时间不得接管筛选序列');

  assertIncludes(viewerSession, 'const PAUSE_REASONS = Object.freeze({', '会话缺少独立暂停原因集合');
  for (const reason of [
    "USER: 'user'",
    "PAGE: 'page'",
    "FULLSCREEN: 'fullscreen'",
    "PICTURE_IN_PICTURE: 'picture-in-picture'",
    "OFFLINE: 'offline'",
    "BUFFERING: 'buffering'",
    "USER_ACTION_REQUIRED: 'user-action-required'",
    "FAILURE: 'failure'",
    "NODE_INVALID: 'node-invalid'",
    "MEDIA_CONFLICT: 'media-conflict'",
    "FILTER: 'filter'",
  ]) assertIncludes(viewerSession, reason, `缺少暂停原因：${reason}`);
  assertIncludes(viewerSession, 'this.pauseReasons = new Set();', '暂停原因必须使用独立集合');
  assertIncludes(viewerSession, 'this.pauseReasons.delete(reason)', '暂停恢复必须只清除对应原因');
  const mediaScopedPauseReasons = viewerSession.match(/const MEDIA_SCOPED_PAUSE_REASONS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assertExcludes(mediaScopedPauseReasons, 'PAUSE_REASONS.FILTER', '筛选暂停不得因媒体节点替换自动解除');
  assertIncludes(viewerSession, 'if (!this.hasPauseReason(PAUSE_REASONS.FILTER))', '筛选暂停期间必须继续屏蔽关闭定位确认');

  assertIncludes(viewerSession, "document.addEventListener('fullscreenchange'", '缺少标准 fullscreenchange');
  assertIncludes(viewerSession, 'document.fullscreenElement', '缺少标准 fullscreenElement 判断');
  assertIncludes(viewerSession, "document.addEventListener('enterpictureinpicture'", '缺少标准 enterpictureinpicture');
  assertIncludes(viewerSession, "document.addEventListener('leavepictureinpicture'", '缺少标准 leavepictureinpicture');
  assertIncludes(viewerSession, 'document.pictureInPictureElement', '缺少标准 pictureInPictureElement 判断');
  assertExcludes(viewerSession, 'disablePictureInPicture = false', '不得移除 Telegram PiP 限制');
  assertIncludes(viewerSession, "window.addEventListener('offline'", '缺少 offline 监听');
  assertIncludes(viewerSession, "window.addEventListener('online'", '缺少 online 监听');
  assertIncludes(viewerSession, 'navigator.onLine === false', '网络恢复不得把 onLine 当作媒体可用证明');
  assertIncludes(viewerSession, "eventType !== 'canplay' && eventType !== 'playing'", '视频在线恢复必须等待 canplay 或 playing');

  assertIncludes(viewerSession, 'const BUFFERING_WARNING_MS = 15000;', '缓冲慢提示阈值必须约 15 秒');
  assertIncludes(viewerSession, "add(media, 'waiting'", '缺少 waiting 监听');
  assertIncludes(viewerSession, "add(media, 'stalled'", '缺少 stalled 监听');
  assertIncludes(viewerSession, '媒体加载较慢，连续浏览已暂停', '缺少缓冲慢提示');
  assertIncludes(viewerSession, 'this.bufferingRecovered = true;', '缓冲恢复必须记录可继续证据');
  assertIncludes(viewerSession, 'this.isBufferingSlow && this.hasPauseReason(PAUSE_REASONS.BUFFERING)', '慢缓冲必须进入可手动继续的暂停状态');
  assertIncludes(viewerSession, '当前媒体仍在缓冲，请稍后重试', '慢缓冲未恢复时不得错误继续');
  assertIncludes(viewerSession, "error.name === 'NotAllowedError'", '自动播放限制未区分 NotAllowedError');
  assertIncludes(viewerSession, '点击视频开始播放', '自动播放限制缺少用户操作提示');
  assertIncludes(viewerSession, 'media.error.code', '视频失败必须检查 error.code');
  assertIncludes(viewerSession, 'this.addPauseReason(PAUSE_REASONS.FAILURE', '确认失败必须暂停');
  assertIncludes(viewerSession, 'if (!automatic)', '失败与系统暂停不得阻止手动导航');

  assertIncludes(viewerSession, 'isLoopMedia(this.currentMedia)', '循环媒体未接入调度');
  assertIncludes(viewerSession, 'this.currentVideoHasPlayed', '循环媒体缺少首次 playing 证据');
  assertIncludes(viewerSession, "this.startTimedMediaCountdown('循环媒体'", '循环媒体未复用停留时间');
  assertIncludes(viewerSession, 'media.loop !== this.currentLoopState', '循环证据变化未暂停');
  assertIncludes(viewerSession, 'mediaSequenceId === this.mediaSequenceId', '旧媒体事件缺少序列隔离');
  assertIncludes(viewerSession, 'this.currentMedia === media', '旧媒体事件缺少节点身份隔离');
  assertIncludes(viewerSession, 'media.isConnected', '旧媒体事件缺少连接状态检查');
  assertIncludes(viewerSession, 'this.viewer.contains(media)', '媒体必须仍属于当前查看器');
  assertIncludes(viewerSession, 'if (!this.isCurrentMedia(media, mediaSequenceId) || this.hasAutomationPause()) return;', '旧 timer 或暂停状态不得自动导航');

  for (const preference of ['videoMuted', 'videoVolume', 'videoPlaybackRate']) {
    assertIncludes(viewerSession, preference, `会话缺少视频偏好：${preference}`);
  }
  assertIncludes(viewerSession, "add(media, 'volumechange'", '缺少 volumechange 同步');
  assertIncludes(viewerSession, "add(media, 'ratechange'", '缺少 ratechange 同步');
  assertIncludes(viewerSession, 'if (!(media instanceof HTMLVideoElement) || isLoopMedia(media)) return;', '循环媒体不得套用普通视频偏好');
  assertIncludes(viewerSession, 'if (!Object.keys(patch).length) return;', '视频偏好同步缺少反馈循环保护');

  for (const cleanup of [
    "document.removeEventListener('fullscreenchange'",
    "document.removeEventListener('enterpictureinpicture'",
    "document.removeEventListener('leavepictureinpicture'",
    "window.removeEventListener('online'",
    "window.removeEventListener('offline'",
    'this.bufferingTimer = clearTimeoutId(this.bufferingTimer)',
    'this.releaseMediaListeners()',
    'disconnectObserver(this.observer)',
  ]) assertIncludes(viewerSession, cleanup, `会话销毁缺少清理：${cleanup}`);

  assertIncludes(viewerSession, 'isEditableEventTarget(event)', '方向键监听必须避开输入控件');
  for (const forbidden of ['webpack', 'indexedDB', 'TelegramApi', 'Bot API']) {
    assertExcludes(viewerSession, forbidden, `连续浏览不得依赖 ${forbidden}`);
  }
}

function verifyShortcuts(modules) {
  const keyboardShortcuts = modules.get('features/shortcuts/keyboard-shortcuts.js');
  assertExcludes(keyboardShortcuts, '../../platform/', '快捷键模块不得依赖 platform');
  assertExcludes(keyboardShortcuts, 'document.querySelector(', '快捷键模块不得查询 Telegram DOM');
  for (const token of ['input', 'textarea', 'select', '[contenteditable]', '[role="textbox"]']) {
    assertIncludes(keyboardShortcuts, token, `快捷键缺少输入保护：${token}`);
  }
  assertIncludes(keyboardShortcuts, '[contenteditable]:not([contenteditable="false"])', '快捷键必须排除 contenteditable=false');
  for (const guard of [
    'event.defaultPrevented',
    'event.repeat',
    'event.isComposing',
    'event.ctrlKey',
    'event.altKey',
    'event.metaKey',
    '!viewer.isConnected',
    '!isViewerVisible()',
  ]) assertIncludes(keyboardShortcuts, guard, `快捷键缺少保护：${guard}`);
  assertIncludes(keyboardShortcuts, "event.code === 'Space'", '快捷键缺少 Space');
  assertIncludes(keyboardShortcuts, "event.code === 'KeyA'", '快捷键缺少 A');
  for (const comparison of [
    "event.code === 'ArrowLeft'",
    "event.code === 'ArrowRight'",
    "event.code === 'Escape'",
    "event.key === 'Escape'",
    "event.code === 'KeyD'",
  ]) assertExcludes(keyboardShortcuts, comparison, `快捷键不得处理：${comparison}`);
  assertCondition((keyboardShortcuts.match(/event\.preventDefault\(\);/g) || []).length === 1, '快捷键只能统一阻止一次默认行为');
  assertCondition((keyboardShortcuts.match(/event\.stopPropagation\(\);/g) || []).length === 1, '快捷键只能统一停止一次传播');
  assertIncludes(keyboardShortcuts, "window.removeEventListener('keydown', handleKeyDown, true);", '快捷键销毁缺少 listener 清理');

  const shortcuts = modules.get('features/shortcuts/index.js');
  assertIncludes(shortcuts, 'session.togglePause()', '快捷键会话未调用 togglePause');
  assertIncludes(shortcuts, 'session.toggleContinuous()', '快捷键会话未调用 toggleContinuous');
  assertIncludes(shortcuts, 'requestRefresh: () => session.requestRefresh()', '快捷键会话未转发 requestRefresh');
  assertIncludes(shortcuts, 'createCloseSnapshot: () => session.createCloseSnapshot()', '快捷键会话未转发关闭快照');
  assertIncludes(shortcuts, 'getLastConfirmedMediaTarget: () => session.getLastConfirmedMediaTarget()', '快捷键会话未转发最后目标');
  assertIncludes(shortcuts, 'shortcuts.destroy();', '快捷键会话销毁不完整');
  assertIncludes(shortcuts, 'session.destroy();', 'ViewerSession 销毁不完整');
}

function verifyComposition(modules) {
  const debugApi = modules.get('features/debug/debug-api.js');
  for (const apiName of [
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
  ]) assertCondition(new RegExp(`\\b${apiName}\\b`).test(debugApi), `调试 API 缺少：${apiName}`);
  assertIncludes(debugApi, 'version: WEB_K_VERSION', '调试摘要版本未使用 version.js');

  const app = modules.get('app.js');
  for (const featurePath of [
    './features/continuous-browsing/index.js',
    './features/close-position/index.js',
    './features/control-panel/index.js',
    './features/debug/index.js',
    './features/shortcuts/index.js',
  ]) assertIncludes(app, featurePath, `app.js 缺少功能模块：${featurePath}`);
  assertIncludes(app, "from './core/lifecycle.js'", 'app.js 未装配 lifecycle');
  assertIncludes(app, 'createShortcutSession(viewerSession', 'app.js 未组合快捷键会话');

  const entry = modules.get('entry.js');
  assertIncludes(entry, "from './app.js'", 'entry.js 未从 app.js 启动');
  assertIncludes(entry, 'createApp().start();', 'entry.js 未直接启动应用');
  assertCondition(!entry.includes('./features/') && !entry.includes('./platform/') && !entry.includes('./core/'), 'entry.js 不得直接装配具体模块');
}

function verifyContinuation(modules) {
  const controller = modules.get('features/media-stream-continuation/controller.js');
  const session = modules.get('features/media-stream-continuation/continuation-viewer-session.js');
  const index = modules.get('features/media-stream-continuation/index.js');
  const lifecycle = modules.get('core/lifecycle.js');
  const app = modules.get('app.js');

  assertCondition(/CONTINUATION_TIMEOUT_MS\s*=\s*20000\b/.test(controller), 'continuation 总超时必须为 20000ms');
  assertCondition(/MAX_SCROLL_ATTEMPTS\s*=\s*8\b/.test(controller), '最大滚动尝试必须为 8 次');
  assertCondition(/FILTER_SEQUENCE_TIMEOUT_MS\s*=\s*15000\b/.test(controller), '筛选总时限必须为 15000ms');

  for (const forbidden of FEATURE_FORBIDDEN_SELECTORS) {
    assertExcludes(controller, forbidden, `continuation controller 包含平台选择器：${forbidden}`);
    assertExcludes(session, forbidden, `continuation-viewer-session 包含平台选择器：${forbidden}`);
    assertExcludes(index, forbidden, `continuation index 包含平台选择器：${forbidden}`);
  }

  assertIncludes(
    session,
    'if (reason === HOVER_PAUSE_REASON && isLoopMedia(this.currentMedia)) return;',
    '循环媒体必须仅忽略 HOVER 暂停原因',
  );

  assertIncludes(lifecycle, 'shouldSkipClosePosition', 'lifecycle 缺少程序化关闭隔离检查');
  assertIncludes(lifecycle, 'handleViewerClosed', 'lifecycle 缺少程序化关闭处理器');
  assertIncludes(lifecycle, 'locateMessageAfterClose', 'lifecycle 未保留普通用户关闭定位');

  assertIncludes(app, './features/media-stream-continuation/index.js', 'app.js 缺少 media-stream-continuation 功能模块');
  assertIncludes(app, 'createMediaStreamContinuation()', 'app.js 未创建 continuation 控制器');
  assertIncludes(app, 'ContinuationViewerSession', 'app.js 未传入 ContinuationViewerSession');
  assertIncludes(app, 'continuation,', 'app.js 未把 continuation 传递给 lifecycle');

  assertExcludes(session, 'continuousEnabled: false', 'continuation 会话不得把 continuousEnabled 持久化为 false');
  assertExcludes(controller, 'continuousEnabled: false', 'continuation 控制器不得把 continuousEnabled 持久化为 false');
  assertExcludes(session, 'saveSettings', 'continuation 会话不得改写设置持久化');
}

async function verifyGeneratedOutput() {
  const [generated, topLevelEntries, modules, hasLegacyMain] = await Promise.all([
    readFile(OUTPUT_PATH, 'utf8'),
    readdir(TAMPERMONKEY_DIR, { withFileTypes: true }),
    readRequiredModules(),
    pathExists(LEGACY_MAIN_PATH),
  ]);

  assertCondition(!hasLegacyMain, 'legacy-main.js 必须保持删除');
  const expectedMetadata = createWebKUserscriptMetadata();
  const metadataEndIndex = generated.indexOf('// ==/UserScript==');
  assertCondition(generated.startsWith(expectedMetadata), '生成文件顶部 metadata 不符合单一来源');
  assertCondition(metadataEndIndex >= 0, '生成文件缺少 metadata 结束标记');
  assertCondition(
    generated.slice(metadataEndIndex + '// ==/UserScript=='.length).trimStart().startsWith(GENERATED_NOTICE),
    '生成文件缺少禁止手工修改说明',
  );
  assertCondition((generated.match(/\/\/ ==UserScript==/g) || []).length === 1, '生成文件包含重复 metadata');

  const metadataBlock = generated.slice(0, metadataEndIndex + '// ==/UserScript=='.length);
  const matchLines = metadataBlock.match(/^\/\/ @match\s+.+$/gm) || [];
  assertCondition(matchLines.length === 1, `metadata @match 数量异常：${matchLines.length}`);
  assertCondition(matchLines[0] === `// @match        ${WEB_K_MATCH}`, 'metadata 未唯一匹配 Web K');
  assertExcludes(metadataBlock, 'web.telegram.org/a/', 'metadata 禁止包含 Web A');
  assertIncludes(metadataBlock, '// @grant        none', 'metadata 必须保持 @grant none');

  const metadataVersion = metadataBlock.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
  assertCondition(metadataVersion === WEB_K_VERSION, 'metadata 版本与 version.js 不一致');
  const escapedVersion = escapeRegExp(WEB_K_VERSION);
  assertCondition(new RegExp(`(?:const|let|var)\\s+WEB_K_VERSION\\s*=\\s*['"]${escapedVersion}['"]`).test(generated), '生成文件缺少运行时版本常量');
  assertCondition(/version:\s*WEB_K_VERSION\b/.test(generated), '调试 API 未使用运行时版本常量');

  for (const token of [
    'browseDirection',
    'mediaFilter',
    'createKeyboardShortcuts',
    'toggle-continuous',
    'toggle-pause',
    'custom-duration-input',
    '自定义图片停留秒数',
    'apply-duration',
    '请输入 1～300 秒，最多一位小数',
    'videoMuted',
    'videoVolume',
    'videoPlaybackRate',
    'video-muted',
    'video-volume',
    'video-rate',
    'enterpictureinpicture',
    'leavepictureinpicture',
    'fullscreenchange',
    'NotAllowedError',
    '媒体加载较慢',
    'createMediaStreamContinuation',
    'ContinuationViewerSession',
    'MediaStreamContinuationController',
    'shouldSkipClosePosition',
    'handleViewerClosed',
    'takeSessionContext',
    'isLoopMedia',
  ]) assertIncludes(generated, token, `生成文件缺少 V1 或 P1-09 标记：${token}`);

  assertCondition(
    /function isValidPhotoDurationMs\(value\) \{\s*return Number\.isInteger\(value\) && value >= (?:1e3|1000) && value <= (?:3e5|300000) && value % 100 === 0;\s*\}/.test(generated),
    '生成文件缺少 1～300 秒和一位小数校验',
  );
  assertExcludes(generated, 'disablePictureInPicture = false', '生成文件不得移除 Telegram PiP 限制');
  assertCondition((generated.match(/tt\.mediaContinuity\.v1/g) || []).length === 1, '生成文件出现第二套 storage key');
  assertCondition(!/\bimport\s*\(/.test(generated), '生成文件禁止动态 import');
  assertCondition(!/^\s*(?:import|export)\s/m.test(generated), '生成文件仍包含 ES Module 语句');
  assertCondition(!/sourceMappingURL/i.test(generated), '生成文件禁止 sourcemap 引用');
  assertCondition(/\(\(\)\s*=>\s*\{|\(function\s*\(\)\s*\{/.test(generated), '生成文件未检测到 IIFE');

  const unexpectedOutputs = topLevelEntries
    .filter((entry) => entry.isFile()
      && entry.name.startsWith('telegram-media-continuity-web-k')
      && entry.name !== OUTPUT_FILE_NAME)
    .map((entry) => entry.name);
  assertCondition(unexpectedOutputs.length === 0, `检测到额外 Web K 产物：${unexpectedOutputs.join(', ')}`);

  verifyModuleBoundaries(modules);

  console.log([
    '[check:tampermonkey:web-k] 通过',
    `version=${WEB_K_VERSION}`,
    `match=${WEB_K_MATCH}`,
    `modules=${modules.size}`,
    'legacy=removed',
    'v1=loop-media,pause-reasons,video-preferences,control-panel',
    `output=${OUTPUT_FILE_NAME}`,
  ].join('\n'));
}

verifyGeneratedOutput().catch((error) => {
  console.error(`[check:tampermonkey:web-k] 失败：${error.message}`);
  process.exitCode = 1;
});
