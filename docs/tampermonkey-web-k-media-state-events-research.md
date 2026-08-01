# Telegram Web K 媒体状态事件只读研究

## 0. 结论与当前状态

本文件是 P1-05「GIF／循环短视频策略」和 P1-06「播放状态与失败暂停」的研究记录。

当前结论：

> 仓库侧准备、现有实现静态审计、真实页面观察方案和脱敏事件记录器已经建立；当前执行环境无法控制已登录的 Windows Chrome、Tampermonkey 与 Telegram Web K 页面，因此尚未产生真实页面事件证据。

本文件不得被解读为 P1-05 或 P1-06 已完成，也不得把下文的“候选规则”“待验证序列”当作真实 Web K 观察。

研究状态：

```text
仓库前置检查：已完成
研究分支：已创建
现有实现静态审计：已完成
真实 Web K 页面观察：未执行
真实事件顺序：未取得
成功复现次数：0
P1-05 正式实现依据：不足
P1-06 正式实现依据：不足
```

## 1. 研究边界

### 1.1 允许范围

本研究只使用：

- Telegram Web K 公开页面 DOM；
- `HTMLImageElement`、`HTMLVideoElement` 和 `HTMLMediaElement` 的公开属性与事件；
- 浏览器标准 PiP、Fullscreen、online／offline 事件；
- 当前页面内存中的临时、脱敏事件记录；
- 仓库现有 Web K userscript 的静态阅读。

### 1.2 禁止范围

不得依赖：

- 完整媒体 URL；
- 文件名文本；
- 聊天正文、频道名称、用户名或账号标识；
- Telegram 私有对象；
- webpack 模块；
- IndexedDB；
- Telegram API、Bot API 或 MTProto；
- 浏览器缓存内容导出；
- 绕过受保护媒体或权限限制的操作。

### 1.3 本次仓库范围

只允许新增：

```text
docs/tampermonkey-web-k-media-state-events-research.md
```

未修改：

- `tampermonkey/src/**`；
- 生成 userscript；
- 构建配置；
- CI；
- package 文件；
- Web A；
- Telegram 桌面源码；
- 现有路线文档。

## 2. 基线与研究环境

### 2.1 仓库基线

```text
仓库：https://github.com/elio-zwd/telegram-tt
范围冻结 PR：https://github.com/elio-zwd/telegram-tt/pull/15
稳定分支：codex/tampermonkey-media-continuity
实际稳定 Commit：b9b2b99fa7a30261cc38f2d6fcea808c5ba200b9
研究分支：research/tampermonkey-web-k-media-state-events
仓库侧准备时间：2026-08-01T15:46Z 后
```

PR #15 已合并。研究分支精确从上述稳定 Commit 创建。

### 2.2 真实页面环境

以下项目必须由实际执行者在开始观察前填写：

```text
Windows 版本：未取得
Chrome 版本：未取得
Tampermonkey 版本：未取得
Telegram Web K 页面地址：未取得，应为 https://web.telegram.org/k/*
实际安装 userscript 版本：未取得；稳定分支源码标记为 0.4.0-k6
研究开始时间：未开始
研究结束时间：未开始
```

在以上环境信息完整前，不得把任何浏览器行为写为已确认。

## 3. 现有实现静态审计

本节只描述稳定分支代码，不代表真实 Web K 页面已经验证。

### 3.1 当前公开 DOM 探测

`tampermonkey/src/web-k/platform/media-viewer.js` 当前：

- 以 `.media-viewer-whole` 作为查看器候选；
- 在查看器媒体根中查询 `img, video`；
- 通过可见性、尺寸、相对查看器中心位置和播放状态评分选择活动媒体；
- 只把 `HTMLImageElement` 和 `HTMLVideoElement` 视为受支持媒体；
- 图片成功显示条件为 `complete && naturalWidth > 0`；
- 视频成功显示候选条件为 `readyState >= HAVE_METADATA`，或已取得视频尺寸。

