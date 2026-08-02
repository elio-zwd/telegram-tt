# Telegram Web K 同频道媒体自动续流真实页面研究

## 0. 当前结论与研究状态

本文件用于 P1-09「同频道媒体自动续流与循环媒体自动切换修复」的真实页面研究。

当前只完成：

- GitHub 稳定基线核验；
- 现有模块、调用链和旧研究的静态审读；
- 真实页面研究矩阵设计；
- 脱敏只读 Console 探针准备。

当前**尚未完成**：

- Windows Chrome + Tampermonkey + 已登录 Telegram Web K 的真实页面观察；
- 正向、反向队列边界行为确认；
- 消息列表实际加载方向确认；
- 循环媒体无法自动切换的真实根因确认；
- 任何运行代码修改、版本升级、构建、CI 或浏览器综合验收。

因此本文目前是“研究准备文档”，不是研究结论。不得把下文的静态假设写入 PR 描述作为真实页面事实。

```text
仓库：elio-zwd/telegram-tt
Base 分支：codex/tampermonkey-media-continuity
Base SHA：20e86e6f7518d1978e8b5a49fec76364e28fde4c
研究与开发分支：feat/tampermonkey-web-k-media-stream-continuation
启动版本：0.4.0-k10
目标版本：0.4.0-k11
PR #20：已合并
开放冲突检查：仅 PR #17 为旧媒体事件研究文档，未修改当前运行模块
```

## 1. 证据边界

### 1.1 允许使用

- Telegram Web K 公开 DOM；
- 标准 `HTMLImageElement`、`HTMLVideoElement`、`HTMLMediaElement` 属性和事件；
- 标准 `MutationObserver`、滚动属性、Fullscreen、PiP、在线状态；
- 当前 userscript 的公开 `window.TelegramMediaContinuity` 调试 API；
- 当前页面内存中的临时、脱敏探针结果；
- 仓库源码静态阅读。

### 1.2 禁止使用或记录

- 聊天正文、频道名、群名、用户名；
- 真实 peer ID、message ID、album ID；
- `src`、`currentSrc`、`poster`、媒体 URL、Blob URL；
- 真实 `href`；
- Telegram 私有对象、webpack 模块、IndexedDB；
- Telegram API、Bot API、MTProto；
- 受保护内容绕过。

研究报告只允许记录临时别名，例如 `peer-1`、`message-7`、`node-3`。

## 2. 静态审计结果：仅作为待验证假设

### 2.1 循环媒体悬停

静态事实：

`features/continuous-browsing/viewer-session.js` 当前对所有活动媒体统一注册：

```text
pointerenter -> 增加 HOVER 暂停原因
pointerleave -> 移除 HOVER 暂停原因
```

循环媒体倒计时要求不存在任何暂停原因。因此，如果指针长期停留在循环媒体上，倒计时可能长期不启动或被清除。

待真实页面验证：

- viewer 打开后指针是否通常自然停留在媒体上；
- `pointerenter` 是否在循环媒体绑定后稳定触发；
- 控制条状态是否持续显示悬停暂停；
- 指针移出后是否恢复完整倒计时；
- 无指针悬停时循环媒体是否可以正常切换。

在验证前，不能把“悬停”认定为唯一真实根因。

### 2.2 listener 注册前已经播放

静态事实：

当前绑定新视频节点时，如果满足：

```text
paused === false
readyState >= HAVE_CURRENT_DATA
```

会把 `currentVideoHasPlayed` 初始化为 `true`；后续 `playing` 事件也会将其设为 `true`。

待真实页面验证：

- listener 绑定时循环媒体是否已经在播放；
- `readyState` 是否足以排除“看似未暂停但尚未推进”的假阳性；
- `currentTime` 是否持续前进；
- 节点替换后新的初始状态是否不同。

### 2.3 缓冲状态残留

静态事实：

`waiting`／`stalled` 会增加 `BUFFERING` 暂停原因；`canplay`／`playing` 在未进入慢缓冲状态时会清除该原因。

待真实页面验证：

- 循环媒体是否出现 `waiting`／`stalled` 后没有对应恢复事件；
- Telegram 是否替换节点而不是在原节点恢复；
- 旧节点事件是否被 sequence ID 正确隔离。

