# Telegram Web K 媒体状态事件真实页面研究

## 0. 结论与研究状态

本文件为 P1-05「GIF／循环短视频策略」和 P1-06「播放状态与失败暂停」提供 Telegram Web K 真实页面证据。

2026-08-01，本地只读验收环境按本文既定脱敏记录方案完成 12 组场景研究。报告由真实 Windows Chrome、Tampermonkey 和已登录 Telegram Web K 页面产生，再由远端开发对话审校并写回本文件。

当前结论：

- **P1-05 已取得足以进入功能设计的真实样本依据**：本次 3 个 GIF 样本均使用 `HTMLVideoElement`，均为 `loop === true`；3 个普通短视频样本均为 `loop === false`。
- **P1-06 已取得全屏、网络、媒体错误、等待和自动播放限制的真实样本依据**。
- Telegram Web K 默认视频节点设置 `disablePictureInPicture === true`，因此默认页面路径不能进入 PiP；移除该公开限制属性后，Chrome 标准 PiP API 与事件可工作。该修改实验只证明浏览器标准能力，不代表 Telegram 默认提供 PiP。
- 媒体切换在本次 3/3 样本中使用节点替换，旧节点变为 `isConnected === false`。
- `abort`、`emptied`、`suspend` 在本轮报告中未观察到；不得据此设计必经转换。
- “用户主动暂停”没有独立完成“可信用户输入 + `pause`”对照实验，`pause` 事件仍不能单独证明用户意图。

因此本研究可以作为 P1-05 和 P1-06 的**设计依据**，但 PR 继续保持 Draft，等待产品规则确认和最终只读审校；本文件不代表功能已经实现。

研究状态：

```text
仓库前置检查：已完成
现有实现静态审计：已完成
真实 Web K 页面观察：已完成
GIF 样本：3
普通短视频样本：3
核心场景复现：每组 3 次
脱敏检查：通过
P1-05 设计依据：已具备
P1-06 设计依据：基本具备
用户主动暂停判定：仍需专项验证
功能实现：未开始
PR 状态：Draft
```

## 1. 证据来源与真实性边界

### 1.1 证据来源

真实观察由本地只读执行环境完成。远端开发对话没有直接控制该浏览器，而是基于用户提供的完整只读研究报告写回结果。

本文严格区分：

- **仓库静态事实**：从稳定分支源码读取；
- **本地真实观察**：报告中记录的实际 DOM 属性、事件顺序和复现次数；
- **设计建议**：基于静态事实与真实观察形成；
- **尚未确认**：报告未提供或未稳定复现的场景。

### 1.2 允许证据

只使用：

- Telegram Web K 公开页面 DOM；
- `HTMLImageElement`、`HTMLVideoElement`、`HTMLMediaElement` 的公开属性与事件；
- 浏览器标准 PiP、Fullscreen、`online`／`offline` API；
- 当前页面内存中的临时脱敏事件记录；
- 仓库现有 Web K userscript 的静态阅读。

### 1.3 禁止证据

未使用且正式实现不得依赖：

- 完整或部分媒体 URL；
- 文件名、扩展名和聊天文本；
- 频道名称、用户名、账号标识；
- Telegram 私有对象；
- webpack 模块；
- IndexedDB；
- Telegram API、Bot API 或 MTProto；
- 受保护媒体或权限绕过。

## 2. 仓库基线与真实研究环境

### 2.1 仓库基线

```text
仓库：https://github.com/elio-zwd/telegram-tt
范围冻结 PR：https://github.com/elio-zwd/telegram-tt/pull/15
稳定分支：codex/tampermonkey-media-continuity
实际稳定 Commit：b9b2b99fa7a30261cc38f2d6fcea808c5ba200b9
研究分支：research/tampermonkey-web-k-media-state-events
研究初始 Commit：54dfb2242b826c1ca7e1b9b6c6729706269333d4
```

PR #15 已合并，研究分支从其合并后的稳定 HEAD 创建。

### 2.2 真实执行环境

```text
操作系统：Microsoft Windows 10 专业版
Windows 版本：10.0.19045，Build 19045，x64
Chrome：150.0.7871.187，Official Build，x64
Tampermonkey：5.5.0_0
Telegram Web K：https://web.telegram.org/k/
userscript 版本标记：0.4.0-k6
研究开始：2026-08-01T23:52:04+08:00
研究结束：2026-08-01T23:58:01+08:00
```

本次实验通过 DOM／Console 只读脱敏记录器观察，没有修改 userscript 功能代码。

