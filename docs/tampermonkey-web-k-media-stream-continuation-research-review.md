# Telegram Web K P1-09 真实页面研究回传审校

## 0. 审校结论

本文件审校本地只读环境回传的《Telegram Web K 同频道媒体自动续流真实页面深度研究报告》。

结论：

```text
队列边界与消息加载研究：PASS WITH NOTES
循环媒体无法自动切换研究：未完成
P1-09 整体研究门禁：未通过
运行代码开发：不得开始
```

当前回传报告提供了队列边界、消息列表滚动容器、历史消息加载、DOM 前插和 viewer 重开的真实页面证据，但没有提供 P1-09 同时要求的循环媒体事件序列与真实根因，也没有完成 `browseDirection` 到“更旧／更新消息加载方向”的映射。

因此，可将本文件中的“已采纳事实”用于后续设计；“待补充门禁”完成前，不得修改运行代码、升级版本或创建 Draft PR。

## 1. 研究执行与只读状态

回传的最终只读核验：

```text
git status --short：为空
git diff --exit-code：0
git rev-parse HEAD：2d6786ad3d4a0132f8f9b776a35aa8dabb441084
```

回传声明：

- 未修改运行代码；
- 未提交；
- 未推送；
- 未创建 PR；
- 工作区保持干净。

当前回传未提供以下环境字段，后续补充研究时必须填写：

```text
Windows 完整版本与 Build
Chrome 完整版本
Tampermonkey 版本
userscript SHA-256
研究开始和结束时间
```

## 2. 已采纳的真实页面事实

### 2.1 viewer 队列边界

回传观察到：

- 正向边界时 `.media-viewer-switcher-right` 节点仍在 DOM 中，但增加 `hide` 类；
- 反向边界时 `.media-viewer-switcher-left` 节点仍在 DOM 中，但增加 `hide` 类；
- 对应按钮计算样式表现为不可见；
- 未观察到边界按钮被直接从 DOM 删除。

这与当前 `platform/navigation.js` 的保守判断一致：

```text
按钮不可见，或包含 hide 类
→ 视为当前方向没有可用 viewer 导航
```

限定说明：本次样本可以证明当前研究环境中的稳定表现，不应在文档或 PR 中写成“所有未来 Web K 版本 100% 零误判”。正式实现仍需同时检查：

- 节点存在；
- 节点连接；
- 可见性；
- `hide` 类；
- operation、viewer 和 peer 身份。

### 2.2 消息列表滚动容器

回传确认当前活动消息列表使用：

```text
.scrollable.scrollable-y.bubbles-scrollable
```

正式实现仍必须通过 `platform/message-list.js` 的活动容器接口访问，不得在 continuation feature 中复制该选择器。

### 2.3 历史消息加载方向

回传确认：

```text
加载更旧的历史消息：请求滚动到消息列表顶部
加载更新方向的消息：请求滚动到消息列表底部
```

需要注意，加载更旧消息并发生 DOM 前插后，浏览器滚动锚定可能使最终 `scrollTop` 数值增大。因此实现不能使用“滚动后 scrollTop 必须更接近 0”作为加载成功条件。

加载成功应观察至少一种结构变化：

- 新 message identity 出现；
- 媒体目标集合增加；
- `scrollHeight` 改变；
- 目标区域 MutationObserver 捕获到节点变化；
- 经真实验证的加载指示开始并结束。

### 2.4 DOM 前插与加载证据

回传样本：

```json
{
  "beforeScroll": {
    "scrollTop": 445,
    "scrollHeight": 1303,
    "messageNodeCount": 18
  },
  "afterScrollTop": {
    "scrollTop": 1055,
    "scrollHeight": 2358,
    "messageNodeCount": 35
  }
}
```

已确认：

- `scrollHeight` 增加约 1055px；
- 消息节点数从 18 增加到 35；
- 更旧消息采用 DOM 前插；
- 前插后浏览器维持视觉锚点，导致最终 `scrollTop` 数值重新调整。

正式实现不得仅依赖固定 `sleep`，也不得仅比较滚动数值。

### 2.5 关闭 viewer 后可重新打开媒体

回传确认，通过当前消息节点中的公开可点击媒体区域，可以重新唤起 `.media-viewer-whole`。

回传列出的候选结构包括：

```text
.album-item .media-photo-aspect
.bubble .attachment
```

审校限制：

- `.bubble .attachment` 范围较宽，不能直接作为正式自动点击选择器；
- 必须先由消息身份、当前 peer、相册 index 和媒体类型共同限定候选；
- 不得点击头像、网页预览、贴纸装饰、pinned message 或非消息列表区域；
- 同一 message 内存在多个不明确候选时必须暂停，不得猜测；
- 正式选择器和点击接口必须集中在 platform 层。

### 2.6 viewer 重建

回传确认：

- 关闭后重新点击媒体会重新出现 `.media-viewer-whole`；
- TT Shadow DOM 控制条会随新 ViewerSession 重新挂载；
- 新 viewer 中官方导航边界会按新队列重新计算。

正式恢复不能只以“viewer 出现”为成功，还必须验证：

- viewer 节点连接且可见；
- 活动媒体有效显示；
- peer 与 continuation operation 一致；
- message 与目标一致；
- album index 与目标一致；
- 用户没有手动接管；
- operation ID 仍为当前值。

## 3. 对回传结论的修正

### 3.1 不承诺真正无限运行