### 2.4 当前查看器队列边界

静态事实：

当自动导航方向没有官方按钮时，当前 `navigateOnce()` 会调用 `finish()`；`finish()` 会：

```text
active = false
continuousEnabled 持久化为 false
清除 timer
显示当前队列末尾或开头状态
```

这与 P1-09 冻结规则冲突。P1-09 必须把“自动队列边界”改为 continuation 请求，而不是永久关闭连续浏览。

待真实页面验证：

- 边界按钮是删除、隐藏、增加 `hide`，还是短暂不可见；
- 保持 viewer 打开时 Telegram 是否可能自行扩展队列；
- 正向、反向边界的真实 DOM 时序。

### 2.5 程序关闭与旧关闭定位冲突

静态事实：

`core/lifecycle.js` 只要发现当前 viewer 不可见或节点断开，就会：

```text
生成关闭快照
销毁 ViewerSession
调用 locateMessageAfterClose()
```

`locateMessageAfterClose()` 会轮询、平滑居中和高亮最后消息。自动续流同样需要在关闭 viewer 后操作消息滚动容器，两者可能竞争滚动位置。

设计门禁：程序化 continuation 关闭必须拥有显式标记，使 lifecycle 跳过普通用户关闭定位，并把关闭结果交给 continuation operation。

### 2.6 现有可复用平台能力

`platform/message-list.js` 已提供：

- 当前活动聊天滚动容器；
- 公开 peer/message 身份读取；
- 相册 index；
- 精确消息节点定位；
- DOM 顺序中的相邻媒体目标；
- peer 变化保护；
- 虚拟列表导致源节点断开后的同身份重新匹配。

仍需真实研究后扩展的平台能力：

- 官方关闭 viewer；
- 有界滚动与加载证据；
- 媒体候选枚举和筛选；
- 公开点击目标；
- viewer 关闭、打开与目标确认。

这些选择器和行为不得直接散落到新 feature 中。

## 3. 真实研究环境记录模板

执行者必须填写实际值：

```text
操作系统：
Windows 版本与 Build：
Chrome 版本：
Tampermonkey 版本：
Telegram Web K：https://web.telegram.org/k/
userscript 版本：0.4.0-k10
userscript SHA-256：
研究开始时间：
研究结束时间：
目标分支 HEAD：
研究前 git status --short：
研究后 git status --short：
```

全过程只读，不修改源码、生成文件或工作区。

## 4. 脱敏只读 Console 探针

在已登录 Telegram Web K 页面打开 DevTools Console，先打开一个允许正常浏览的媒体，再粘贴以下脚本。

探针只记录：

- 节点临时编号；
- 标签名、连接和可见状态；
- `loop`、`paused`、`readyState`、`currentTime`、`ended`；
- 标准媒体事件；
- 导航按钮存在、可见、`hide`、`hidden`、`aria-hidden`；
- 消息和媒体节点数量；
- 滚动尺寸和位置；
- TT 控制条自己的状态文案。

探针不读取聊天文字、媒体 URL、真实身份或链接。

