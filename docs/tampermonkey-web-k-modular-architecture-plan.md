# Telegram Web K 油猴插件模块化架构计划

## 1. 背景

当前稳定基线：

```text
仓库：https://github.com/elio-zwd/telegram-tt
基线分支：codex/tampermonkey-media-continuity
基线 SHA：c720607203864e7594248cc21249c244c5a88479
已合并 PR：#7
稳定脚本：tampermonkey/telegram-media-continuity-web-k.user.js
稳定版本：0.4.0-k5
```

PR #7 已完成 Web K 连续浏览和关闭后定位，脚本已经包含：

- DOM 与媒体查看器探测；
- 消息身份和相册映射；
- 关闭后消息定位；
- 连续图片、视频浏览；
- 设置存储；
- Shadow DOM 控制条；
- 脱敏调试 API；
- 页面和查看器生命周期管理。

这些能力当前集中在约 1,600 行的单一 userscript 中。继续在单文件内增加频道设置、媒体过滤、快捷键、浏览历史和自动保存，会提高阅读、审查、回归和多对话协作成本。

## 2. 已确认产品决策

### 2.1 唯一支持平台

后续插件路线只支持：

```text
Telegram Web K：https://web.telegram.org/k/*
```

明确不继续开发 Web A：

- 不为 Web A 增加新功能；
- 不为 Web A 建立新适配器；
- 不要求 Web K 新模块兼容 Web A；
- 现有 Web A 脚本保留为历史参考，不参与后续架构和功能验收；
- 除非用户未来重新明确改变决定，否则任何新 PR 不得修改 Web A 脚本。

### 2.2 最终架构

原先的“A/K 双适配器”方向调整为：

> **Web K 共享核心 + Web K 平台适配器 + 独立功能模块 + 单文件构建产物。**

其中“共享核心”是指 Web K 各功能之间共享的生命周期、状态、存储、清理和日志能力，不再表示 Web A/K 跨平台共享。

### 2.3 发布形态

开发源码使用多文件 ES Module；用户安装仍使用一个完整 userscript：

```text
tampermonkey/src/web-k/**
        ↓ Vite/Rollup 构建
tampermonkey/telegram-media-continuity-web-k.user.js
```

最终生成文件继续保持原路径，避免用户安装入口变化。

## 3. 目标

1. 将模块源码确立为唯一开发源；
2. 继续生成一个可直接安装的 Web K `.user.js`；
3. 保持 PR #7 已验收行为完全等价；
4. Telegram DOM 选择器集中在 Web K 平台适配层；
5. 连续浏览、关闭定位、控制面板和调试功能彼此解耦；
6. 为后续插件优先迁移矩阵中的功能提供稳定扩展点；
7. 降低 AI 每次需要读取的文件数量和上下文长度；
8. 支持多个 AI 对话在不同模块和分支上工作，但合并前必须串行重基和重新生成单文件产物。

## 4. 非目标

本轮模块化不得同时实现：

- 新的媒体筛选功能；
- 浏览方向设置；
- 快捷键扩展；
- 频道独立设置；
- 浏览历史或“只浏览未看过”；
- 自动保存或下载管理；
- Web A 兼容；
- Telegram API、Bot API、MTProto 或私有模块接入；
- TypeScript 迁移；
- UI 重设计；
- 新第三方运行时依赖。

模块化 PR 只改变源码组织、构建方式和内部依赖，不改变产品行为。

## 5. 推荐目录结构

```text
tampermonkey/
├─ src/
│  └─ web-k/
│     ├─ entry.js
│     ├─ version.js
│     │
│     ├─ core/
│     │  ├─ runtime.js
│     │  ├─ lifecycle.js
│     │  ├─ settings.js
│     │  ├─ cleanup.js
│     │  └─ logger.js
│     │
│     ├─ platform/
│     │  ├─ dom.js
│     │  ├─ media-viewer.js
│     │  ├─ message-list.js
│     │  └─ navigation.js
│     │
│     ├─ features/
│     │  ├─ continuous-browsing/
│     │  │  ├─ viewer-session.js
│     │  │  ├─ media-scheduler.js
│     │  │  └─ navigation-target.js
│     │  ├─ close-position/
│     │  │  ├─ source-target.js
│     │  │  ├─ target-tracker.js
│     │  │  ├─ message-locator.js
│     │  │  └─ notice.js
│     │  ├─ control-panel/
│     │  │  ├─ control-panel.js
│     │  │  └─ template.js
│     │  └─ debug/
│     │     ├─ debug-api.js
│     │     └─ probes.js
│     │
│     └─ app/
│        └─ create-app.js
│
├─ build/
│  ├─ vite.web-k-userscript.config.js
│  └─ verify-web-k-userscript.mjs
│
├─ telegram-media-continuity-web-k.user.js
├─ telegram-media-continuity.user.js
├─ AGENTS.md
└─ README.md
```

