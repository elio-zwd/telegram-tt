# Telegram Web K 连续浏览键盘快捷键

## 1. 结论

P1-03 在不修改连续浏览状态机、Telegram 平台适配器和控制面板的前提下，为活动媒体查看器会话增加两个快捷键：

```text
Space：暂停或继续连续浏览
A：开启或关闭连续浏览
```

Telegram 原有行为保持不变：

```text
ArrowLeft：上一项
ArrowRight：下一项
Esc：关闭查看器
```

V1 不实现 `D` 保存快捷键，也不新增任何自动保存、下载或媒体持久化能力。

## 2. 基线与依赖

开发基线：

```text
Base：codex/tampermonkey-media-continuity
Base SHA：b9b2b99fa7a30261cc38f2d6fcea808c5ba200b9
开发分支：feat/tampermonkey-web-k-shortcuts
预留版本：0.4.0-k8
```

P1-02 媒体类型筛选与本任务并行开发，但合并顺序固定：

```text
P1-02 → P1-03
```

P1-02 合并后，本分支必须基于最新 `codex/tampermonkey-media-continuity` 重新基准化，确认版本为 `0.4.0-k8`，重新生成 userscript，并重新执行 CI 与真实浏览器验收。

## 3. 架构设计

新增 `features/shortcuts/**`，只负责键盘事件识别、触发保护和监听器清理。

```text
features/shortcuts/keyboard-shortcuts.js
  识别 Space 和 A
  检查输入、组合输入、修饰键、查看器可见性和会话状态
  只在真正处理快捷键时阻止默认行为
  销毁时移除 keydown listener

features/shortcuts/index.js
  调用 ViewerSession 现有公开方法
  将快捷键生命周期与查看器会话生命周期组合
  转发 lifecycle 和调试 API 仍需访问的公开接口
```

快捷键模块只调用：

```text
ViewerSession.toggleContinuous()
ViewerSession.togglePause()
ViewerSession.destroy()
ViewerSession.requestRefresh()
ViewerSession.createCloseSnapshot()
ViewerSession.getLastConfirmedMediaTarget()
```

模块不复制连续浏览状态、暂停状态、计时器、导航、媒体确认或关闭定位逻辑。

`app.js` 先创建原 `ViewerSession`，再使用快捷键会话包装器组合。包装后仍公开：

```text
viewer
requestRefresh()
createCloseSnapshot()
getLastConfirmedMediaTarget()
destroy()
```

销毁顺序固定为：

1. 移除快捷键 `keydown` listener；
2. 销毁原 `ViewerSession`；
3. 原会话继续清理媒体监听器、观察器、计时器和控制条。

## 4. 触发规则

### 4.1 允许触发

只有同时满足以下条件时才处理 `Space` 或 `A`：

- 当前存在尚未销毁的快捷键会话；
- 查看器仍连接到 DOM；
- 查看器可见；
- 按键不是长按重复事件；
- 不在输入法组合期间；
- 未按下 `Ctrl`、`Alt` 或 `Meta`；
- 事件目标不属于可编辑区域；
- 事件尚未被其他逻辑标记为已处理。

### 4.2 可编辑区域

以下目标及其事件传播路径不得触发快捷键：

```text
input
textarea
select
[contenteditable]，但明确 contenteditable="false" 除外
[role="textbox"]
```

`[role="textbox"]` 用于覆盖 Telegram 消息输入编辑器及其他语义输入组件，不依赖随机类名或 Telegram 私有模块。

### 4.3 默认行为和传播

只有确认命中 `Space` 或 `A` 后才执行：

```js
event.preventDefault();
event.stopPropagation();
```

方向键、Esc 以及其他按键不会被阻止、不会停止传播，也不会调用连续浏览方法。

## 5. 快捷键语义

### Space

调用 `ViewerSession.togglePause()`：

- 连续浏览开启时，在暂停与继续之间切换；
- 连续浏览关闭时，沿用现有 `ViewerSession` 行为，不复制或修改状态；
- 控制条通过原会话的 `panel.render(viewState())` 同步显示。

### A

调用 `ViewerSession.toggleContinuous()`：

- 在开启和关闭连续浏览之间切换；
- 开启时沿用原逻辑清除暂停状态；
- 设置持久化、计时器重启和控制条同步均由原会话负责。

快捷键不关心当前自动浏览方向，因此正向和反向模式使用完全相同的切换逻辑。

## 6. 静态和临时行为核验

