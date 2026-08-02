# Tampermonkey 插件开发规则

本文件适用于 `tampermonkey/**`。同时遵守仓库根目录 `AGENTS.md`；当根规则主要面向 Telegram TT 桌面源码、与油猴脚本的技术形态不一致时，以本文件的目录级规则为准。

## 1. 产品与技术范围

- 后续油猴插件只开发 Telegram Web K：`https://web.telegram.org/k/*`。
- Web K 安装脚本：`tampermonkey/telegram-media-continuity-web-k.user.js`。
- 现有 Web A 脚本 `tampermonkey/telegram-media-continuity.user.js` 作为历史参考保留，不新增功能、不建立新适配器、不参与后续验收。
- 除非用户未来重新明确改变决定，任何新 PR 不得修改 Web A 脚本。
- 油猴源码使用原生 JavaScript、ES Module、浏览器 DOM API 和 Shadow DOM。
- 不把 Teact、SCSS Modules、GramJS、Global State 或桌面应用本地化规范强行套用于油猴脚本。
- 不新增第三方运行时依赖；构建工具优先复用仓库已有 Vite/Rollup 能力。
- 只修改当前需求必需的文件，不顺带格式化、迁移或重构无关代码。

## 2. 模块化架构边界

最终架构：

> Web K 共享核心 + Web K 平台适配器 + 独立功能模块 + 单文件构建产物。

- `tampermonkey/src/web-k/**` 是模块化完成后的开发源码真源。
- `core/**` 负责生命周期、运行状态、清理、日志和设置，不直接查询 Telegram 专属 DOM。
- `platform/**` 集中 Web K DOM 选择器、查看器、消息列表和官方导航行为。
- `features/**` 按产品能力拆分，功能模块不得自行散落 Telegram 选择器。
- `entry.js` 只负责装配和启动，不堆积业务逻辑。
- 最终用户安装产物仍为单个 `telegram-media-continuity-web-k.user.js`。
- 生成文件必须带有禁止手工修改说明；代码修改应发生在模块源码中，再通过构建重新生成。
- 不创建 Web A 适配器，不为了假想平台设计通用框架。
- 共用能力应先形成明确接口，再在独立基础 PR 中修改；不得在功能 PR 中临时大规模调整 core/platform。

## 3. 构建与生成文件

- 复用现有 Vite/Rollup，不新增不必要的打包依赖。
- 构建必须输出一个 IIFE userscript，不生成运行时动态 chunk。
- metadata 必须位于生成文件顶部，只包含 Web K `@match`。
- metadata 版本和调试 API 版本必须来自同一源码常量。
- 默认不压缩生成文件，便于审查和浏览器调试。
- 不提交 sourcemap，除非任务明确要求并完成隐私审查。
- 构建不得删除或覆盖 `tampermonkey/` 中无关文件。
- 生成文件继续提交仓库，保证用户可直接安装。
- 生成文件冲突不得手工拼接：从最新 Base 重基后重新构建。
- 重复构建应产生稳定结果；构建不稳定时不得合并。

## 4. Telegram 接入安全边界

- 不调用 Telegram API、Bot API 或 MTProto。
- 不要求用户提供 API ID、API Hash、Bot Token 或账号凭据。
- 不读取、枚举或调用 Telegram 的 webpack 私有模块、内部运行时对象或未公开函数。
- 不读取 Telegram IndexedDB、缓存数据库或本地认证数据。
- 不绕过受保护内容、付费媒体、频道权限、下载限制或 Telegram 安全控制。
- 页面结构不匹配时必须安全失效，不得导致白屏、阻断点击、持续滚动或破坏 Telegram 原功能。

## 5. 隐私与本地数据

- 不上传、收集或发送聊天内容、账号数据、频道信息或媒体地址。
- 调试日志不得输出聊天正文、频道名称、用户名、账号标识或完整媒体 URL。
- DOM 探测结果必须脱敏，只保留选择器命中、布尔状态、元素类型和必要的非内容标识。
- 本地持久化仅保存完成功能所需的最小数据，并设置版本、数量上限、损坏数据清理和淘汰策略。
- 不持久化可直接还原媒体内容的 URL、Blob 地址或聊天正文。
- 新增频道位置、历史、未看状态或下载记录前，必须先审查 Schema 和隐私边界。

## 6. DOM 选择器与真实页面验证

- 上游 Telegram Web 源码只能作为设计线索，不能代替线上真实 Web K 页面确认。
- 新增或修改选择器前，必须确认页面状态、元素生命周期和虚拟列表行为。
- 优先使用稳定的公开属性、语义结构和多证据匹配，避免依赖随机类名、文本内容或媒体 URL。
- 选择器证据冲突时停止对应自动行为，不得猜测目标元素。
- 必须考虑 Telegram 消息列表的虚拟化：目标不在 DOM 不等于目标不存在。
- 禁止通过无界滚动、无限 MutationObserver 重试或反复点击寻找目标。
- 需要调用 Telegram 官方 DOM 行为时，必须先在真实页面验证事件时序，并限制次数和超时。
- 正式选择器应集中在 `platform/**`；调试探测选择器不得自动升级为正式行为。

## 7. 自动操作与生命周期

- 所有自动点击、滚动、重试和等待必须有明确触发条件、次数上限和超时。
- 用户手动操作优先于插件自动操作；插件不得与用户持续争夺焦点、播放状态或滚动位置。
- MutationObserver、事件监听器、计时器、动画和媒体回调必须在查看器关闭、页面切换或会话销毁时清理。
- 异步回调必须校验当前会话、当前查看器和序列 ID，避免旧任务作用于新页面。
- 媒体尚未成功加载时，不得记录为“最后成功显示媒体”。
- 自动行为失败时应恢复为 Telegram 原始行为，而不是阻止关闭或导航。

