# Telegram Web K 关闭媒体查看器后定位消息实施计划

## 1. 文档状态

- 仓库：`https://github.com/elio-zwd/telegram-tt`
- 基线分支：`codex/tampermonkey-media-continuity`
- 基线 Commit：`b7c89bea426f420b563d3bd5089056ee1cdc43dc`
- 开发分支：`feat/tampermonkey-web-k-close-to-media-position`
- 目标脚本：`tampermonkey/telegram-media-continuity-web-k.user.js`
- 当前脚本版本：`0.3.0-k3`
- 计划状态：已确认，等待实施

本计划只解决：

> Telegram Web K 连续浏览媒体后，关闭媒体查看器时，将聊天窗口定位到最后一个成功显示媒体所属的消息。

本 PR 不同时实现自动保存、频道设置、浏览历史、Web A/K 统一入口或其他桌面版需求迁移。

## 2. 已确认产品决策

采用推荐组合：`1A + 2A + 3A + 4A`。

### 2.1 结束位置

定位最后一个已经成功显示的媒体，而不是最后一次发起切换的媒体。

成功显示条件：

- 图片：当前活动媒体可见、`complete === true`、`naturalWidth > 0`；
- 视频：当前活动媒体可见，并已取得有效媒体元数据或可播放画面；
- 新媒体仍在加载或切换尚未确认时，保留上一项成功媒体作为最终位置。

### 2.2 关闭入口

首版优先覆盖：

- Telegram 官方关闭按钮；
- `Esc` 关闭；

点击遮罩、触摸下滑或其他关闭方式只在能够安全识别时处理；无法确认时允许正常关闭并降级，不拦截或模拟未知行为。

### 2.3 目标不在 DOM

在真实页面确认后，允许调用一次 Telegram 官方“跳转到当前消息”DOM 行为。

禁止：

- 反复滚动加载历史；
- 连续快速点击；
- 调用 Telegram 私有函数、打包模块、IndexedDB 或 MTProto；
- 仅凭媒体 URL、尺寸或相似缩略图猜测目标消息。

### 2.4 高亮

目标消息滚动至聊天视口中部附近后，短暂高亮约 1.2 秒；动画结束自动清理，不永久修改 Telegram 样式。

## 3. 根因与源码依据

### 3.1 当前油猴脚本缺失消息映射

当前 Web K 脚本只维护活动 `img/video`、媒体指纹和官方左右切换按钮，没有维护：

- `peerId`；
- `messageId`；
- `albumIndex`；
- 对应聊天消息节点；
- 关闭后的定位任务。

`ViewerSession.destroy()` 只停止计时、解除监听和移除控制条。

### 3.2 Web K 官方源码行为

参考 Web K 上游 `morethanwords/tweb` Commit `e52b5d9318848ab83316cb53138358cf49d2a27f`：

- `src/components/mediaViewer/index.ts` 的媒体目标包含 `element`、`mid`、`peerId`、`message`、`index`；
- 相邻媒体从搜索加载时，目标可能有 `mid/peerId`，但 `element` 为 `null`；
- `src/components/mediaViewer/base.ts` 关闭动画尝试返回 `this.target?.element`；
- 连续切换到没有原聊天节点的媒体后，官方关闭无法回到该消息，与实测现象一致；
- `src/components/mediaViewer/index.ts` 的作者区域点击行为，会在关闭后让 Telegram 自身按 `peerId + mid + threadId` 定位消息；
- `src/components/chat/selection.ts` 表明聊天消息节点使用 `data-mid` 和 `data-peer-id` 参与身份识别。

以上是实现方向依据，不等于线上 DOM 保证。编码前必须通过当前 Telegram Web K 实际页面进行脱敏 DOM 探测。

## 4. 推荐架构

在现有单文件脚本内做最小增量，不进行大重构。

```text
ViewerSession
├── 活动媒体识别（现有）
├── 消息身份探测（新增）
├── 最后成功目标状态（新增）
├── 关闭意图捕获（新增）
├── 关闭后定位协调器（新增）
└── 调试与安全降级（扩展）
```

建议集中增加以下函数，具体命名可按代码风格调整：

