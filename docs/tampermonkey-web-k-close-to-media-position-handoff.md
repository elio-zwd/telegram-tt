# Telegram Web K 关闭后定位最后媒体消息开发交接

## 1. 接手任务

接手 GitHub 仓库 `elio-zwd/telegram-tt`，在现有分支继续完成：

> Telegram Web K 连续浏览媒体后，关闭媒体查看器时，将聊天窗口定位到最后一个成功显示媒体所属的消息。

不要重新讨论产品定义，不要从零规划，不要转回桌面客户端源码开发。

## 2. 仓库与分支

```text
仓库：https://github.com/elio-zwd/telegram-tt
基线分支：codex/tampermonkey-media-continuity
基线 SHA：b7c89bea426f420b563d3bd5089056ee1cdc43dc
开发分支：feat/tampermonkey-web-k-close-to-media-position
目标脚本：tampermonkey/telegram-media-continuity-web-k.user.js
基线脚本版本：0.3.0-k3
```

当前分支已经创建，规划文档已开始提交。接手时必须先读取远端最新 HEAD，不得从本交接文档中的中间 Commit 猜测最终 HEAD。

## 3. 必读文件顺序

1. `AGENTS.md`；
2. `README.md`；
3. `tampermonkey/README.md`；
4. `docs/tampermonkey-web-k-media-viewer-fix-plan.md`；
5. `docs/tampermonkey-web-k-close-to-media-position-plan.md`；
6. `docs/tampermonkey-web-k-close-to-media-position-task.md`；
7. `docs/tampermonkey-plugin-migration-matrix.md`；
8. `tampermonkey/telegram-media-continuity-web-k.user.js`；
9. `tampermonkey/telegram-media-continuity.user.js`，只读参考；
10. 当前开放 PR 和近期提交。

## 4. 已确认能力与限制

规划对话已确认：

- GitHub 仓库读取能力可用；
- 创建分支、修改文件、Commit、PR 能力可用；
- 用户账号对仓库具有写权限；
- Superpowers 插件在规划对话中不可调用，已使用等价人工流程；
- 当前对话可能同样没有本地终端或真实 Telegram 页面控制能力，必须如实区分静态检查与浏览器验收；
- 未实际执行的命令不得写成通过；
- 未读取的 DOM 不得假设存在。

如果新对话能够调用 Superpowers，适用顺序：

```text
Superpowers:executing-plans
Superpowers:systematic-debugging
Superpowers:verification-before-completion
Superpowers:finishing-a-development-branch
```

如果不能调用，继续按本仓库文档执行等价人工流程。

## 5. 已完成状态

### 5.1 Web K 已有功能

PR #6 已合并，稳定 HEAD 为：

```text
b7c89bea426f420b563d3bd5089056ee1cdc43dc
```

真实验收已通过：

- Web K 注入；
- Shadow DOM 控制条；
- 手动上一项、下一项；
- 图片定时自动切换；
- 连续至少三张图片；
- 视频 `ended` 自动切换；
- 悬停、页面失焦、用户缩放时暂停；
- 退出缩放完整重新计时；
- 循环视频提示；
- 队列末尾停止；
- Telegram 原功能回归；
- 控制台无错误。

不要重复修改这些逻辑，除非关闭定位功能引发回归。

### 5.2 当前脚本缺口

Web K 脚本当前没有：

- 当前媒体所属 `peerId/messageId` 映射；
- 最后成功媒体目标；
- 关闭意图快照；
- 关闭后等待聊天恢复；
- 消息定位和短暂高亮；
- 虚拟列表安全降级。

### 5.3 Web A 可参考能力

`tampermonkey/telegram-media-continuity.user.js` 已有：

- 位置存储数据结构；
- 消息 ID 和官方链接解析思路；
- 当前 DOM 中查找历史消息；
- 最多 100 条位置记录；
- 安全失效与脱敏调试。

但 Web A 当前逻辑是“下次打开后显示继续入口”，不是“关闭后立即定位”，不能直接复制整个实现。

## 6. 产品决策

用户已确认推荐组合：`1A + 2A + 3A + 4A`。

### 6.1 最后位置

- 最后成功显示媒体；
- 新项尚未加载时仍使用上一成功项；
- 相册只定位所属消息；
- 消息滚动到聊天中部附近。

### 6.2 关闭入口

- 首版优先官方关闭按钮和 `Esc`；
- 其他关闭方式能安全识别则处理，否则降级；
- 不阻断 Telegram 官方关闭。

### 6.3 虚拟列表

- 目标在 DOM：直接居中和高亮；
- 目标不在 DOM：只允许调用一次经过浏览器确认的 Telegram 官方消息跳转 DOM 行为；
- 无安全跳转：提示并结束；
- 禁止错误滚动、循环加载和私有接口。

### 6.4 高亮

- 约 1.2 秒；
- 自动清理；
- 不永久修改 Telegram 样式。

## 7. 推荐实现顺序

### 阶段 1：重新核对和 DOM 探测

1. 检出开发分支；
2. 检查开放 PR 是否出现同文件修改；
3. 读取完整脚本；
4. 扩展脱敏调试 API；
5. 通过用户真实浏览器确认：
   - 消息节点 `data-mid/data-peer-id`；
   - 官方关闭按钮；
   - 作者或消息跳转区域；
   - 关闭后节点移除/隐藏时序；
   - Telegram 是否恢复旧滚动位置。