## 3. 仓库现有实现静态审计

### 3.1 当前媒体探测

`tampermonkey/src/web-k/platform/media-viewer.js`：

- 在 `.media-viewer-whole` 内查询 `img, video`；
- 通过公开 DOM 可见性、尺寸、中心位置和播放状态选择活动媒体；
- 图片成功显示条件为 `complete && naturalWidth > 0`；
- 视频成功显示候选条件为 `readyState >= HAVE_METADATA` 或视频尺寸已取得。

`mediaFingerprint()` 当前仍包含媒体地址尾部片段。该值没有持久化，但 P1-05／P1-06 不应把地址片段作为分类或状态证据。

### 3.2 当前图片事件

`ViewerSession.bindMedia()` 当前监听：

```text
load
error
```

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

尚未统一监听：

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

现有代码在 `video.loop === true` 时停止等待 `ended` 并提示手动切换；`play()` Promise 拒绝目前只显示“点击视频开始播放”，未区分拒绝原因。

## 4. 观察方法与脱敏 DOM 结构

### 4.1 记录字段

每个媒体节点仅记录：

```text
nodeId
tagName
isConnected
loop
autoplay
muted
duration
currentTime
readyState
networkState
ended
paused
errorCode
complete
naturalWidthPositive
pictureInPictureElement 是否为当前节点
fullscreenElement 是否为当前节点
navigator.onLine
事件类型与相对时间
```

### 4.2 禁止记录字段

```text
src
currentSrc
poster
href
alt
文件名
聊天文本
频道和账号信息
Telegram 私有对象
```

### 4.3 脱敏 DOM 示例

GIF／循环媒体：

```text
viewer: visible
media:
  nodeId: <local-sequence>
  tagName: VIDEO
  isConnected: true
  loop: true
  autoplay: true
  muted: true
  duration: <finite-seconds>
  readyState: 4
  networkState: 1
```

普通短视频：

```text
viewer: visible
media:
  nodeId: <local-sequence>
  tagName: VIDEO
  isConnected: true
  loop: false
  duration: <finite-seconds>
```

## 5. 真实观察步骤

每组核心场景执行 3 次：

1. 打开允许正常查看的普通频道媒体；
2. 启动脱敏事件记录器；
3. 清空上一场景记录；
4. 使用 Telegram 官方导航或浏览器公开能力触发场景；
5. 记录公开属性、事件顺序、节点连接状态和最终状态；
6. 不读取或输出任何媒体地址、文本和私有对象；
7. 场景结束后停止记录器；
8. 实验前后执行 Git 只读门禁，确认工作区不变。

网络场景使用 Chrome DevTools Offline／网络限制；错误场景使用请求阻断或资源不可用条件；自动播放场景使用无用户手势且非静音播放条件。

## 6. 真实事件顺序与复现次数

| 场景 | 已确认事件顺序或结果 | 复现 |
|---|---|---:|
| GIF／循环媒体播放 | `node-bound -> play -> playing -> timeupdate...`，到末端后 `currentTime` 回绕至 0，未出现 `ended` | 3/3 |
| 普通短视频自然结束 | `node-bound -> loadedmetadata -> canplay -> play -> playing -> timeupdate... -> ended` | 3/3 |
| GIF 与普通视频切换 | 旧节点移除、`isConnected=false`，新节点取得新 `nodeId` | 3/3 |
| Telegram 默认 PiP | 节点 `disablePictureInPicture=true`，`requestPictureInPicture()` 抛出 `InvalidStateError` | 3/3 |
| 移除 PiP 限制后的标准 API | `enterpictureinpicture`，退出时 `leavepictureinpicture`；元素引用相应设置／清空 | 3/3 |
| 系统全屏进入／退出 | `fullscreenchange`；进入时 `fullscreenElement` 为视频，退出时为 `null` | 3/3 |
| 已加载图片断网／恢复 | `offline -> 等待 -> online`；图片继续显示 | 3/3 |
| 正在加载图片断网／恢复 | `offline -> image error -> online -> 重新加载 -> load` | 3/3 |
| 已缓冲视频断网／恢复 | 缓冲范围内继续播放；边界后 `waiting/stalled`；恢复后 `online -> canplay -> playing` | 3/3 |
| 正在缓冲视频断网／恢复 | `waiting/stalled`，`networkState=2`；恢复后 `online -> canplay -> playing` | 3/3 |
| 图片请求失败／恢复 | `error`，有效尺寸为 0；解除阻断并重试后 `load` | 3/3 |
| 视频错误／恢复 | `waiting/stalled -> error(code=4)`；重新加载后 `loadedmetadata -> playing` | 3/3 |
| 自动播放拒绝／恢复 | `play()` 拒绝 `NotAllowedError`；静音或可信点击后 `play -> playing -> timeupdate` | 3/3 |

