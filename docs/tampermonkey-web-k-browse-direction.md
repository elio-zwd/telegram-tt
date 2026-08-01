# Telegram Web K 正向和反向连续浏览

## 1. 目标

P1-01 为 Telegram Web K 油猴插件增加可持久化的自动浏览方向，同时保持手动导航、关闭定位和 P0 已验收行为兼容。

```text
Base：codex/tampermonkey-media-continuity@c929dee57debbaed4acf1ac6c07a0c48142d4b33
开发分支：feat/tampermonkey-web-k-browse-direction
目标版本：0.4.0-k6
```

本功能只作用于 Telegram Web K：

```text
https://web.telegram.org/k/*
```

Web A 脚本和桌面源码不在本次范围内。

## 2. 产品语义

新增设置：

```js
browseDirection: 'forward' | 'backward'
```

默认值为 `forward`。

- `forward`：图片倒计时和普通视频结束后调用方向 `1`，对应 Telegram 官方下一项。
- `backward`：图片倒计时和普通视频结束后调用方向 `-1`，对应 Telegram 官方上一项。
- 方向只影响自动连续浏览，不重新定义任何手动操作。

手动方向继续固定为：

```text
TT 上一项 = -1
TT 下一项 = 1
Telegram 官方左侧控件 = -1
Telegram 官方右侧控件 = 1
ArrowLeft = -1
ArrowRight = 1
```

## 3. 设置兼容

继续使用唯一 storage key：

```text
tt.mediaContinuity.v1
```

`core/settings.js` 同时兼容：

- 旧扁平设置对象；
- 当前 `{ settings: ... }` 包装格式；
- 旧数据缺少 `browseDirection`；
- 非法方向值；
- 损坏 JSON；
- `localStorage` 读取或写入失败。

缺失、未知或非法值全部回退为 `forward`。修改方向时通过现有增量更新路径保存，不覆盖连续浏览开关、图片时长和控制条折叠状态。

## 4. 连续浏览实现

`ViewerSession.getAutomaticDirection()` 是字符串设置到数值导航方向的唯一转换点：

```js
getAutomaticDirection() {
  return this.settings.browseDirection === 'backward' ? -1 : 1;
}
```

以下自动行为统一使用该方向：

- 图片倒计时结束；
- 普通视频 `ended`；
- 官方导航按钮可用性判断；
- 队列边界停止；
- 自动切换状态提示；
- 关闭定位相邻目标准备。

正向无下一项时提示已到当前媒体末尾；反向无上一项时提示已到当前媒体开头。两种方向都不循环、不自动加载更多历史、不猜测隐藏媒体、不持续重试。

## 5. 控制面板

Shadow DOM 控制面板增加紧凑选择框：

```text
正向
反向
```

控制面板仍然只接收状态、发送回调和渲染 UI，不导入或调用 `platform/**`。

方向变更后：

- 立即持久化；
- 立即影响下一次自动切换；
- 当前图片倒计时取消并从完整时长重新开始；
- 不立即强制切换媒体；
- 不改变暂停状态；
- 不改变连续浏览开关；
- 收起、展开和刷新后保持设置。

## 6. 关闭定位

所有导航继续调用：

```js
prepareNavigationTarget(direction)
```

这里的 `direction` 是本次实际执行的 `1` 或 `-1`，而不是根据设置名称猜测消息位置。新媒体成功显示后，`MediaTargetTracker` 才会更新 `lastConfirmedMediaTarget`。

因此反向自动浏览、连续反向多项、相册和加载失败场景继续沿用 P0 的 pending/confirmed target 与安全降级机制。

## 7. 修改范围

源码和门禁：

```text
tampermonkey/src/web-k/version.js
tampermonkey/src/web-k/core/settings.js
tampermonkey/src/web-k/features/continuous-browsing/viewer-session.js
tampermonkey/src/web-k/features/control-panel/control-panel.js
tampermonkey/build/verify-web-k-userscript.mjs
```

文档和生成产物：

```text
tampermonkey/README.md
docs/tampermonkey-web-k-browse-direction.md
tampermonkey/telegram-media-continuity-web-k.user.js
```

明确未修改：

- `platform/navigation.js` 的方向映射和选择器；
- `app.js` 的应用装配；
- Web A userscript；
- Telegram 桌面源码；
- storage key；
- 调试 API 名称和返回结构。

## 8. 验证状态

远端开发对话没有可用的仓库终端和真实 Telegram Web K 浏览器控制能力，因此不把以下内容写成已通过：

- 本地 `npm ci`；
- 本地双次构建和 SHA-256；
- 本地 `node --check`；
- 真实浏览器 43 项验收。

GitHub Actions 将执行 Linux 和 Windows 双平台依赖安装、连续构建、哈希一致性、生成文件门禁、语法检查和 Git 差异检查。真实结果以 Draft PR 最新 Head 的工作流记录为准。

真实浏览器验收完成前 PR 保持 Draft。

## 9. 重点回归

- 旧设置默认正向；
- 图片和普通视频正向、反向自动切换；
- 反向连续至少三项；
- 反向到首项安全停止；
- TT、官方按钮和方向键不因自动方向改变；
- 手动切换后自动模式继续使用设置方向；
- 切换方向后图片重新开始完整倒计时；
- 正向和反向关闭定位到最后成功显示的消息；
- 加载失败保留上一项成功目标；
- 相册定位整条消息；
- 悬停、失焦、缩放和循环视频行为不回归；
- `getSummary()` 返回 `0.4.0-k6` 和当前 `browseDirection`；
- 调试 API 不输出聊天正文、频道名称、用户名、原始 href 或完整媒体 URL。

## 10. 回滚

本功能可以整体回滚对应 PR。旧本地数据仍可由 `0.4.0-k5` 读取；新增的 `browseDirection` 字段会被旧版本忽略。用户侧也可以先在 Tampermonkey 中停用脚本恢复 Telegram 原始行为。
