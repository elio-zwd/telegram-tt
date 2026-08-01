# Telegram Web A 媒体续播油猴脚本

脚本路径：

```text
tampermonkey/telegram-media-continuity.user.js
```

适用页面：

```text
https://web.telegram.org/a/*
```

## 功能范围

第一版已经实现：

- 通过 DOM 特征识别 Telegram Web A 媒体查看器；
- 通过面积、可见性和视口中心距离识别当前活动图片或视频；
- 识别官方上一项、下一项和关闭控件；
- 图片加载完成后按 2、3、5、8、10、15 或 30 秒自动切换；
- 视频真正触发 `ended` 后自动切换；
- 鼠标悬停、图片拖动或缩放、标签页后台、浏览器失焦时暂停图片倒计时；
- 用户手动暂停视频后暂停连续浏览；
- 手动上一项或下一项后连续浏览保持开启；
- 到当前媒体末尾停止，不循环；
- 使用 Shadow DOM 隔离控制条样式；
- 保存连续浏览开关、图片停留时间和控制条折叠状态；
- 关闭查看器时保存可确认的频道、话题、消息和相册位置；
- 本地最多保留 100 条位置记录；
- 损坏、非法或版本不兼容的数据自动清理；
- 只有上次消息及媒体仍存在于当前 DOM 时，才显示“继续上次位置”；
- 页面结构无法可靠识别时安全失效，不阻断 Telegram 原有操作。

第一版不会：

- 调用 Telegram API、Bot API 或 MTProto；
- 读取 Telegram 私有状态、IndexedDB 或打包模块；
- 上传聊天内容、账号数据或媒体链接；
- 主动请求整段频道历史；
- 自动保存或批量下载媒体；
- 绕过频道保护、付费媒体或权限限制；
- 跨频道连续浏览。

## 安装

1. 浏览器安装 Tampermonkey。
2. 打开 `telegram-media-continuity.user.js` 的 GitHub Raw 页面。
3. Tampermonkey 弹出安装页后确认安装。
4. 打开或刷新 Telegram Web A。
5. 进入频道并打开一张普通图片或视频。
6. 媒体查看器识别成功后，底部会出现 `Telegram TT` 控制条。

脚本保持 `@grant none`，只使用页面 DOM、原生媒体事件和浏览器 `localStorage`。

## 控制条

- **连续浏览：开／关**：启用或关闭自动推进；
- **暂停／继续**：临时暂停或恢复当前连续浏览会话；
- **←／→**：触发 Telegram 官方上一项或下一项操作；
- **图片时间**：选择图片停留时间；
- **继续上次位置**：仅当历史消息媒体仍在当前页面 DOM 中、可以安全点击时显示；
- **×**：折叠为一个 `TT` 小按钮，折叠状态会持久化。

## 本地数据

存储键：

```text
tt.mediaContinuity.v1
```

数据包括：

- 连续浏览开关；
- 图片停留时间；
- 控制条折叠状态；
- 账号槽位标识；
- 频道标识；
- 话题标识；
- 消息标识；
- 相册媒体序号；
- 官方目标链接；
- 更新时间。

脚本不会把媒体资源地址写入持久化存储。媒体地址只在当前页面内用于判断媒体是否已经切换，页面关闭后不会保留。

## DOM 探测模式

在 Telegram Web A 地址后增加：

```text
?ttMediaDebug=1
```

也可以在浏览器控制台执行：

```js
TelegramMediaContinuity.enableDebug(true);
```

查看当前探测结果：

```js
TelegramMediaContinuity.inspect();
```

返回内容只包括：

- 标签名；
- `role`；
- `aria-label`；
- `title`；
- 类名；
- `data-*` 属性名称；
- 节点尺寸；
- 按钮和媒体数量；
- 是否确认处于频道上下文。

不会输出聊天正文或媒体资源地址。

其他调试命令：

```js
TelegramMediaContinuity.getSummary();
TelegramMediaContinuity.rescan();
TelegramMediaContinuity.resetStorage();
```

