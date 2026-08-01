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

当前版本：`0.4.0-k7`。

## 开发真源

生成 userscript 不再作为开发入口。唯一开发真源是：

```text
tampermonkey/src/web-k/
```

PR-M3 后的模块结构：

```text
core/       运行时、生命周期、清理、设置、日志
platform/   Web K DOM、媒体查看器、消息列表、官方导航
features/   连续浏览、关闭定位、控制面板、调试
app.js      显式装配 core、platform 与 features
entry.js    仅创建并启动应用
version.js  版本单一来源
```

`legacy-main.js` 已删除，不得恢复兼容转发壳。

## 当前能力

- 图片加载后按设置倒计时切换；
- 普通视频结束后自动切换；
- 自动连续浏览可选择正向（下一项）或反向（上一项）；
- 自动连续浏览可选择“图片和视频”“仅图片”或“仅视频”；
- 媒体筛选只作用于自动推进，TT、Telegram 官方控件和方向键不受限制；
- 自动模式遇到不匹配媒体时沿当前方向有界跳过，最多 50 项、总计最多 15 秒；
- 筛选序列在设置变化、手动导航、暂停和会话销毁时立即取消，旧 timer 不会串入新序列；
- 无法可靠判断媒体类型时暂停，不根据 URL、文件名、私有模块或 IndexedDB 猜测；
- 方向设置只影响自动切换，TT、Telegram 官方控件和方向键继续保持原物理方向；
- 切换方向或筛选后当前图片从完整停留时间重新倒计时，不立即导航，也不改变连续浏览状态；
- 正向到末尾、反向到开头时安全停止，不循环、不自动加载更多历史；
- 鼠标悬停、页面失焦、缩放和交互期间暂停；
- 协调 TT 控件、Telegram 官方左右控件和方向键切换；
- 关闭查看器后定位最后真正成功显示的媒体消息，跳过中的中间项目不会被确认为最终目标；
- 相册媒体定位整条来源消息；
- Shadow DOM 控制条；
- 脱敏调试和关闭流程探测。

## 控制条

- **连续浏览：开／关**：启用或关闭自动推进；
- **暂停／继续**：临时暂停或恢复当前连续浏览会话；
- **←／→**：始终触发 Telegram 官方上一项或下一项，不受自动方向和媒体筛选影响；
- **正向／反向**：设置下一次自动切换方向；
- **图片和视频／仅图片／仅视频**：设置自动连续浏览的媒体类型；
- **图片时间**：选择图片停留时间；
- **×**：折叠为一个 `TT` 小按钮，折叠状态会持久化。

## 本地设置

继续使用：

```text
tt.mediaContinuity.v1
```

Web K 设置包含：

- 连续浏览开关；
- 图片停留时间；
- 自动浏览方向 `forward` 或 `backward`；
- 自动媒体筛选 `all`、`images` 或 `videos`；
- 控制条折叠状态。

旧数据缺少筛选字段、筛选值非法、JSON 损坏或 `localStorage` 不可用时，媒体筛选安全回退为 `all`。旧数据的方向兼容规则保持不变，不创建第二个 storage key。

## 构建

在仓库根目录执行：

```powershell
npm ci
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
```

构建输出必须保持：

- 单个未压缩 IIFE userscript；
- 无动态 import、额外 chunk 或 sourcemap；
- metadata 唯一匹配 Web K；
- `@grant none`；
- 版本来自 `version.js`；
- storage key 继续为 `tt.mediaContinuity.v1`；
- `browseDirection` 默认值为 `forward`；
- `mediaFilter` 默认值为 `all`；
- 媒体筛选具备最大跳过次数、总超时和序列隔离；
- `legacy-main.js` 不存在；
- 四类 feature 模块存在；
- 生成文件与重新构建结果一致。

## 调试 API

控制台公开接口保持：

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

`getSummary().settings` 会自然包含当前 `browseDirection` 和 `mediaFilter`。调试输出不得包含聊天正文、频道名称、用户名、原始 href 或完整媒体 URL。

## 验收边界

构建和 CI 只能证明源码、产物和静态门禁成立，不能替代真实 Telegram Web K 浏览器验收。媒体筛选的正反向、相册、关闭定位、快速改筛选和窄窗口等场景完成真实页面回归前，功能 PR 保持 Draft。

详细设计、兼容规则和验收重点见：

```text
docs/tampermonkey-web-k-media-filter.md
```
