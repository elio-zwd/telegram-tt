# Telegram Web K 媒体续播修复计划

## 任务目标

修复 `tampermonkey/telegram-media-continuity.user.js` 在 Telegram Web K 页面无法识别和控制图片、视频查看器的问题。

测试页面：

```text
https://web.telegram.org/k/#@meizi_office
```

基线分支：

```text
codex/tampermonkey-media-continuity
```

开发分支：

```text
fix/tampermonkey-web-k-media-viewer
```

## 已确认根因

### 1. 仓库版本没有注入 Web K

当前仓库脚本只有：

```text
@match https://web.telegram.org/a/*
```

因此仓库版本不会在 `/k/` 页面注入。用户本地曾手工增加 Web K 匹配，但该改动尚未提交到 GitHub，不能作为远端修改基线。

### 2. 当前 DOM 适配只针对 Telegram Web A

现有代码依赖以下 Web A 结构：

```text
.MediaViewer
.MediaViewerSlides
.MediaViewerSlide
button.navigation.next
button.navigation.prev
```

Telegram Web K 官方源码 `morethanwords/tweb` 当前使用另一套结构：

```text
.media-viewer-whole
.media-viewer
.media-viewer-content
.media-viewer-media
.media-viewer-movers
.media-viewer-switcher-left
.media-viewer-switcher-right
.media-viewer-topbar
```

Web K 的上一项和下一项是 `div.media-viewer-switcher-*`，不是 Web A 的 `button.navigation.*`。当前 `candidateButtons()` 也不会把没有 `role`、`tabindex` 的切换器视为候选控件。

### 3. Web A 与 Web K 的点击机制不同

Web A 适配使用带横坐标的合成 `MouseEvent`，避免官方查看器把零坐标点击识别成错误方向。

Web K 官方源码为左右切换器分别绑定独立 `click` 监听器，并通过 `listLoader.go(-1/1)` 切换，因此应优先对精确切换器执行原生 `.click()`，不应继续套用 Web A 的横坐标事件方案。

## 修复范围

第一轮只修改油猴脚本及其说明文档，不修改 Telegram 源码、构建产物或其他第二阶段 PR。

计划实现：

1. 同时匹配 `/a/*` 与 `/k/*`，保留 Web A 向后兼容。
2. 增加 Web A / Web K 页面类型识别。
3. 为 Web K 增加精确查看器根节点识别。
4. 为 Web K 增加左右切换器、关闭控件和活动媒体识别。
5. 按页面类型分别触发导航：
   - Web A：保留带方向坐标的合成点击；
   - Web K：点击精确的左右切换器。
6. 扩展脱敏调试 API，输出页面类型、匹配节点和可见状态，不输出聊天正文、账号信息或媒体 URL。
7. 保持结构无法识别时安全失效，不拦截 Telegram 原有交互。

## 分层排查顺序

### A. 注入层

确认：

```js
Boolean(window.TelegramMediaContinuity)
document.documentElement.dataset.telegramMediaContinuity
```

### B. 查看器识别层

打开一张普通图片后确认：

```js
document.querySelector('.media-viewer-whole')
```

### C. 导航控件层

确认：

```js
document.querySelector('.media-viewer-switcher-left')
document.querySelector('.media-viewer-switcher-right')
```

并记录节点是否可见、是否含 `hide` 类、尺寸是否大于零。

### D. 事件执行层

分别调用左右切换器的 `.click()`，确认媒体节点或媒体指纹发生变化。

### E. 媒体生命周期层

确认：

- 图片加载完成后启动倒计时；
- 手动切换后重新绑定当前图片或视频；
- 视频触发 `ended` 后只推进一次；
- 手动暂停视频后不自动推进；
- 到达当前队列末尾时停止。

## 脱敏 DOM 取样

不上传整页 HTML。整页 HTML 可能包含频道正文、账号昵称、媒体 URL 和其他个人数据。

由本地浏览器测试 AI 在“已打开媒体查看器”的状态执行以下代码，并只回传输出对象：

```js
(() => {
  const describe = (element) => {
    if (!(element instanceof Element)) return undefined;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      tag: element.tagName.toLowerCase(),
      classes: Array.from(element.classList),
      role: element.getAttribute('role') || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      hidden: element.hasAttribute('hidden'),
      ariaHidden: element.getAttribute('aria-hidden') || '',
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      rect: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      },
      imageCount: element.querySelectorAll('img').length,
      videoCount: element.querySelectorAll('video').length,
      buttonCount: element.querySelectorAll('button, [role="button"]').length,
    };
  };

  const viewer = document.querySelector('.media-viewer-whole');
  const left = viewer?.querySelector('.media-viewer-switcher-left');
  const right = viewer?.querySelector('.media-viewer-switcher-right');
  const mediaRoot = viewer?.querySelector('.media-viewer-media');
  const activeMedia = mediaRoot?.querySelector('video, img');

  return {
    pathname: location.pathname,
    hashShape: location.hash.startsWith('#@') ? '#@channel' : location.hash.slice(0, 24),
    scriptInjected: Boolean(window.TelegramMediaContinuity),
    scriptDataset: document.documentElement.dataset.telegramMediaContinuity || '',
    viewer: describe(viewer),
    left: describe(left),
    right: describe(right),
    mediaRoot: describe(mediaRoot),
    activeMedia: describe(activeMedia),
    debugSummary: window.TelegramMediaContinuity?.getSummary?.(),
    debugInspect: window.TelegramMediaContinuity?.inspect?.(),
  };
})();
```

禁止回传：

- `document.documentElement.outerHTML`；
- 完整 `document.body.innerHTML`；
- 图片或视频的 `src`、`currentSrc`、Blob URL；
- 频道正文、成员信息、账号昵称和头像地址。

## 完成条件

### 核心功能

- Web K 打开普通图片或视频后，底部出现 TT 控制条。
- 控制条上一项、下一项与官方方向一致。
- 连续图片按设定时间推进，切换后重新完整计时。
- 视频播放结束后推进一次；手动暂停时不推进。
- 官方手动切换后脚本仍能识别新媒体。
- 队列末尾停止，不循环、不快速连点。

### 兼容与安全

- Web A 原有识别和导航逻辑不回归。
- 未打开媒体查看器时不注入控制条。
- DOM 不匹配时安全失效，不导致白屏、输入异常或页面导航失效。
- 调试输出不包含聊天正文和媒体 URL。

## 验证状态定义

远端 GitHub 修改阶段只能进行源码对照、静态检查和差异审阅。

真实页面行为必须由本地浏览器测试 AI 验证，并记录：

- 浏览器与 Tampermonkey 版本；
- 安装的脚本版本与 Commit SHA；
- 测试 URL 页面类型；
- 每项验收步骤与结果；
- 控制台错误和脱敏诊断输出；
- 失败时的复现步骤。