```text
detectMessageTarget(viewer, media)
findSourceMessageFromEventTarget(target)
findMessageContainer(target)
findActiveChatContainer()
findChatScrollContainer(message)
findOfficialJumpToMessageControl(viewer)
waitForViewerClosed(viewer, sequenceId)
locateMessageAfterClose(snapshot)
highlightMessageTemporarily(message)
showLocationNotice(message)
```

DOM 选择器必须集中管理，业务流程中不得散落大量猜测选择器。

## 5. 目标数据模型

只保存当前会话中的短期映射，不在本 PR 增加新的持久化历史。

```js
{
  peerKey: "",
  messageKey: "",
  albumIndex: 0,
  source: "viewer-dom | official-link | source-message | official-jump",
  confidence: "high | medium",
  confirmedAt: 0,
  mediaFingerprint: "",
  sourceMessageNode: undefined,
  officialTargetHref: ""
}
```

要求：

- 自动定位只接受高可信目标；
- `peerKey + messageKey` 同时存在时优先使用；
- 仅有 `messageKey` 时，必须限制在当前活动聊天容器内；
- DOM 节点使用弱引用或会话字段，不写入持久化存储；
- 不持久化媒体资源 URL；
- `albumIndex` 用于诊断和未来扩展，关闭后只定位相册所属消息。

## 6. 状态与时序

建议新增状态：

```text
pendingMediaTarget
lastConfirmedMediaTarget
closeSnapshot
closeSequenceId
isCloseHandled
locateAttemptCount
locationTimerIds
```

### 6.1 媒体切换

```text
检测到媒体变化
→ 创建 pendingMediaTarget
→ 等待媒体成功显示
→ 再解析或校验消息身份
→ 更新 lastConfirmedMediaTarget
```

禁止在仅触发下一项按钮后立刻覆盖最后位置。

### 6.2 关闭

```text
捕获明确关闭意图
→ 冻结 lastConfirmedMediaTarget 为 closeSnapshot
→ closeSequenceId + 1
→ 允许 Telegram 执行官方关闭
→ 等待查看器隐藏或移除
→ 等待聊天容器恢复并稳定
→ 定位并高亮
```

### 6.3 防重复

- 同一 `closeSequenceId` 只能执行一次定位；
- MutationObserver 只能触发状态刷新，不能直接重复滚动；
- 新媒体查看器会话创建后，旧会话延迟任务必须失效；
- 每次关闭最多一次官方跳转、一次主定位和一次有条件复核；
- 不采用无限轮询，所有等待必须有总超时。

## 7. 消息映射优先级

按可靠性依次尝试：

1. 查看器公开 DOM 或官方链接明确提供 `peerId + messageId`；
2. 当前媒体打开前捕获到来源消息的 `data-peer-id + data-mid`；
3. 已经由真实页面验证的 Telegram 官方“跳转到当前消息”控件；
4. 相册计数、活动媒体顺序等只作为一致性校验；
5. 媒体 URL、Blob URL、尺寸或缩略图相似不得单独决定目标。

如果证据冲突：

- 不自动定位；
- 输出脱敏调试信息；
- 正常关闭查看器；
- 给出轻量提示。

## 8. 虚拟列表处理

### 8.1 目标消息仍在 DOM

- 在当前活动聊天容器中按 `peerId + messageId` 查找；
- 使用消息所属滚动容器执行居中滚动；
- 高亮约 1.2 秒；
- 不触发官方历史加载。

### 8.2 目标消息暂时不在 DOM

仅当官方跳转控件已通过真实页面验证时：

- 调用一次官方控件；
- 有界等待 Telegram 自己加载目标消息；
- 找到精确目标后居中和高亮；
- 超时后停止，不继续点击。

### 8.3 无安全跳转方式

- 不滚动到相邻消息；
- 不猜测当前滚动方向；
- 提示“最后查看消息当前未加载”；
- 保持 Telegram 可继续正常使用。

### 8.4 消息删除或频道变化

- 频道已经切换：取消旧任务；
- 目标消息删除：提示无法定位；
- 相同数字消息 ID 出现在其他频道：必须通过 `peerId` 或当前聊天上下文隔离。

## 9. DOM 探测要求

实施前应扩展 `TelegramMediaContinuity.inspect()`，只输出脱敏结构：