本次远端开发环境无法克隆 GitHub 仓库，也没有完整依赖环境，因此没有执行 Vite 构建。

已使用临时、未提交的 Node 行为脚本核验：

- `Space` 只调用一次暂停切换，并阻止默认行为；
- `A` 只调用一次连续浏览切换，并阻止默认行为；
- `event.repeat` 不触发；
- `event.isComposing` 不触发；
- `Ctrl` 修饰键不触发；
- `input` 不触发；
- `[role="textbox"]` 不触发；
- `ArrowLeft` 不被拦截；
- `Esc` 不被拦截；
- `destroy()` 后 listener 被移除；
- 新增模块和 `app.js` 通过 `node --check` 语法检查。

以上仅证明独立快捷键逻辑和语法，不等同于完整仓库构建、GitHub CI 或真实 Telegram Web K 浏览器验收。

## 7. 真实浏览器验收

记录环境：

```text
操作系统：
浏览器及版本：
Tampermonkey 版本：
分支和 HEAD：
userscript 版本：0.4.0-k8
```

### 7.1 Space 暂停和继续

1. 打开图片并开启连续浏览；
2. 图片倒计时期间按一次 `Space`；
3. 控制条应显示暂停，等待超过图片时长不得切换；
4. 再按一次 `Space`；
5. 控制条应显示继续，并从原会话规则重新调度当前媒体。

### 7.2 A 开启和关闭

1. 查看器可见时按 `A`；
2. 控制条连续浏览状态切换；
3. 再按 `A` 恢复；
4. 刷新页面后确认开关持久化仍由原设置逻辑负责。

### 7.3 长按保护

1. 长按 `Space`；
2. 只允许首次非 repeat 事件触发一次；
3. 长按 `A` 重复相同步骤；
4. 控制条不得快速来回闪烁。

### 7.4 输入保护

分别在以下位置输入包含空格和字母 A 的文本：

- Telegram 消息输入编辑器；
- 搜索输入框；
- 弹窗输入框；
- `textarea`；
- 下拉选择；
- 任意 `contenteditable` 编辑区；
- 输入法组合过程。

连续浏览和暂停状态不得改变，文字输入必须正常。

### 7.5 修饰键保护

分别按下：

```text
Ctrl+A
Alt+A
Meta+A
Ctrl+Space
Alt+Space
Meta+Space
```

不得触发插件快捷键，也不得破坏浏览器或 Telegram 原行为。

### 7.6 Telegram 原快捷键

1. 按 `ArrowLeft`，Telegram 正常进入上一项；
2. 按 `ArrowRight`，Telegram 正常进入下一项；
3. 按 `Esc`，Telegram 正常关闭查看器；
4. 插件不得对三个按键调用 `preventDefault()` 或停止传播。

### 7.7 正向和反向模式

1. 分别选择正向和反向自动浏览；
2. 在两种模式下重复 `Space` 与 `A` 验收；
3. 快捷键只改变开关和暂停状态，不改变浏览方向；
4. 后续自动切换继续遵循当前方向。

### 7.8 生命周期与重复 listener

1. 打开查看器，按 `A` 一次，确认只切换一次；
2. 关闭查看器；
3. 页面普通区域按 `A` 和 `Space`，不得触发；
4. 快速连续打开、关闭、重新打开查看器；
5. 每次按键仍只触发一次；
6. 控制台不得出现未捕获异常。

### 7.9 回归

- 控制条按钮仍正常工作；
- Telegram 官方左右按钮仍正常；
- 关闭定位仍定位最后成功确认媒体；
- `window.TelegramMediaContinuity.inspect()` 正常；
- `getSummary()`、关闭流程探测和其他调试 API 正常；
- P1-02 合并后，媒体筛选与快捷键组合无冲突。

## 8. 风险与降级

- Telegram 若在输入组件上缺少标准 `contenteditable` 和 `role="textbox"` 语义，可能需要基于真实 DOM 增加平台级公开证据；不得在快捷键模块内写入随机类名选择器。
- 快捷键监听使用捕获阶段，仅处理 `Space` 和 `A`；任何识别不确定场景都优先不触发。
- 查看器不可见、断开或会话销毁后快捷键安全失效，Telegram 页面继续保持原行为。

## 9. 回滚

可整体回滚本功能的 `features/shortcuts/**`、`app.js` 接线和版本/文档提交。回滚不会迁移或删除用户设置，因为本功能没有新增 storage 字段。
