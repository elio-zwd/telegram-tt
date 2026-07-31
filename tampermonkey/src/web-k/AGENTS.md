# Telegram Web K 模块源码规则

本文件适用于 `tampermonkey/src/web-k/**`，与仓库根目录和 `tampermonkey/AGENTS.md` 同时生效。上级文件第 14 节描述的是已完成的 PR-M1 构建基座；PR-M2 起，本目录的当前结构与迁移边界以本文件为准。

## 1. 当前 M2 结构

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

## 2. 职责边界

- `core/**` 只负责运行状态、日志、设置、清理和页面生命周期，不得包含 Telegram 专属 DOM 选择器。
- `platform/**` 集中 Web K 查看器、媒体、消息列表、相册映射和官方导航选择器及 DOM 行为。
- `legacy-main.js` 在 M2 期间是组合和业务保留层，继续承载 `ControlPanel`、`ViewerSession`、图片倒计时、视频 `ended`、关闭后定位和调试 API。
- `entry.js` 继续作为构建入口，不增加业务分支。
- `version.js` 继续是 userscript metadata 和调试摘要的版本唯一来源。

## 3. 行为冻结

PR-M2 只移动和接线，不改变：

- userscript metadata、`@match` 和 `@grant none`；
- storage key、设置字段、默认值和兼容读取；
- Telegram Web K DOM 选择器；
- timeout、poll、retry 和倒计时数值；
- listener 的 capture、passive、once 参数；
- `sequenceId` 防竞态与取消逻辑；
- 图片、视频、相册和消息映射；
- 关闭后定位顺序、居中、高亮和提示；
- Shadow DOM 控制条；
- `window.TelegramMediaContinuity` 名称、方法和返回结构。

发现等价性问题时，优先修复依赖传递或迁移遗漏，不顺手重写算法。

## 4. M3 边界

本阶段禁止：

- 把控制条、连续浏览、关闭定位或调试 API 继续拆入 `features/**`；
- 删除 `legacy-main.js`；
- 增加设置、快捷键、过滤、频道状态、历史或下载能力；
- 建立 Web A 适配器或跨平台框架；
- 新增第三方依赖、TypeScript 或测试文件。

上述功能拆分属于 PR-M3，必须等待 PR-M2 合并并完成真实浏览器验收后再开始。

## 5. 构建与验证

源码修改后必须重新生成：

```powershell
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
```

- 生成 userscript 禁止手工修改。
- 连续构建两次必须一致，不得出现额外 chunk、动态 import 或 sourcemap。
- `check:tampermonkey:web-k` 必须继续检查核心层边界、平台选择器集中、storage key、metadata、版本和单文件 IIFE。
- 构建和 CI 不能替代真实 Telegram Web K 浏览器验收。
- PR #9 的 22 项真实场景未全部复验前，PR-M2 保持 Draft，不得声称产品行为已经通过。
