# Telegram Web K 媒体类型筛选

## 1. 目标

P1-02 为 Telegram Web K 油猴插件增加全局、持久化的自动媒体类型筛选，同时保持手动导航、浏览方向、关闭定位和已完成的连续浏览行为兼容。

```text
Base：PR #15 合并后的 codex/tampermonkey-media-continuity 最新 HEAD
开发分支：feat/tampermonkey-web-k-media-filter
目标版本：0.4.0-k7
```

本功能只作用于：

```text
https://web.telegram.org/k/*
```

Web A userscript、Telegram 桌面源码、私有模块和 IndexedDB 均不在本次范围内。

## 2. 产品语义

新增设置：

```js
mediaFilter: 'all' | 'images' | 'videos'
```

控制条提供：

```text
图片和视频（默认）
仅图片
仅视频
```

规则：

- `all`：保持现有自动连续浏览行为；
- `images`：自动推进只停留在公开 DOM 中可识别为 `img` 的媒体；
- `videos`：自动推进只停留在公开 DOM 中可识别为普通 `video` 的媒体；
- 筛选只影响自动推进，不限制 TT 上一项、TT 下一项、Telegram 官方按钮和方向键；
- GIF 和循环视频本 PR 不建立独立类型，继续按当前公开 DOM 元素和既有行为处理；
- 不根据媒体 URL、文件名、聊天文本或 Telegram 私有状态猜测类型。

## 3. 设置兼容

继续使用唯一 storage key：

```text
tt.mediaContinuity.v1
```

`core/settings.js` 同时兼容：

- 旧扁平设置对象；
- 当前 `{ settings: ... }` 包装格式；
- 旧数据缺少 `mediaFilter`；
- 非法或未知筛选值；
- 损坏 JSON；
- `localStorage` 读取或写入失败。

缺失、未知或非法值全部回退为 `all`。修改筛选时通过现有增量更新路径保存，不覆盖连续浏览开关、图片时长、浏览方向和控制条折叠状态。

## 4. 公开媒体类型接口

`platform/media-viewer.js` 只根据当前活动媒体节点本身分类：

```text
HTMLImageElement -> images
HTMLVideoElement -> videos
其他或证据不足 -> undefined
```

返回 `undefined` 时，连续浏览暂停并提示用户手动处理；不自动跳过、不猜测。

## 5. 有界筛选序列

媒体筛选序列由 `ViewerSession` 管理，固定安全边界为：

```text
最大跳过项目：50
总超时：15 秒
相邻跳过调度延迟：80 毫秒
单次官方导航确认超时：沿用 3 秒
```

每个序列记录：

```text
id
direction
filter
startedAt
skipped
```

序列只有在以下条件全部成立时继续：

- 当前对象仍是活动序列；
- `id` 与当前 `filterSequenceId` 一致；
- 筛选值未变化；
- 浏览方向未变化；
- 连续浏览仍开启；
- 会话未暂停；
- 查看器会话未销毁。

任何旧 timer、旧 poll 或旧媒体回调发现条件不再成立时直接退出，不继续点击。

## 6. 自动与手动导航边界

自动推进在 `mediaFilter !== 'all'` 时创建筛选序列，并沿当前 `browseDirection` 调用 Telegram 官方导航控件。

以下操作立即接管并取消旧筛选序列：

- TT 上一项或下一项；
- Telegram 官方上一项或下一项；
- `ArrowLeft` 或 `ArrowRight`；
- 暂停连续浏览；
- 关闭连续浏览；
- 修改浏览方向；
- 修改媒体筛选；
- 查看器会话销毁。

手动操作永远只执行用户明确选择的一步，不再自动跳过不匹配媒体。

## 7. 边界与失败处理

- 当前方向没有公开导航按钮时停止连续浏览；
- 正向提示已到当前媒体末尾，反向提示已到当前媒体开头；
- 不循环；
- 不主动加载更多历史；
- 不滚动消息列表寻找隐藏媒体；
- 不无限点击；
- 达到 50 项上限或 15 秒总超时后暂停；
- 官方按钮无法触发或媒体在单次导航超时内未变化时暂停；
- 无法可靠判断媒体类型时暂停；
- 图片或视频加载失败时不确认新的关闭定位目标。

## 8. 关闭定位一致性

筛选跳过中的中间媒体设置 `blockCurrentTargetConfirmation`，因此：