## 最小验收

### 1. 页面安全

1. 在普通聊天页面启用脚本。
2. 不打开媒体查看器。
3. 确认聊天、输入、滚动和导航正常。
4. 控制台没有脚本产生的未捕获异常。

### 2. 连续图片

1. 进入频道并打开图片。
2. 开启连续浏览。
3. 等待图片完整加载。
4. 默认约 5 秒后进入下一项。
5. 切换后重新开始完整倒计时。

### 3. 自动暂停

1. 图片倒计时期间把鼠标移入图片。
2. 等待超过设定时间，图片不能切换。
3. 鼠标移出后从完整时间重新计时。
4. 切换到其他浏览器标签页，不能在后台切换。
5. 返回 Telegram 后重新计时。
6. 缩放或拖动图片时不能自动切换。

### 4. 连续视频

1. 打开普通视频并开启连续浏览。
2. 视频结束后进入下一项。
3. 用户手动暂停视频后，控制条变为暂停状态。
4. 点击“继续”后恢复当前会话。
5. 浏览器拒绝自动播放时，停留并提示“点击视频继续播放”，不能直接跳过。

### 5. 手动切换

1. 连续浏览开启时点击官方下一项，或控制条的 `→`。
2. 连续浏览仍保持开启。
3. 新图片重新计时，新视频重新绑定结束事件。

### 6. 队列末尾

1. 到达当前可见媒体末尾。
2. 脚本停止连续浏览。
3. 不循环，不连续快速点击。
4. 状态显示“已到当前媒体末尾”。

### 7. 位置记录

1. 在频道 A 打开媒体并切换到另一个媒体。
2. 关闭媒体查看器。
3. 在同一频道重新打开其他媒体。
4. 原消息及其媒体仍在当前 DOM 时，显示“继续上次位置”。
5. 点击后关闭当前查看器并重新点击历史媒体。
6. 进入频道 B 时不能使用频道 A 的记录。
7. 可以识别话题标识时，不同话题互不串用。

### 8. 损坏数据

1. 在开发者工具中把 `tt.mediaContinuity.v1` 改成非法 JSON。
2. 刷新 Telegram Web A。
3. 脚本自动清理非法数据。
4. Telegram 原页面仍能正常使用。

### 9. 安全失效

1. 临时修改 Telegram DOM，使查看器或导航按钮无法识别。
2. 脚本不注入控制条，或显示结构变化提示。
3. 不拦截 Telegram 官方操作。
4. 不造成白屏或持续点击。

## 已知边界

- 油猴脚本无法像源码版一样调用 `openMediaViewer`、消息缓存选择器或动态媒体搜索动作。
- “继续上次位置”只在历史媒体仍存在于当前 DOM 时显示，避免跳转空白位置或调用不稳定的私有接口。
- 频道识别采用显式 `data-*` 类型信息或频道订阅者提示；无法确认频道类型时仍可连续浏览，但不会保存续播位置。
- Telegram Web A 页面结构更新后，可能需要根据 DOM 探测结果调整定位评分。
- 短循环视频不会等待不存在的 `ended` 事件，第一版提示用户手动切换。
- 没有主动加载完整频道历史，因此“末尾”表示 Telegram 当前查看器能够提供的末尾。

## 回退

出现异常时可先在 Tampermonkey 中停用脚本。脚本不修改 Telegram 代码和数据，停用后 Telegram Web A 会恢复原始行为。

需要清理本地记录时，在控制台执行：

```js
TelegramMediaContinuity.resetStorage();
```

# Telegram Web K 媒体续播油猴脚本（活动实现）

脚本路径：

```text
tampermonkey/telegram-media-continuity-web-k.user.js
```

适用页面：

```text
https://web.telegram.org/k/*
```

当前版本：`0.4.0-k10`。

## 开发真源

唯一开发真源：

```text
tampermonkey/src/web-k/
```

模块结构：