目录可以在实施中小幅调整，但必须保持以下边界：

- `platform/**`：唯一允许出现 Telegram Web K 页面选择器的主要位置；
- `features/**`：一个产品能力一个目录；
- `core/**`：不直接操作 Telegram 专属 DOM；
- `entry.js`：只负责装配和启动，不堆积业务逻辑；
- 生成的 `.user.js`：不得直接手工修改。

## 6. 模块职责

### 6.1 `core/runtime.js`

维护页面级运行状态：

- 当前查看器会话；
- 页面 MutationObserver；
- 扫描计时器；
- 关闭定位序列；
- 调试开关；
- 全局清理句柄。

不保存 Telegram 聊天正文、名称或媒体 URL。

### 6.2 `core/lifecycle.js`

负责：

- 初始化；
- 页面扫描调度；
- 查看器出现和消失；
- `pagehide`、`popstate`、`hashchange`；
- 应用销毁和资源释放。

### 6.3 `core/settings.js`

负责：

- `DEFAULT_SETTINGS`；
- 设置校验；
- `localStorage` 读取、写入和损坏数据降级；
- 后续 Schema 版本演进入口。

### 6.4 `platform/dom.js`

只提供公开 DOM 的通用工具：

- 元素可见性；
- 元素脱敏描述；
- 可滚动祖先；
- 数字属性读取；
- DOM 生命周期判断。

### 6.5 `platform/media-viewer.js`

封装：

- `.media-viewer-whole`；
- 活动媒体根和活动图片/视频；
- 缩放状态；
- 媒体成功显示判定；
- 媒体 fingerprint；
- 查看器状态。

### 6.6 `platform/navigation.js`

封装：

- 官方上一项、下一项按钮；
- 可用性判断；
- 有限次官方 DOM 点击；
- 页面方向与产品方向的唯一映射。

功能模块不得自行查询方向按钮。

### 6.7 `platform/message-list.js`

封装：

- `data-mid`、`data-peer-id`；
- `.bubble` 和 `.album-item.grouped-item`；
- 当前聊天滚动容器；
- 相册内部序号；
- 精确消息查找；
- 虚拟列表目标未加载的安全返回。

### 6.8 `features/continuous-browsing/**`

保留 PR #6/#7 已有能力：

- 图片倒计时；
- 视频 `ended`；
- 悬停、失焦、缩放、交互暂停；
- 手动和自动导航；
- 队列末尾停止；
- `ViewerSession` 生命周期。

### 6.9 `features/close-position/**`

负责：

- 来源消息捕获；
- `pendingMediaTarget`；
- `lastConfirmedMediaTarget`；
- 关闭快照；
- 查看器关闭后定位；
- 频道切换和用户新操作取消；
- 居中、高亮和安全提示。

### 6.10 `features/control-panel/**`

负责 Shadow DOM 控制条、状态渲染和用户事件，不直接执行 Telegram DOM 导航。

### 6.11 `features/debug/**`

负责：

- `window.TelegramMediaContinuity`；
- 脱敏 DOM 探测；
- 关闭流程探测；
- 只读摘要；
- 调试开关。

调试模块不得输出正文、频道名、用户名或完整媒体 URL。

## 7. 构建与生成规则

### 7.1 复用现有工具

仓库已经包含 Vite，不新增打包依赖。新增脚本建议：

```json
{
  "scripts": {
    "build:tampermonkey:web-k": "vite build --config tampermonkey/build/vite.web-k-userscript.config.js",
    "check:tampermonkey:web-k": "node tampermonkey/build/verify-web-k-userscript.mjs"
  }
}
```

实际命名可按仓库惯例调整。

### 7.2 构建输出要求