说明：

- 表中的 `3/3` 只表示本次指定环境和样本均复现，不代表 Telegram Web K 所有版本、所有媒体和所有浏览器的永久保证。
- `abort`、`emptied`、`suspend` 没有出现在报告记录的已确认序列中。
- 用户主动暂停没有独立专项对照记录。

## 7. GIF 与普通短视频

### 7.1 GIF／循环媒体真实属性

本次 3 个 GIF 样本均观察到：

```text
tagName: VIDEO
loop: true
autoplay: true
muted: true
duration: 有限浮点数
readyState: 4
networkState: 1
```

样本时长包括约 `6.04s` 和 `19.067s`。

播放达到媒体末端后：

- `timeupdate` 中 `currentTime` 从接近 `duration` 回绕至 0；
- 3/3 样本均未观察到 `ended`；
- 节点继续播放下一循环。

因此 P1-05 不得等待循环媒体的 `ended`。

### 7.2 普通短视频对照

本次 3 个普通短视频样本均观察到：

```text
tagName: VIDEO
loop: false
duration: 有限浮点数
```

自然播放结束时 3/3 均出现 `ended`，并进入 `paused === true`。

### 7.3 可使用的分类结论

在本次样本中，GIF 与普通短视频唯一一致的公开分类差异是：

```js
media instanceof HTMLVideoElement && media.loop === true
```

正式实现的技术名称应为“循环媒体”，而不是把所有 `loop === true` 节点宣称为文件格式意义上的 GIF。

不得使用：

- URL 或扩展名；
- 文件名和消息文本；
- `muted` 或 `autoplay` 单独判断；
- 媒体尺寸；
- Telegram 私有媒体对象。

## 8. 节点生命周期

GIF 与普通视频切换 3/3 均观察到：

- 旧 `HTMLVideoElement` 从 DOM 移除；
- 旧节点 `isConnected === false`；
- 新媒体使用新的 `HTMLVideoElement`；
- 新节点获得新的脱敏 `nodeId`。

正式实现必须：

1. 为每个活动节点建立独立会话／序列；
2. 节点断开后立即使 timer、poll 和旧回调失效；
3. 所有异步回调重新校验：
   - 当前节点；
   - `isConnected`；
   - 当前查看器；
   - 会话／序列 ID；
4. 不让旧节点的 `load`、`playing`、`ended` 或 `error` 影响新媒体。

本结论来自当前 3/3 切换样本。实现仍应防御未来版本可能出现的节点复用。

## 9. PiP 与系统全屏

### 9.1 Telegram 默认 PiP

实际 Web K 视频节点观察到：

```text
disablePictureInPicture: true
```

默认条件下直接调用 `requestPictureInPicture()`：

```text
InvalidStateError
原因：disablePictureInPicture 属性存在
```

因此：

- 当前 Telegram Web K 默认不允许该视频节点进入标准 PiP；
- P1-06 不应假设用户可以通过 Telegram 默认 UI 进入 PiP；
- 可以保留标准 PiP 事件的防御性监听，以兼容未来 Web K 变化、浏览器扩展或页面条件变化；
- 不得为了功能实现主动移除 `disablePictureInPicture`。

移除该属性后的实验只用于验证 Chrome 标准 API：

```text
enterpictureinpicture
document.pictureInPictureElement === targetVideo
leavepictureinpicture
document.pictureInPictureElement === null
```

该实验不属于 Telegram 默认产品行为。

### 9.2 系统全屏

全屏进入和退出 3/3 均通过标准 API：

```text
进入：fullscreenchange，document.fullscreenElement === 当前 VIDEO
退出：fullscreenchange，document.fullscreenElement === null
```

P1-06 可以可靠监听 `fullscreenchange`，进入系统全屏时暂停插件自动切换，退出后重新评估当前节点。

报告未单独记录退出全屏后的 `currentTime` 连续性，因此不能额外宣称播放时间一定连续。

## 10. 网络断开与恢复

### 10.1 `navigator.onLine` 的证据边界

`offline`／`online` 与 `navigator.onLine` 可以证明：

- 浏览器当时报告的网络连接状态；
- 可以作为自动切换的高优先级暂停／重新评估信号。