```text
core/       运行时、生命周期、清理、设置、日志
platform/   Web K DOM、媒体查看器、消息列表、官方导航
features/   连续浏览、关闭定位、控制面板、调试、快捷键
app.js      显式装配 core、platform 与 features
entry.js    仅创建并启动应用
version.js  版本单一来源
```

生成文件 `telegram-media-continuity-web-k.user.js` 只能通过构建产生，不得手工编辑。`legacy-main.js` 已删除，不得恢复。

## V1 当前能力

- 图片加载成功后按预设或自定义时间自动切换；
- 图片时间预设为 2、3、5、8、10、15、30 秒，自定义范围为 `1.0～300.0` 秒；
- 普通视频只在有效 `ended` 后自动切换；
- 循环媒体按 `HTMLVideoElement && loop === true` 识别，首次 `playing` 后复用图片时间倒计时；
- 正向、反向连续浏览；
- “图片和视频”“仅图片”“仅视频”自动筛选；
- 筛选最多跳过 50 项、总计最多 15 秒，使用独立 sequence ID；
- Space 暂停／继续，A 开启／关闭连续浏览；
- 输入框、文本域、下拉框、可编辑区域和输入法组合期间不触发快捷键；
- 页面失焦、全屏、标准 PiP、离线、缓冲、缩放、悬停和媒体交互期间暂停自动切换；
- `waiting`／`stalled` 不直接判定失败，持续约 15 秒后提示加载较慢；
- 自动播放 `NotAllowedError` 提示点击视频，不自动跳过；
- 图片明确 `error` 或视频有效 `error.code` 第一次出现时暂停，不自动跳过；
- 用户仍可使用 Telegram 原生导航、方向键或关闭；
- 全局保存普通视频静音、音量和倍速；
- 倍速支持 `0.5x / 1x / 1.25x / 1.5x / 2x`；
- Telegram 替换普通 video 节点后重新应用播放偏好；
- 循环媒体不应用普通视频偏好，不会被强制取消静音；
- 关闭查看器后定位最后真正成功显示的媒体消息；
- 相册定位整条来源消息；
- Shadow DOM 控制条、窄窗口换行、收起与展开；
- 脱敏调试 API 和单文件 Web K userscript 构建。

## 循环媒体策略

唯一正式判断条件：

```js
media instanceof HTMLVideoElement && media.loop === true
```

循环媒体仍属于视频。“仅图片”会跳过，“仅视频”会保留。循环媒体不等待通常不会出现的 `ended`；第一次进入 `playing` 后使用图片停留时间。节点替换、暂停、缓冲或系统状态变化会作废旧倒计时，恢复后从完整时间重新计时。

不根据 URL、文件名、扩展名、聊天文本、`muted`、`autoplay`、尺寸、时长、Telegram 私有对象、webpack 或 IndexedDB 猜测媒体类型。

## 暂停与恢复

会话独立记录用户、页面、全屏、PiP、离线、缓冲、自动播放限制、失败、节点失效、证据冲突、筛选、悬停、交互和缩放等暂停原因。解除一个原因不会错误解除其他原因。

- 进入全屏或真实标准 PiP 后暂停；退出后重新确认当前节点，不立即导航；
- 不移除 Telegram 默认的 `disablePictureInPicture`；
- 离线后暂停，在线后图片等待有效 `load` 或已确认可显示，视频等待 `canplay`／`playing`；
- `waiting`／`stalled` 只进入可恢复缓冲暂停；
- `NotAllowedError` 归类为需要用户操作；
- 确认失败后不自动点击下一项、不循环重试、不污染关闭定位目标；
- 新媒体节点、有效恢复或用户明确继续后按当前真实状态恢复。

## 图片与循环媒体停留时间

控制条保留以下预设：

```text
2、3、5、8、10、15、30 秒
```

选择“自定义…”后可输入 `1.0～300.0` 秒，支持整数或一位小数，并可点击“应用”或按 Enter 提交。空值、科学计数法、超过一位小数、超范围和非数字不会保存，也不会改变上一个有效值。

