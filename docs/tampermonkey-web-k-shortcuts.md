# Telegram Web K 连续浏览键盘快捷键

## 1. 结论

P1-03 为活动的 Telegram Web K 媒体查看器会话增加两个快捷键：

```text
Space：暂停或继续连续浏览
A：开启或关闭连续浏览
```

Telegram 原有快捷键保持不变：

```text
ArrowLeft：上一项
ArrowRight：下一项
Esc：关闭媒体查看器
```

V1 不实现 `D` 保存快捷键，也不增加自动保存、自动下载、批量保存或其他媒体持久化能力。

## 2. 最新基线与重新基准化

```text
稳定分支：codex/tampermonkey-media-continuity
稳定基线：cc89a47fabef24d7d80f5d3c6cfa5c060faeb0d9
稳定版本：0.4.0-k7
开发分支：feat/tampermonkey-web-k-shortcuts
目标版本：0.4.0-k8
```

P1-02 PR #16 已完成真实浏览器验收并以 Squash Merge 方式进入稳定分支。

PR #18 原 Head `614b6613e625d0571ce035517445054b4003731b` 相对新基线为 `ahead 5 / behind 1`。当前 GitHub 能力没有安全的服务端 rebase 操作，因此采用不改写历史的等价重新基准化方案：

1. 以 `cc89a47fabef24d7d80f5d3c6cfa5c060faeb0d9` 的完整树作为合并结果基础；
2. 只叠加 PR #18 原有的快捷键文档、`app.js`、`features/shortcuts/**` 和 `0.4.0-k8` 版本文件；
3. 创建双父合并提交；
4. 使用非强制 fast-forward 更新 PR #18 分支。

该方案完整保留 P1-02 的设置、媒体分类、有界筛选序列、关闭定位隔离、控制条和 `0.4.0-k7` 生成产物历史，同时保留 PR #18 原有提交，不强推、不删除分支、不改写他人历史。重新基准化后分支相对最新稳定基线为 `behind 0`。

## 3. 架构设计

新增独立 Feature：

```text
tampermonkey/src/web-k/features/shortcuts/keyboard-shortcuts.js
tampermonkey/src/web-k/features/shortcuts/index.js
```

### `keyboard-shortcuts.js`

只负责：

- 识别 `Space` 和 `A`；
- 检查事件是否已被处理；
- 检查长按、输入法组合和修饰键；
- 检查输入区域；
- 检查查看器是否仍连接且可见；
- 注册和移除 `keydown` listener；
- 真正命中快捷键后阻止默认行为和传播。

该模块不查询 Telegram 私有 DOM，不依赖随机类名，不调用 platform，不保存业务状态。

### `index.js`

只负责把快捷键与现有 `ViewerSession` 组合：

```text
Space -> ViewerSession.togglePause()
A     -> ViewerSession.toggleContinuous()
```

包装会话继续转发 lifecycle、关闭定位和调试 API 需要的接口：

```text
viewer
requestRefresh()
createCloseSnapshot()
getLastConfirmedMediaTarget()
destroy()
```

销毁时先移除快捷键 listener，再调用原 `ViewerSession.destroy()`。

### `app.js`

只做显式装配：先创建原 `ViewerSession`，再使用 `createShortcutSession()` 包装。`entry.js`、lifecycle、platform、控制面板和关闭定位模块均不承担快捷键业务。

## 4. 输入与触发保护

以下事件不得触发快捷键：

```text
input
textarea
select
[contenteditable]，但 contenteditable="false" 除外
[role="textbox"]
输入法组合期间
event.repeat
Ctrl
Alt
Meta
event.defaultPrevented
查看器不可见
查看器已断开 DOM
快捷键会话已销毁
```

使用 `event.composedPath()` 检查完整事件传播路径，以覆盖 Shadow DOM 和嵌套编辑器。`[role="textbox"]` 用于覆盖 Telegram 消息输入编辑器和其他标准语义文本框，不依赖 Telegram 私有类名。

## 5. 默认行为边界

只有确认命中 `Space` 或 `A` 后才执行：

```js
event.preventDefault();
event.stopPropagation();
```

以下按键不会进入处理分支：

```text
ArrowLeft
ArrowRight
Esc
D
其他普通按键
```

因此 Telegram 官方方向键、关闭快捷键、输入和浏览器快捷键继续保持原行为。

## 6. 与 P1-02 媒体筛选的组合兼容

快捷键不复制任何 P1-02 状态，只调用 `ViewerSession` 现有公开方法。

### Space 暂停和继续

`togglePause()` 已实现：

- 连续浏览关闭时直接返回，不会被 Space 擅自开启；
- 从运行切换为暂停时调用 `takeOverFilterSequence()`；
- 取消当前筛选序列、递增序列 ID，并使旧 timer 和旧 poll 失效；
- 清理中间媒体的目标确认屏蔽并按当前实际媒体重新确认；
- 更新控制条暂停状态；
- 恢复时从当前实际显示媒体重新调度，不恢复旧筛选序列。

### A 开启和关闭

`toggleContinuous()` 已实现：

- 调用 `takeOverFilterSequence()` 取消旧筛选序列；
- 在开启和关闭之间切换；
- 开启时清除暂停状态；
- 使用 `tt.mediaContinuity.v1` 的原设置路径持久化；
- 重新渲染控制条并从当前实际媒体调度；
- 关闭后图片 timer、视频后续自动导航和筛选序列均不能继续执行。