不能证明：

- Telegram 服务可访问；
- 媒体 CDN 可访问；
- 当前请求已成功；
- 缓存是否足够继续播放；
- 恢复在线后媒体已经可播放。

因此 `online` 后不得立即自动导航，也不得单凭 `navigator.onLine === true` 自动清除失败。

### 10.2 图片

已加载图片：

```text
offline -> 等待 -> online
```

图片仍保持显示。

正在加载图片：

```text
offline -> error -> online -> 重新发起加载 -> load
```

报告观察到恢复后的重新加载，但没有完整记录每次重试是否沿用原节点。实现应重新扫描活动节点并以节点身份为准。

### 10.3 视频

已缓冲视频在断网后可继续播放已缓冲区间；到达未缓冲边界后出现：

```text
waiting
stalled
networkState: 2
```

恢复网络后：

```text
online -> canplay -> playing
```

`waiting`／`stalled` 不是失败证据。只有出现当前节点 `error` 且 `video.error` 存在时才进入已确认失败。

## 11. 错误、等待、暂停与自动播放证据分类

### 11.1 已确认失败 `FAILED`

可接受证据：

- 当前活动图片节点触发 `error`，且有效尺寸为 0；
- 当前活动视频节点触发 `error`，且 `video.error.code` 存在；
- 当前节点被稳定公开错误占位替换，但需另有明确 DOM 证据。

本次视频不可用场景观察到：

```text
video.error.code = 4
MEDIA_ERR_SRC_NOT_SUPPORTED
```

失败后不自动跳过，连续浏览进入暂停并提示用户处理。

### 11.2 暂时等待 `WAITING`

证据组合：

- 当前视频触发 `waiting` 或 `stalled`；
- `video.error === null`；
- 当前节点仍连接且仍是活动节点；
- 后续仍可能出现 `canplay`／`playing`。

`waiting`、`stalled`、`suspend`、离线或一段时间没有进度，均不能单独定义永久失败。

等待可以有提示超时，但超时结果仍应是“暂停等待用户处理”，不是自动跳过。

### 11.3 浏览器自动播放限制 `USER_ACTION_REQUIRED`

本次 3/3 观察到：

- 非静音且无用户手势时，`play()` Promise 拒绝；
- 错误名称为 `NotAllowedError`；
- 当前节点没有媒体错误；
- 设置静音或可信用户点击后，播放恢复；
- 恢复序列为 `play -> playing -> timeupdate`。

只有明确 `NotAllowedError` 或同类用户手势／权限拒绝，且无媒体错误时，才能归类为自动播放限制。其他 `play()` 拒绝必须分别处理。

### 11.4 用户主动暂停 `USER_PAUSED`

本轮没有完成独立的“可信用户输入 -> `pause`”对照实验，因此：

- `pause` 事件本身不能证明用户主动暂停；
- `pause` 可能来自自然结束、节点替换、页面状态变化或 Telegram 内部操作；
- 当前只能归类为“暂停意图未确认”。

正式判定至少需要：

- 视频未 `ended`；
- 无 `video.error`；
- 节点仍有效；
- 不是插件主动调用；
- 附近存在可信 `pointerdown`／`click`／键盘事件，或用户操作公开播放控件的证据。

证据不足时进入 `USER_ACTION_REQUIRED` 或“暂停待用户处理”，不得声称用户主动暂停。

### 11.5 节点已失效 `INVALIDATED`

可接受证据：

- `media.isConnected === false`；
- 活动媒体已切换到新节点；
- 查看器关闭；
- 会话／序列 ID 变化。

旧节点后续事件必须忽略。

### 11.6 未观察事件

本轮没有报告稳定观察到：

```text
abort
emptied
suspend
```

正式状态机可以监听这些事件用于诊断，但不得把它们设计为必经路径或单独作为失败证据。

## 12. 可用于正式实现的公开证据

可以使用：

- `media instanceof HTMLImageElement`；
- `media instanceof HTMLVideoElement`；
- `video.loop`；
- `video.readyState`、`networkState`、`ended`、`paused`；
- `video.error?.code`；
- `img.complete`、`img.naturalWidth`；
- `load`、`error`；
- `loadedmetadata`、`canplay`、`playing`、`ended`；
- `waiting`、`stalled`；
- `play()` Promise 拒绝名称；
- `media.isConnected`；
- 当前活动节点身份；
- `document.fullscreenElement`；
- `document.pictureInPictureElement`；
- `navigator.onLine`，但仅作为浏览器网络提示；
- 当前查看器和会话／序列 ID。

