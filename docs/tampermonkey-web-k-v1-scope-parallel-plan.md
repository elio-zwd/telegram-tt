# Telegram Web K V1 范围冻结与并行开发计划

## 1. 结论

Telegram Web K 油猴插件的 V1 定义为：

> 在现有连续浏览、关闭定位和正反向浏览基础上，完成纯浏览体验闭环；不把 V1 扩展成自动保存、下载管理器、频道历史中心或动态历史加载器。

当前稳定基线：

```text
分支：codex/tampermonkey-media-continuity
HEAD：a68a9007a5ec86716fb0ea3db243fe99dab9a399
版本：0.4.0-k6
已完成：P0 模块化、P1-01 正向和反向连续浏览
```

本计划根据 2026-08-01 的产品确认冻结：

1. V1 尽量覆盖原《Telegram TT 二次开发功能定义》的浏览体验，但明确排除自动保存；
2. 媒体类型筛选第一版只提供“图片和视频、仅图片、仅视频”，GIF 策略独立实施；
3. 单项媒体第一次被确认加载或播放失败时立即暂停连续浏览，不自动跳过；
4. 预加载下一项和动态加载更多均移出 V1，后续只做独立可行性实验；
5. V1 只有全局设置，不增加频道、群组或话题独立设置。

当一般范围与具体选择冲突时，以具体选择为准。因此“尽量覆盖原 MVP”不包含自动保存、预加载、动态加载和频道级状态。

## 2. V1 已完成能力

- 连续浏览开关；
- 图片加载成功后定时切换；
- 普通视频 `ended` 后自动切换；
- 暂停、继续、上一项和下一项；
- Telegram 官方导航和方向键切换跟踪；
- 正向和反向自动连续浏览；
- 队列开头或末尾安全停止；
- 鼠标悬停、页面失焦、缩放和交互暂停；
- 相册按 Telegram 原生顺序浏览；
- 关闭查看器后定位最后成功媒体消息；
- Shadow DOM 控制条；
- 图片时长预设值；
- 设置本地持久化和损坏数据安全回退；
- 脱敏调试 API；
- Web K 单文件 userscript 构建和双平台静态门禁。

## 3. V1 剩余必做能力

### P1-02 媒体类型筛选

提供三个互斥模式：

```text
图片和视频（默认）
仅图片
仅视频
```

规则：

- 只影响自动连续浏览；
- 用户手动上一项、下一项和方向键仍允许进入任何 Telegram 可访问媒体；
- 自动切换遇到不匹配媒体时，继续沿当前 `browseDirection` 有界跳过；
- 每次自动筛选序列必须有最大跳过次数、总超时和 `sequenceId`；
- 到达当前可见队列边界后停止，不循环、不加载更多历史；
- 无法可靠判断媒体类型时暂停并提示，不猜测；
- 本 PR 不新增 GIF 独立选项。

建议分支：

```text
feat/tampermonkey-web-k-media-filter
```

建议 PR 标题：

```text
feat: 支持 Web K 媒体类型筛选
```

### P1-03 键盘快捷键

V1 增加：

```text
Space：暂停或继续
A：开启或关闭连续浏览
```

现有行为继续保持：

```text
ArrowLeft：Telegram 上一项
ArrowRight：Telegram 下一项
Esc：Telegram 关闭查看器
```

规则：

- 输入框、文本域、可编辑区域、组合输入和修饰键场景不得触发；
- 不拦截 Telegram 已有方向键和 Esc 默认行为；
- 不新增 `D`，因为 V1 不包含自动保存；
- 快捷键只调用 ViewerSession 已有公开方法；
- 不复制媒体调度、暂停或导航状态。

建议分支：

```text
feat/tampermonkey-web-k-shortcuts
```

建议 PR 标题：

```text
feat: 增加 Web K 连续浏览快捷键
```

### P1-04 自定义图片停留时间

现有预设值继续保留：

```text
2、3、5、8、10、15、30 秒
```

新增：

- 自定义秒数输入；
- 建议有效范围 `1–300` 秒；
- 允许一位小数时，内部统一转换为整数毫秒；
- 非法、空值、超范围值不保存；
- 修改后当前图片重新开始完整倒计时；
- 不改变连续浏览开关和暂停状态；
- 旧设置继续兼容。

建议分支：

```text
feat/tampermonkey-web-k-custom-photo-duration
```

### P1-05 GIF 与循环短视频策略

本任务必须建立在 P1-02 的媒体分类结果之上。

目标：

