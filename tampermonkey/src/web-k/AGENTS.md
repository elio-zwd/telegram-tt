# Telegram Web K 模块源码规则

本文件适用于 `tampermonkey/src/web-k/**`，与仓库根目录和 `tampermonkey/AGENTS.md` 同时生效。PR-M3 完成后，本目录的模块源码是 Web K userscript 的唯一开发真源；生成文件不得手工修改。

## 1. 当前 M3 结构

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
├─ features/
│  ├─ continuous-browsing/
│  │  ├─ viewer-session.js
│  │  └─ index.js
│  ├─ close-position/
│  │  ├─ target-tracker.js
│  │  ├─ message-locator.js
│  │  └─ index.js
│  ├─ control-panel/
│  │  ├─ control-panel.js
│  │  └─ index.js
│  └─ debug/
│     ├─ debug-api.js
│     ├─ probes.js
│     └─ index.js
├─ app.js
├─ entry.js
└─ version.js
```

`legacy-main.js` 已删除，不得重新建立兼容转发壳。

## 2. 依赖方向

```text
core          platform
  \              /
   \            /
      features
         |
        app
         |
       entry
```

- `entry.js` 只允许创建并启动应用，不写业务分支。
- `app.js` 显式装配 lifecycle、platform 和四类 feature，不建立事件总线、服务容器或通用插件框架。
- `core/**` 不依赖 `platform/**` 或 `features/**`，不得出现 Telegram 专属 DOM 选择器。
- `platform/**` 集中 Web K 查看器、媒体、消息列表、相册映射和官方导航选择器。
- `features/**` 可以依赖 core 和 platform，但不得自行复制 Telegram 平台选择器。
- 不为 Web A 预留抽象，不建立跨客户端适配框架。

## 3. 功能模块边界

### 连续浏览

`features/continuous-browsing/**` 负责 `ViewerSession`、图片倒计时、视频 `ended`、悬停/失焦/缩放/交互暂停、导航超时、队列末尾和媒体资源清理。所有 Telegram 左右导航必须调用 `platform/navigation.js`。

### 关闭定位

`features/close-position/**` 负责来源消息捕获、pending/confirmed target、关闭快照、`sequenceId`、有界 poll、精确消息定位、居中、高亮和安全提示。消息与查看器 DOM 查询必须通过 platform 模块。

### 控制面板

`features/control-panel/**` 是纯 UI。只接收状态和回调，不查询 Telegram DOM，不直接调用 platform，不保存业务状态。

### 调试

`features/debug/**` 维护 `window.TelegramMediaContinuity` 公开 API、脱敏探测和可清理的关闭流程 probe。不得输出聊天正文、频道名称、用户名、原始 href 或完整媒体 URL。

## 4. 行为冻结

模块化和后续维护不得无意改变：

- userscript metadata、`@match https://web.telegram.org/k/*` 和 `@grant none`；
- 版本 `0.4.0-k5`，除非独立版本 PR 明确升级；
- storage key `tt.mediaContinuity.v1`、设置字段、默认值和旧数据兼容；
- Telegram DOM 选择器；
- timeout、poll、retry、倒计时和高亮时长；
- listener 的 capture、passive、once 参数；
- 图片、视频、相册目标映射和关闭后定位顺序；
- 控制条布局、文案和交互；
- 调试 API 名称、返回结构和脱敏边界；
- 单文件未压缩 IIFE，无动态 import、额外 chunk 或 sourcemap。

发现回归时优先检查依赖传递、清理时序和迁移遗漏，不顺手重写算法。

## 5. 后续新功能规则

- 一个产品能力一个独立 feature 目录或在既有 feature 内做最小扩展。
- Telegram DOM 能力先扩展 `platform/**` 的小接口，再由 feature 调用。
- UI 只发回调和渲染状态，不直接执行 Telegram 导航或消息定位。
- 不把所有变量塞入巨型全局对象；跨模块只传递必要参数或小型接口。
- 不新增第三方依赖、TypeScript 或测试文件，除非用户明确改变当前边界。
- Web A userscript 只读保留，后续功能只开发 Web K。

## 6. 构建与验证

源码修改后必须重新执行：

```powershell
npm ci
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
```

- 连续构建两次必须得到相同 SHA-256。
- `check:tampermonkey:web-k` 必须验证 M3 模块清单、legacy 删除、选择器边界、storage key、metadata、版本和单文件 IIFE。
- 生成 userscript 必须提交并与重新构建结果一致。
- 构建和 CI 不能替代真实 Telegram Web K 浏览器验收。
- 22 项真实浏览器回归完成前，结构变更 PR 保持 Draft，不得声称产品行为通过。

## 7. 自动化 CDP 调试流

AI/Agent 在对此目录的 Web K userscript 进行自动化测试与 UI 体验调试时，严格遵守 [docs/tampermonkey-web-k-browser-testing-guide.md](file:///M:/Windows/Telegram/docs/tampermonkey-web-k-browser-testing-guide.md)，使用本地 HTTP (`http://localhost:8888/`) 静态服务 + CDP 动态注入，实时读取 `window.TelegramMediaContinuity` 的 API 输出。

