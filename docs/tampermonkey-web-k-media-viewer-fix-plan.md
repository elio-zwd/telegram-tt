# Telegram Web K 媒体续播修复计划

## 目标

修复 Tampermonkey 媒体续播脚本在 Telegram Web K 页面不可用的问题，并通过真实 Chrome + Tampermonkey 页面验证图片、视频、手动切换和自动连续浏览。

测试页面：

```text
https://web.telegram.org/k/#@meizi_office
```

基线分支：

```text
codex/tampermonkey-media-continuity
```

开发分支：

```text
fix/tampermonkey-web-k-media-viewer
```

## 已确认根因

### 1. 原脚本未注入 Web K

原脚本只声明：

```text
@match https://web.telegram.org/a/*
```

用户实际打开的是：

```text
https://web.telegram.org/k/*
```

首轮诊断确认：

- `window.TelegramMediaContinuity` 不存在；
- 页面根节点没有初始化标记；
- TT 控制条没有挂载；
- 无脚本异常，因为脚本根本没有运行。

### 2. Web K 与 Web A 使用不同媒体查看器 DOM

Web K 的稳定结构包括：

```text
.media-viewer-whole
.media-viewer-movers
.media-viewer-switcher-left
.media-viewer-switcher-right
```

原 Web A 脚本使用 `.MediaViewerSlides`、`.MediaViewerSlide` 和 A 版导航逻辑，不能只补充 `@match` 后继续复用。

### 3. Web K 默认布局矩阵被误判为用户缩放

首轮真实浏览器验收发现：

- 脚本成功注入；
- TT 控制条成功显示；
- 手动上一项、下一项通过；
- 视频结束切换通过；
- 队列末尾与原页面回归通过；
- 图片自动倒计时失败。

失败状态为：

```text
正在查看图片，倒计时暂停
```

原因是旧判断沿图片父节点读取 CSS Matrix。Web K 为适配图片尺寸，会在默认布局容器上设置大于 1 的 Matrix，这不是用户主动缩放。

Web K 自身在用户进入缩放状态时，会给 `.media-viewer-whole` 增加：

```text
is-zooming
```

因此修复方案改为读取 Web K 的明确状态类，不再根据布局 Matrix 猜测用户缩放。

## 实现范围

新增 Web K 专用验证脚本：

```text
tampermonkey/telegram-media-continuity-web-k.user.js
```

当前版本：

```text
0.3.0-k3
```

实现内容：

- 匹配 `https://web.telegram.org/k/*`；
- 识别 `.media-viewer-whole`；
- 优先在 `.media-viewer-movers` 识别活动图片或视频；
- 识别 Web K 官方左右切换控件；
- 直接调用官方控件 `.click()`；
- 图片按设定时间自动切换；
- 视频触发 `ended` 后切换；
- 页面失焦、鼠标悬停和用户交互时暂停；
- 通过 `.media-viewer-whole.is-zooming` 判断用户缩放；
- 缩放状态进入或退出时重新调度倒计时；
- 提供 Shadow DOM 控制条；
- 提供脱敏调试 API；
- 无法识别结构时安全失效。

## 首轮浏览器验收结果

验收 Commit：

```text
97f14f7fc1f7f9553d7e302dac6a2c35a771eed9
```

环境：

```text
Windows 10 x64
Chrome 150.0.0.0
Tampermonkey 4.18+
```

结果：

| 项目 | 结果 |
| --- | --- |
| 脚本注入 | PASS |
| TT 控制条 | PASS |
| 手动上一项 | PASS |
| 手动下一项 | PASS |
| 视频自动播放 | PASS |
| 视频结束切换 | PASS |
| 循环视频处理 | PASS |
| 队列末尾 | PASS |
| Telegram 原功能回归 | PASS |
| 图片自动切换 | FAIL |
| 连续三张图片 | FAIL |

图片失败根因已在以下 Commit 修复：

```text
f35098832745c23056b970ef5287a1fc5175bca3
```

## 当前验证状态

已完成：

- 首轮真实浏览器验收；
- 根因定位；
- 静态核对 Web K 的 `is-zooming` 状态；
- 修复默认布局 Matrix 误判；
- 增加缩放状态变化后的计时器重调度；
- 本地隔离逻辑断言：默认状态为 false，带 `is-zooming` 时为 true。

尚未完成：

- 对 `f35098832745c23056b970ef5287a1fc5175bca3` 执行完整 `node --check`；
- 图片倒计时定向复测；
- 连续自动切换至少三张图片；
- 点击官方缩放按钮时立即暂停；
- 退出缩放后从完整时间重新计时；
- 确认修复未回归手动切换、视频和队列末尾。

## 定向验收条件

### 默认图片

- `TelegramMediaContinuity.inspect().isZoomed` 为 `false`；
- 开启连续浏览后显示倒计时；
- 到期只切换一项；
- 新图片重新开始完整倒计时；
- 连续至少三张图片。

### 用户缩放

- 点击 Telegram 官方缩放按钮后，查看器包含 `is-zooming`；
- `inspect().isZoomed` 为 `true`；
- 倒计时立即停止；
- 等待超过图片时长不得切换；
- 退出缩放后 `isZoomed` 恢复为 `false`；
- 从完整时长重新倒计时。

### 回归

- TT 左右切换方向正确；
- 视频结束后仍切换；
- 队列末尾仍停止；
- 不影响 Telegram 关闭、滚动和媒体控制。

## 风险

- 相册、受保护媒体、付费媒体和特殊视频可能使用不同结构；
- 当前仍为 Web K 核心验证版，尚未迁移 Web A 的频道续播位置功能；
- Web A 与 Web K 暂时采用两个脚本，完成验收后再收敛安装方式。

## 回滚

本分支只新增 Web K 脚本和文档。出现问题时停用或删除 Web K 验证脚本即可，不影响 Web A 脚本和 Telegram 页面数据。
