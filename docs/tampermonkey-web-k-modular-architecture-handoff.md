# Telegram Web K 油猴插件模块化开发交接

## 1. 接手目标

接手 `elio-zwd/telegram-tt`，继续完成下一阶段：

1. 将 Web K 油猴插件改造成模块化源码；
2. 保持最终安装产物仍为单个 `.user.js`；
3. 将插件优先迁移矩阵改为 Web K 唯一路线；
4. 不开发 Web A。

不要重新讨论是否支持 Web A。用户已明确确认后续只开发 Web K。

## 2. 仓库和基线

```text
仓库：https://github.com/elio-zwd/telegram-tt
稳定分支：codex/tampermonkey-media-continuity
稳定 SHA：c720607203864e7594248cc21249c244c5a88479
已合并 PR：#7
稳定脚本：tampermonkey/telegram-media-continuity-web-k.user.js
稳定版本：0.4.0-k5
稳定脚本 Blob：bff54d20036894a2e4a17655856a6325f66a6748
```

规划分支：

```text
docs/tampermonkey-web-k-modular-roadmap
```

接手时必须重新读取远端最新分支和开放 PR，不得假设以上 SHA 永久不变。

## 3. 必读顺序

1. `AGENTS.md`；
2. `tampermonkey/AGENTS.md`；
3. `tampermonkey/README.md`；
4. `docs/tampermonkey-web-k-modular-architecture-plan.md`；
5. `docs/tampermonkey-web-k-modular-architecture-task.md`；
6. `docs/tampermonkey-web-k-modular-architecture-handoff.md`；
7. `docs/tampermonkey-plugin-migration-matrix.md`；
8. `docs/tampermonkey-web-k-close-to-media-position-handoff.md`；
9. `tampermonkey/telegram-media-continuity-web-k.user.js`；
10. `package.json` 和现有 Vite 配置；
11. 当前开放 PR 和近期提交。

Web A 脚本只用于确认未被修改，不需要阅读其实现来设计兼容层。

## 4. 能力和工具说明

规划对话已确认：

- GitHub 仓库读取、分支、文件写入和 PR 能力可用；
- Superpowers 插件在规划对话不可调用，已执行等价人工 brainstorming 和 writing-plans；
- 仓库已有 Vite，无需新增打包依赖；
- 当前脚本约 1,600 行，职责边界已经可以识别；
- PR #7 已完成真实 Windows 10 + Chrome 150 + Tampermonkey 4.18+ 验收。

新对话开始时仍需重新确认插件和 GitHub 实际能力。

Superpowers 可用时，推荐：

```text
Superpowers:executing-plans
Superpowers:verification-before-completion
Superpowers:finishing-a-development-branch
```

出现构建或行为回归时使用：

```text
Superpowers:systematic-debugging
```

不可用时继续执行文档中的人工等价流程，不得假装调用成功。

## 5. 已确认架构决策

最终架构：

> Web K 共享核心 + Web K 平台适配器 + 独立功能模块 + 单文件构建产物。

说明：

- “共享核心”只服务 Web K 各功能；
- 只实现一个 Web K 平台适配器；
- 不创建 Web A 适配器；
- 不追求跨 Telegram 客户端通用框架；
- 源码使用多文件 ES Module；
- 生成产物继续是 `tampermonkey/telegram-media-continuity-web-k.user.js`；
- 生成文件提交仓库，方便用户直接安装；
- 生成文件不得手工编辑。

## 6. 为什么分三次实现

不能直接把 1,600 行脚本一次性拆完。

### M1：构建基座

先验证：

```text
原稳定逻辑
→ 模块入口/临时 legacy-main
→ Vite 构建
→ 原路径单文件
```

M1 不拆业务，主要排除打包器导致的执行语义变化。

### M2：共享核心和平台层

只抽取低耦合工具、生命周期、设置和 Web K DOM 适配，不拆产品功能。

### M3：功能模块

最后抽取连续浏览、关闭定位、控制面板和调试，并删除临时 legacy。

三个 PR 必须串行，不能由三个对话同时从同一稳定文件拆分。

## 7. 首个实现任务：PR-M1

新开发对话首先负责：

```text
分支：refactor/tampermonkey-web-k-build-foundation
Base：最新 codex/tampermonkey-media-continuity
目标 PR：build/refactor Web K userscript 构建基座
```

PR-M1 完成内容：

- Vite userscript 构建配置；
- 版本和 metadata 单一来源；
- 模块入口；
- 当前稳定逻辑原样迁入临时模块；
- 构建输出原路径单文件；
- package scripts；
- 生成文件一致性检查；
- README 和 AGENTS 构建规则；
- PR #7 全量浏览器回归。

PR-M1 禁止：

- 拆分业务模块；
- 新增功能；
- 修改 Web A；
- 引入 TypeScript；
- 引入新依赖；
- UI 改版；
- 顺手重命名大量函数。

## 8. 插件优先迁移矩阵执行结论

Web K 路线：

