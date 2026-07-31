# Telegram Web K 油猴插件模块化执行任务

## 1. 执行原则

本任务不是新增产品功能，而是把稳定的 Web K userscript 改造成：

> 多文件模块源码 + 单文件可安装产物。

全过程必须保持 `0.4.0-k5` 已验收行为等价。

后续只开发 Web K，不开发 Web A。现有 Web A 脚本只读保留，不得修改。

## 2. 基线

```text
仓库：https://github.com/elio-zwd/telegram-tt
Base：codex/tampermonkey-media-continuity
Base SHA：c720607203864e7594248cc21249c244c5a88479
稳定脚本：tampermonkey/telegram-media-continuity-web-k.user.js
稳定版本：0.4.0-k5
已验收脚本 Blob：bff54d20036894a2e4a17655856a6325f66a6748
```

## 3. 总体拆分

模块化分为三个串行 PR：

| 阶段 | 分支 | 目标 |
| --- | --- | --- |
| M1 | `refactor/tampermonkey-web-k-build-foundation` | 建立构建基座并生成等价单文件 |
| M2 | `refactor/tampermonkey-web-k-core-platform` | 抽取共享核心和 Web K 平台适配层 |
| M3 | `refactor/tampermonkey-web-k-feature-modules` | 抽取独立功能模块并删除临时 legacy |

不能把三个阶段合并成一个超大 PR。

---

# PR-M1：构建基座与等价生成

## Task M1-01：重新确认基线

- [ ] 确认 `codex/tampermonkey-media-continuity` HEAD；
- [ ] 确认 PR #7 已合并；
- [ ] 读取根目录和 `tampermonkey/AGENTS.md`；
- [ ] 检查开放 PR 是否修改以下文件：
  - `package.json`；
  - `tampermonkey/**`；
- [ ] 从最新 Base 创建独立分支；
- [ ] 记录 Base SHA 和初始脚本 Blob SHA。

## Task M1-02：建立版本和 metadata 单一来源

- [ ] 新建 Web K 版本模块；
- [ ] metadata 中的 `@version` 从同一版本来源生成；
- [ ] 调试 API `getSummary().version` 使用同一版本来源；
- [ ] 只保留 `https://web.telegram.org/k/*`；
- [ ] 保持 `@grant none`；
- [ ] 不加入 Web A metadata。

建议文件：

```text
tampermonkey/src/web-k/version.js
tampermonkey/build/web-k-userscript-metadata.js
```

## Task M1-03：建立 Vite userscript 构建配置

- [ ] 复用仓库已有 Vite；
- [ ] 不新增打包依赖；
- [ ] 输出 IIFE；
- [ ] 禁止代码拆 chunk；
- [ ] 禁止运行时动态 import；
- [ ] 默认不压缩；
- [ ] 不提交 sourcemap；
- [ ] 输出到原路径：

```text
tampermonkey/telegram-media-continuity-web-k.user.js
```

- [ ] metadata 位于生成文件第一行；
- [ ] 生成文件包含禁止手工修改说明；
- [ ] 构建不得清空 `tampermonkey/` 其他文件。

## Task M1-04：迁移当前稳定脚本

首阶段不拆业务逻辑。

允许方案：

```text
tampermonkey/src/web-k/entry.js
tampermonkey/src/web-k/legacy-main.js
```

要求：

- [ ] 把当前稳定 IIFE 内容迁移到模块源码；
- [ ] 不改变函数内部逻辑；
- [ ] 不重命名核心状态和方法；
- [ ] 不改变事件监听捕获参数；
- [ ] 不改变 timeout、poll、sequenceId；
- [ ] 不改变 DOM 选择器；
- [ ] 不改变本地存储 key；
- [ ] 不改变控制条文案和布局；
- [ ] 不顺带清理“看起来重复”的代码。

## Task M1-05：新增构建命令

建议：

```json
{
  "scripts": {
    "build:tampermonkey:web-k": "vite build --config tampermonkey/build/vite.web-k-userscript.config.js",
    "check:tampermonkey:web-k": "node tampermonkey/build/verify-web-k-userscript.mjs"
  }
}
```

- [ ] 命令命名与仓库风格一致；
- [ ] `verify` 检查 metadata、单文件、禁止动态 import 和版本一致性；
- [ ] 不新增测试框架或测试目录；
- [ ] 检查脚本失败时返回非零退出码。

## Task M1-06：生成文件一致性

- [ ] 连续构建两次；
- [ ] 两次生成结果一致；
- [ ] 生成文件可通过 `node --check`；
- [ ] 没有额外 chunk；
- [ ] 没有外部运行时依赖；
- [ ] 没有 Web A match；
- [ ] 原始 userscript 安装路径不变。

## Task M1-07：M1 浏览器回归

必须使用真实 Telegram Web K 验证：

