# Telegram 媒体续播油猴脚本

当前仓库包含两个脚本：

```text
tampermonkey/telegram-media-continuity.user.js
tampermonkey/telegram-media-continuity-web-k.user.js
```

## Telegram Web A

适用页面：

```text
https://web.telegram.org/a/*
```

脚本：

```text
tampermonkey/telegram-media-continuity.user.js
```

该脚本是原有 Web A 第一版，支持频道媒体连续浏览和有限的续播位置记录。

## Telegram Web K

适用页面：

```text
https://web.telegram.org/k/*
```

验证脚本：

```text
tampermonkey/telegram-media-continuity-web-k.user.js
```

当前版本：

```text
0.3.0-k3
```

Web K 与 Web A 使用不同的媒体查看器 DOM，因此不能只给 Web A 脚本增加一个 `@match`。

Web K 验证脚本当前支持：

- 识别 `.media-viewer-whole` 媒体查看器；
- 在 `.media-viewer-movers` 中识别当前图片或视频；
- 使用 Web K 官方左右切换控件；
- 图片按设定时长自动切换；
- 视频自然结束后切换；
- 悬停、页面失焦、用户交互和缩放时暂停；
- 使用 `.media-viewer-whole.is-zooming` 判断真实用户缩放；
- Shadow DOM 控制条；
- 安全失效，不阻断 Telegram 原有操作。

当前 Web K 脚本仍是兼容验证版，尚未迁移 Web A 的频道续播位置功能。

## 安装 Web K 验证脚本

1. 在 Tampermonkey 中停用旧 Web A 脚本，避免测试结果混淆。
2. 安装 `telegram-media-continuity-web-k.user.js`。
3. 刷新 Telegram Web K。
4. 打开频道中的普通图片或视频。
5. 媒体查看器识别成功后，底部出现 TT 控制条。

脚本保持：

```text
@grant none
```

只使用页面 DOM、浏览器媒体事件和 `localStorage`，不调用 Telegram API。

## Web K 调试

控制台执行：

```js
TelegramMediaContinuity.getSummary();
TelegramMediaContinuity.inspect();
TelegramMediaContinuity.testPrevious();
TelegramMediaContinuity.testNext();
```

开启日志：

```js
TelegramMediaContinuity.enableDebug(true);
```

`inspect()` 只输出：

- 标签和类名；
- 节点尺寸；
- 图片、视频数量；
- 左右导航可用性；
- 是否处于 `is-zooming`；
- 控制条是否挂载。

不会输出聊天正文或媒体 URL。

## Web K 最小验收

### 默认图片

1. 打开普通图片。
2. 执行 `TelegramMediaContinuity.inspect()`。
3. 确认 `isZoomed` 为 `false`。
4. 开启连续浏览。
5. 确认出现图片倒计时。
6. 连续自动切换至少三张图片。

### 用户缩放

1. 在图片倒计时期间进入 Telegram 官方缩放状态。
2. 确认 `inspect().isZoomed` 为 `true`。
3. 等待超过设定图片时长，图片不能切换。
4. 退出缩放。
5. 确认 `isZoomed` 恢复为 `false`。
6. 倒计时从完整时长重新开始。

### 视频

1. 打开普通非循环视频。
2. 开启连续浏览。
3. 视频自然结束后进入下一项。
4. 循环视频应提示手动切换。

### 安全回归

确认脚本不影响：

- Telegram 聊天滚动；
- 媒体查看器关闭；
- 官方左右按钮；
- 视频控制栏；
- 频道导航。

## 本地数据

两个脚本当前共用：

```text
tt.mediaContinuity.v1
```

Web K 验证脚本只读取和更新其中的基础设置：

- 连续浏览开关；
- 图片停留时间；
- 控制条折叠状态。

不会修改 Web A 已保存的位置记录。

## 回退

出现异常时在 Tampermonkey 中停用对应脚本即可。脚本不修改 Telegram 服务端数据。
