# Telegram Web K 关闭后定位最后媒体消息开发交接

## 1. 最终结论

PR #7 的 `0.4.0-k5` 已完成代码实现、静态检查和 Windows 10 真实 Telegram Web K 浏览器验收。

最终实现：

> 连续浏览媒体后，关闭媒体查看器时，只在能够高可信确认消息身份的情况下，将聊天定位到最后一个成功显示媒体所属消息；无法安全确认时明确降级，绝不滚动到错误消息。

当前状态：

- PR #7：**Ready for review**；
- PR：Open、未合并；
- 核心定位、降级路径和现有功能回归：通过；
- 无已知合并阻塞项；
- 未经用户明确授权不得合并。

## 2. 仓库、分支和 Commit

```text
仓库：https://github.com/elio-zwd/telegram-tt
PR：https://github.com/elio-zwd/telegram-tt/pull/7
基线分支：codex/tampermonkey-media-continuity
基线 SHA：b7c89bea426f420b563d3bd5089056ee1cdc43dc
开发分支：feat/tampermonkey-web-k-close-to-media-position
探测阶段 HEAD：97f3a8706dbdd2d3d39c633efbfab40b3ab6411c
核心实现 Commit：d3e3bb5cc03e71736f421396700899157b4ce396
README Commit：48bca38f5ffbe27f6fe8cde9061288cf4134e406
首轮交接 Commit：fa68b55b9241451675ab8b070cd2e56b35a6cce8
最终 Task 验收 Commit：eade883d713745ecdcafa4a3c048710ce56a8393
目标脚本：tampermonkey/telegram-media-continuity-web-k.user.js
脚本版本：0.4.0-k5
```

本文件提交后，以远端开发分支最新 HEAD 为准。

## 3. 已确认真实 DOM

真实探测环境：

```text
Windows 10 专业版 64 位 10.0.19045
Chrome 150.0.0.0
Tampermonkey 4.18+
Node v24.14.1
Git 2.53.0.windows.2
Telegram Web K
```

已确认：

- 消息 ID：`data-mid`；
- 对话 ID：`data-peer-id`；
- 普通消息：`.bubble`；
- 相册媒体项：`.album-item.grouped-item`；
- 聊天滚动容器：`.scrollable.scrollable-y.bubbles-scrollable`；
- `Esc` 关闭时查看器会从 DOM 移除；
- Telegram 原生关闭前后不会自动改变聊天滚动位置。

官方关闭按钮探测样本存在状态矛盾，因此正式实现不绑定猜测的关闭按钮类名，而是统一等待查看器实际隐藏或移除。

尚未确认可安全使用的官方“跳转到消息”控件。本版在目标不在 DOM 时返回 `target-not-loaded`，不自动点击候选控件。

## 4. `0.4.0-k5` 实现摘要

### 4.1 消息来源和身份

- 用户从聊天点击媒体时读取公开 DOM；
- 使用数字 `data-peer-id + data-mid` 建立高可信目标；
- 相册记录内部媒体 `messageKey` 与 `albumIndex`；
- 不阻止 Telegram 原事件；
- 不读取正文、频道名、用户名或媒体 URL；
- 目标只存在当前页面会话，不新增位置持久化。

### 4.2 最后成功媒体

- 图片必须可见、加载完成且 `naturalWidth > 0`；
- 视频必须可见并取得元数据或有效尺寸；
- 新媒体仍在加载或加载失败时保留上一成功目标；
- 当前成功媒体无法建立高可信映射时禁止定位到旧消息；
- TT 控制条、Telegram 官方按钮、方向键、图片自动切换和视频 `ended` 均通过媒体实际变化与成功显示确认目标。

### 4.3 关闭后定位

- 等待查看器实际隐藏或移除；
- 使用单调 `sequenceId` 防止旧任务和重复任务；
- 定位等待有明确总超时；
- 只在当前活动聊天中精确匹配目标；
- 频道变化或新操作会取消旧任务；
- 精确匹配后滚动到视口中部附近；
- 最多执行一次有界位置复核；
- 高亮约 1.2 秒后清理；
- 相册验证内部项，但滚动和高亮整条 `.bubble`。

### 4.4 安全降级

- 目标不在 DOM：`target-not-loaded`；
- 切换聊天：`cancelled-peer-changed` 或取消旧序列；
- 映射不确定：正常关闭且不滚动；
- 不猜测滚动方向；
- 不循环加载历史；
- 不连续点击；
- 不调用 Telegram API、Bot API、MTProto、IndexedDB 或私有运行时；
- 不点击未经确认的官方跳转控件。

## 5. 调试接口