- [ ] 脚本注入；
- [ ] 控制条出现；
- [ ] 官方关闭；
- [ ] `Esc` 关闭；
- [ ] 图片倒计时；
- [ ] 连续至少三项；
- [ ] TT 上一项和下一项；
- [ ] Telegram 官方左右切换；
- [ ] `ArrowLeft/ArrowRight`；
- [ ] 视频 `ended`；
- [ ] 悬停暂停；
- [ ] 页面失焦暂停；
- [ ] 缩放暂停和退出缩放重新计时；
- [ ] 循环视频提示；
- [ ] 队列末尾停止；
- [ ] 关闭后定位；
- [ ] 相册定位整条消息；
- [ ] 目标不在 DOM 安全降级；
- [ ] 切换聊天取消旧任务；
- [ ] 调试 API 可用；
- [ ] Telegram 输入、滚动、导航无回归。

## Task M1-08：文档与 PR

- [ ] 更新 `tampermonkey/README.md`；
- [ ] 更新 `tampermonkey/AGENTS.md` 生成文件规则；
- [ ] 记录构建命令；
- [ ] 记录源文件和生成文件关系；
- [ ] 创建 Draft PR；
- [ ] PR Base 使用最新稳定油猴分支；
- [ ] 未完成真实浏览器回归前不得 Ready；
- [ ] 未经用户授权不得合并。

---

# PR-M2：核心与平台适配层

前置条件：PR-M1 已合并并完成真实浏览器验收。

## Task M2-01：抽取纯核心模块

按以下顺序抽取，每抽取一个模块都重新构建和静态检查：

1. `version.js`；
2. `core/logger.js`；
3. `core/settings.js`；
4. `core/runtime.js`；
5. `core/cleanup.js`；
6. `core/lifecycle.js`。

要求：

- [ ] 核心模块不出现 Telegram 选择器；
- [ ] 不导出未使用函数；
- [ ] 不引入事件总线、依赖注入框架或服务容器；
- [ ] 保持早返回和现有命名风格；
- [ ] localStorage key 和数据兼容。

## Task M2-02：抽取 `platform/dom.js`

迁移：

- [ ] `isElementVisible`；
- [ ] 数字 data 属性读取；
- [ ] 脱敏元素描述；
- [ ] href 模式描述；
- [ ] 可滚动祖先；
- [ ] DOM 安全工具。

不得迁移业务状态。

## Task M2-03：抽取 `platform/media-viewer.js`

迁移：

- [ ] 查看器发现；
- [ ] 媒体 root；
- [ ] 活动媒体评分和查找；
- [ ] fingerprint；
- [ ] 成功显示判定；
- [ ] 缩放状态。

## Task M2-04：抽取 `platform/navigation.js`

迁移：

- [ ] 官方左右控件选择器；
- [ ] 可用性；
- [ ] 点击调度；
- [ ] 方向映射。

所有功能模块只能通过该模块导航。

## Task M2-05：抽取 `platform/message-list.js`

迁移：

- [ ] 消息和 peer 身份；
- [ ] 来源消息节点；
- [ ] 相册 index；
- [ ] 聊天滚动容器；
- [ ] 活动 peer；
- [ ] 精确目标查找；
- [ ] 虚拟列表未加载返回；
- [ ] 相邻可见媒体目标。

## Task M2-06：平台 API 静态检查

- [ ] `features/**` 不直接查询 Telegram 选择器；
- [ ] 选择器集中、可搜索；
- [ ] 不把调试选择器与正式定位混用；
- [ ] 公开 DOM 证据冲突时仍安全降级；
- [ ] Web A 文件无修改。

## Task M2-07：M2 完整回归

重复 M1 全部静态检查和浏览器验收，不得只验证“脚本能启动”。

---

# PR-M3：功能模块抽取

前置条件：PR-M2 已合并并完成真实浏览器验收。

## Task M3-01：连续浏览模块

新目录：

```text
tampermonkey/src/web-k/features/continuous-browsing/
```

迁移：

- [ ] `ViewerSession`；
- [ ] 图片 scheduler；
- [ ] 视频 `ended`；
- [ ] 用户交互暂停；
- [ ] 导航超时；
- [ ] 队列结束状态；
- [ ] 媒体监听清理。

## Task M3-02：关闭定位模块

新目录：

```text
tampermonkey/src/web-k/features/close-position/
```

迁移：

- [ ] 来源目标捕获；
- [ ] pending/confirmed target；
- [ ] 关闭快照；
- [ ] 关闭后 poll；
- [ ] 消息居中；
- [ ] 1.2 秒高亮；
- [ ] 提示；
- [ ] sequenceId 和取消。

## Task M3-03：控制面板模块

新目录：

```text
tampermonkey/src/web-k/features/control-panel/
```

迁移：

- [ ] Shadow DOM template；
- [ ] 样式；
- [ ] 状态渲染；
- [ ] 用户事件转发；
- [ ] panel destroy。

控制面板不得直接查询 Telegram DOM。

## Task M3-04：调试模块

新目录：

```text
tampermonkey/src/web-k/features/debug/
```

迁移：