- 能可靠识别的 GIF 或循环短视频按独立策略处理；
- GIF 默认按图片停留时间切换；
- 普通短视频只播放一次后切换；
- 不允许循环媒体无限阻塞连续队列；
- 类型证据不足时保持 Telegram 原行为并暂停自动切换；
- 不通过媒体 URL、文件名文本或私有模块猜测类型。

建议分支：

```text
feat/tampermonkey-web-k-loop-media-policy
```

### P1-06 播放状态与失败暂停

统一处理：

- 画中画；
- 系统全屏；
- 浏览器离线；
- 已确认的图片加载失败；
- 已确认的视频播放失败；
- 自动播放被浏览器策略阻止。

冻结规则：

- 进入画中画或系统全屏后暂停自动切换；
- 离线时暂停，恢复在线后不立即自动跳走，重新评估当前媒体；
- 单项媒体第一次确认失败即暂停连续浏览；
- 不自动跳过失败项；
- 不维护“连续失败 3 项”阈值；
- 用户手动处理后可以继续；
- 失败状态不得阻止 Telegram 原始导航和关闭；
- `navigator.onLine` 只能作为暂停信号，不作为媒体必然可用的证据。

建议分支：

```text
feat/tampermonkey-web-k-playback-state
```

### P1-07 视频播放偏好

同一 PR 完成：

- 静音状态延续；
- 音量偏好；
- 播放倍速；
- Telegram 替换 video 节点后重新应用；
- 设置仅保存在当前全局 storage key；
- 自动播放被拦截时停留并提示，不跳过。

建议分支：

```text
feat/tampermonkey-web-k-playback-preferences
```

### P1-08 控制条与设置整理

P1 最后的整合 PR，只整理已经完成的设置：

- 连续浏览；
- 暂停；
- 上一项、下一项；
- 浏览方向；
- 媒体类型；
- 图片时间；
- 循环媒体策略；
- 视频播放偏好；
- 状态和错误提示。

不得为未实现的自动保存、预加载、频道设置或历史功能放置空按钮。

建议分支：

```text
feat/tampermonkey-web-k-settings-panel
```

## 4. 明确移出 V1

### 自动保存与下载

V1 不包含：

- 浏览时自动保存；
- 手动保存增强；
- 图片、视频或 GIF 保存类型开关；
- 文件大小限制；
- 重复媒体跳过；
- 下载队列；
- 下载历史；
- 文件名模板；
- 目录结构；
- 快捷键 `D`。

所有下载功能仍需先完成 Web K 下载能力可行性实验。

### 预加载与动态加载

V1 不包含：

- 插件主动预加载下一项；
- 预加载下两项；
- 接近边界时自动加载更多历史；
- 无限滚动；
- 自动点击加载更多；
- 枚举完整频道媒体。

后续只能使用独立 `research/` PR 验证有界方案。

### 状态、频道和历史

V1 不包含：

- 每频道独立设置；
- 群组或话题独立设置；
- 每频道上次位置；
- 重新进入频道恢复；
- 浏览历史；
- 只浏览未看过；
- 收藏或稍后查看；
- 数据导入导出；
- 本地统计。

### 高级队列

V1 不包含：

- 队列循环；
- 等待频道新媒体；
- 当前序号和完整总数；
- 随机浏览；
- 指定日期开始；
- 多频道播放列表。

## 5. 多 AI 并行原则

多个独立 ChatGPT 对话不能共享实时工作区，也不能互相控制。每个对话只负责一个分支、一个任务和一个 PR，通过 GitHub PR、Commit 和文档交接。

共同限制：

- 所有代码分支都从创建时最新的 `codex/tampermonkey-media-continuity` 建立；
- 开始修改前检查开放 PR；
- 同一时间只有一个对话可以修改 `viewer-session.js`、`settings.js`、`control-panel.js` 或 `platform/media-viewer.js`；
- 每个代码 PR 都会重新生成 `tampermonkey/telegram-media-continuity-web-k.user.js`；
- 生成文件冲突只能通过重基后重新构建解决；
- 合并前必须重基到最新稳定分支、重新构建、重新验收；
- 不强推、不覆盖其他分支、不复制其他对话未合并代码；
- 未经用户明确授权不得合并。

仓库现有 PR #3、#4、#5 是旧桌面源码路线，Base 为 `master`，不得作为 Web K 功能实现直接合并或复制。

## 6. 第一并行波次

规划 PR 合并后，允许同时启动三个对话。

### 对话 A：P1-02 媒体类型筛选代码

独占文件范围：

```text
tampermonkey/src/web-k/core/settings.js
tampermonkey/src/web-k/platform/media-viewer.js
tampermonkey/src/web-k/features/continuous-browsing/viewer-session.js
tampermonkey/src/web-k/features/control-panel/control-panel.js
```

