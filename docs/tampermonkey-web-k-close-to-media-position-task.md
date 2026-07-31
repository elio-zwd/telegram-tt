# Telegram Web K 关闭后定位最后媒体消息 Task

## 0. 任务状态

- 状态：**开发与真实浏览器验收完成**
- PR：<https://github.com/elio-zwd/telegram-tt/pull/7>
- Base：`codex/tampermonkey-media-continuity`
- Base SHA：`b7c89bea426f420b563d3bd5089056ee1cdc43dc`
- 开发分支：`feat/tampermonkey-web-k-close-to-media-position`
- 已验收 HEAD：`fa68b55b9241451675ab8b070cd2e56b35a6cce8`
- 脚本版本：`0.4.0-k5`
- 实现 Commit：`d3e3bb5cc03e71736f421396700899157b4ce396`

完成条件：

> 只在能够高可信确认最后媒体所属消息时定位；不能确认时安全降级，绝不滚动到错误消息。

## 1. 开发与约束检查

- [x] 在既有分支和 PR #7 上继续开发；
- [x] 读取根目录和 `tampermonkey/` 目录规则；
- [x] 检查开放 PR 和相关代码；
- [x] 未修改默认分支；
- [x] 未修改 Web A 脚本；
- [x] 未修改 `src/`；
- [x] 未新增依赖、构建产物、日志或用户数据；
- [x] 未调用 Telegram API、Bot API、MTProto、IndexedDB 或私有运行时。

## 2. 真实 DOM 探测

- [x] 确认消息 ID 使用 `data-mid`；
- [x] 确认对话 ID 使用 `data-peer-id`；
- [x] 确认普通消息节点为 `.bubble`；
- [x] 确认相册项为 `.album-item.grouped-item`；
- [x] 确认聊天滚动容器为 `.scrollable.scrollable-y.bubbles-scrollable`；
- [x] 确认 `Esc` 关闭时序；
- [x] 确认 Telegram 原生关闭不会自动改变聊天滚动位置；
- [x] 探测结果不包含正文、名称或媒体 URL；
- [x] 官方关闭按钮样本存在矛盾，因此正式实现不绑定猜测的按钮选择器；
- [x] 未确认官方消息跳转控件，因此本版不自动点击候选控件。

## 3. 消息目标模型

- [x] 捕获用户从聊天消息打开媒体的公开 DOM 身份；
- [x] 使用 `data-peer-id + data-mid` 建立高可信目标；
- [x] 记录相册内部 `messageKey` 和 `albumIndex`；
- [x] 增加 `pendingMediaTarget`；
- [x] 增加 `lastConfirmedMediaTarget`；
- [x] 增加当前媒体映射丢失状态；
- [x] 目标只保存在当前页面会话，不新增持久化记录；
- [x] 证据冲突或映射不确定时不猜测。

## 4. 最后成功媒体

- [x] 图片必须可见、加载完成且 `naturalWidth > 0` 才确认；
- [x] 视频必须可见并取得元数据或有效尺寸才确认；
- [x] 新媒体仍在加载时保留上一成功目标；
- [x] 加载失败不覆盖上一成功目标；
- [x] TT 左右切换后等待媒体实际变化和成功显示；
- [x] Telegram 官方左右切换后等待媒体实际变化和成功显示；
- [x] 键盘方向键切换后等待媒体实际变化和成功显示；
- [x] 图片自动切换后更新最终目标；
- [x] 视频 `ended` 自动切换后更新最终目标；
- [x] 循环视频保留原有提示与手动策略。

## 5. 关闭后定位

- [x] 统一观察查看器实际隐藏或移除；
- [x] 官方关闭动作可触发定位；
- [x] `Esc` 可触发定位；
- [x] 使用单调 `sequenceId` 防止重复任务；
- [x] 定位任务有明确总超时；
- [x] 只在当前活动聊天中精确匹配目标；
- [x] 频道变化时取消；
- [x] 目标在 DOM 时居中滚动；
- [x] 允许一次有界位置复核，避免与 Telegram 动画争夺；
- [x] 高亮约 1.2 秒后自动清理；
- [x] 相册验证内部项，但滚动和高亮整条 `.bubble`；
- [x] 用户开始新操作时取消旧定位序列。

## 6. 安全降级

- [x] 目标不在当前虚拟列表 DOM 时返回 `target-not-loaded`；
- [x] 目标不在 DOM 时不猜测方向、不循环加载历史；
- [x] 切换聊天时返回 `cancelled-peer-changed` 或取消旧序列；
- [x] 映射不确定时正常关闭且不滚动；
- [x] 不点击未经确认的官方跳转控件；
- [x] 不产生跨聊天高亮；
- [x] 不残留永久高亮；
- [x] 不形成重复滚动或滚动争夺。

说明：

- [ ] “目标不在 DOM 时调用一次官方消息跳转”未实现；原因是官方跳转 DOM 尚未得到可靠确认。
- [x] 当前验收范围接受保守降级为 `target-not-loaded`，此项不是 PR #7 的合并阻塞项。

## 7. 静态验证

已在 Windows 10 本地只读验收中实际执行：

```powershell
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check origin/codex/tampermonkey-media-continuity...HEAD
git diff --name-status origin/codex/tampermonkey-media-continuity...HEAD
git status --short
git rev-parse HEAD
```

- [x] `node --check` 退出码 0；
- [x] `git diff --check` 退出码 0、无输出；
- [x] 工作区干净；
- [x] HEAD 为 `fa68b55b9241451675ab8b070cd2e56b35a6cce8`；
- [x] 修改范围仅为既定 7 个文件；
- [x] Web A 脚本和 `src/` 未修改。

## 8. 真实浏览器验收

环境：

```text
Windows 10 专业版 64 位 10.0.19045
Chrome 150.0.0.0
Tampermonkey 4.18+
Telegram Web K
```

核心场景：

- [x] 直接打开普通图片后使用官方关闭动作定位；
- [x] `Esc` 关闭后定位；
- [x] TT 连续切换至少三项后定位最后成功媒体；
- [x] TT 上一项与下一项方向正确；
- [x] Telegram 官方左右切换方向正确；
- [x] 键盘 `ArrowLeft`、`ArrowRight` 方向正确；
- [x] 图片自动连续播放后定位最后成功媒体；
- [x] 新媒体加载中关闭时保留上一成功媒体；
- [x] 视频 `ended` 后定位新媒体；
- [x] 相册内部切换后定位并高亮整条相册消息。

安全场景：

- [x] 目标不在 DOM 时安全返回 `target-not-loaded`；
- [x] 切换聊天时取消定位；
- [x] 新操作取消旧定位任务；
- [x] 无方向反转；
- [x] 无错误消息定位；
- [x] 无重复滚动；
- [x] 无永久高亮；
- [x] 无脚本未捕获异常；
- [x] 不影响 Telegram 原生聊天、输入、滚动和导航。

现有功能回归：

- [x] TT 控制条；
- [x] 连续浏览开关；
- [x] 图片倒计时；
- [x] 悬停暂停；
- [x] 页面失焦暂停；
- [x] 缩放暂停与退出缩放重新计时；
- [x] 视频 `ended`；
- [x] 循环视频提示；
- [x] 队列末尾停止；
- [x] 官方关闭和 `Esc`。

## 9. PR 收尾

- [x] 真实浏览器阻塞项全部通过；
- [x] PR 描述记录实现、降级和验证证据；
- [x] 交接文档更新为最终验收状态；
- [x] PR #7 标记 Ready；
- [ ] 合并 PR。

未经用户明确授权不得执行合并。
