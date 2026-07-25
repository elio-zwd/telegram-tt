# 第二阶段：媒体文件命名模板

## 目标

为媒体查看器下载和后续“浏览时自动保存”提供统一的文件命名能力，并保持与第一版连续浏览控制器解耦。

本分支已经完成：

- 文件名模板渲染与校验；
- Windows 文件名安全处理；
- 模板本地持久化；
- “数据与存储”页面编辑入口；
- 图片下载文件名接入；
- 视频下载队列文件名接入。

本分支没有修改 `MediaViewerSlides`、`VideoPlayer`、连续浏览状态或自动保存队列。

## 分支

```text
feat/phase-2-media-filename-template
```

基线：创建分支时最新 `master` 提交 `7c2bdfcc951084976a17ef3e96e803cc47256261`。

## 默认模板

```text
{channel}_{date}_{messageId}_{mediaIndex}.{ext}
```

示例：

```text
ChannelName_2026-07-25_1582_02.mp4
```

## 支持的占位符

| 占位符 | 含义 | 示例 |
| --- | --- | --- |
| `{channel}` | 当前聊天或频道名称 | `ChannelName` |
| `{date}` | 消息日期，格式 `YYYY-MM-DD` | `2026-07-25` |
| `{time}` | 消息时间，格式 `HH-mm-ss` | `09-07-03` |
| `{messageId}` | Telegram 消息 ID | `1582` |
| `{mediaIndex}` | 相册内媒体序号，从 1 开始并至少补齐两位 | `02` |
| `{originalName}` | 原始文件名，不含路径和扩展名 | `IMG_1001` |
| `{ext}` | 标准化为小写的扩展名 | `mp4` |

## 用户入口

进入：

```text
设置 → 数据与存储 → Download
```

输入框下方会列出所有可用占位符。

规则：

- 输入框失去焦点时保存；
- 输入为空时恢复默认模板；
- 存在未知占位符或无有效文件名内容时，不保存并恢复上一次有效模板；
- 设置保存在浏览器或 Tauri WebView 的本地存储中；
- 当前实现对本地全部 Telegram TT 账号共用。

## 对外接口

文件：

```text
src/util/mediaDownloadFilename.ts
```

### 读取与保存模板

```ts
loadMediaFilenameTemplate()
storeMediaFilenameTemplate(template)
```

### 生成文件名

```ts
buildMediaDownloadFilename(context, options)
```

输入示例：

```ts
const filename = buildMediaDownloadFilename({
  channelTitle: chat.title,
  messageDate: new Date(message.date * 1000),
  messageId: message.id,
  mediaIndex,
  originalFilename,
  extension,
}, {
  template: loadMediaFilenameTemplate(),
});
```

### 校验模板

```ts
validateMediaFilenameTemplate(template)
```

返回：

- `isValid`：模板是否可以保存；
- `unknownTokens`：不支持的占位符，已自动去重；
- `hasFilenameContent`：模板是否至少包含普通文字或一个已知占位符。

## 已实现规则

- 自动过滤 Windows 文件名非法字符：`< > : " / \\ | ? *` 和控制字符；
- 防止模板产生路径分隔符或路径穿越；
- 处理 Windows 保留名称，例如 `CON`、`NUL`、`COM1`；
- 去除结尾的点和空格；
- 合并重复的空格、下划线和连接符；
- 扩展名统一转为小写并只保留字母与数字；
- 模板未包含 `{ext}` 时自动追加扩展名；
- 未传扩展名时可从原文件名推断；
- 相册序号从 1 开始，默认输出 `01`；
- 未知占位符不会原样写入文件名；
- 渲染结果为空时使用安全回退名称；
- 默认最大长度为 180 个 JavaScript 字符；
- 截断时优先保留扩展名。

## 当前下载接入

### 图片

媒体查看器中的图片继续使用浏览器原生 `download` 属性，文件名替换为模板渲染结果。

### 视频

视频继续进入现有 `downloadMedia` 下载队列。开始任务前，为媒体对象提供模板渲染后的 `fileName`，现有下载 action 和下载管理器无需修改。

### 内容保护

本分支没有改变现有保护判断：

- 受保护媒体不会新增下载入口；
- 模板功能不能绕过频道或消息的内容保护；
- 只改变允许下载媒体的最终文件名。

## 与第一版自动保存的集成边界

第一版自动保存功能完成后，在真正调用浏览器下载或 Tauri 文件写入之前复用同一个函数：

```text
媒体成为当前活动项
  → 检查内容保护、类型与大小限制
  → 解析原始文件名和扩展名
  → buildMediaDownloadFilename(...)
  → 重复文件检查
  → 写入下载目录
```

命名工具不负责：

- 判断媒体是否允许下载；
- 判断频道是否受保护；
- 创建下载目录；
- 检查重复媒体；
- 下载、取消或重试任务；
- 解决同名文件冲突。

## 验证命令

仓库规则要求不为该改动新增测试文件。执行：

```sh
npm run check:ts
npm run check
npm run build:dev
```

手动检查：

1. 进入“设置 → 数据与存储”。
2. 将模板改为 `{channel}_{messageId}_{originalName}.{ext}`。
3. 打开频道图片并下载，确认文件名符合模板。
4. 打开频道视频并下载，确认下载管理器中的文件名符合模板。
5. 输入 `{unknown}` 并离开输入框，确认恢复上一次有效模板。
6. 打开受保护频道媒体，确认下载限制未被改变。

## 后续可独立扩展

- 为设置入口增加专用本地化标题和说明；
- 文件夹模板，例如 `{channel}/{date}`；
- 按账号保存不同模板；
- 用户可选的本地时区或 UTC 时间；
- 同名冲突策略：跳过、覆盖、自动编号；
- 字节级长度限制，以适配不同文件系统；
- 设置页面实时文件名预览；
- 从下载任务中展示最终文件名。
