# Telegram Web K P1-09 补充专项研究结论

## 0. 门禁结论

```text
循环媒体自动切换根因：PASS
浏览方向与消息加载映射：PASS
真实页面研究门禁：PASS
允许进入实施计划与运行代码开发：是
```

本文件记录 2026-08-02 在真实 Windows Chrome、Tampermonkey 和已登录 Telegram Web K 页面完成的补充专项研究。全过程只读取公开 DOM、标准媒体属性与事件、当前 userscript 公开状态，不记录聊天正文、频道名称、用户名、真实 peer/message ID 或媒体 URL。

## 1. 研究环境

```text
操作系统：Windows 10 Pro 64-bit，Build 19045
Chrome：150.0.0.0 Official Build
Tampermonkey：5.5.0_0
Telegram Web K：https://web.telegram.org/k/
userscript：0.4.0-k10
userscript SHA-256：8BDDEC8E413CF3CDBC01B2D7032AECD65DC280463913C0A16AC5705AE2243E75
研究开始：2026-08-02T14:20:46+08:00
研究结束：2026-08-02T14:21:18+08:00
研究分支：feat/tampermonkey-web-k-media-stream-continuation
研究 HEAD：353c77f016bdffa6ce51813f45e2680341ff9072
```

研究结束时：

```text
git status --short：空
git diff --exit-code：0
git rev-parse HEAD：353c77f016bdffa6ce51813f45e2680341ff9072
```

## 2. 循环媒体自动切换根因

至少使用 3 个满足以下公开条件的循环媒体样本：

```text
HTMLVideoElement
loop === true
```

### 2.1 指针悬停

实测序列：

```text
play -> playing -> pointerenter
```

控制条状态稳定进入：

```text
鼠标悬停，倒计时暂停
```

在指针持续停留超过 `photoDurationMs` 时，导航按钮可用，但不会自动切换。

结论：当前查看器打开后，光标通常自然落在画面中央；活动循环媒体收到 `pointerenter` 后，现有会话加入 `HOVER` 暂停原因并清除倒计时。这是循环媒体无法自动切换的主要真实根因。

### 2.2 指针移出

实测序列：

```text
pointerleave -> 重新计时 -> timer 到期 -> 官方导航
```

指针移出后，可按完整 `photoDurationMs` 稳定自动切换。

结论：循环媒体本身的计时、导航和节点序列隔离可用；问题不是 timer 或官方导航整体失效，而是自然悬停永久阻断计时。

### 2.3 已播放初始化

当 listener 绑定时循环媒体已经满足：

```text
paused === false
readyState === 4
```

现有 `currentVideoHasPlayed` 初始化可直接允许倒计时，随后自动切换成功。

结论：绑定前已经播放的初始化逻辑有效，不是主要缺陷。

### 2.4 绑定后播放

实测序列：

```text
canplay -> play -> playing
```

状态从“等待循环媒体开始播放”进入倒计时并成功导航。

结论：`playing` 后启动循环媒体倒计时的现有逻辑有效。

### 2.5 缓冲恢复

实测序列：

```text
waiting -> stalled -> canplay -> playing
```

15 秒内恢复时，`BUFFERING` 暂停可被清除并继续自动切换；超过慢缓冲阈值时仍按现有设计要求用户确认。

结论：短暂缓冲不会留下永久暂停，慢缓冲保护继续保留。

### 2.6 节点替换

切换循环媒体时观察到旧节点断开、新节点接管。现有 `mediaSequenceId` 与 `isCurrentMedia()` 成功隔离旧 timer 和旧事件回调。

结论：节点替换隔离有效，不需要重写该机制。

### 2.7 边界状态

当 timer 到期且官方方向按钮可用时，自动导航成功；当方向按钮带 `.hide` 时，timer 到期但无法导航，进入当前队列边界路径。

结论：循环媒体修复只应移除“自然悬停阻断”，不能绕过缓冲、全屏、画中画、节点失效、媒体冲突或用户实际交互保护。

## 3. 浏览方向与加载方向映射

使用同一频道内三个相邻媒体，脱敏为：

```text
消息 DOM 顶部／更旧
media-A
media-B（从此处打开查看器）
media-C
消息 DOM 底部／更新
```

### 3.1 正向

```text
browseDirection = forward
viewer 物理按钮 = .media-viewer-switcher-right
消息 DOM 方向 = following／向下
消息时间方向 = 更新消息
列表加载方向 = 底部
```

从 `media-B` 点击右侧官方按钮后打开 `media-C`。

### 3.2 反向

```text
browseDirection = backward
viewer 物理按钮 = .media-viewer-switcher-left
消息 DOM 方向 = preceding／向上
消息时间方向 = 更旧历史消息
列表加载方向 = 顶部，scrollTop -> 0
```

从 `media-B` 点击左侧官方按钮后打开 `media-A`。加载更旧消息时，新消息节点采用 DOM 前插；浏览器滚动锚定可能使加载完成后的最终 `scrollTop` 数值增大。

## 4. 对实现的直接约束

### 4.1 循环媒体

- 图片继续保留 HOVER 暂停；
- 普通视频继续等待 `ended`；
- 循环媒体不再因自然 `pointerenter` 加入 HOVER；
- `pointerdown`、wheel、全屏、PiP、离线、缓冲、失败、节点失效和媒体冲突继续暂停；
- 不修改 `video.loop`，不使用 URL、文件名或 Telegram 私有对象判断媒体类型。

### 4.2 队列续流

- 自动导航遇到 `.hide` 边界时，不得调用旧 `finish()` 永久关闭连续浏览；
- 保持 `continuousEnabled = true`；
- 使用唯一 continuation operation ID；
- 程序化关闭 viewer 时，lifecycle 必须跳过普通关闭后的定位、居中和高亮；
- `forward` 只驱动列表底部，`backward` 只驱动列表顶部；
- 加载成功至少需要 message identity 集合、媒体目标集合或 `scrollHeight` 的结构变化，不得只依赖固定 sleep；
- 新 viewer 必须由精确 peer、message、album index 对应的消息媒体入口打开；
- 用户点击、按键、切换频道或话题时必须取消旧 operation；
- 单次 operation 最长 20 秒、最多 8 次滚动；
- 筛选序列继续沿用最多 50 项和总时限约 15 秒；
- 未找到更多媒体时进入可手动继续的暂停状态，不把 `continuousEnabled` 持久化为 false。

## 5. 真实性边界

上述结论仅证明当前研究环境中的公开 DOM 和标准事件行为，不承诺所有未来 Telegram Web K 版本“100% 零误判”或真正无限运行。正式实现必须保留超时、次数、peer 身份、节点连接、可见性、operation ID 和用户接管保护。