## 13. 不可靠证据

不得使用：

- 完整或截断媒体 URL；
- 文件名、扩展名、聊天文字；
- Telegram 私有状态、webpack、IndexedDB；
- 单一随机类名；
- 只凭 `muted` 或 `autoplay` 判断循环媒体；
- 只凭尺寸或时长判断 GIF；
- 只凭 `navigator.onLine` 判断资源可用；
- 只凭 `waiting`、`stalled`、`suspend` 判断失败；
- 只凭 `pause` 判断用户意图；
- 旧节点断开后的延迟事件；
- 单次样本得出的永久结论。

## 14. 建议的 P1-05 产品规则

1. 技术和 UI 优先使用“循环媒体”，不要把公开 DOM 分类直接等同于文件格式 GIF。
2. 循环媒体判定：
   ```js
   media instanceof HTMLVideoElement && media.loop === true
   ```
3. 循环媒体不等待 `ended`。
4. 首次 `playing` 或其他成功显示证据出现后，按图片停留时间启动计时。
5. 计时必须在以下状态暂停：
   - 页面失焦；
   - 鼠标悬停或用户交互；
   - 系统全屏；
   - 标准 PiP（若未来可用）；
   - 浏览器离线；
   - `waiting`／`stalled`；
   - 自动播放限制；
   - 已确认失败；
   - 节点失效。
6. 普通视频 `loop === false` 时继续等待 `ended`。
7. 循环证据不足或冲突时暂停自动切换，保持 Telegram 原行为。
8. 媒体切换后重新分类，新节点重新开始完整调度。
9. 不解析媒体文件内容，不读取响应，不根据 URL 或文本猜测。
10. 循环媒体计时默认是否直接复用图片时间，需要用户确认。

## 15. 建议的 P1-06 状态机

### 15.1 状态

```text
DETACHED             未发现有效活动媒体
LOADING              已发现节点，尚未确认成功显示
READY                媒体已成功显示
PLAYING              视频正在播放
WAITING              暂时缓冲或等待恢复
USER_ACTION_REQUIRED 自动播放受限或暂停意图不明
PIP_SUSPENDED         标准 PiP 活动；当前 Web K 默认不可进入
FULLSCREEN_SUSPENDED  标准系统全屏活动
OFFLINE_SUSPENDED     浏览器报告离线
FAILED                当前媒体已确认失败
INVALIDATED           节点断开、被替换或会话结束
```

### 15.2 转换

```text
DETACHED -> LOADING
发现新的活动 img／video

LOADING -> READY
图片 load 且 naturalWidth > 0
视频 loadedmetadata／canplay 且节点仍有效

READY -> PLAYING
视频 playing

PLAYING -> WAITING
waiting／stalled，且无 video.error

WAITING -> PLAYING
canplay／playing

任意有效状态 -> USER_ACTION_REQUIRED
play() 以 NotAllowedError 拒绝，或 pause 意图无法确认

任意有效状态 -> PIP_SUSPENDED
enterpictureinpicture 且 pictureInPictureElement 为当前节点

PIP_SUSPENDED -> 重新评估
leavepictureinpicture

任意有效状态 -> FULLSCREEN_SUSPENDED
fullscreenchange 且 fullscreenElement 为当前媒体或其公开容器

FULLSCREEN_SUSPENDED -> 重新评估
fullscreenchange 且 fullscreenElement 为空

任意有效状态 -> OFFLINE_SUSPENDED
offline

OFFLINE_SUSPENDED -> 重新评估
online；不得直接自动导航

LOADING／READY／PLAYING／WAITING -> FAILED
当前节点 error 且满足图片或视频失败证据

任意状态 -> INVALIDATED
节点断开、活动节点替换、查看器关闭或会话 ID 变化
```

### 15.3 优先级

```text
INVALIDATED
FAILED
PIP_SUSPENDED／FULLSCREEN_SUSPENDED／OFFLINE_SUSPENDED
USER_ACTION_REQUIRED
WAITING
PLAYING／READY／LOADING
```

### 15.4 恢复规则

- 退出全屏、PiP 或恢复在线后只重新评估当前节点；
- 不立即自动导航；
- 不自动清除 `FAILED`；
- 用户可信操作后出现 `playing`，可解除自动播放限制；
- 节点变化时创建新会话，旧事件失效；
- 所有恢复都重新验证查看器、节点和序列 ID。

## 16. 未能复现或证据不足的场景