```js
(() => {
  window.__ttP109Probe?.stop?.();

  const VIEWER_SELECTOR = '.media-viewer-whole';
  const LEFT_SELECTOR = '.media-viewer-switcher-left';
  const RIGHT_SELECTOR = '.media-viewer-switcher-right';
  const SCROLL_SELECTOR = '.scrollable.scrollable-y.bubbles-scrollable';
  const HOST_ID = 'telegram-media-continuity-host';
  const MEDIA_EVENTS = [
    'load', 'error', 'loadedmetadata', 'loadeddata', 'canplay',
    'play', 'playing', 'pause', 'waiting', 'stalled', 'ended',
    'pointerenter', 'pointerleave',
  ];

  const nodeIds = new WeakMap();
  const cleanup = [];
  const events = [];
  let nextNodeId = 1;
  let boundMedia;
  let stopped = false;

  function getNodeId(node) {
    if (!(node instanceof Node)) return '';
    if (!nodeIds.has(node)) nodeIds.set(node, `node-${nextNodeId++}`);
    return nodeIds.get(node);
  }

  function isVisible(node) {
    if (!(node instanceof Element) || !node.isConnected) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && node.getAttribute('aria-hidden') !== 'true'
      && !node.hasAttribute('hidden');
  }

  function getViewer() {
    const viewer = document.querySelector(VIEWER_SELECTOR);
    return isVisible(viewer) ? viewer : undefined;
  }

  function getActiveMedia(viewer) {
    if (!(viewer instanceof Element)) return undefined;
    const candidates = Array.from(viewer.querySelectorAll('img, video'))
      .filter(isVisible)
      .map((media) => {
        const rect = media.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(centerX - innerWidth / 2, centerY - innerHeight / 2);
        return { media, score: rect.width * rect.height - distance * 100 };
      })
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.media;
  }

  function describeButton(viewer, selector) {
    const button = viewer?.querySelector(selector);
    return {
      exists: button instanceof Element,
      nodeId: getNodeId(button),
      connected: Boolean(button?.isConnected),
      visible: isVisible(button),
      hasHideClass: Boolean(button?.classList.contains('hide')),
      hidden: Boolean(button?.hasAttribute('hidden')),
      ariaHidden: button?.getAttribute('aria-hidden') || '',
      classNames: button ? Array.from(button.classList).slice(0, 12) : [],
    };
  }

  function describeMedia(media) {
    if (!(media instanceof Element)) return undefined;
    const base = {
      nodeId: getNodeId(media),
      tag: media.tagName.toLowerCase(),
      connected: media.isConnected,
      visible: isVisible(media),
    };
    if (media instanceof HTMLVideoElement) {
      return {
        ...base,
        loop: media.loop,
        paused: media.paused,
        ended: media.ended,
        readyState: media.readyState,
        networkState: media.networkState,
        currentTime: Number(media.currentTime.toFixed(3)),
        durationFinite: Number.isFinite(media.duration),
        errorCode: media.error?.code || 0,
      };
    }
    if (media instanceof HTMLImageElement) {
      return {
        ...base,
        complete: media.complete,
        naturalWidthPositive: media.naturalWidth > 0,
      };
    }
    return base;
  }

  function findActiveScrollContainer() {
    return Array.from(document.querySelectorAll(SCROLL_SELECTOR))
      .filter(isVisible)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
      })[0];
  }

  function describeScroll() {
    const container = findActiveScrollContainer();
    if (!(container instanceof Element)) return undefined;
    const messageNodes = container.querySelectorAll('[data-mid][data-peer-id]');
    const mediaNodes = container.querySelectorAll(
      '.bubble.photo, .bubble.video, .bubble.is-gif, .album-item[data-mid][data-peer-id]',
    );
    return {
      nodeId: getNodeId(container),
      connected: container.isConnected,
      scrollTop: Math.round(container.scrollTop),
      scrollHeight: Math.round(container.scrollHeight),
      clientHeight: Math.round(container.clientHeight),
      messageNodeCount: messageNodes.length,
      mediaTargetCount: mediaNodes.length,
    };
  }

  function getPanelStatus() {
    const host = document.getElementById(HOST_ID);
    return host?.shadowRoot?.querySelector('#status')?.textContent || '';
  }

  function snapshot(label = 'snapshot') {
    const viewer = getViewer();
    const media = getActiveMedia(viewer);
    bindMedia(media);
    const result = {
      atMs: Math.round(performance.now()),
      label,
      viewer: {
        exists: Boolean(document.querySelector(VIEWER_SELECTOR)),
        visible: Boolean(viewer),
        nodeId: getNodeId(viewer),
      },
      previous: describeButton(viewer, LEFT_SELECTOR),
      next: describeButton(viewer, RIGHT_SELECTOR),
      media: describeMedia(media),
      scroll: describeScroll(),
      panelStatus: getPanelStatus(),
    };
    console.log('[TT P1-09 snapshot]', result);
    return result;
  }

  function recordMediaEvent(event) {
    const target = event.currentTarget;
    const result = {
      atMs: Math.round(performance.now()),
      type: event.type,
      media: describeMedia(target),
      panelStatus: getPanelStatus(),
    };
    events.push(result);
    console.log('[TT P1-09 media event]', result);
  }

  function releaseMedia() {
    while (cleanup.length) cleanup.pop()();
    boundMedia = undefined;
  }

  function bindMedia(media) {
    if (media === boundMedia) return;
    releaseMedia();
    if (!(media instanceof Element)) return;
    boundMedia = media;
    for (const type of MEDIA_EVENTS) {
      media.addEventListener(type, recordMediaEvent, true);
      cleanup.push(() => media.removeEventListener(type, recordMediaEvent, true));
    }
    console.log('[TT P1-09 media bound]', describeMedia(media));
  }

  const observer = new MutationObserver(() => {
    if (stopped) return;
    const viewer = getViewer();
    bindMedia(getActiveMedia(viewer));
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'loop'],
  });

  const api = Object.freeze({
    snapshot,
    mark(label) {
      return snapshot(`MARK: ${String(label || '')}`);
    },
    getEvents() {
      return events.map((item) => ({ ...item }));
    },
    clear() {
      events.length = 0;
      console.clear();
      return snapshot('cleared');
    },
    stop() {
      if (stopped) return;
      stopped = true;
      observer.disconnect();
      releaseMedia();
      delete window.__ttP109Probe;
      console.info('[TT P1-09] probe stopped');
    },
  });

  Object.defineProperty(window, '__ttP109Probe', {
    configurable: true,
    enumerable: false,
    value: api,
  });

  snapshot('installed');
  console.info('[TT P1-09] 使用 __ttP109Probe.snapshot()、mark()、getEvents()、clear()、stop()');
})();
```

