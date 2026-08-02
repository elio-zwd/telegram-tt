# Telegram Web K 油猴插件 V1 浏览体验完成说明

## 1. 结论

本综合任务在稳定分支 `codex/tampermonkey-media-continuity` 的 P1-04 合并基线上，完成 Telegram Web K 油猴插件 V1 剩余浏览体验：

```text
P1-04 自定义图片停留时间（基线已合并，综合回归保留）
P1-05 循环媒体连续浏览策略
P1-06 全屏、PiP、网络、缓冲、自动播放和失败暂停
P1-07 视频静音、音量和倍速偏好
P1-08 控制条与设置整合
```

V1 继续只作用于 `https://web.telegram.org/k/*`，不修改 Web A，不调用 Telegram API、Bot API、MTProto、私有 webpack 模块或 IndexedDB，不增加自动保存、下载、预加载、频道设置和历史入口。

## 2. 基线与版本

开发启动时核验：

```text
稳定分支：codex/tampermonkey-media-continuity
稳定 HEAD：402a391f0a0b7d84ae3e7e59669160caa5c01e93
稳定版本：0.4.0-k9
PR #16：已合并
PR #18：已合并
PR #19（P1-04）：已合并
PR #17：研究文档 Draft，未修改运行代码
综合开发分支：feat/tampermonkey-web-k-v1-completion
综合版本：0.4.0-k10
```

## 3. P1-04 综合回归

保留预设 `2、3、5、8、10、15、30` 秒，并继续支持：

- `1.0～300.0` 秒；
- 整数或一位小数；
- 整数毫秒存储；
- Enter 或“应用”提交；
- 空值、科学计数法、超过一位小数和越界值拒绝保存；
- 非法输入保留上一个有效值；
- 图片和循环媒体修改后从完整新时长重新计时；
- 普通视频不受图片时间修改影响；
- 暂停与关闭状态不被修改时间解除。

唯一 storage key 仍为：

```text
tt.mediaContinuity.v1
```

## 4. P1-05 循环媒体

### 4.1 公开分类条件

循环媒体只使用 PR #17 的真实页面证据：

```js
media instanceof HTMLVideoElement && media.loop === true
```

不使用 URL、文件名、扩展名、聊天文本、`muted`、`autoplay`、尺寸、时长、Telegram 私有对象、webpack 或 IndexedDB 猜测。

### 4.2 调度规则

- 普通视频继续等待 `ended`；
- 循环媒体不等待 `ended`；
- 循环媒体首次进入 `playing` 后，以图片停留时间启动完整倒计时；
- `waiting`／`stalled`、失焦、全屏、PiP、离线、用户暂停或交互会停止倒计时；
- 恢复后从完整时长重新计时，不保留过期剩余时间；
- 循环媒体仍归类为视频，因此“仅图片”跳过、“仅视频”允许；
- 同一节点的 `loop` 证据发生冲突时暂停，等待用户确认继续；
- 节点替换后旧 listener、Promise、倒计时和回调由节点引用与 `mediaSequenceId` 双重作废。

## 5. P1-06 暂停原因与恢复

### 5.1 独立暂停原因

会话使用暂停原因集合，而不是把所有状态压入单一布尔值：

```text
user
page
fullscreen
picture-in-picture
offline
buffering
user-action-required
failure
node-invalid
media-conflict
filter
hover
interaction
zoom
```

清除一个系统原因不会解除用户暂停或其他仍存在的原因。用户主动暂停优先保留；会话销毁后全部异步任务失效。

### 5.2 全屏与 PiP

- 监听标准 `fullscreenchange` 和 `document.fullscreenElement`；
- 进入全屏立即暂停自动切换；
- 退出全屏后重新确认当前媒体节点，不立即导航；
- 监听标准 `enterpictureinpicture`、`leavepictureinpicture` 和 `document.pictureInPictureElement`；
- 不移除或覆盖 Telegram 的 `disablePictureInPicture` 限制；
- PiP 期间暂停自动切换，退出后只在其他暂停原因都解除时恢复。

### 5.3 网络与缓冲

- `offline` 只作为暂停信号；
- `online` 后不立即导航；
- 已确认可显示的图片可以恢复，否则等待新的 `load`；
- 视频等待 `canplay` 或 `playing` 后恢复；
- `waiting`、`stalled` 立即停止自动导航和循环媒体计时，但不视为永久失败；
- 持续约 15 秒后提示“媒体加载较慢，连续浏览已暂停”，并保持暂停；
- 15 秒内恢复的 `canplay`／`playing` 可自动解除缓冲原因；
- 超过 15 秒后即使媒体恢复，也等待用户按“继续”，避免静默恢复和意外跳过；
- 用户按“继续”时若仍没有恢复证据，则提示“当前媒体仍在缓冲，请稍后重试”；
- 缓冲恢复绝不会解除用户主动暂停或其他暂停原因。

### 5.4 自动播放与失败