当前 `mediaFingerprint()` 还包含媒体节点 ID、尺寸及媒体地址尾部片段。地址片段虽然没有持久化，但不应成为 P1-05／P1-06 的产品分类证据；后续正式设计应优先使用节点身份、标准属性和事件序列。

### 3.2 当前图片事件

`ViewerSession.bindMedia()` 当前监听：

```text
load
error
```

当前行为：

- `load`：确认当前媒体目标，并开始或重启图片倒计时；
- `error`：清理倒计时和待确认导航目标，显示“图片加载失败，请手动处理”。

尚未统一成 P1-06 状态机，也没有记录错误前后的节点替换、网络状态和恢复序列。

### 3.3 当前视频事件

当前监听：

```text
loadedmetadata
loadeddata
canplay
playing
ended
error
```

当前行为：

- 多个成功事件都可确认当前媒体目标；
- `ended` 在连续浏览开启且未暂停时触发自动导航；
- `error` 清理待确认导航目标并显示失败提示；
- `video.loop === true` 时显示“循环视频需手动切换”；
- 视频暂停且未结束时调用 `play()`；
- `play()` Promise 拒绝只显示“点击视频开始播放”。

当前未监听：

```text
waiting
stalled
abort
emptied
suspend
pause
enterpictureinpicture
leavepictureinpicture
fullscreenchange
online
offline
```

当前也未记录 `video.error.code`，未区分自动播放限制、暂时缓冲、确认失败、用户暂停和节点失效。

### 3.4 静态审计结论

现有代码足以证明：

- 当前实现已经基于公开 `img`／`video` 节点；
- 循环视频目前不会等待 `ended`；
- 图片与视频已有最小成功和失败监听；
- P1-06 所需的 PiP、系统全屏、网络、缓冲和细分失败状态尚未接入。

现有代码不能证明：

- Web K 中 GIF 实际使用什么节点；
- GIF 与普通短视频是否存在稳定公开差异；
- 节点切换时是否复用；
- PiP、全屏和网络恢复的真实事件顺序；
- `waiting`、`stalled`、`suspend` 等事件在 Web K 中的稳定性；
- Telegram 对失败媒体的真实重试行为。

## 4. 脱敏 DOM 与事件记录器

### 4.1 使用目的

以下脚本只用于浏览器控制台临时观察：

- 不写入仓库运行代码；
- 不持久化数据；
- 不输出媒体地址、文件名或聊天文本；
- 不修改 Telegram 行为；
- 只监听公开事件并生成脱敏记录。

执行前应打开一个允许正常查看的普通频道媒体，禁止用于受保护或付费内容。

### 4.2 控制台记录器