图片或循环媒体显示中修改时间，会从完整新时长重新计时；用户暂停、系统暂停或连续浏览关闭时只保存，不解除暂停；普通视频播放不受影响。

## 视频播放偏好

普通视频全局保存：

- 静音状态；
- 音量 `0～1`；
- 倍速 `0.5x / 1x / 1.25x / 1.5x / 2x`。

监听标准 `volumechange` 和 `ratechange`，Telegram 原生控件修改也会同步保存。程序应用设置时只在值变化时写入，避免反馈循环。循环媒体不套用普通视频偏好。

## 控制条

- **连续浏览：开／关**；
- **暂停／继续**；
- **←／→** Telegram 官方上一项／下一项；
- **正向／反向**；
- **图片和视频／仅图片／仅视频**；
- **图片与循环媒体时间／自定义**；
- **声音／静音**；
- **音量滑杆和百分比**；
- **视频倍速**；
- **状态与错误提示**；
- **×／TT** 收起与展开。

所有输入控件具有可访问性标签。控制条使用 Shadow DOM，窄窗口自动换行，不增加自动保存、下载、预加载、历史或频道设置入口。

## 本地设置

唯一 storage key：

```text
tt.mediaContinuity.v1
```

Web K 设置字段：

```text
continuousEnabled
photoDurationMs
browseDirection
mediaFilter
panelCollapsed
videoMuted
videoVolume
videoPlaybackRate
```

旧数据缺少新字段时安全回退。非法音量和倍速不会保存为运行值。顶层关闭定位记录等其他数据继续保留，不创建第二个 key。

## 键盘快捷键

```text
Space  暂停／继续连续浏览
A      开启／关闭连续浏览
```

`input`、`textarea`、`select`、可编辑区域、语义文本框、输入法组合、长按 repeat、Ctrl、Alt、Meta、不可见查看器或已销毁会话不触发。ArrowLeft、ArrowRight 和 Esc 保持 Telegram 原行为，不提供 D 或下载快捷键。

## 构建

在仓库根目录执行：

```powershell
npm ci
npm run build:tampermonkey:web-k
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
```

两次生成文件 SHA-256 必须一致。构建保持单个未压缩 IIFE、无动态 import、额外 chunk 或 sourcemap、metadata 只匹配 Web K、`@grant none`、版本来自 `version.js`。

## 调试 API 与隐私

公开接口保持：

```text
window.TelegramMediaContinuity.inspect
window.TelegramMediaContinuity.inspectMessageMapping
window.TelegramMediaContinuity.armCloseFlowProbe
window.TelegramMediaContinuity.getCloseFlowProbe
window.TelegramMediaContinuity.getLastLocationResult
window.TelegramMediaContinuity.cancelCloseFlowProbe
window.TelegramMediaContinuity.enableDebug
window.TelegramMediaContinuity.testPrevious
window.TelegramMediaContinuity.testNext
window.TelegramMediaContinuity.rescan
window.TelegramMediaContinuity.getSummary
```

不输出聊天正文、频道名称、用户名、原始 href 或完整媒体 URL，不读取 Telegram 私有模块或 IndexedDB。

## 验收边界

构建和 GitHub CI 不能替代真实 Telegram Web K 浏览器验收。循环媒体、全屏、默认 PiP 限制、离线恢复、缓冲、自动播放拒绝、失败暂停、视频偏好、窄窗口、相册、关闭定位和快速关闭重开完成真实页面回归前，综合 PR 保持 Draft。

详细说明：

```text
docs/tampermonkey-web-k-media-filter.md
docs/tampermonkey-web-k-shortcuts.md
docs/tampermonkey-web-k-v1-completion.md
```

媒体状态与事件依据来自 Draft PR #17 的 `docs/tampermonkey-web-k-media-state-events-research.md`，本综合分支不复制该研究分支文件。

## 回退

在 Tampermonkey 中停用脚本或回退到 `0.4.0-k9`。GitHub 可 revert 综合 PR。新设置字段可被旧版本安全忽略，不需要删除 `tt.mediaContinuity.v1`。
