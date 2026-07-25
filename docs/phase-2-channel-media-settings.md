# 第二阶段：每个频道独立设置

## 功能目标

允许用户针对某个频道或话题覆盖连续媒体浏览的全局默认设置。

典型场景：

- 全局默认浏览图片和视频，但频道 A 只浏览图片；
- 全局图片停留 5 秒，但频道 B 使用 8 秒；
- 全局关闭自动保存，但指定频道单独开启；
- 某个频道允许保存图片，但不保存视频或 GIF；
- 某个话题使用反向浏览，频道主列表继续使用全局方向。

本分支先实现独立、可测试的数据层，不修改第一阶段正在开发的播放控制器、设置页面和自动保存流程。

## 分支

```text
feat/phase-2-channel-media-settings
```

该分支直接基于 `master` 创建，不依赖“续播位置”分支，也不应合并到其他第二阶段分支中。

## 当前实现

### 支持的覆盖项

```text
isContinuousBrowsingEnabled
imageDurationSeconds
mediaType
方向 direction
shouldPreloadNext
isAutoSaveEnabled
shouldSavePhotos
shouldSaveVideos
shouldSaveGifs
maxVideoSizeMb
endBehavior
```

对应取值：

- 媒体类型：`all`、`photo`、`video`；
- 浏览方向：`forward`、`backward`；
- 队列结束行为：`stop`、`wait`、`loop`；
- 图片停留时间：2–300 秒；
- 视频大小限制：1–4096 MB。

### 差异化保存

频道设置只保存与全局默认值不同、且由用户明确覆盖的字段。

例如全局设置为：

```ts
{
  imageDurationSeconds: 5,
  mediaType: 'all',
  isAutoSaveEnabled: false,
}
```

频道只配置：

```ts
{
  imageDurationSeconds: 8,
  mediaType: 'photo',
}
```

最终解析结果为：

```ts
{
  imageDurationSeconds: 8,
  mediaType: 'photo',
  isAutoSaveEnabled: false,
}
```

未覆盖的自动保存设置继续继承全局值。

### 撤销单项覆盖

更新接口接受 `null`，用于撤销某一项频道覆盖：

```ts
updateChannelMediaSettingsOverride({
  accountId,
  chatId,
  settings: {
    imageDurationSeconds: null,
  },
});
```

撤销后，该字段重新继承全局默认值。

如果所有覆盖项都被撤销，整个频道记录会自动删除。

### 隔离规则

设置按照以下维度隔离：

- Telegram 账号；
- 频道或聊天；
- 话题 Thread。

同一频道的主消息列表和不同话题可以使用不同设置。

### 本地存储策略

存储键：

```text
tt.channelMediaSettings.v1
```

规则：

- 最多保留 500 个频道或话题设置记录；
- 超过上限时淘汰最旧记录；
- 同一账号、频道、话题只保留最新记录；
- 损坏 JSON 自动清理；
- 不兼容版本自动清理；
- 非法字段和值自动过滤；
- 重复记录自动去重；
- LocalStorage 不可用或写入失败时静默降级；
- 存储失败不得阻断媒体查看器。

## 对外接口

代码文件：

```text
src/util/channelMediaSettings.ts
```

主要接口：

```ts
getChannelMediaSettingsOverride(...)
resolveChannelMediaSettings(...)
updateChannelMediaSettingsOverride(...)
clearChannelMediaSettingsOverride(...)
clearAccountChannelMediaSettings(...)
clearAllChannelMediaSettings(...)
```

### 读取并解析有效设置

```ts
const override = getChannelMediaSettingsOverride(
  currentUserId,
  chatId,
  threadId,
);

const effectiveSettings = resolveChannelMediaSettings(
  globalSettings,
  override,
);
```

第一阶段合并后，连续浏览控制器应只读取 `effectiveSettings`，不应自行重复处理频道覆盖逻辑。

## 单元测试覆盖

测试文件：

```text
src/util/channelMediaSettings.test.ts
```

已覆盖：

1. 保存和读取部分覆盖项；
2. 与全局设置合并；
3. 增量更新并保留其他覆盖项；
4. 使用 `null` 撤销单项覆盖；
5. 所有覆盖项清空后删除记录；
6. 多账号隔离；
7. 多频道隔离；
8. 多话题隔离；
9. 非法设置过滤；
10. 损坏 JSON 和不兼容版本自修复；
11. 非法记录过滤、重复记录去重；
12. 500 条上限与旧记录淘汰；
13. 清除单频道、单账号和全部记录；
14. LocalStorage 异常安全降级。

## 本地验证

仓库要求：

```text
Node.js 24.11 或 26
npm 11 或 12
```

验证命令：

```bash
npm ci
npm test -- src/util/channelMediaSettings.test.ts
npm run check
npm run build:mocked
```

完整回归：

```bash
npm test
```

## 后续 UI 接入

第一阶段稳定后，再通过单独的小 PR 增加频道菜单入口：

```text
频道菜单 → 连续浏览设置
```

建议界面包含：

- 使用全局设置开关；
- 连续浏览默认开关；
- 媒体类型；
- 图片停留时间；
- 浏览方向；
- 预加载下一项；
- 浏览时自动保存；
- 保存图片、视频和 GIF；
- 视频大小限制；
- 队列结束行为；
- 恢复全局默认值。

UI 保存时调用 `updateChannelMediaSettingsOverride`；点击“恢复全局默认值”时调用 `clearChannelMediaSettingsOverride`。

## 已知边界

- 当前分支只提供数据层和解析能力，尚未增加频道菜单 UI；
- 当前分支不修改第一阶段设置类型，合并第一阶段后需要增加一次类型适配；
- 下载目录和自定义文件名模板不属于本模块，后续应由单独模块处理；
- 频道退出、账号退出时的数据清理入口已具备，但尚未接入退出动作；
- 不要把本分支和“续播位置”分支相互合并，应分别通过 PR 审查。