```js
(() => {
  const EVENT_TYPES = [
    'load', 'error',
    'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough',
    'play', 'playing', 'pause', 'ended', 'timeupdate',
    'waiting', 'stalled', 'abort', 'emptied', 'suspend',
    'enterpictureinpicture', 'leavepictureinpicture',
  ];

  const records = [];
  const cleanups = [];
  const nodeIds = new WeakMap();
  let nextNodeId = 1;
  let stopped = false;

  function getNodeId(node) {
    if (!nodeIds.has(node)) {
      nodeIds.set(node, nextNodeId);
      nextNodeId += 1;
    }
    return nodeIds.get(node);
  }

  function describeMedia(media) {
    const isVideo = media instanceof HTMLVideoElement;
    return {
      nodeId: getNodeId(media),
      tagName: media.tagName,
      isConnected: media.isConnected,
      loop: isVideo ? media.loop : undefined,
      autoplay: isVideo ? media.autoplay : undefined,
      muted: isVideo ? media.muted : undefined,
      duration: isVideo && Number.isFinite(media.duration)
        ? Number(media.duration.toFixed(3))
        : undefined,
      currentTime: isVideo && Number.isFinite(media.currentTime)
        ? Number(media.currentTime.toFixed(3))
        : undefined,
      readyState: isVideo ? media.readyState : undefined,
      networkState: isVideo ? media.networkState : undefined,
      ended: isVideo ? media.ended : undefined,
      paused: isVideo ? media.paused : undefined,
      errorCode: isVideo && media.error ? media.error.code : undefined,
      complete: media instanceof HTMLImageElement ? media.complete : undefined,
      naturalWidthPositive: media instanceof HTMLImageElement
        ? media.naturalWidth > 0
        : undefined,
      pictureInPictureElement: document.pictureInPictureElement === media,
      fullscreenElement: document.fullscreenElement === media,
    };
  }

  function record(type, media, extra = {}) {
    const entry = {
      elapsedMs: Math.round(performance.now()),
      type,
      online: navigator.onLine,
      documentHidden: document.hidden,
      media: media ? describeMedia(media) : undefined,
      ...extra,
    };
    records.push(entry);
    console.log('[TT media research]', entry);
  }

  function bind(media) {
    if (nodeIds.has(media)) return;
    getNodeId(media);
    record('node-bound', media);

    for (const type of EVENT_TYPES) {
      const listener = () => record(type, media);
      media.addEventListener(type, listener, true);
      cleanups.push(() => media.removeEventListener(type, listener, true));
    }
  }

  function scan() {
    if (stopped) return;
    const viewer = document.querySelector('.media-viewer-whole');
    if (!viewer) {
      record('viewer-missing');
      return;
    }
    for (const media of viewer.querySelectorAll('img, video')) bind(media);
  }

  const observer = new MutationObserver((mutations) => {
    record('mutation', undefined, {
      mutationCount: mutations.length,
    });
    scan();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'src', 'aria-hidden'],
  });
  cleanups.push(() => observer.disconnect());

  const onOnline = () => record('online');
  const onOffline = () => record('offline');
  const onFullscreenChange = () => record('fullscreenchange', document.fullscreenElement);
  window.addEventListener('online', onOnline, true);
  window.addEventListener('offline', onOffline, true);
  document.addEventListener('fullscreenchange', onFullscreenChange, true);
  cleanups.push(() => window.removeEventListener('online', onOnline, true));
  cleanups.push(() => window.removeEventListener('offline', onOffline, true));
  cleanups.push(() => document.removeEventListener('fullscreenchange', onFullscreenChange, true));

  const intervalId = window.setInterval(scan, 500);
  cleanups.push(() => window.clearInterval(intervalId));
  scan();

  window.__ttMediaStateResearch = {
    snapshot() {
      scan();
      return records.at(-1);
    },
    dump() {
      return structuredClone(records);
    },
    clear() {
      records.length = 0;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      while (cleanups.length) cleanups.pop()();
      console.log('[TT media research] stopped');
    },
  };
})();
```

结束研究后必须执行：

```js
window.__ttMediaStateResearch.stop();
```

### 4.3 脱敏 DOM 记录格式

每个场景只保留以下结构，不复制页面原始 HTML：

```text
viewer：是否存在、是否可见
media：nodeId、tagName、isConnected
video：loop、autoplay、muted、duration、readyState、networkState、ended、paused、errorCode
image：complete、naturalWidthPositive
browser：pictureInPictureElement 是否为当前节点、fullscreenElement 是否为当前节点
```

禁止记录：

```text
src
currentSrc
href
poster
alt
文本内容
data-* 的值
频道或消息标识
```

## 5. 观察步骤

每个场景至少成功复现 3 次；如果三次结果不一致，继续复现到能够说明差异来源，或标记为不稳定。

### 5.1 GIF 与循环媒体