## 8. 代码风格

- 沿用现有 Web K userscript 的函数命名、常量、状态类和日志风格。
- 优先早返回，避免深层嵌套。
- 固定超时、重试次数和阈值使用模块顶部常量，不散落魔法数字。
- 模块和函数保持单一职责；DOM 探测、目标确认、关闭快照、定位和高亮分别处理。
- 仅为复杂时序、隐私边界和降级逻辑添加中文注释，不保留临时调试代码。
- 不保留未使用、推测性或“以后可能用到”的通用工具函数。
- 不使用 `eval`、动态脚本注入或页面私有模块劫持。
- 模块化迁移时优先移动现有逻辑，不在同一 PR 顺带重命名、优化和新增功能。

## 9. Shadow DOM 与样式

- 插件控制界面优先放入独立 Shadow DOM，避免污染 Telegram 页面样式。
- 样式必须限定在插件宿主或 Shadow Root 内，不添加影响 Telegram 全局元素的宽泛规则。
- 对 Telegram 消息的临时高亮应自动清理，不永久修改 class、style 或页面结构。
- 新增界面不得遮挡 Telegram 官方关闭、导航、播放、输入和滚动控件。

## 10. 版本与文档

- 修改 userscript 行为时更新版本源码；不得分别手改 metadata 和调试版本。
- 同步更新 `tampermonkey/README.md` 中的平台、功能、限制、构建和验收状态。
- 重要 DOM 兼容修复或架构迁移应更新对应 Plan、Task 或交接文档。
- 文档必须区分设计推断、静态检查、构建结果、GitHub CI 和真实浏览器验收。
- 不得把未执行命令、未观察 DOM 或未完成浏览器场景写成“已通过”。
- 插件优先迁移路线只记录 Web K 的真实状态；Web A 不再列入执行计划。

## 11. 验证要求

模块化完成后，修改源码至少执行并记录真实输出：

```powershell
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check <base>...HEAD
git diff --name-status <base>...HEAD
git status --short
git rev-parse HEAD
```

在构建命令尚未建立前，至少执行现有 `node --check` 和 Git 差异检查。

- 根目录规则要求不新增测试文件，本目录继续遵守。
- 构建和静态检查不能替代真实 Telegram Web K 浏览器验收。
- 无本地终端时只做静态阅读和 GitHub 差异核对，并明确标记命令尚未执行。
- 无真实浏览器控制能力时，不得声称 DOM、媒体时序、连续浏览或关闭定位通过。
- 浏览器验收必须记录操作系统、浏览器、Tampermonkey 版本、复现步骤和结果。
- 模块化 M1/M2/M3 每个阶段都必须重复 PR #7 核心回归。

## 12. 多 AI 对话与 GitHub 协作

- 一个对话只负责一个任务、一个独立分支和一个 PR。
- 模块化构建基座、核心平台抽取和功能抽取必须串行执行。
- 同一源码模块同一时间只能由一个对话写入；其他对话不得在不同分支同时拆同一 legacy 文件。
- 文档任务可以与代码任务并行，但必须限定不重叠文件。
- 模块化完成后，不同功能可在不同 `features/**` 目录并行开发。
- 公共 `core/**` 或 `platform/**` 接口变化应先建立独立基础 PR。
- 所有代码 PR 合并前必须从最新 Base 重基、重新构建生成文件并重新验收。
- 开始修改前检查开放 PR 和近期提交，发现同文件或同逻辑冲突时先报告。
- 每次写入前重新读取目标分支最新文件，避免覆盖其他提交。
- 对话之间通过分支、Commit、PR 描述、评论和 `docs/` 交接，不依赖聊天记忆。
- 不强推、不删除他人分支、不关闭或合并他人 PR。
- 未经用户明确授权不得合并 PR。

## 13. Commit 与 PR

- Commit 标题使用“英文类型: 中文描述”，保持原子性。
- 构建基础使用 `build:`，源码组织调整使用 `refactor:`，文档使用 `docs:`。
- PR 描述至少包含背景与目标、实现方式、修改文件、构建结果、验证情况、未验证项、风险、回滚和本地验收步骤。
- 功能尚未完成或真实浏览器尚未验收时保持 Draft。
- 完成前重新审查差异，确认未修改 Web A 脚本和桌面源码。

## 14. PR-M1 当前构建基座

在 PR-M1 合并前，Web K 源码关系固定为：

```text
version.js
→ entry.js
→ legacy-main.js
→ vite.web-k-userscript.config.js
→ telegram-media-continuity-web-k.user.js
```

- `tampermonkey/src/web-k/version.js` 是版本唯一来源。
- `tampermonkey/src/web-k/legacy-main.js` 必须保持稳定脚本 Blob `bff54d20036894a2e4a17655856a6325f66a6748`；M1 不在该文件内拆模块、重命名或优化逻辑。
- 构建配置只允许剥离 legacy metadata，并把调试 API 版本连接到版本模块；不得改变选择器、监听参数、timeout、poll、sequenceId、storage key、控制条或关闭定位时序。
- `tampermonkey/telegram-media-continuity-web-k.user.js` 只允许由 `npm run build:tampermonkey:web-k` 生成，不得作为最终修复直接手工编辑。
- `npm run check:tampermonkey:web-k` 必须验证 metadata、Web K `@match`、版本、单文件 IIFE、动态 import、额外产物和 legacy Blob。
- 连续构建两次的生成结果必须一致；真实浏览器回归完成前 PR 保持 Draft。