- 格式：IIFE；
- 只生成一个 JavaScript 文件；
- 不生成动态 chunk；
- 不压缩，便于审查和调试；
- 不生成 sourcemap 到仓库；
- userscript metadata 必须位于文件第一行；
- `@match` 只保留 Web K；
- `@grant none`；
- 输出路径保持 `tampermonkey/telegram-media-continuity-web-k.user.js`；
- 生成文件顶部增加“Generated file, do not edit directly”说明；
- 版本号由单一源码常量生成，不能在 metadata 和调试 API 中分别手工维护。

### 7.3 生成文件策略

生成文件继续提交到仓库，保证用户可以直接安装 GitHub 中的单文件。

代价是多个功能 PR 都会修改生成文件，因此：

1. 不允许手工解决生成文件内部冲突；
2. 每个 PR 合并前从最新 Base 重基；
3. 删除冲突后的旧生成内容；
4. 重新执行构建生成完整文件；
5. 再执行静态和浏览器验收；
6. 功能 PR 可以并行开发，但合并和最终重生成必须串行。

## 8. 插件优先迁移矩阵摘要

旧矩阵中的 Web A 状态不再作为执行目标。Web K 唯一路线按以下阶段推进。

### 8.1 已完成稳定能力

| 能力组 | 状态 | 依据 |
| --- | --- | --- |
| 图片定时连续浏览 | 已完成 | PR #6/#7 |
| 视频结束自动切换 | 已完成 | PR #6/#7 |
| 悬停、失焦、缩放暂停 | 已完成 | PR #6/#7 |
| 官方/TT 前后切换 | 已完成 | PR #6/#7 |
| 队列末尾停止 | 已完成 | PR #6/#7 |
| 关闭后定位最后媒体消息 | 已完成 | PR #7 |
| 相册消息级定位 | 已完成 | PR #7 |
| Shadow DOM 控制条 | 已完成 | PR #6/#7 |
| 脱敏调试工具 | 已完成 | PR #6/#7 |

### 8.2 当前 P0：模块化基础设施

| 项目 | 目标 |
| --- | --- |
| 构建基座 | 多文件源码生成单文件 userscript |
| Web K 平台适配器 | 集中 Telegram 选择器和官方 DOM 行为 |
| 共享核心 | 生命周期、存储、日志、清理和运行状态 |
| 功能模块 | 连续浏览、关闭定位、控制面板、调试独立目录 |
| 等价回归 | 保持 `0.4.0-k5` 已验收行为 |
| 开发治理 | 生成文件、版本、分支和多对话协作规则 |

### 8.3 P1：浏览体验增强

建议依次实现：

1. 图片/视频/GIF 类型过滤；
2. 正向、反向浏览；
3. 快捷键及输入区域冲突保护；
4. 图片停留时间自定义输入；
5. GIF/循环短视频策略；
6. PiP、全屏和播放状态暂停；
7. 控制条设置入口和状态整理。

这些功能可分别建立独立 feature 目录和独立 PR。

### 8.4 P2：状态与频道能力

1. 每频道最后浏览位置持久化；
2. 相册内部位置持久化；
3. 全局与频道独立设置；
4. 浏览历史；
5. 只浏览未看过；
6. 收藏或稍后查看；
7. 设置导入、导出和数据清理。

应先确定最小本地数据 Schema，再实现 UI。

### 8.5 P3：保存和下载

1. 下载能力和浏览器限制实验；
2. 手动保存当前媒体；
3. 浏览时自动保存；
4. 类型、大小和会话总量限制；
5. 文件名模板和安全清洗；
6. 去重和下载历史；
7. 失败重试和队列状态。

下载路线必须默认关闭，不绕过 Telegram 限制，并单独完成隐私、安全和真实下载验收。

### 8.6 P4：高级队列

- 等待新媒体；
- 有界动态加载更多；
- 当前序号和可见总数；
- 随机浏览；
- 日期起点；
- 多频道队列。

这些能力受虚拟列表和 Telegram 页面控制影响，必须逐项实验，不承诺桌面客户端级完整性。

### 8.7 明确不开发

- Web A；
- Telegram API、Bot API、MTProto；
- 私有 webpack 模块；
- IndexedDB 账号数据；
- 绕过受保护内容或付费媒体；
- 任意本地目录控制；
- 浏览器关闭后的永久后台运行；
- 未经真实页面验证的自动点击或无限滚动。

## 9. 分阶段实施方案

模块化不采用一次性大重写，拆成三个串行 PR。

### PR-M1：构建基座与单文件等价生成