1. 刷新 Web K，确认实际安装的 userscript 版本。
2. 打开一个普通静态图片，启动记录器并保存基线。
3. 打开 Telegram UI 中明确表现为 GIF 的媒体。
4. 记录 `tagName`、`loop`、`autoplay`、`muted`、`duration`、`readyState` 和 `ended`。
5. 保持播放至少两个循环周期，确认是否出现 `timeupdate`、`playing` 和 `ended`。
6. 用 Telegram 官方上一项／下一项在 GIF、普通短视频和图片之间切换。
7. 比较节点 ID，确认节点被替换还是复用。
8. 对至少 3 个 GIF 和 3 个普通短视频重复。
9. 不查看或记录 URL、文件名和 Telegram 私有对象。

### 5.2 PiP

1. 打开允许 PiP 的普通视频。
2. 清空记录器。
3. 通过浏览器或 Telegram 公开 UI 进入 PiP。
4. 记录 `enterpictureinpicture` 与 `document.pictureInPictureElement`。
5. 在 PiP 内播放、暂停和等待数秒。
6. 退出 PiP，记录 `leavepictureinpicture`。
7. 记录退出后原节点是否仍连接、是否复用、播放状态和当前时间是否连续。
8. 重复 3 次。

### 5.3 系统全屏

1. 打开普通视频。
2. 清空记录器。
3. 通过 Telegram 或浏览器公开 UI 进入全屏。
4. 记录 `fullscreenchange` 和 `document.fullscreenElement`。
5. 在全屏内播放、暂停和切换控制。
6. 退出全屏。
7. 记录退出后节点身份、连接状态和播放状态。
8. 重复 3 次。

### 5.4 网络断开与恢复

每类媒体分别执行：

```text
已加载图片
正在加载图片
已缓冲视频
正在缓冲视频
```

步骤：

1. 使用 Chrome DevTools Network 的 Offline 模式，不关闭页面。
2. 在断网前清空事件记录。
3. 切换 Offline，记录 `offline`、`navigator.onLine` 和媒体事件。
4. 等待至少 10 秒，观察 Telegram 是否自行重试或替换节点。
5. 恢复 Online，记录 `online` 后的全部媒体事件。
6. 等待媒体稳定或明确失败。
7. 每个场景重复 3 次。

`navigator.onLine` 只可用作浏览器报告的在线／离线提示：

- 可以证明浏览器当时报告的连接状态；
- 不能证明 Telegram 服务可访问；
- 不能证明媒体 CDN 可访问；
- 不能证明当前媒体请求成功；
- 不能证明缓存资源仍可播放；
- 不能单独作为“恢复播放成功”证据。

### 5.5 图片错误

优先通过 DevTools Request Blocking 阻止当前测试图片域名或具体请求，不修改 Telegram 页面代码。

1. 打开尚未加载完成的普通图片。
2. 阻止请求。
3. 记录是否出现 `error`。
4. 记录节点是否随后被替换。
5. 解除阻止，观察 Telegram 是否重试以及事件序列。
6. 重复 3 次。

### 5.6 视频错误与缓冲

1. 打开普通视频。
2. 分别使用 Offline、Slow 3G 和 Request Blocking。
3. 记录 `waiting`、`stalled`、`suspend`、`abort`、`emptied`、`error`。
4. `error` 出现时记录 `video.error.code`。
5. 恢复网络，观察节点复用、节点替换和 Telegram 重试。
6. 每类条件重复 3 次。

### 5.7 自动播放拒绝

1. 在 Chrome 网站设置中阻止自动播放，或使用无用户手势的新会话条件。
2. 打开普通视频并调用当前插件自动播放路径。
3. 在控制台单独记录 `video.play()` Promise 的拒绝对象名称和消息类别，但不记录媒体地址。
4. 确认是否存在 `playing`、`pause`、`waiting` 或 `error`。
5. 用户点击视频后再次播放。
6. 记录恢复后的事件顺序。
7. 重复 3 次。

## 6. 真实事件顺序

当前未执行真实页面观察，因此本节没有已确认事件顺序。

