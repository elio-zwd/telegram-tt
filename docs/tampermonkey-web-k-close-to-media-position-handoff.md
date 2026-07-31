# Telegram Web K 关闭后定位最后媒体消息开发交接

## 1. 当前结论

Draft PR #7 已在原分支完成 `0.4.0-k5` 第一版正式实现：

> Telegram Web K 连续浏览媒体后，关闭媒体查看器时，只在能够高可信确认消息身份的情况下，将聊天定位到最后一个成功显示媒体所属消息。

当前状态为：**代码已提交、静态核验已完成、等待真实浏览器功能验收**。

PR 仍应保持 Draft；在 `0.4.0-k5` 的完整浏览器验收通过前，不得标记 Ready，不得合并。

## 2. 仓库与分支

```text
仓库：https://github.com/elio-zwd/telegram-tt
PR：https://github.com/elio-zwd/telegram-tt/pull/7
基线分支：codex/tampermonkey-media-continuity
基线 SHA：b7c89bea426f420b563d3bd5089056ee1cdc43dc
开发分支：feat/tampermonkey-web-k-close-to-media-position
探测阶段 HEAD：97f3a8706dbdd2d3d39c633efbfab40b3ab6411c
实现 Commit：d3e3bb5cc03e71736f421396700899157b4ce396
README Commit：48bca38f5ffbe27f6fe8cde9061288cf4134e406
目标脚本：tampermonkey/telegram-media-continuity-web-k.user.js
当前脚本版本：0.4.0-k5
```

接手时必须读取远端最新 HEAD，不得把上述中间 Commit 当成最终 HEAD。

## 3. 已确认的真实页面证据

本地只读探测环境：

```text
Windows 10 专业版 64 位 10.0.19045
Chrome 150.0.0.0
Tampermonkey 4.18+
Node v24.14.1
Git 2.53.0.windows.2
```

已确认 Telegram Web K 当前公开 DOM：

- 消息 ID：`data-mid`；
- 对话 ID：`data-peer-id`；
- 普通消息：`.bubble`；
- 相册媒体项：`.album-item.grouped-item`；
- 聊天滚动容器：`.scrollable.scrollable-y.bubbles-scrollable`；
- `Esc` 关闭后查看器约 286ms 从 DOM 移除；
- `Esc` 关闭前后 Telegram 原生聊天滚动位置未变化；
- 原有图片计时、视频结束切换、缩放暂停、手动导航、队列末尾和 Telegram 原生功能回归通过。

探测报告中的“官方关闭按钮”样本存在内部矛盾：状态写为 `viewer-removed`，但结束时仍记录 `viewerConnectedAfter: true`、`viewerVisibleAfter: true`，并持续约 6 秒。因此正式实现没有绑定某个猜测的关闭按钮选择器，而是统一观察查看器实际隐藏或移除。

探测尚未确认可安全使用的官方“跳转到消息”控件，因此本版不自动点击任何候选跳转控件。

## 4. `0.4.0-k5` 实现内容

### 4.1 消息来源捕获

- 在用户从聊天点击媒体时，以捕获阶段读取公开 DOM；
- 只接受同时存在数字 `data-mid` 与 `data-peer-id` 的高可信目标；
- 相册记录内部媒体项的 `data-mid` 和序号；
- 不阻止 Telegram 原事件；
- 不读取正文、频道名、用户名或媒体 URL。

### 4.2 最后成功媒体状态

新增会话态：

```text
pendingMediaTarget
lastConfirmedMediaTarget
currentMappingLost
```

确认条件：

- 图片：活动媒体可见、`complete === true`、`naturalWidth > 0`；
- 视频：活动媒体可见，并取得元数据或有效视频尺寸；
- 新媒体仍在加载或加载失败时，不覆盖上一成功目标；
- 当前媒体已经成功显示但无法建立高可信映射时，标记映射丢失，关闭后不定位到旧消息。

### 4.3 导航映射

覆盖：

- TT 控制条上一项、下一项；
- Telegram 官方左右切换控件；
- `ArrowLeft`、`ArrowRight`；
- 自动图片切换；
- 视频 `ended` 自动切换。

只在新媒体实际变化并成功显示后确认新目标，不根据“按钮已点击”直接更新最终位置。

### 4.4 关闭后定位