### 支持组合

快捷键不改变当前浏览方向或媒体筛选，因此同一实现覆盖：

```text
正向 + 图片和视频
反向 + 图片和视频
正向 + 仅图片
反向 + 仅图片
正向 + 仅视频
反向 + 仅视频
```

### 手动导航

快捷键模块不处理方向键。TT 左右按钮、Telegram 官方左右按钮和 ArrowLeft／ArrowRight 继续由原会话按单步手动导航处理，手动进入不匹配媒体时不会追加自动跳过。

### 关闭定位

快捷键暂停、关闭或会话销毁均沿用 P1-02 的 `takeOverFilterSequence()`、`blockCurrentTargetConfirmation` 和 `MediaTargetTracker`：

- 自动跳过中的中间媒体不会成为最终关闭定位目标；
- 最后真正成功显示的媒体仍可成为确认目标；
- 相册继续定位整条来源消息；
- 销毁时旧筛选序列、导航 poll、timer 和 listener 均失效。

## 7. 静态门禁

`check:tampermonkey:web-k` 在完整保留 P1-02 门禁的基础上增加：

- `features/shortcuts/**` 必须存在；
- `app.js` 必须显式装配快捷键会话；
- 快捷键模块不得依赖 platform 或直接查询 Telegram DOM；
- 必须包含 `input`、`textarea`、`select`、`contenteditable` 和 `role=textbox` 保护；
- `contenteditable=false` 不得被误判；
- 必须处理 `event.defaultPrevented`、`event.repeat`、`event.isComposing`、Ctrl、Alt、Meta、查看器连接和可见性；
- 只能处理 Space 和 A，不得出现 ArrowLeft、ArrowRight、Escape 或 KeyD；
- `preventDefault()` 和 `stopPropagation()` 只能位于统一命中入口；
- `destroy()` 必须移除捕获阶段 listener；
- 会话包装器必须调用现有 toggle 方法并完整转发 lifecycle 接口；
- 生成 userscript 必须包含快捷键代码；
- P1-02 的 `mediaFilter`、最大跳过 50 项、15 秒总超时、序列隔离和关闭定位屏蔽门禁继续保留。

## 8. 构建与验证

最终需要执行：

```powershell
npm ci
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --exit-code -- tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check origin/codex/tampermonkey-media-continuity...HEAD
git diff --name-status origin/codex/tampermonkey-media-continuity...HEAD
git status --short
git rev-parse HEAD
```

连续构建两次的 SHA-256 必须一致。生成 userscript 必须来自构建或 GitHub Actions artifact，禁止手工拼接。

构建和 CI 只能证明源码、产物和静态门禁成立，不能替代真实登录 Telegram Web K 的端到端验收。

## 9. 真实浏览器验收矩阵

记录：

```text
操作系统：
浏览器及版本：
Tampermonkey 版本：
Telegram Web K 地址与验收时间：
分支与精确 HEAD：
userscript 版本：0.4.0-k8
userscript SHA-256：
```

至少覆盖：

1. Space 暂停和继续；
2. A 开启和关闭；
3. 连续浏览关闭时 Space 不开启；
4. 正向模式；
5. 反向模式；
6. 图片和视频模式；
7. 仅图片模式；
8. 仅视频模式；
9. 筛选跳过中按 Space，旧序列立即停止；
10. 再按 Space 后从当前实际媒体重新开始；
11. 筛选跳过中按 A，后续自动点击停止；
12. 再按 A 后使用当前方向和筛选值重新开始；
13. 快速连续按键不会产生旧序列串入；
14. 长按只触发首次非 repeat 事件；
15. Telegram 消息输入框；
16. 搜索框；
17. 弹窗输入框；
18. textarea、select、contenteditable 和 role=textbox；
19. contenteditable=false 可以正常触发快捷键；
20. 中文输入法组合；
21. Ctrl、Alt、Meta 组合键；
22. ArrowLeft、ArrowRight 原单步行为；
23. Esc 原关闭行为；
24. 快速关闭和重新打开查看器；
25. listener 不重复，一个按键只触发一次；
26. 查看器关闭后快捷键失效；
27. 关闭定位最后成功媒体；
28. 相册定位整条来源消息；
29. 调试 API 名称、结构和隐私输出；
30. Telegram 输入、消息收发、滚动和导航回归；
31. 控制台无未捕获异常、无 timer、observer 或 listener 泄漏。

## 10. 风险与安全降级

- Telegram 输入组件若未来缺少标准 `contenteditable` 和 `role="textbox"` 语义，需要基于真实 DOM 增加公开、稳定证据；不得在快捷键模块中加入随机类名。
- listener 使用捕获阶段以便在 Telegram 默认行为前处理 Space 和 A，但任何不确定场景都优先不触发。
- 快捷键只改变现有会话状态，不新增 timer、observer、storage 字段或 Telegram DOM 适配。
- 查看器不可见、断开或会话销毁后快捷键安全失效，Telegram 页面恢复原始行为。

## 11. 回滚

可以整体回滚 P1-03 对应提交。该功能没有新增 storage 字段，不需要迁移或清理用户设置。用户侧也可以停用 Tampermonkey 脚本恢复 Telegram 原行为。