实际执行后必须按以下格式追加，不得把预期顺序写成结果：

```text
场景：
样本编号：
媒体类别：
节点是否复用：
事件顺序：
最终节点状态：
是否成功复现：
异常或差异：
```

待记录场景：

| 场景 | 已确认事件顺序 | 复现次数 |
|---|---|---:|
| GIF 初次打开 | 未观察 | 0 |
| GIF 第二次循环 | 未观察 | 0 |
| GIF 切换到普通视频 | 未观察 | 0 |
| 普通短视频自然结束 | 未观察 | 0 |
| 进入／退出 PiP | 未观察 | 0 |
| 进入／退出系统全屏 | 未观察 | 0 |
| 已加载图片断网／恢复 | 未观察 | 0 |
| 正在加载图片断网／恢复 | 未观察 | 0 |
| 已缓冲视频断网／恢复 | 未观察 | 0 |
| 正在缓冲视频断网／恢复 | 未观察 | 0 |
| 图片请求失败／恢复 | 未观察 | 0 |
| 视频请求失败／恢复 | 未观察 | 0 |
| 自动播放拒绝／用户恢复 | 未观察 | 0 |

## 7. GIF 与循环媒体研究结果

### 7.1 真实观察

```text
GIF 使用 img、video 或其他公开 DOM：未确认
tagName：未确认
loop：未确认
autoplay：未确认
muted：未确认
duration：未确认
readyState：未确认
ended 是否触发：未确认
timeupdate：未确认
playing：未确认
节点是否复用：未确认
普通短视频与 GIF 的公开差异：未确认
```

### 7.2 可验证候选证据

以下只能作为待验证候选：

- `tagName`；
- `video.loop`；
- `video.autoplay`；
- `video.muted`；
- `duration` 是否有限且稳定；
- `ended` 是否在完整播放后出现；
- `timeupdate` 是否跨越循环边界；
- 节点 ID 是否变化；
- `readyState` 和 `playing` 是否能证明媒体已进入可播放状态。

单独一个属性不足以命名媒体为“GIF”。正式实现更安全的内部分类名称应为“循环媒体”，除非真实页面能够证明稳定的 GIF 公开特征。

### 7.3 不可靠证据

- URL 扩展名；
- Blob URL 内容；
- 文件名；
- 消息文字中的“GIF”；
- 随机或压缩类名；
- Telegram 内部媒体类型对象；
- webpack 模块；
- IndexedDB；
- 只观察一次得到的属性组合。

## 8. PiP 与系统全屏研究结果

### 8.1 PiP

```text
enterpictureinpicture：未观察
leavepictureinpicture：未观察
pictureInPictureElement：未观察
Telegram 是否使用标准 API：未确认
退出后节点身份：未确认
退出后播放状态：未确认
```

只有实际事件和 `document.pictureInPictureElement` 一致时，才能确认标准 PiP API 路径。

### 8.2 系统全屏

```text
fullscreenchange：未观察
fullscreenElement：未观察
Telegram 是否使用标准 API：未确认
退出后节点身份：未确认
退出后播放状态：未确认
```

如果 Telegram 使用 CSS 模拟全屏而没有标准 `fullscreenchange`，应另行记录公开 DOM 变化，但不能把 CSS 大尺寸模式称为系统全屏。

## 9. 网络、错误与自动播放研究结果

### 9.1 网络断开与恢复

```text
offline：未观察
online：未观察
已加载图片：未观察
正在加载图片：未观察
已缓冲视频：未观察
正在缓冲视频：未观察
Telegram 自身重试：未观察
恢复后的事件序列：未观察
```

### 9.2 错误与等待事件

| 证据 | 当前 Web K 结果 |
|---|---|
| 图片 `error` | 未观察 |
| 视频 `error` | 未观察 |
| `video.error.code` | 未观察 |
| `stalled` | 未观察 |
| `waiting` | 未观察 |
| `abort` | 未观察 |
| `emptied` | 未观察 |
| `suspend` | 未观察 |
| `play()` Promise 拒绝 | 未观察 |
| 用户手势后恢复播放 | 未观察 |