## 5. 循环媒体研究矩阵

至少选择 3 个循环媒体样本，每项重复 3 次。

| 编号 | 场景 | 操作 | 必须记录 |
| --- | --- | --- | --- |
| L01 | listener 后播放 | 打开循环媒体后立即安装探针 | `play`、`playing`、timer 状态、是否导航 |
| L02 | listener 前已播放 | 先等待循环媒体播放，再刷新或重建 session | 初始 `paused`、`readyState`、`currentTime` 是否推进 |
| L03 | 指针停留 | 指针保持在媒体上超过 `photoDurationMs` | `pointerenter`、面板状态、是否长期暂停 |
| L04 | 指针移出 | L03 后移出媒体 | `pointerleave`、是否完整重新计时、是否切换 |
| L05 | 实际交互 | 点击播放器、拖动进度、滚轮或缩放 | interaction 暂停和冷却恢复 |
| L06 | waiting 恢复 | 制造短暂网络限制 | `waiting/stalled -> canplay/playing` 与暂停清理 |
| L07 | 节点替换 | 在循环媒体之间切换 | 旧节点断开、新 node ID、旧 timer 是否失效 |
| L08 | timer 有按钮 | 确保对应导航按钮存在 | 到时是否调用正确方向导航 |
| L09 | timer 无按钮 | 到当前 viewer 队列边界 | 到时是否进入边界路径，而非静默停住 |
| L10 | loop 变化 | 仅观察 Telegram 是否修改 `loop` | 变化时序和现有冲突暂停是否合理 |

每个场景必须区分：

```text
倒计时根本未开始
倒计时被 HOVER/BUFFERING/INTERACTION 暂停
倒计时被节点替换或 sequence ID 重置
倒计时结束但无导航按钮
导航已触发但媒体未变化
```

## 6. 队列边界与消息加载研究矩阵

### 6.1 正向

1. 打开频道中间位置的媒体；
2. 开启正向连续浏览；
3. 到达当前 viewer 队列末尾；
4. 在边界前、边界时、等待 3 秒后分别执行：

```js
__ttP109Probe.snapshot('forward-boundary-before');
__ttP109Probe.snapshot('forward-boundary-at');
__ttP109Probe.snapshot('forward-boundary-after-3s');
```

