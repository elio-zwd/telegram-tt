# Telegram Web K 油猴插件 P0 模块化完成记录

## 1. 结论

Telegram Web K 油猴插件模块化 P0 已正式完成，可以开始 P1 产品功能开发。

P0 最终架构为：

> Web K 共享核心 + Web K 平台适配器 + 独立功能模块 + 单文件 userscript 构建产物。

后续只开发 Telegram Web K：

```text
https://web.telegram.org/k/*
```

Web A 脚本继续作为历史参考只读保留，不新增功能、不建立适配器、不参与后续验收。

## 2. 稳定基线

```text
仓库：https://github.com/elio-zwd/telegram-tt
稳定分支：codex/tampermonkey-media-continuity
稳定 HEAD：5dac28431d4b51ea7a13c6bb485318d460eb3f25
userscript 版本：0.4.0-k5
PR #12 验收 Head：e1a18c527b730822d398a5a6f57f4487c701a407
PR #12 合并方式：Squash merge
```

## 3. P0 实施记录

| 阶段 | PR | 结果 | 合并 Commit |
| --- | --- | --- | --- |
| 规划 | PR #8 | 建立 Web K 唯一路线、模块化计划和迁移矩阵 | `88b359a9171faee33676301ae3fd01e0b367035f` |
| M1 | PR #9 | 建立多文件源码到单文件 userscript 的构建基座 | `0d083a6ba31052da139e3a77330c70ab22e6efba` |
| 路线收尾 | PR #10 | 刷新 Web K 插件优先迁移矩阵 | `059ea490155b10143673c7fa8718f334a23c9a9d` |
| M2 | PR #11 | 抽取 core 与 Web K platform | `13223980777d276bb698a71166edf45710475c6c` |
| M3 | PR #12 | 抽取四类 feature、完成 app 装配并删除 legacy | `5dac28431d4b51ea7a13c6bb485318d460eb3f25` |

## 4. 最终模块结构

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
│  ├─ close-position/
│  ├─ control-panel/
│  └─ debug/
├─ app.js
├─ entry.js
└─ version.js
```

确认：

- `entry.js` 只负责启动；
- `app.js` 显式装配 core、platform 和 features；
- `legacy-main.js` 已删除；
- 控制面板不直接查询 Telegram DOM；
- Telegram Web K 选择器集中在 platform；
- 最终用户继续安装单个 `tampermonkey/telegram-media-continuity-web-k.user.js`。

## 5. 最终只读验收

验收时间：`2026-08-01 15:59:00 UTC+8`。

环境：

```text
Windows 10 Pro x64 10.0.19045
Git 2.53.0.windows.2
Node.js v24.14.1
npm 11.11.0
Vite 8.1.0
Chrome 132.0.6834.160
Tampermonkey 5.3.6166
Telegram Web K
```

### 5.1 基线门禁

实际检出：

```text
codex/tampermonkey-media-continuity@5dac28431d4b51ea7a13c6bb485318d460eb3f25
```

与目标 HEAD 严格一致，验收前后 `git status --short` 均为空。

### 5.2 构建和静态检查

以下命令实际执行并通过：

```powershell
npm ci
npm run build:tampermonkey:web-k
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check
git status --short
git rev-parse HEAD
```

两次构建 SHA-256 完全一致，并与 PR #12 CI 一致：

```text
cebe2c0a2065d31feb75b6cc32c6ccd703a1bc9f09d3fe951f5fbcca498390a1
```

构建产物确认：

- 单个未压缩 IIFE；
- `@version 0.4.0-k5`；
- `@match https://web.telegram.org/k/*`；
- `@grant none`；
- 无 Web A match；
- 无动态 import；
- 无额外 chunk；
- 无 sourcemap；
- 无 `legacy-main.js` 引用；
- 生成文件与仓库跟踪版本一致。

### 5.3 真实浏览器回归

以下模块均通过：

- 基础页面安全、脚本注入、Shadow DOM 控制条和 Telegram 原生操作；
- 图片倒计时、连续切换、悬停/失焦/缩放暂停与队列末尾停止；
- 普通视频 `ended`、循环视频提示和自动播放安全降级；
- TT、Telegram 官方按钮和方向键导航；
- 官方关闭、`Esc`、自动切换、视频切换后的关闭定位；
- 相册整条消息定位、居中、高亮和清理；
- 目标不在 DOM、映射不确定、消息删除和切换聊天时安全降级；
- `sequenceId` 会话隔离；
- `window.TelegramMediaContinuity` 调试 API、timer 清理和脱敏边界；
- 控制台无未捕获异常。

最终验收结论：`PASS`。

## 6. P1 启动条件

以下条件已经满足：

- P0 的 M1、M2、M3 均已合并；
- 合并后的稳定 Squash Commit 已完成只读构建复验；
- 生成产物哈希与 CI 一致；
- 真实 Telegram Web K 核心回归通过；
- 工作区保持干净；
- Web A 未修改。

因此允许从稳定基线创建新的 P1 功能分支。

## 7. 下一目标

P1 首个任务：

```text
P1-01 正向和反向连续浏览
```

建议分支：

```text
feat/tampermonkey-web-k-browse-direction
```

建议 PR 标题：

```text
feat: 支持 Web K 正向和反向连续浏览
```

该功能完成后再实施媒体类型过滤，因为连续跳过和队列末尾行为依赖统一的浏览方向语义。