- `play()` Promise 的 `NotAllowedError` 归类为需要用户操作；
- 不把自动播放限制认定为媒体损坏；
- 可信操作后出现 `playing`，且用户未主动暂停时恢复；
- 图片明确 `error` 时确认失败；
- 视频只有当前有效节点触发 `error` 且存在有效 `video.error.code` 时确认失败；
- 第一次确认失败即暂停，不自动跳过、不循环重试；
- 失败不会阻止 Telegram 原生上一项、下一项、方向键或关闭；
- 失败媒体不会覆盖最后成功显示的关闭定位目标；
- 筛选超时暂停即使遇到媒体节点替换，也继续保持暂停与关闭定位屏蔽，直到用户手动接管；
- 当前媒体重新有效后，用户可按“继续”；仍不可用时保持失败提示。

## 6. P1-07 视频播放偏好

新增全局设置：

```js
videoMuted
videoVolume
videoPlaybackRate
```

规则：

- 与其他设置共同保存到 `tt.mediaContinuity.v1`；
- 缺失或非法值安全回退；
- 音量限制为 `0～1`，保存到两位小数；
- 倍速只允许 `0.5x / 1x / 1.25x / 1.5x / 2x`；
- 默认静音为关闭、音量为 `1`、倍速为 `1`；
- Telegram 替换普通 video 节点后重新应用；
- 监听 `volumechange` 与 `ratechange`，同步保存 Telegram 原生控件修改；
- 程序应用值后只有真实差异才写入，避免反馈循环；
- 普通视频应用静音、音量和倍速；
- 循环媒体不应用普通视频偏好，尤其不会被强制取消静音；
- 不绕过浏览器自动播放策略，不修改 Telegram 私有播放器状态。

## 7. P1-08 控制条

Shadow DOM 控制条整合：

```text
连续浏览开关
暂停／继续
上一项／下一项
正向／反向
图片和视频／仅图片／仅视频
图片与循环媒体停留时间
自定义时间
声音／静音
音量滑杆与百分比
0.5x / 1x / 1.25x / 1.5x / 2x
状态与错误提示
收起／展开
```

控制条保持紧凑换行，不新增未来占位按钮。所有输入控件具有 `aria-label`；`input`、`select` 和自定义输入聚焦时，Space 与 A 快捷键继续由现有输入保护隔离。销毁会话时移除宿主节点、全局 listener、媒体 listener、observer、timer 和引用。

## 8. 设置兼容

旧设置继续兼容：

- 缺少新视频字段时使用默认值；
- 旧 `photoDurationMs`、`browseDirection`、`mediaFilter`、`continuousEnabled` 和 `panelCollapsed` 保留；
- 非法视频音量或倍速不会污染运行状态；
- 顶层位置记录等其他数据保留；
- 不创建第二个 storage key。

## 9. 静态与构建门禁

最终执行命令：

```text
npm ci
npm run build:tampermonkey:web-k
npm run build:tampermonkey:web-k
npm run check:tampermonkey:web-k
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check
```

受控远端预构建已在 Ubuntu 24.04、Node.js `24.14.1`、npm `11.11.0` 环境执行：

- `npm ci` 成功；
- 修改源码和门禁脚本的 `node --check` 成功；
- Vite `8.1.0` 连续构建两次成功，均转换 25 个模块；
- 两次生成 userscript 的 SHA-256 一致；
- `npm run check:tampermonkey:web-k` 通过，识别版本 `0.4.0-k10`、24 个源码模块和 V1 四类门禁；
- 生成 userscript 的 `node --check` 通过；
- `git diff --check` 通过；
- 最终 userscript SHA-256：`8bddec8e413cf3cdbc01b2d7032aecd65dc280463913c0a16ac5705ae2243e75`。

`npm ci` 同时报告仓库既有依赖存在 5 个审计项（1 个 moderate、4 个 high）；本任务按范围约束未升级依赖、未执行 `npm audit fix`。生成 userscript 只能由构建产生，不得手工修改。

最终 Linux／Windows 结果以 Draft PR 切回正式稳定基线后的 GitHub Actions 为准。

## 10. 最终真实浏览器验收

构建和 CI 不能替代真实 Telegram Web K 验收。最终组合 userscript 至少覆盖：

- 图片预设与自定义时间；
- 正向、反向和三种媒体筛选；
- Space、A 与输入保护；
- 循环媒体和普通视频；
- 全屏进入／退出；
- Telegram 默认 PiP 限制；
- 离线／在线恢复；
- waiting／stalled；
- 自动播放拒绝与用户恢复；
- 图片和视频失败；
- 静音、音量、倍速与新 video 节点恢复；
- 控制条宽屏、窄屏、收起与展开；
- 相册、关闭定位、快速切换和快速关闭重开；
- listener、timer、observer 不重复；
- Telegram 输入、收发、滚动和聊天切换；
- 调试 API 与控制台未捕获异常。

真实浏览器验收完成前，综合 PR 保持 Draft。

## 11. 风险与回滚

主要风险：

- Telegram Web K DOM 或媒体事件时序变化；
- 浏览器对自动播放、PiP 或离线缓存行为差异；
- 不同媒体源在 `waiting`、`stalled`、`error` 之间的事件顺序不同；
- 窄窗口下 Telegram 官方控件与 TT 控制条的实际空间需要真机确认。

回滚方式：

1. 在 Tampermonkey 中停用或回退到 `0.4.0-k9`；
2. GitHub 中 revert 综合 PR；
3. 不需要迁移 localStorage，新字段缺失会自动回退，旧版本会忽略新字段；
4. 不删除 `tt.mediaContinuity.v1`，除非用户明确需要清理本地设置和位置记录。