### 9.3 建议的证据分类

以下是待真实页面验证的实现判定规则，不是当前观察结果。

#### 已确认失败

可接受候选证据：

- 图片当前节点触发 `error`，节点仍是活动媒体；
- 视频当前节点触发 `error`，并存在 `video.error.code`；
- `play()` 拒绝为明确不支持媒体格式，而不是用户手势限制；
- Telegram 已替换为错误占位，但必须有稳定公开 DOM 证据。

单独的 `waiting`、`stalled`、`suspend` 或 `navigator.onLine === false` 不足以定义失败。

#### 暂时等待

可接受候选证据：

- `waiting` 或 `stalled` 出现；
- 当前节点仍连接且仍是活动媒体；
- `video.error` 不存在；
- 仍可能出现后续 `playing`／`canplay`；
- 等待必须有时间上限，但超时后应暂停并提示，而不是自动跳过。

#### 浏览器自动播放限制

候选判定：

- 插件调用的 `play()` Promise 拒绝；
- 拒绝类型明确属于用户手势或权限限制；
- 当前节点无 `video.error`；
- 用户可信点击后能够恢复 `playing`。

不得把所有 `play()` 拒绝统一归类为自动播放限制。

#### 用户主动暂停

`pause` 事件本身不能证明用户意图。正式实现至少需要结合：

- 当前节点未结束、无媒体错误；
- 不是插件主动调用 `pause()`；
- 不是进入 PiP／全屏、页面失焦、节点替换或网络切换造成的状态变化；
- 附近存在用户可信输入事件，或 Telegram 公开播放控件的用户操作证据。

证据不足时应归类为“暂停状态待用户处理”，不要声称“用户主动暂停”。

#### 节点已失效

候选判定：

- `media.isConnected === false`；
- 当前活动媒体已切换到另一节点；
- MutationObserver 观察到旧节点被移除；
- 查看器已经关闭；
- 当前会话或序列 ID 已变化。

旧节点后续触发的事件必须被忽略。

## 10. 可用于正式实现的公开证据

当前只有以下证据完成了仓库静态确认，尚未完成真实页面稳定性确认：

- `HTMLImageElement`／`HTMLVideoElement` 类型；
- `complete`、`naturalWidth`；
- `readyState`、`videoWidth`、`videoHeight`；
- `loop`；
- `loadedmetadata`、`loadeddata`、`canplay`、`playing`、`ended`、`error`；
- 节点连接状态；
- 标准 PiP、Fullscreen 和 online／offline API 可作为研究入口。

正式实现前仍需证明：

- 这些证据在真实 Web K 中能够稳定命中；
- 节点替换时旧事件不会污染新会话；
- 事件组合能够区分失败、等待和自动播放限制；
- 至少 3 次复现结果一致，或已记录不一致原因。

## 11. 不可靠证据

以下证据不得用于正式分类或自动导航决定：

- 完整或部分媒体 URL；
- 文件名、扩展名和聊天文本；
- Telegram 私有运行时对象；
- webpack 模块；
- IndexedDB；
- 单一随机类名；
- 仅根据媒体尺寸推断 GIF；
- 仅根据 `muted` 或 `autoplay` 推断 GIF；
- 仅根据 `navigator.onLine` 推断媒体可用性；
- 仅根据事件长时间未出现定义失败；
- 旧节点在断开后触发的延迟事件；
- 单次复现结果。

## 12. 建议的 P1-05 产品规则

以下建议为保守候选规则，必须在真实页面证据完成后冻结。

