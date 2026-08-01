# Telegram Web K PR-M3 功能模块说明

## 1. 范围

PR-M3 基于：

```text
Base 分支：codex/tampermonkey-media-continuity
Base SHA：13223980777d276bb698a71166edf45710475c6c
开发分支：refactor/tampermonkey-web-k-feature-modules
Draft PR：#12
userscript 版本：0.4.0-k5
```

本阶段只抽取连续浏览、关闭定位、控制面板和调试模块，建立应用装配层并删除临时 `legacy-main.js`。不增加产品功能，不改变 metadata、storage schema、Telegram DOM 选择器、事件参数、时间常量、控制条设计或公开调试 API。

后续仍只开发 Telegram Web K；Web A userscript 只读保留。

## 2. 最终源码结构

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

## 3. 模块职责

### 连续浏览

- 保留 `ViewerSession`；
- 图片加载后倒计时与 200 ms 状态刷新；
- 视频 `ended` 自动切换和循环视频提示；
- 悬停、页面失焦、缩放、拖动和滚轮交互暂停；
- TT、官方控件和方向键导航协调；
- 3 秒导航超时、100 ms 轮询和队列末尾停止；
- media listener、timer、interval、observer 的清理。

模块只通过 `platform/navigation.js` 触发 Telegram 官方导航。

### 关闭定位

- 捕获来源消息与相册 index；
- 管理 `pendingMediaTarget`、`lastConfirmedMediaTarget` 和映射丢失状态；
- 新媒体成功显示后才确认目标；
- 建立关闭快照与 `sequenceId`；
- 查看器关闭后最多等待约 2.4 秒；
- 精确匹配当前 peer 和消息；
- 居中、高亮约 1.2 秒并显示原有提示；
- 目标未加载、peer 改变或映射不确定时安全降级。

### 控制面板

控制面板只负责 Shadow DOM host、原模板和样式、状态渲染、展开/收起、用户事件转发和销毁。它不导入 platform，不查询 Telegram DOM，也不直接执行导航。

### 调试

继续公开：

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

`getSummary().version` 来自 `version.js`。探测输出继续排除聊天正文、频道名称、用户名、原始 href 和完整媒体 URL；probe timer 和 listener 可清理，关闭 probe 继续使用 6 秒 timeout。

## 4. 应用装配

```text
entry.js
→ createApp()
→ 创建 debug feature
→ 注入 control panel factory
→ 创建 ViewerSession factory
→ 装配 close-position 与 lifecycle
→ initializeScript()
```

`entry.js` 只调用 `createApp().start()`。`app.js` 使用明确参数和小型接口连接 core、platform 与四类 feature；没有事件总线、服务容器、通用插件框架、Web A 抽象或循环依赖。

## 5. legacy 删除

- `tampermonkey/src/web-k/legacy-main.js` 已从源码树删除；
- Vite 配置已删除 legacy metadata 转换插件；
- 检查器明确断言 legacy 不存在；
- CI Linux 与 Windows 都检查四类 feature 目录和 `app.js`；
- 生成 userscript 仅从 `entry.js` 构建。

## 6. 静态与构建验证

远端开发过程已完成：

- 新增和修改 JavaScript 逐文件 `node --check`；
- 相对 import 图存在性核对；
- PR 差异静态审阅；
- GitHub Actions Linux 已完成远端生成与检查；最终 Linux / Windows 双平台结果以 PR #12 最新 Head 的 CI 记录为准；
- 生成 userscript 已由构建任务回填，不手工编辑。

本文不把尚未完成的真实浏览器验收写成通过。

## 7. 浏览器验收状态

远端开发对话没有真实 Telegram Web K 浏览器控制能力，因此 PR #12 保持 Draft。PR #11 已通过的 22 项场景必须在当前 M3 Head 上完整重跑；在收到真实浏览器日志前，不得写成“行为等价已通过”。

重点回归：

- 图片、视频、相册和队列末尾；
- 官方/TT/方向键导航；
- 悬停、失焦、缩放和交互暂停；
- 官方关闭、`Esc` 与关闭后定位；
- 目标未加载、peer 改变和映射不确定时降级；
- 控制条布局、文案、展开和收起；
- 调试 API 名称、结构和脱敏；
- Telegram 输入、收发消息、滚动和聊天导航；
- 控制台无未捕获异常。

## 8. 风险与回滚

主要风险是媒体节点替换、导航 timeout、目标确认和查看器关闭之间的时序回归，以及 Telegram 虚拟列表导致目标不在 DOM。回滚时可整体回退 PR #12；版本和 storage schema 未变化，不需要迁移本地数据。用户侧可先在 Tampermonkey 中停用脚本恢复 Telegram 原始行为。