- 中间图片的 `load`；
- 中间视频的 `loadedmetadata`、`loadeddata`、`canplay` 或 `playing`；
- `bindMedia()` 的即时确认

均不能把该项目写入 `lastConfirmedMediaTarget`。

找到匹配媒体后先结束筛选序列，再由现有 `MediaTargetTracker` 在媒体真正成功显示时确认目标。匹配媒体加载失败时清除 pending target，关闭查看器继续使用上一个真正成功显示的媒体目标。

用户主动手动接管当前媒体时，如果该媒体已成功显示，允许将其确认为新的最后目标，因为此时它已不再是自动跳过中的中间项目。

## 9. 控制条与窄窗口

控制条新增媒体类型选择框。现有 Shadow DOM 隔离保持不变。

在不超过 480px 的窄窗口中：

- 控件继续换行；
- 按钮和选择框使用紧凑尺寸；
- 状态文本单独占一行；
- 不修改 Telegram 页面全局样式。

真实页面是否遮挡 Telegram 官方控件仍需浏览器验收确认。

## 10. 修改范围

源码和门禁：

```text
tampermonkey/src/web-k/version.js
tampermonkey/src/web-k/core/settings.js
tampermonkey/src/web-k/platform/media-viewer.js
tampermonkey/src/web-k/features/continuous-browsing/viewer-session.js
tampermonkey/src/web-k/features/control-panel/control-panel.js
tampermonkey/build/verify-web-k-userscript.mjs
```

文档和生成产物：

```text
tampermonkey/README.md
docs/tampermonkey-web-k-media-filter.md
tampermonkey/telegram-media-continuity-web-k.user.js
```

明确未修改：

- `tampermonkey/src/web-k/app.js`；
- `tampermonkey/src/web-k/core/lifecycle.js`；
- `tampermonkey/src/web-k/features/shortcuts/**`；
- Web A userscript；
- Telegram 桌面源码；
- 依赖清单；
- CI 工作流。

## 11. 静态门禁

`check:tampermonkey:web-k` 增加检查：

- `mediaFilter` 默认值为 `all`；
- 只接受 `all`、`images` 和 `videos`；
- 媒体类型判断集中在 platform；
- 控制条包含筛选框和筛选回调；
- 自动筛选包含最大跳过次数、总超时和序列 ID；
- 跳过过程隔离关闭定位确认；
- 手动操作具有筛选序列接管入口；
- 生成 userscript 包含媒体筛选设置。

## 12. 验收矩阵

真实 Telegram Web K 浏览器验收至少覆盖：

1. 旧设置默认“图片和视频”；
2. 非法值和损坏 JSON 回退 `all`；
3. 仅图片正向连续浏览；
4. 仅图片反向连续浏览；
5. 仅视频正向连续浏览；
6. 仅视频反向连续浏览；
7. 连续跳过多个不匹配项目；
8. 正向末尾和反向开头安全停止；
9. TT、官方按钮和方向键仍能进入不匹配媒体；
10. 相册内混合图片和视频；
11. 快速改变筛选取消旧序列；
12. 快速改变方向取消旧序列；
13. 暂停、关闭或销毁会话后无旧点击；
14. 加载失败不误确认关闭定位目标；
15. 关闭后定位最后真正成功显示的媒体；
16. 循环视频保持既有提示和行为；
17. 480px 及更窄窗口不遮挡官方控件；
18. 调试 API 名称、返回结构和隐私边界不回归；
19. Telegram 输入、消息收发、滚动和聊天导航不回归；
20. 控制台无未捕获异常、无无限 timer 或重复点击。

## 13. 验证状态

远端开发对话没有真实 Telegram Web K 登录浏览器控制能力，因此不把浏览器场景写成已通过。

GitHub Actions 将执行 Linux 和 Windows 双平台：

```text
npm ci
连续构建两次并比较 SHA-256
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check
git diff --name-status
git status --short
git rev-parse HEAD
```

真实 CI 结果以 Draft PR 最新 Head 为准。完成真实浏览器验收前 PR 保持 Draft。

## 14. 回滚

本功能可以整体回滚对应 PR。旧版本会忽略新增的 `mediaFilter` 字段，不需要建立新 storage key 或执行数据迁移。用户侧也可以先在 Tampermonkey 中停用脚本，恢复 Telegram 原始行为。