如果无法直接访问浏览器，不得假装确认。可以先提交安全的探测增强，让用户按文档运行并返回脱敏结果，再完成最终选择器。

### 阶段 2：消息映射

1. 捕获初始来源消息；
2. 建立 `pendingMediaTarget`；
3. 媒体成功显示后更新 `lastConfirmedMediaTarget`；
4. 对来源消息、查看器公开证据和官方链接做一致性校验；
5. 证据冲突时禁用自动定位。

### 阶段 3：关闭定位

1. 捕获官方关闭按钮和 `Esc`；
2. 冻结关闭快照；
3. 等待查看器实际关闭；
4. 在当前聊天中查找目标消息；
5. 目标不在 DOM 时使用一次经验证的官方跳转；
6. 居中并高亮；
7. 使用关闭序列 ID 和有界超时防止重复。

### 阶段 4：验证和 PR

1. 静态检查；
2. 浏览器完整验收；
3. 更新 README 和交接文档；
4. 创建 PR；
5. 不合并；
6. 输出本地只读验收 Prompt。

## 8. 禁止事项

- 不调用 Telegram API、Bot API、MTProto；
- 不要求 API ID；
- 不读取或枚举 Telegram 私有运行时和打包模块；
- 不读取 Telegram IndexedDB；
- 不持久化媒体 URL、聊天正文、频道名称或账号信息；
- 不绕过频道保护、付费媒体或权限限制；
- 不新增第三方依赖；
- 不新增测试文件；
- 不修改默认分支；
- 不在本 PR 实现自动保存、频道设置或统一架构；
- 不把多个 AI 对话同时指向本分支写代码；
- 不未经用户授权合并 PR。

## 9. 多 AI 对话协作规则

用户可以手动开启多个 AI 对话，但这些对话不能共享可靠实时状态。

### 9.1 当前分支独占

```text
feat/tampermonkey-web-k-close-to-media-position
```

只能由一个开发对话写入。其他对话不得同时修改：

```text
tampermonkey/telegram-media-continuity-web-k.user.js
tampermonkey/README.md
docs/tampermonkey-web-k-close-to-media-position-*.md
```

规划对话完成交接后停止写入代码，由新开发对话接管。

### 9.2 可以并行的独立对话

以下任务只在各自创建独立分支和 PR 后并行：

| 对话 | 建议分支 | 范围 | 与当前分支关系 |
| --- | --- | --- | --- |
| A | `feat/tampermonkey-web-k-close-to-media-position` | 当前 Web K P0 实现 | 当前主任务，独占 Web K 脚本 |
| B | `docs/tampermonkey-shared-core-architecture` | 只写共享核心架构方案，不改脚本 | 可并行 |
| C | `docs/tampermonkey-download-feasibility` | 只做浏览时保存和下载限制可行性研究 | 可并行 |
| D | `feat/tampermonkey-web-a-close-to-media-position` | Web A 关闭后定位，修改 Web A 脚本和专属文档 | 设计稳定后可并行，禁止改公共 README |

### 9.3 暂不并行的功能

以下功能都会修改 Web K 主脚本，应等待当前 PR 合并后串行：

- Web K 频道位置持久化；
- Web K 浏览历史；
- Web K 只浏览未看过；
- Web K 快捷键；
- Web K 媒体类型过滤；
- Web K 自动保存；
- Web A/K 单脚本统一入口。

### 9.4 交接媒介

所有对话通过以下内容交接：

- GitHub 分支；
- Commit；
- PR 描述；
- PR 评论；
- `docs/` 交接文档。

不得依赖“另一个对话应该知道”。

## 10. 开放 PR 状态

规划时开放 PR：

- PR #3：桌面源码媒体文件名模板；
- PR #4：桌面源码频道独立设置数据层；
- PR #5：桌面源码只浏览未看过媒体。

它们以 `master` 为 Base，不修改当前 Web K 油猴脚本。接手时仍需重新检查，不能永久依赖本记录。

## 11. 验证命令

本地 AI 只读验收建议：

```powershell
git fetch origin
git checkout feat/tampermonkey-web-k-close-to-media-position
git pull --ff-only origin feat/tampermonkey-web-k-close-to-media-position
git status --short
git rev-parse HEAD
node --check tampermonkey/telegram-media-continuity-web-k.user.js
git diff --check origin/codex/tampermonkey-media-continuity...HEAD
git diff --name-status origin/codex/tampermonkey-media-continuity...HEAD
```

浏览器验收必须使用真实 Telegram Web K 页面，不得仅凭静态代码宣称功能通过。

## 12. 完成输出要求

开发完成后必须输出：

1. 仓库链接；
2. PR 链接和编号；
3. Base 分支和开发分支；
4. 最终 Commit SHA；
5. 修改文件；
6. 完成内容；
7. 静态检查真实结果；
8. 浏览器验收真实结果；
9. 尚未验证内容；
10. 风险和重点回归区域；
11. 回滚建议；
12. 给本地验收 AI 的可复制只读 Prompt。

## 13. 当前交接结论

方案已经确认，任务已经拆分，不需要再次向用户询问 1A/2A/3A/4A。

新开发对话应直接：

```text
读取仓库和规划文档
→ 检查并行冲突
→ 完成脱敏 DOM 探测
→ 按 Task 实施
→ 静态核对
→ 配合真实浏览器验收
→ 创建 PR
→ 不合并
```