1. 产品内部优先使用“循环媒体”而不是“GIF”作为技术分类。
2. 如果当前活动节点为 `HTMLVideoElement` 且真实页面稳定确认 `loop === true`：
   - 不等待 `ended`；
   - 在第一次 `playing` 或可确认成功显示后，按图片停留时间计时；
   - 悬停、交互、页面失焦、PiP、系统全屏、网络暂停和错误状态都暂停计时；
   - 计时结束后按当前浏览方向切换。
3. 如果当前节点为 `HTMLVideoElement` 且 `loop === false`：
   - 普通情况下等待 `ended`；
   - `waiting`／`stalled` 只进入等待，不自动切换；
   - 已确认失败时暂停连续浏览，不自动跳过。
4. 如果 GIF 在真实 Web K 中表现为 `HTMLImageElement`，且没有稳定公开动画属性：
   - 按图片策略处理；
   - 不根据 URL 或文本猜测其为 GIF。
5. 如果循环媒体证据不足或相互冲突：
   - 保持 Telegram 原行为；
   - 暂停自动切换；
   - 提示用户手动处理。
6. 节点替换后必须重新分类，旧节点的 timer 和事件回调全部失效。
7. 不对循环次数做推测，不解析媒体文件内容，不读取网络响应。

## 13. 建议的 P1-06 状态机

以下状态机为设计候选，不代表已经通过真实页面验证。

### 13.1 状态

```text
DETACHED             未发现有效活动媒体
LOADING              已发现节点，尚未确认成功显示
READY                媒体已成功显示，可等待调度
PLAYING              视频正在播放
WAITING              暂时缓冲或等待恢复
USER_ACTION_REQUIRED 自动播放被限制或暂停意图不明
PIP_SUSPENDED         标准 PiP 活动，自动切换暂停
FULLSCREEN_SUSPENDED  标准系统全屏活动，自动切换暂停
OFFLINE_SUSPENDED     浏览器报告离线，自动切换暂停
FAILED                当前媒体已确认失败
INVALIDATED           节点已断开、被替换或会话结束
```

### 13.2 关键转换

```text
DETACHED -> LOADING
发现新的活动 img／video

LOADING -> READY
图片 load 且 naturalWidth > 0
视频 loadedmetadata／loadeddata／canplay 且节点仍有效

READY -> PLAYING
视频 playing

PLAYING -> WAITING
waiting／stalled，且无 error

WAITING -> PLAYING
playing

任意有效状态 -> PIP_SUSPENDED
enterpictureinpicture 且 pictureInPictureElement 为当前节点

PIP_SUSPENDED -> 重新评估当前节点
leavepictureinpicture

任意有效状态 -> FULLSCREEN_SUSPENDED
fullscreenchange 且 fullscreenElement 为当前媒体或其公开容器

FULLSCREEN_SUSPENDED -> 重新评估当前节点
fullscreenchange 且 fullscreenElement 为空

任意有效状态 -> OFFLINE_SUSPENDED
offline

OFFLINE_SUSPENDED -> 重新评估当前节点
online；不得立即自动导航

LOADING／READY／PLAYING／WAITING -> FAILED
当前节点明确 error，或其他经验证的不可恢复证据

任意状态 -> INVALIDATED
节点断开、活动节点替换、查看器关闭或会话 ID 变化
```

### 13.3 优先级

从高到低：

```text
INVALIDATED
FAILED
PIP_SUSPENDED／FULLSCREEN_SUSPENDED／OFFLINE_SUSPENDED
USER_ACTION_REQUIRED
WAITING
PLAYING／READY／LOADING
```

状态冲突时采用更高优先级，自动行为全部停止。

### 13.4 恢复原则

- 退出 PiP、全屏或恢复在线后只重新评估当前媒体；
- 不立即跳到下一项；
- 不自动清除已确认失败；
- 用户点击播放成功并出现 `playing` 后，可从自动播放限制状态恢复；
- 用户手动切换到新媒体后创建新节点会话；
- 所有恢复都必须验证当前节点、查看器和序列 ID。