建议分支：

```text
refactor/tampermonkey-web-k-build-foundation
```

范围：

- 新增 Vite userscript 构建配置；
- 新增版本和 metadata 单一来源；
- 将现有脚本完整迁入模块入口或临时 `legacy-main.js`；
- 构建生成原路径单文件；
- 不拆业务逻辑；
- 对比并验收现有全部行为。

这是所有后续模块化和功能开发的依赖，必须先合并。

### PR-M2：核心与平台适配层抽取

建议分支：

```text
refactor/tampermonkey-web-k-core-platform
```

依赖：PR-M1 已合并。

范围：

- `core/runtime`；
- `core/lifecycle`；
- `core/settings`；
- `core/logger`；
- `platform/dom`；
- `platform/media-viewer`；
- `platform/message-list`；
- `platform/navigation`。

不拆产品功能，不改变行为。

### PR-M3：功能模块抽取

建议分支：

```text
refactor/tampermonkey-web-k-feature-modules
```

依赖：PR-M2 已合并。

范围：

- 连续浏览；
- 关闭定位；
- 控制面板；
- 调试工具；
- 删除临时 legacy 模块；
- 完成最终目录和文档。

## 10. 多 AI 对话协作

### 10.1 可以立即并行

| 对话 | 分支 | 文件范围 | 输出 |
| --- | --- | --- | --- |
| A | `refactor/tampermonkey-web-k-build-foundation` | 构建配置、模块入口、生成脚本、package scripts、README | PR-M1 |
| B | `docs/tampermonkey-web-k-migration-roadmap` | 只更新迁移矩阵和路线文档，不改源码、README、AGENTS | 路线文档 PR |
| C | `docs/tampermonkey-web-k-browser-regression` | 只整理现有浏览器回归清单和验收模板 | 验收文档 PR |

本规划分支已经提供路线摘要，因此 B、C 属于可选增强，不是 PR-M1 阻塞项。

### 10.2 必须串行

- PR-M1、PR-M2、PR-M3 必须依次合并；
- 不允许多个对话同时拆同一个 legacy 文件；
- 不允许多个对话同时修改生成脚本；
- 新产品功能必须等待 PR-M3 完成；
- 每个实现 PR 只由一个 AI 对话负责。

### 10.3 模块化完成后的并行方式

不同功能可以在不同 feature 目录并行开发，但：

- 每个功能一个分支和 PR；
- 不同时修改同一 core/platform 文件；
- 需要公共接口变化时先建立单独基础 PR；
- 合并前从最新 Base 重基并重新生成 userscript；
- 生成文件冲突不得手工拼接。

## 11. 完成条件

模块化最终完成需满足：

1. 源码按职责拆分；
2. 单文件 userscript 可稳定构建；
3. metadata 和版本只有一个真实来源；
4. 生成文件无动态 import、无外部运行时依赖；
5. `node --check` 通过；
6. 重复构建结果稳定；
7. 生成文件与源码一致；
8. Web A 文件无修改；
9. PR #7 全部静态和浏览器场景回归通过；
10. Telegram 原生关闭、输入、滚动、导航无回归；
11. README、AGENTS 和交接文档更新；
12. PR 未经用户授权不得合并。

## 12. 风险

### 12.1 构建语义变化

打包器可能改变顶层作用域、函数名或执行顺序。PR-M1 必须先建立最小等价构建，不能同时抽取逻辑。

### 12.2 事件和清理顺序

`ViewerSession`、全局 observer、关闭定位和 `pagehide` 对执行顺序敏感。抽取时不能改变监听捕获阶段、清理顺序或序列 ID 校验。

### 12.3 生成文件冲突

所有代码 PR 都会重新生成同一个 userscript。并行开发可以进行，但最终合并必须串行重基和重建。

### 12.4 AI 过度重构

AI 可能顺手引入事件总线、依赖注入框架、类型系统或抽象层。本计划要求先沿用现有对象和函数结构，只在已有职责边界上拆分。

## 13. 回滚

- PR-M1 异常：回滚构建配置和模块入口，恢复 `0.4.0-k5` 单文件；
- PR-M2/M3 异常：回滚对应抽取 PR，不影响上一稳定阶段；
- 浏览器异常：停用 Tampermonkey 脚本即可恢复 Telegram 原始行为；
- 模块化不修改 Telegram 数据或云端内容。