- [ ] `inspect`；
- [ ] `inspectMessageMapping`；
- [ ] `armCloseFlowProbe`；
- [ ] `getLastLocationResult`；
- [ ] `testPrevious/testNext`；
- [ ] `getSummary`；
- [ ] 隐私断言。

## Task M3-05：应用装配

- [ ] `entry.js` 只调用 `createApp`；
- [ ] `createApp` 装配 core、platform、features；
- [ ] 不在入口写业务分支；
- [ ] 不使用全局可变对象传递所有依赖；
- [ ] 不过度抽象成通用插件框架。

## Task M3-06：移除 legacy

- [ ] 删除临时 `legacy-main.js`；
- [ ] 确认无重复实现；
- [ ] 确认无死代码；
- [ ] 确认生成文件只来自模块入口；
- [ ] 更新架构图和维护说明。

## Task M3-07：最终验证

静态命令建议：

```powershell
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check origin/codex/tampermonkey-media-continuity...HEAD
git diff --name-status origin/codex/tampermonkey-media-continuity...HEAD
git status --short
git rev-parse HEAD
```

必须记录真实退出码和关键输出。

浏览器重复 M1 全部验收。

---

# 4. 迁移矩阵执行任务

模块化完成前，不启动产品功能开发。

## Task R-01：更新 Web K 唯一路线

- [ ] 将 Web A 标记为冻结、非执行目标；
- [ ] 更新 PR #7 为已完成；
- [ ] 加入模块化 P0；
- [ ] 按 P1/P2/P3/P4 分组；
- [ ] 为每项标明依赖模块；
- [ ] 为每项标明 DOM、隐私和浏览器风险；
- [ ] 为每项建议独立分支和 PR；
- [ ] 不把建议功能标成原计划。

## Task R-02：P1 浏览体验功能拆分

分别建立任务卡：

- [ ] 类型过滤；
- [ ] 浏览方向；
- [ ] 快捷键；
- [ ] 图片时间输入；
- [ ] GIF 策略；
- [ ] PiP/全屏状态；
- [ ] 控制条设置入口。

## Task R-03：P2 状态能力 Schema

先设计并审查本地数据结构，再写功能：

- [ ] 频道位置；
- [ ] 相册 index；
- [ ] 频道设置；
- [ ] 浏览历史；
- [ ] 未看媒体；
- [ ] 收藏；
- [ ] 数据版本和清理。

## Task R-04：P3 下载可行性门禁

- [ ] 先做真实 Web K 实验；
- [ ] 不假设当前媒体 URL 可长期使用；
- [ ] 不绕过保护；
- [ ] 确认浏览器文件名、大小和完成状态能力；
- [ ] 只有可行性通过后才拆自动保存功能 PR。

## Task R-05：P4 高级队列实验

每项先独立实验，不直接承诺：

- [ ] 等待新媒体；
- [ ] 动态加载更多；
- [ ] 可见序号和总数；
- [ ] 随机；
- [ ] 日期起点；
- [ ] 多频道队列。

---

# 5. 多 AI 对话分工

## 可立即并行

### 对话 A：PR-M1 实现

独占：

```text
package.json
tampermonkey/build/**
tampermonkey/src/web-k/**
tampermonkey/telegram-media-continuity-web-k.user.js
tampermonkey/README.md
tampermonkey/AGENTS.md
```

### 对话 B：迁移矩阵路线文档

只允许修改：

```text
docs/tampermonkey-plugin-migration-matrix.md
docs/tampermonkey-web-k-plugin-priority-roadmap.md
```

不得修改源码、README、AGENTS 或生成脚本。

### 对话 C：浏览器验收模板

只允许修改新建文档：

```text
docs/tampermonkey-web-k-browser-regression.md
```

不得修改已有代码或公共文档。

## 不可立即并行

- PR-M2 必须等待 M1 合并；
- PR-M3 必须等待 M2 合并；
- 所有新产品功能必须等待 M3 合并；
- 不能让两个对话同时修改 `legacy-main.js` 或生成 userscript。

# 6. Commit 建议

PR-M1：

```text
build: 增加 Web K userscript 构建基座
refactor: 迁移 Web K 脚本到模块源码入口
docs: 更新 Web K 模块化构建说明
```

PR-M2：

```text
refactor: 抽取 Web K 共享核心模块
refactor: 抽取 Web K 平台适配层
docs: 更新 Web K 模块边界说明
```

PR-M3：

```text
refactor: 抽取 Web K 连续浏览模块
refactor: 抽取 Web K 关闭定位模块
refactor: 抽取 Web K 控制面板和调试模块
docs: 完成 Web K 模块化交接
```

# 7. 完成前检查

- [ ] 只开发 Web K；
- [ ] Web A 脚本未修改；
- [ ] 没有新增运行时依赖；
- [ ] 没有行为扩展；
- [ ] 生成文件没有手工修改；
- [ ] Build、静态检查、浏览器验收状态区分清楚；
- [ ] PR 描述记录未验证项；
- [ ] 未经用户授权没有合并。