回传使用了“无限无缝连续浏览体验”的表述。P1-09 冻结规则只允许：

```text
接近无休止的当前频道持续播放
```

正式实现必须保留：

```text
单次 continuation 总超时：20 秒
单轮最大滚动尝试：8 次
筛选最多连续跳过：50 项
筛选总时限：约 15 秒
同一时间只允许一个 operation
```

超时后进入 `PAUSED_NO_MORE_MEDIA`，保持 `continuousEnabled = true`，但停止滚动和点击。

### 3.2 `continuationPending` 只是设计建议

回传提出 `continuationPending = true`。这不是已经存在的仓库事实，只能作为实现方案。

正式设计应优先使用拥有唯一 ID 的 operation 对象，例如：

```text
continuationOperationId
state
peerKey
direction
mediaFilter
anchorTarget
startedAt
viewer/session 引用
cleanup 资源
```

lifecycle 应通过 continuation feature 的明确接口判断程序化关闭，而不是依赖容易残留的单一布尔值。

### 3.3 不能从本报告确认 browseDirection 映射

回传确认了：

```text
顶部加载更旧消息
底部加载更新消息
```

但没有确认：

```text
browseDirection = forward
```

在当前 Telegram viewer 中究竟对应“更旧消息”还是“更新消息”；`backward` 同理。

P1-09 冻结要求必须沿用现有方向语义，不能另建方向定义。因此必须补测：

1. 在消息列表记录三个脱敏相邻媒体的 DOM 顺序；
2. 从中间媒体打开 viewer；
3. 点击右侧官方按钮，记录目标在消息 DOM 中是前一个还是后一个；
4. 点击左侧官方按钮做同样记录；
5. 分别到达右边界和左边界；
6. 确认每个边界需要向列表顶部还是底部加载。

完成后才能建立：

```text
browseDirection -> viewer 物理方向 -> 消息 DOM 方向 -> 滚动加载方向
```

## 4. 未完成的循环媒体研究门禁

回传报告没有包含循环媒体研究，以下问题全部仍未确认：

- 循环媒体样本数量；
- listener 绑定时间；
- 绑定时是否已在播放；
- `paused`、`readyState`、`currentTime` 是否推进；
- `playing` 是否在绑定前已经发生；
- `currentVideoHasPlayed` 初始化是否正确；
- `pointerenter` 后是否持续存在 `HOVER`；
- 指针移出后是否开始完整倒计时；
- `waiting`、`stalled` 后暂停原因是否清除；
- Telegram 是否替换 video 节点；
- timer 是否创建、暂停、重置或到期；
- timer 到期后是否调用导航；
- 有导航按钮时是否切换成功；
- 无导航按钮时是否只是进入旧 `finish()`；
- `video.loop` 是否运行中变化；
- 自动播放限制是否影响首次播放。

因此当前不能确认：

```text
HOVER 是循环媒体不能自动切换的真实主要根因
```

静态代码只证明 HOVER 是高概率候选，不足以满足本任务的真实页面门禁。

## 5. 进入实现前必须补充的最小研究

只需补充两个专项，不必重新执行已经完成的完整队列研究。

### 5.1 循环媒体专项

至少 3 个循环媒体样本，每个执行：

1. 指针停留在媒体上超过 `photoDurationMs`；
2. 指针移出媒体后等待完整 `photoDurationMs`；
3. listener 绑定时媒体已经播放；
4. listener 绑定后才触发 `playing`；
5. 人为等待一次 `waiting`／`stalled` 后恢复；
6. 切换媒体触发 video 节点替换；
7. timer 到期且导航按钮存在；
8. timer 到期且导航按钮为边界状态。

必须记录 TT 状态文案与脱敏媒体事件序列，明确属于：

```text
倒计时未开始
倒计时被 HOVER 暂停
倒计时被 BUFFERING 暂停
倒计时因节点替换重置
倒计时正常结束但无导航按钮
导航已触发但媒体未变化
```

### 5.2 方向映射专项

使用至少三个相邻媒体，确认：

```text
右侧按钮对应消息 DOM 前一个还是后一个
左侧按钮对应消息 DOM 前一个还是后一个
forward 边界应加载顶部还是底部
backward 边界应加载顶部还是底部
```

只记录临时别名，不记录真实 peer/message ID。

## 6. 当前允许形成的设计结论

待补充专项完成前，只允许冻结以下架构方向：

1. 新增独立 `features/media-stream-continuation/`；
2. ViewerSession 在自动边界时请求 continuation，不再调用 `finish()`；
3. continuation 使用唯一 operation ID；
4. lifecycle 区分程序关闭与用户关闭；
5. 程序关闭跳过普通关闭定位；
6. 消息滚动、候选发现、点击重开全部经 platform 小接口；
7. 加载成功使用 DOM 结构证据，不只使用延时；
8. 20 秒、8 次、50 项和 15 秒保护保持不变；
9. 超时保持 `continuousEnabled = true`；
10. 用户接管立即取消 operation 并清理全部资源。

以下内容仍不得冻结：

- forward/backward 的滚动方向映射；
- 循环媒体 HOVER 修复的最终规则；
- 正式媒体点击选择器；
- viewer 目标身份验证的具体公开 DOM 组合。

## 7. 当前分支状态

本研究审校文件只记录证据和门禁，不修改任何运行源码、构建脚本、版本或生成 userscript。
