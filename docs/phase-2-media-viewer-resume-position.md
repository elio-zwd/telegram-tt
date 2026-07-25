# 第二阶段：记住频道上次媒体位置

## 状态

- 开发分支：`feat/phase-2-media-viewer-resume-position`
- 基线：`master` 的 `7c2bdfcc951084976a17ef3e96e803cc47256261`
- 当前状态：首个可验收切片已实现，尚未合并

## 本次实现范围

本分支实现第二阶段功能中的“记住上次浏览位置”，并尽量避免与第一版连续浏览、自动保存主链路产生冲突。

已实现：

1. 浏览频道消息中的图片或视频时，记录：
   - Telegram 账号；
   - 频道 ID；
   - 线程 ID；
   - 消息 ID；
   - 相册或付费媒体中的媒体序号；
   - 最后更新时间。
2. 每个 Telegram 账号独立保存记录，避免多账号之间串数据。
3. 每个频道只保留最新位置。
4. 每个账号最多保留 100 个频道的位置，超过后自动淘汰最旧记录。
5. 本地数据损坏、字段不合法时自动清理，不阻断媒体查看器。
6. 用户重新打开同一频道的其他媒体时：
   - 桌面端媒体查看器操作区显示“最近位置”图标；
   - 移动端在“更多”菜单显示“上一个/Previous”入口；
   - 点击后返回该频道上一次记录的媒体位置。
7. 当前打开位置与已记录位置相同时，不显示恢复入口。

## 数据存储

数据只写入浏览器本地存储，不上传服务器。

存储键按账号隔离：

```text
telegram-tt-media-viewer-history-v1:<accountId>
```

单条记录结构：

```ts
{
  chatId: string;
  threadId?: string | number;
  messageId: number;
  mediaIndex: number;
  updatedAt: number;
}
```

## 主要文件

```text
src/components/mediaViewer/MediaViewerActions.tsx
src/util/mediaViewerHistory.ts
src/util/mediaViewerHistory.test.ts
```

## 与第一版的合并边界

本功能没有修改：

- `MediaViewerSlides.tsx`；
- `VideoPlayer.tsx`；
- 连续浏览计时器；
- 视频结束切换逻辑；
- 自动保存或下载队列；
- 第一版全局设置字段。

预计与第一版的主要潜在冲突只会出现在：

```text
src/components/mediaViewer/MediaViewerActions.tsx
```

合并时应保留本分支的三个职责：

1. 首次进入频道媒体查看器时读取旧位置；
2. 当前媒体变化时更新位置；
3. 在操作区提供恢复入口。

## 当前限制

这是第二阶段的首个独立切片，不包含：

- 在频道主页直接显示“继续上次浏览”；
- 对已被服务器删除的历史消息进行自动恢复；
- 跨频道媒体播放列表；
- 浏览历史管理页面；
- 用户手动清除全部浏览位置的设置入口；
- 云端同步浏览位置。

如果历史消息当前无法被客户端解析或已失去访问权限，恢复操作可能无法打开对应媒体；后续可结合消息定位和动态媒体搜索补强。

## 本地验证命令

```bash
npm install
npm run check:ts
npm test -- mediaViewerHistory
npm run build:dev
```

## 手工验收

1. 登录 Telegram，进入频道 A。
2. 打开媒体 1，切换到媒体 2 后关闭查看器。
3. 再打开频道 A 的媒体 3。
4. 桌面端应出现“最近位置”图标；移动端更多菜单应出现恢复入口。
5. 点击后应返回媒体 2。
6. 关闭并重新打开同一个媒体 2，不应显示无意义的恢复入口。
7. 切换到另一个 Telegram 账号，账号 A 的记录不应出现在账号 B。
8. 连续浏览超过 100 个不同频道后，最旧频道记录应被自动淘汰。