5. 观察下一项按钮是删除、隐藏、`hide` 还是重新出现；
6. 不关闭 viewer，等待 Telegram 是否自行扩展队列；
7. 使用官方关闭按钮关闭 viewer；
8. 记录关闭后列表位置是否改变；
9. 分别尝试向消息列表两个方向滚动，记录哪一方向触发更多目标出现；
10. 记录加载证据：message 数量、media target 数量、scrollHeight、DOM 替换；
11. 点击锚点之后的下一条媒体，确认 viewer 是否使用新节点重建；
12. 确认新 viewer 打开的是预期临时身份和相册 index，不记录真实 ID。

### 6.2 反向

重复正向矩阵，但从当前 viewer 队列开头触发，并确认：

- 上一项按钮的真实边界状态；
- 对应的消息列表加载方向；
- 新节点是前插、后插还是整体替换；
- 锚点可能被虚拟列表回收时，是否可以通过同身份重新找到；
- 打开候选后 viewer 和目标方向是否正确。

### 6.3 每次滚动必须记录

```js
__ttP109Probe.snapshot('scroll-attempt-1-before');
// 仅执行一次人工滚动
__ttP109Probe.snapshot('scroll-attempt-1-after');
```

填写：

| 尝试 | 方向 | scrollTop | scrollHeight | message 数量 | media 数量 | DOM 变化 | 加载指示 | 结论 |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 待填 |  |  |  |  |  |  |  |

不得用固定 sleep 单独证明加载成功；至少需要一种 DOM 或滚动范围的新证据。

## 7. 用户接管与取消研究

在边界关闭、滚动、搜索和重开阶段分别测试：

- 手动关闭 viewer；
- 点击其他消息或媒体；
- 使用官方上一项／下一项；
- 按方向键；
- 切换频道或话题；
- 关闭连续浏览；
- 修改方向；
- 修改筛选。

每项记录：

```text
用户动作发生时间
当前 viewer node ID
当前 peer 临时别名
旧 operation 是否停止滚动
旧 operation 是否停止点击
是否出现旧 session 修改新控制条
```

## 8. 研究结论填写模板

### 8.1 循环媒体真实根因

```text
结论：待填
样本数量：待填
复现次数：待填
已排除：待填
主要证据：待填
次要因素：待填
```

### 8.2 队列边界真实行为

```text
正向按钮状态：待填
反向按钮状态：待填
viewer 保持打开是否自行扩展：待填
正向对应消息列表加载方向：待填
反向对应消息列表加载方向：待填
加载开始证据：待填
加载完成证据：待填
消息节点更新方式：待填
虚拟列表回收情况：待填
官方关闭行为：待填
媒体重开可靠入口：待填
viewer 重开确认条件：待填
```

### 8.3 可进入实现的选择器和行为

只把经过至少 3 次稳定复现的公开 DOM 行为列入正式设计：

| 能力 | 公开 DOM 或标准 API | 复现 | 冲突情况 | 是否允许实现 |
| --- | --- | ---: | --- | --- |
| 关闭 viewer | 待填 |  |  |  |
| 识别边界 | 待填 |  |  |  |
| 驱动滚动 | 待填 |  |  |  |
| 判断加载 | 待填 |  |  |  |
| 枚举候选 | 待填 |  |  |  |
| 点击媒体 | 待填 |  |  |  |
| 确认新 viewer | 待填 |  |  |  |

## 9. 实现门禁

只有完成并提交上述真实研究结论后，才允许修改运行代码。

正式实现前必须满足：

- 已确认正向、反向真实加载方向；
- 已确认官方关闭行为；
- 已确认至少一种可靠加载证据；
- 已确认媒体候选与相册打开方式；
- 已确认 viewer 重开和目标校验；
- 已确认循环媒体真实根因；
- 研究结果已脱敏；
- 研究 Commit 只修改本文档。

随后才进入：

```text
根因分析
→ 实施计划
→ 失败场景与临时行为验证设计
→ 运行代码修改
→ 构建与静态验证
→ 真实页面综合验收
→ Draft PR
→ Linux/Windows CI
```

## 10. 当前未修改范围

当前研究准备阶段未修改：

- `tampermonkey/src/web-k/**` 运行代码；
- `tampermonkey/src/web-k/version.js`；
- 生成 userscript；
- `tampermonkey/README.md`；
- package 文件；
- GitHub Actions；
- Web A；
- Telegram 桌面源码。
