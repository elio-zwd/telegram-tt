# Telegram Web K PR-M2 核心与平台层说明

## 1. 范围

PR-M2 只抽取共享核心和 Telegram Web K 平台适配层，不增加产品功能，不改变 `0.4.0-k5` 的 metadata、storage key、设置结构、DOM 选择器、事件参数、timeout/poll/retry 数值、`sequenceId`、控制条或关闭后定位时序。

后续仍只开发 Web K。Web A userscript 只读保留。

## 2. 当前源码结构

```text
tampermonkey/src/web-k/
├─ core/
│  ├─ runtime.js
│  ├─ lifecycle.js
│  ├─ cleanup.js
│  ├─ settings.js
│  └─ logger.js
├─ platform/
│  ├─ dom.js
│  ├─ media-viewer.js
│  ├─ message-list.js
│  └─ navigation.js
├─ entry.js
├─ legacy-main.js
└─ version.js
```

## 3. 模块职责

### `core/runtime.js`

保存页面级运行状态：当前查看器会话、页面 observer、扫描 timer、调试开关、来源目标、关闭探测、定位序列和定位 timer。

### `core/logger.js`

提供受 `runtime.debugEnabled` 控制的统一调试日志入口。

### `core/settings.js`

保留原 storage key `tt.mediaContinuity.v1`，负责设置校验、读取、写入和增量更新。设置字段与默认值未变化。

### `core/cleanup.js`

提供 listener、timer、interval 和 observer 的统一清理工具，不包含 Telegram DOM 选择器。

### `core/lifecycle.js`

负责初始化标记、调试开关、页面扫描调度、查看器会话创建/销毁、全局 MutationObserver、周期扫描以及 `pagehide`、`popstate`、`hashchange` 生命周期。

### `platform/dom.js`

提供元素可见性、脱敏元素描述、数字 `data-*` 属性读取、href 模式描述和可滚动祖先查找。

### `platform/media-viewer.js`

集中媒体查看器、媒体 root、活动图片/视频、媒体 fingerprint、成功显示和缩放状态识别。

### `platform/navigation.js`

集中官方上一项/下一项选择器、可用性、点击触发和方向映射。

### `platform/message-list.js`

集中消息 ID/peer ID、来源消息捕获、活动聊天滚动容器、相册映射、精确消息查找以及当前 DOM 中相邻媒体目标收集。

## 4. `legacy-main.js` 仍保留的内容

M2 不执行 M3 的功能模块拆分。以下业务继续留在组合层：

- `ControlPanel` Shadow DOM 控制条；
- `ViewerSession` 连续浏览业务；
- 图片倒计时与暂停策略；
- 视频 `ended` 和循环视频提示；
- 关闭后定位完整业务；
- 调试 API 与关闭流程探测。

M3 才会把这些内容迁入独立 `features/**` 并删除临时 legacy 组合层。

## 5. 构建与检查

```powershell
npm ci
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
```

`check:tampermonkey:web-k` 除原有 metadata、版本、IIFE、单文件、动态 import、额外 chunk 和 sourcemap 检查外，还会验证：

- M2 必需模块均存在；
- `core/**` 不包含 Telegram DOM 标记；
- `legacy-main.js` 不再直接查询正式平台选择器；
- Web K 查看器、导航和消息列表选择器集中在 `platform/**`；
- storage key 保持不变。

生成 userscript 只能通过构建更新，不得手工编辑。

## 6. 验收状态

GitHub CI 和真实 Telegram Web K 浏览器验收必须分别记录。当前远端开发对话不能控制真实浏览器，因此 PR 在重复 PR #9 的 22 项场景前保持 Draft，不得把静态检查或 CI 结果写成浏览器验收通过。