- 查看器、关闭按钮、作者/日期区域；
- 活动媒体及祖先节点的标签、类名和 `data-*` 属性名称；
- 属性值只允许输出经过白名单确认的数字 ID；
- 当前活动聊天容器；
- 消息节点的 `data-mid`、`data-peer-id` 是否存在；
- 候选官方消息跳转控件；
- 不输出聊天正文、频道名称、用户名、媒体 URL 或账号信息。

不得凭上游源码直接假定当前线上构建选择器存在。

## 10. UI 与提示

首版不增加常驻新按钮，沿用官方关闭动作。

可能提示：

- `已定位到最后查看消息`；
- `最后查看消息当前未加载`；
- `无法确认媒体所属消息，已正常关闭`；
- `目标消息可能已删除`。

提示必须短暂显示并自动消失，不遮挡聊天操作。

## 11. 验收标准

1. 普通图片连续切换至少三张后关闭，定位最后成功显示媒体所属消息；
2. 目标消息位于聊天窗口中部附近；
3. 高亮约 1.2 秒后自动清理；
4. 手动上一项后关闭，定位最终手动查看媒体；
5. 手动下一项后关闭，定位最终手动查看媒体；
6. 视频 `ended` 自动切换后关闭，定位新媒体消息；
7. 相册媒体切换后关闭，定位相册所属消息；
8. 新媒体未加载完成就关闭，定位上一项成功媒体；
9. 目标消息仍在 DOM 时不触发额外历史加载；
10. 目标消息不在 DOM 时，最多调用一次经验证的官方跳转；
11. 消息删除时不定位到错误消息；
12. 不同频道相同数字消息 ID 不串用；
13. Telegram 关闭动画不会覆盖最终定位；
14. 一次关闭不会重复滚动、高亮或快速点击；
15. 无法建立高可信映射时安全降级；
16. 官方关闭按钮和 `Esc` 均正常；
17. 不影响现有图片计时、视频结束切换、缩放暂停和队列末尾；
18. 控制台无未捕获异常；
19. Web A 脚本不发生修改或回归；
20. 脚本 DOM 变化时安全失效。

## 12. 修改范围

预计修改：

```text
tampermonkey/telegram-media-continuity-web-k.user.js
tampermonkey/README.md
docs/tampermonkey-web-k-close-to-media-position-plan.md
docs/tampermonkey-web-k-close-to-media-position-task.md
docs/tampermonkey-web-k-close-to-media-position-handoff.md
docs/tampermonkey-plugin-migration-matrix.md
```

明确不修改：

```text
tampermonkey/telegram-media-continuity.user.js
src/
开放 PR #3、#4、#5 的桌面源码分支
默认分支 master
```

## 13. 验证方法

仓库 `AGENTS.md` 要求不要为任务新增测试文件。本任务执行：

```powershell
git fetch origin
git checkout feat/tampermonkey-web-k-close-to-media-position
git pull --ff-only origin feat/tampermonkey-web-k-close-to-media-position
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check origin/codex/tampermonkey-media-continuity...HEAD
git diff --name-status origin/codex/tampermonkey-media-continuity...HEAD
```

并在 Windows 10、Chrome 150、Tampermonkey 4.18+ 执行真实浏览器验收。

必须区分：

- 静态检查通过；
- 真实浏览器验收通过；
- GitHub CI 通过；
- 尚未验证。

没有真实输出时不得声称测试通过。

## 14. Commit 与 PR

建议 Commit：

```text
docs: 增加 Web K 关闭定位开发计划
feat: 增加 Web K 媒体消息映射
feat: 关闭查看器后定位最后媒体消息
docs: 更新 Web K 位置定位验收说明
```

建议 PR 标题：

```text
feat: 支持 Web K 关闭后定位最后媒体消息
```

未经用户明确授权不得合并。

## 15. 回滚

- 停用 Tampermonkey 脚本即可恢复 Telegram 原始行为；
- 代码层可回滚本 PR 对 Web K 脚本的新增逻辑；
- 本功能不修改 Telegram 数据、不调用 API、不写入新的持久化聊天记录；
- 定位器失效时应自动降级为普通关闭。