以及该功能必要的：

```text
tampermonkey/src/web-k/version.js
tampermonkey/build/verify-web-k-userscript.mjs
tampermonkey/README.md
docs/tampermonkey-web-k-media-filter.md
tampermonkey/telegram-media-continuity-web-k.user.js
```

不得修改：

```text
tampermonkey/src/web-k/app.js
tampermonkey/src/web-k/core/lifecycle.js
tampermonkey/src/web-k/features/shortcuts/**
```

预留版本：`0.4.0-k7`。

### 对话 B：P1-03 快捷键代码

独占文件范围：

```text
tampermonkey/src/web-k/features/shortcuts/**
tampermonkey/src/web-k/app.js
```

以及该功能必要的：

```text
tampermonkey/src/web-k/version.js
tampermonkey/build/verify-web-k-userscript.mjs
tampermonkey/README.md
docs/tampermonkey-web-k-shortcuts.md
tampermonkey/telegram-media-continuity-web-k.user.js
```

禁止修改：

```text
tampermonkey/src/web-k/core/settings.js
tampermonkey/src/web-k/platform/media-viewer.js
tampermonkey/src/web-k/features/continuous-browsing/viewer-session.js
tampermonkey/src/web-k/features/control-panel/**
```

快捷键必须通过 `app.js` 组合现有 ViewerSession 公开方法。如果在不修改上述禁区文件的前提下无法安全实现，应停止代码写入，在 PR 或文档中提出最小前置接口，不得越界修改。

该 PR 依赖 P1-02 先合并。开发可并行，但最终合并顺序固定：

```text
P1-02 → P1-03
```

P1-03 在 P1-02 合并后必须重基、将版本调整为最新连续版本并重新生成 userscript。预留最终版本：`0.4.0-k8`。

### 对话 C：真实 Web K 媒体状态研究

只读研究并形成文档，不修改 userscript 和源码。

研究范围：

- GIF 在 Web K 中实际呈现为 `img`、`video` 还是其他公开 DOM；
- 循环短视频的 `loop`、`duration`、事件序列和节点替换行为；
- PiP 事件；
- Fullscreen API 事件；
- 网络断开和恢复时图片、视频事件；
- 图片 `error`、视频 `error`、自动播放拒绝的可区分证据；
- 哪些失败可以安全定义为“已确认失败”。

建议分支：

```text
research/tampermonkey-web-k-media-state-events
```

只允许新增：

```text
docs/tampermonkey-web-k-media-state-events-research.md
```

不得修改代码、生成 userscript、构建配置或路线文档。

## 7. 后续波次

### 第二波

等待 P1-02、P1-03 合并：

- P1-04 自定义图片时间；
- 继续只读验收第一波功能。

P1-04 独占 `settings.js`、`viewer-session.js` 和 `control-panel.js`，因此不与其他修改这些文件的代码任务并行。

### 第三波

根据媒体状态研究结论串行实施：

```text
P1-05 GIF/循环媒体策略
→ P1-06 PiP、全屏、网络和第一次失败暂停
```

两项都会修改媒体识别和 ViewerSession，不并行。

### 第四波

```text
P1-07 视频音量与倍速偏好
→ P1-08 控制条与设置整理
```

P1-08 是 V1 最终整合 PR，必须从最新稳定分支创建并执行完整浏览器回归。

## 8. V1 完成标准

以下全部完成后，才把 V1 标记为完成：

- P1-02～P1-08 均已合并；
- 媒体筛选三个模式真实可用；
- Space 和 A 快捷键不影响输入；
- 自定义图片时间可持久化；
- GIF 和循环短视频不会无限阻塞；
- PiP、系统全屏和离线时不会静默切换；
- 第一次已确认媒体失败会暂停而不是自动跳过；
- 音量、静音和倍速偏好稳定应用；
- 控制条在窄窗口不遮挡 Telegram 官方操作；
- 正向、反向、手动导航和关闭定位无回归；
- 所有设置仍使用 `tt.mediaContinuity.v1`；
- Web A 未修改；
- Linux、Windows 构建和静态门禁通过；
- 稳定合并 Commit 完成真实 Telegram Web K 浏览器验收。

## 9. V1 后续路线

V1 完成后再决定：

```text
V1.1：设置 Schema、频道状态、历史和恢复
V2：Web K 下载可行性实验及浏览时自动保存
Research：预加载、动态加载和高级队列
```

本计划不代表 V1.1、V2 或 Research 项目已经承诺实施。