# 第二阶段：媒体文件命名模板

## 目标

为“浏览时自动保存”和后续下载管理器提供统一、可测试的文件命名能力，同时避免提前耦合第一版正在开发的连续浏览与自动保存流程。

本分支只提供纯工具和单元测试，不修改媒体查看器、下载 action、设置页面或 Tauri 文件系统代码。

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
| `{channel}` | 频道名称 | `ChannelName` |
| `{date}` | 消息日期，格式 `YYYY-MM-DD` | `2026-07-25` |
| `{time}` | 消息时间，格式 `HH-mm-ss` | `09-07-03` |
| `{messageId}` | Telegram 消息 ID | `1582` |
| `{mediaIndex}` | 相册内媒体序号，从 1 开始并至少补齐两位 | `02` |
| `{originalName}` | 原始文件名，不含路径和扩展名 | `IMG_1001` |
| `{ext}` | 标准化为小写的扩展名 | `mp4` |

## 对外接口

文件：

```text
src/util/mediaDownloadFilename.ts
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
  template: userSettings.mediaFilenameTemplate,
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

### 清理文件名

```ts
sanitizeMediaFilename(value)
```

可单独用于手动另存为、频道子目录名或旧下载逻辑。

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

## 与第一版的集成边界

第一版自动保存功能完成后，在真正调用浏览器下载或 Tauri 文件写入之前集成：

```text
媒体成为当前活动项
  → 检查内容保护、类型与大小限制
  → 解析原始文件名和扩展名
  → buildMediaDownloadFilename(...)
  → 重复文件检查
  → 写入下载目录
```

本工具不负责：

- 判断媒体是否允许下载；
- 判断频道是否受保护；
- 创建目录；
- 检查重复媒体；
- 下载、取消或重试任务；
- 存储用户模板设置；
- 解决同名文件冲突。

这些职责继续留在第一版自动保存模块或后续下载管理器中，避免命名工具反向依赖业务状态。

## 建议设置项

后续设置页面可以新增：

```ts
mediaFilenameTemplate: string;
```

默认值直接复用：

```ts
DEFAULT_MEDIA_FILENAME_TEMPLATE
```

保存设置前调用 `validateMediaFilenameTemplate`。存在未知占位符或模板没有有效内容时，不保存并在输入框下显示原因。

## 验证命令

```sh
npm test -- src/util/mediaDownloadFilename.test.ts
npm run check:ts
npm run check
```

## 后续可独立扩展

- 文件夹模板，例如 `{channel}/{date}`；
- 用户可选的本地时区或 UTC 时间；
- 同名冲突策略：跳过、覆盖、自动编号；
- 字节级长度限制，以适配不同文件系统；
- 设置页面模板预览；
- 从下载任务中展示最终文件名。