```js
TelegramMediaContinuity.getSummary();
TelegramMediaContinuity.inspect();
TelegramMediaContinuity.inspectMessageMapping();
TelegramMediaContinuity.getLastLocationResult();
TelegramMediaContinuity.armCloseFlowProbe();
TelegramMediaContinuity.getCloseFlowProbe();
```

定位结果只包含状态、序列号和白名单数字 ID，不包含聊天正文或媒体 URL。

常见结果：

```text
located
target-not-loaded
unmapped-current-media
cancelled-peer-changed
viewer-still-visible
no-confirmed-target
```

## 6. 静态验收结果

在 Windows 10 本地只读验收中实际执行：

```powershell
git fetch origin
git checkout feat/tampermonkey-web-k-close-to-media-position
git pull --ff-only origin feat/tampermonkey-web-k-close-to-media-position
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
node --version
git --version
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check origin/codex/tampermonkey-media-continuity...HEAD
git diff --name-status origin/codex/tampermonkey-media-continuity...HEAD
git show --stat --oneline HEAD
```

结果：

- 分支正确；
- 已验收 HEAD 为 `fa68b55b9241451675ab8b070cd2e56b35a6cce8`；
- `node --check`：退出码 0、无输出；
- `git diff --check`：退出码 0、无输出；
- 工作区干净；
- 差异仅限既定 7 个文件；
- Web A 脚本和 `src/` 未修改。

说明：最终文档提交会使远端 HEAD 前进，但不会改变已验收的 `0.4.0-k5` 脚本 Blob。

已验收脚本 Blob SHA：

```text
bff54d20036894a2e4a17655856a6325f66a6748
```

## 7. 真实浏览器验收结果

### 7.1 核心定位

全部通过：

- 直接打开图片后使用官方关闭动作；
- `Esc` 关闭；
- TT 连续切换至少三项；
- TT 上一项、下一项；
- Telegram 官方左右切换；
- 键盘 `ArrowLeft`、`ArrowRight`；
- 图片自动连续播放；
- 新媒体加载中关闭并保留上一成功媒体；
- 视频 `ended` 后切换；
- 相册内部切换后定位整条相册消息。

所有成功定位结果均为：

```text
status = located
source = exact-dom-match
```

未发现方向反转或错误消息定位。

### 7.2 安全降级

全部通过：

- 目标不在 DOM：`target-not-loaded`，提示后停止；
- 切换聊天：`cancelled-peer-changed`，新聊天无错误高亮；
- 新操作取消旧任务：旧序列停止并清理高亮；
- 无循环加载；
- 无重复滚动；
- 无永久高亮；
- 无跨聊天定位。

### 7.3 现有功能回归

全部通过：

- TT 控制条；
- 连续浏览开关；
- 手动上一项、下一项；
- 图片倒计时；
- 悬停暂停；
- 页面失焦暂停；
- 图片缩放暂停；
- 退出缩放后重新完整计时；
- 视频 `ended`；
- 循环视频提示；
- 队列末尾停止；
- 官方关闭；
- `Esc`；
- Telegram 原生聊天、输入、滚动和导航；
- 控制台无脚本未捕获异常。

## 8. 已知边界

1. Telegram 修改 `.bubble`、`.album-item`、`data-mid`、`data-peer-id` 或滚动容器类名后，功能会安全失效，需要重新探测。
2. 虚拟列表目标不在当前 DOM 时，本版只提示并停止，不跨范围加载。
3. 官方消息跳转控件尚未确认，本版不会自动点击。
4. 目标消息删除或 Telegram 内容结构改变时，应走安全降级，不保证恢复历史目标。
5. 浏览器和 Telegram 大版本升级后应重新执行最小回归。

这些边界不构成当前 PR 的合并阻塞项。

## 9. 修改文件

```text
docs/tampermonkey-plugin-migration-matrix.md
docs/tampermonkey-web-k-close-to-media-position-handoff.md
docs/tampermonkey-web-k-close-to-media-position-plan.md
docs/tampermonkey-web-k-close-to-media-position-task.md
tampermonkey/AGENTS.md
tampermonkey/README.md
tampermonkey/telegram-media-continuity-web-k.user.js
```

明确未修改：

```text
tampermonkey/telegram-media-continuity.user.js
src/
master
```

## 10. 后续操作

PR #7 已可供代码审查和合并决策。

后续只允许：

1. 读取 PR 差异和审查意见；
2. 如有审查意见，在同一分支修复并重新验收；
3. 经用户明确授权后执行合并；
4. 合并后再从新基线开始 Web K 的位置持久化、未看媒体、类型过滤或自动保存等后续任务。

不得未经授权合并、强推、删除分支或顺带开发下一项功能。