## 14. 成功复现次数

当前真实页面复现次数：

```text
总成功复现：0
总失败复现：0
未执行场景：全部
```

完成条件：

- 每个核心场景至少 3 次；
- GIF 与普通短视频至少各 3 个样本；
- 事件顺序存在差异时记录浏览器条件、节点是否替换和最终结果；
- 所有输出完成脱敏检查。

## 15. 未能复现的场景

由于当前执行环境没有可控制的已登录 Telegram Web K 页面，以下全部未执行：

- GIF DOM 类型和循环事件；
- 普通短视频对照；
- 节点复用与替换；
- PiP；
- 系统全屏；
- 图片断网与恢复；
- 视频断网与恢复；
- Telegram 自身重试；
- 图片错误；
- 视频错误与错误码；
- `waiting`、`stalled`、`abort`、`emptied`、`suspend`；
- 自动播放拒绝；
- 用户手势恢复播放。

## 16. 仍需用户确认的问题

真实页面证据完成后，仍需确认以下产品决策：

1. 如果 Web K 无法稳定区分 GIF 与其他循环视频，UI 是否统一显示“循环媒体”。
2. 循环媒体默认停留时间是否直接复用图片时间，还是需要独立设置。
3. 退出 PiP／全屏后，是否只恢复到“暂停等待用户继续”，还是在媒体仍播放时自动恢复调度。
4. 网络恢复后，用户是否必须手动点击“继续”，还是媒体成功恢复 `playing`／`load` 后自动恢复倒计时。
5. `waiting`／`stalled` 持续多久后只提示“等待超时”，但仍不定义为媒体失败。
6. 自动播放拒绝后，用户点击媒体恢复播放是否自动解除暂停。
7. 发生 `emptied` 后节点仍复用时，是进入重新加载，还是立即视为节点已失效；需由真实事件序列决定。

## 17. 风险与安全降级方案

### 17.1 主要风险

- Telegram Web K 更新 DOM 或改变节点生命周期；
- GIF 与普通短视频使用相同 `video` 结构，无法公开区分；
- 视频节点复用导致旧状态残留；
- PiP／全屏退出时事件与节点替换竞态；
- `waiting`、`stalled` 和 `suspend` 在不同网络条件下不稳定；
- `online` 出现时实际媒体 CDN 仍不可访问；
- `play()` 拒绝原因被错误归类；
- 旧节点延迟事件误操作新媒体；
- 自动暂停逻辑与 Telegram 官方播放控制争夺状态。

### 17.2 安全降级

证据不足或状态冲突时必须：

1. 暂停插件自动切换；
2. 保持 Telegram 原生播放、导航和关闭可用；
3. 不自动跳过失败媒体；
4. 不循环点击；
5. 不主动重载媒体；
6. 不改变 Telegram 的 `loop`、`muted`、`autoplay` 或播放速率；
7. 不根据 URL、文件名或私有状态猜测类型；
8. 清理当前 timer、poll、事件监听和旧序列；
9. 显示简短、可操作的状态提示；
10. 用户手动处理后再重新评估当前媒体。

## 18. 完成门禁

本研究 Draft PR 只有在以下条件全部满足后才能标记 Ready：

- 真实环境信息填写完整；
- 所有核心场景至少完成 3 次复现；
- 真实事件顺序写入本文件；
- GIF 与普通短视频的公开差异得到确认，或明确证明无法稳定区分；
- PiP、全屏、网络、错误和自动播放证据完成；
- 已确认失败／暂时等待／自动播放限制／用户暂停／节点失效的判定规则有真实样本支持；
- 文档脱敏审查通过；
- PR 差异仍只有本文件；
- 未修改功能代码、userscript、构建、CI、package、Web A 或桌面源码。

在这些门禁完成前：

```text
PR 必须保持 Draft
P1-05 和 P1-06 不得引用本文件为“已完成真实页面研究”
不得合并
```