以下仍未形成充分证据：

1. `abort` 在 Web K 媒体查看器中的稳定触发条件；
2. `emptied` 在节点复用或重新加载中的真实序列；
3. `suspend` 的稳定语义；
4. 用户可信操作引发 `pause` 的独立对照；
5. Telegram 默认 PiP，因为页面明确禁用；
6. 退出 PiP／全屏后的播放时间连续性；
7. 图片和视频恢复重试时是否始终复用或替换节点；
8. Chrome 150 之外浏览器或未来 Web K 版本的一致性。

这些不足不阻止保守实现，但相关事件只能作为辅助信号，不能成为自动跳过或永久失败的唯一依据。

## 17. 仍需用户确认的问题

1. UI 是否统一使用“循环媒体”，而不是“GIF”。
2. 循环媒体默认是否直接复用图片停留时间。
3. 退出全屏后，媒体仍在播放时是否自动恢复调度，还是保持暂停等待用户继续。
4. 网络恢复并重新出现 `load`／`playing` 后，是否自动恢复倒计时，还是要求用户点击继续。
5. `waiting`／`stalled` 持续多久后显示“等待超时”。
6. 自动播放限制经可信点击恢复后，是否自动解除暂停。
7. 是否在 P1-06 实现前追加一次用户主动暂停专项研究。

## 18. 风险与安全降级

### 18.1 风险

- Telegram Web K 更新 DOM 或媒体节点策略；
- `loop === true` 在未来承载其他循环视频类型；
- 旧节点延迟事件污染新会话；
- 网络恢复和 Telegram 重试存在竞态；
- `waiting`／`stalled` 在不同缓存条件下顺序变化；
- `online` 发生时媒体 CDN 仍不可访问；
- `play()` 拒绝原因误分类；
- 暂停意图误判；
- 自动逻辑与 Telegram 官方播放控制争夺状态。

### 18.2 安全降级

证据不足或状态冲突时：

1. 暂停插件自动切换；
2. 不自动跳过失败项；
3. 不主动重载媒体；
4. 不移除 Telegram 的 PiP 限制；
5. 不改变 `loop`、`muted`、`autoplay` 或播放速率；
6. 保持 Telegram 原生播放、导航和关闭可用；
7. 清理 timer、poll、监听和旧序列；
8. 显示简短可操作提示；
9. 用户手动处理后重新评估；
10. 页面结构不匹配时安全失效。

## 19. 成功复现统计

```text
GIF／循环媒体样本：3
普通短视频样本：3
节点切换：3/3
默认 PiP 被禁用：3/3
移除限制后的标准 PiP：3/3
系统全屏：3/3
已加载图片断网／恢复：3/3
正在加载图片断网／恢复：3/3
已缓冲视频断网／恢复：3/3
正在缓冲视频断网／恢复：3/3
图片错误／恢复：3/3
视频错误／恢复：3/3
自动播放拒绝／恢复：3/3
用户主动暂停专项对照：0
abort／emptied／suspend 稳定序列：0
```

## 20. 只读 Git 门禁与修改范围

本地实验前后均确认：

```text
HEAD：54dfb2242b826c1ca7e1b9b6c6729706269333d4
git status --short：空
差异：
A docs/tampermonkey-web-k-media-state-events-research.md
```

本地实验未修改任何文件、未提交、未推送、未变基、未合并、未改变 PR 状态。

本研究 PR 只允许修改：

```text
docs/tampermonkey-web-k-media-state-events-research.md
```

禁止修改：

- `tampermonkey/src/**`；
- 生成 userscript；
- 构建配置；
- CI；
- package 文件；
- Web A；
- Telegram 桌面源码；
- 现有路线文档。

## 21. 完成与合并门禁

当前研究结果已经足以：

- 规划 P1-05 循环媒体实现；
- 规划 P1-06 全屏、离线、等待、失败和自动播放限制状态机；
- 明确节点替换和旧回调失效要求。

当前仍不得声称：

- P1-05 或 P1-06 功能已经实现；
- Telegram 默认支持 PiP；
- `pause` 一定代表用户主动暂停；
- `abort`、`emptied`、`suspend` 是稳定状态机路径；
- 本次 3/3 样本是跨版本永久契约。

PR 继续保持 Draft。标记 Ready 或合并前至少需要：

1. 用户确认第 17 节产品规则；
2. 决定是否追加用户主动暂停专项研究；
3. 重新核对 PR 差异仍只有本文件；
4. 未经用户授权不得合并。