```text
已完成稳定能力
→ P0 模块化
→ P1 浏览体验
→ P2 状态与频道能力
→ P3 保存与下载
→ P4 高级队列实验
```

### 已完成

- 图片和视频连续浏览；
- 暂停策略；
- 官方和 TT 导航；
- 队列结束；
- 关闭后定位；
- 相册消息定位；
- 控制条；
- 脱敏调试。

### P1

- 媒体类型过滤；
- 正反方向；
- 快捷键；
- 自定义图片时间；
- GIF 策略；
- PiP/全屏状态；
- 设置入口。

### P2

- 每频道位置；
- 相册位置；
- 频道设置；
- 浏览历史；
- 只浏览未看过；
- 收藏；
- 导入导出与清理。

### P3

- 下载可行性；
- 手动保存；
- 自动保存；
- 类型、大小、总量；
- 文件名；
- 去重；
- 下载队列和历史。

### P4

- 等待新媒体；
- 动态加载更多；
- 计数；
- 随机；
- 日期起点；
- 多频道队列。

Web A 和私有 API 路线明确取消。

## 9. 多 AI 对话规则

用户可以开启多个窗口，但每个窗口只能负责一个分支和一个 PR。

### 9.1 当前可并行

#### 对话 A：M1 构建基座

允许修改：

```text
package.json
tampermonkey/build/**
tampermonkey/src/web-k/**
tampermonkey/telegram-media-continuity-web-k.user.js
tampermonkey/README.md
tampermonkey/AGENTS.md
M1 专属文档
```

#### 对话 B：迁移矩阵文档

建议分支：

```text
docs/tampermonkey-web-k-migration-roadmap
```

只允许修改：

```text
docs/tampermonkey-plugin-migration-matrix.md
docs/tampermonkey-web-k-plugin-priority-roadmap.md
```

不得改代码、README、AGENTS 或生成脚本。

#### 对话 C：浏览器回归模板

建议分支：

```text
docs/tampermonkey-web-k-browser-regression
```

只新建：

```text
docs/tampermonkey-web-k-browser-regression.md
```

### 9.2 不可并行

- M2 等待 M1 合并；
- M3 等待 M2 合并；
- 新功能等待 M3 合并；
- 不允许多个窗口同时修改生成 userscript；
- 不允许多个窗口同时从 legacy 文件抽取代码。

### 9.3 合并方式

生成文件是所有代码 PR 的共同输出。不同功能未来可以并行实现，但合并前必须：

1. 从最新 Base 重基；
2. 解决源码冲突；
3. 删除旧生成结果；
4. 重新构建；
5. 重新静态检查；
6. 重新浏览器回归；
7. 串行合并。

禁止手工拼接生成文件冲突。

## 10. M1 建议验证命令

本地环境执行并记录真实结果：

```powershell
git fetch origin
git checkout refactor/tampermonkey-web-k-build-foundation
git pull --ff-only origin refactor/tampermonkey-web-k-build-foundation
node --version
npm --version
git --version
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check origin/codex/tampermonkey-media-continuity...HEAD
git diff --name-status origin/codex/tampermonkey-media-continuity...HEAD
git status --short
git rev-parse HEAD
```

若命令名称在实现中调整，以最终 `package.json` 为准，但 PR 必须明确记录。

## 11. 浏览器验收要求

M1、M2、M3 每个阶段都需要重复 PR #7 的核心回归：

- 脚本注入和控制条；
- 官方关闭和 `Esc`；
- TT/官方/键盘导航；
- 图片连续至少三项；
- 视频 `ended`；
- 悬停、失焦、缩放暂停；
- 队列末尾；
- 关闭定位；
- 相册定位；
- 虚拟列表安全降级；
- 切换聊天取消；
- 调试 API；
- Telegram 原生功能。

没有真实浏览器输出时，只能标记“尚未验收”。

## 12. Commit 和 PR 规范

Commit 示例：

```text
build: 增加 Web K userscript 构建基座
refactor: 迁移 Web K 脚本到模块源码入口
docs: 更新 Web K 模块化构建说明
```

PR 标题建议：

```text
refactor: 建立 Web K 油猴插件模块化构建基座
```

PR 必须包含：

- 背景与目标；
- 等价迁移方式；
- 修改文件；
- 构建输出；
- 静态验证；
- 浏览器验证；
- 未验证项；
- 风险；
- 回滚；
- 本地只读验收步骤。

未经用户授权不得合并。

## 13. 完成输出

每个开发对话完成后必须输出：

1. 仓库；
2. PR 链接和编号；
3. Base 和开发分支；
4. Commit SHA；
5. 修改文件；
6. 完成内容；
7. 构建和静态检查真实结果；
8. 浏览器验收真实结果；
9. 未验证项；
10. 风险和重点回归区域；
11. 回滚建议；
12. 给本地 AI 的只读验收 Prompt。

## 14. 当前交接结论

新开发对话不要直接开始“最终全部拆分”。

第一步只完成：

```text
PR-M1：构建基座 + 稳定脚本等价生成
```

M1 完成并合并后，再新开对话执行 M2；M2 合并后执行 M3。