- 通过查看器实际隐藏或移除创建一次关闭快照；
- 使用单调 `sequenceId` 防止旧任务重复执行；
- 最多有界等待约 2.4 秒；
- 只在当前可见聊天滚动容器中匹配；
- 优先精确验证 `data-peer-id + data-mid`；
- 频道变化时取消；
- 匹配成功后 `scrollIntoView({ block: 'center' })`；
- 约 420ms 后最多执行一次位置复核，避免 Telegram 动画覆盖；
- 高亮约 1.2 秒后自动清理；
- 相册使用内部项验证身份，但滚动和高亮整条 `.bubble`；
- 用户开始新操作或打开新查看器时取消旧定位序列。

### 4.5 安全降级

以下情况不自动滚动：

- 当前成功媒体映射不确定；
- 目标消息不在当前虚拟列表 DOM；
- 频道已经变化；
- 目标可能删除；
- Telegram DOM 选择器失效。

目标不在 DOM 时仅提示“最后查看消息当前未加载”，不猜测方向、不循环加载、不调用私有接口、不点击未经确认的官方跳转控件。

## 5. 调试接口

```js
TelegramMediaContinuity.getSummary();
TelegramMediaContinuity.inspect();
TelegramMediaContinuity.inspectMessageMapping();
TelegramMediaContinuity.getLastLocationResult();
```

定位结果可能为：

```text
located
target-not-loaded
unmapped-current-media
cancelled-peer-changed
viewer-still-visible
no-confirmed-target
```

结果只包含状态、序列号和白名单数字 ID，不包含聊天正文或媒体 URL。

## 6. 已完成验证

开发侧实际执行：

```text
node --check tampermonkey/telegram-media-continuity-web-k.user.js
```

结果：退出码 0，无输出。

还执行了无真实浏览器的 Node 运行烟测，确认：

- 脚本可初始化；
- `getSummary()` 返回 `version = 0.4.0-k5`、`client = web-k`；
- `inspectMessageMapping()` 的隐私声明全部为 `false`；
- 无 DOM 场景不会抛出未捕获异常。

远端脚本 Blob SHA：

```text
bff54d20036894a2e4a17655856a6325f66a6748
```

该 SHA 与本地静态核验文件的 `git hash-object` 完全一致，整文件写入未发生截断。

## 7. 尚未验证

`0.4.0-k5` 尚未在真实 Telegram Web K 页面验证：

- 自动连续切换三项后的最终消息映射方向；
- TT 与 Telegram 官方左右控件是否都映射到正确相邻消息；
- 官方关闭动作触发的实际定位；
- `Esc` 关闭触发的实际定位；
- 图片未加载完成立即关闭时是否保留上一成功媒体；
- 视频 `ended` 后定位；
- 相册整条消息定位与高亮；
- 目标不在 DOM、消息删除、频道切换的降级；
- 居中位置和 1.2 秒高亮视觉效果；
- 现有连续浏览能力的实现后回归。

以上项目未实际通过前，不得写成“功能验收通过”。

## 8. 重点风险

1. Telegram 查看器左右方向与聊天 DOM 顺序必须通过真实页面确认；方向错误会导致消息映射错误，应作为首要阻塞项。
2. 虚拟列表只提供当前 DOM 范围，本版不会跨范围加载目标。
3. 官方关闭按钮探测样本不可靠，因此正式逻辑依赖查看器实际关闭，而非某个按钮类名。
4. Telegram 更改 `.bubble`、`.album-item`、`data-mid`、`data-peer-id` 或滚动容器类名后，功能应安全失效。
5. `document` 类型消息被纳入候选媒体序列，需在真实页面回归文件类媒体是否与查看器顺序一致。

## 9. 禁止事项

- 不调用 Telegram API、Bot API 或 MTProto；
- 不读取 Telegram IndexedDB、私有状态或打包模块；
- 不持久化媒体 URL、正文、频道名或用户信息；
- 不无限轮询、循环滚动或快速点击；
- 不新增第三方依赖；
- 不修改 Web A 脚本或 `src/`；
- 不修改默认分支；
- 不新建重复 PR；
- 未经用户授权不得合并 PR。

## 10. 下一步

1. 拉取远端最新开发分支；
2. 对 `0.4.0-k5` 执行真实浏览器完整验收；
3. 返回逐项结果和 `TelegramMediaContinuity.getLastLocationResult()` 脱敏 JSON；
4. 若方向或映射错误，在当前分支修复并重新验收；
5. 全部阻塞项通过后，再更新 Task、迁移矩阵和 PR Ready 状态；
6. 不自动合并。
