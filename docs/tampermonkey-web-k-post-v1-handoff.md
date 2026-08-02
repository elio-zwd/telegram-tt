# Telegram Web K P2–P4 多对话交接规则

## 1. 目标

本文件规定 P2–P4 各独立 ChatGPT／本地 AI 对话之间的 GitHub 交接方式，避免多个对话同时修改同一分支、路线文档、公共平台层或生成 userscript。

## 2. 基线

```text
仓库：https://github.com/elio-zwd/telegram-tt
稳定分支：codex/tampermonkey-media-continuity
规划启动基线：51a89ebdb4b609023176ee8b1dfdb8dfcacb7377
规划启动版本：0.4.0-k11
```

每个新任务开始前必须重新读取稳定分支 HEAD。若已变化，以最新已验证稳定 HEAD 为准，不得继续使用本文件中的历史 SHA 创建分支。

## 3. 一对话一任务

所有实现 Task 遵守：

```text
一个对话
一个明确 Task ID
一个独立分支
一个 Draft PR
```

禁止：

- 一个对话同时维护多个开发分支；
- 在默认分支或稳定分支直接修改；
- 向其他对话负责的分支提交；
- 未经授权标记 Ready、合并、关闭 PR 或删除分支；
- 把两个主要目标合并到同一 PR；
- 依赖其他对话的口头记忆而不读取 GitHub 记录。

UI-DESIGN 是外部设计讨论，不写运行代码。UI-01 才是仓库实现 Task。

## 4. 新对话启动检查

依次执行：

1. 确认 GitHub 和可用工作流工具；
2. 读取根目录及目标目录适用的 `AGENTS.md`；
3. 读取本路线、Plan、Tasks 和 Handoff；
4. 读取稳定分支最新 HEAD 与 `version.js`；
5. 检查开放 PR、近期 Commit 和同名分支；
6. 检查前置 Task 的 PR 状态、Commit、验证与未决项；
7. 检查目标文件是否正被其他开放 PR 修改；
8. 从最新稳定 Base 创建独立分支；
9. 在 PR 描述记录准确依赖关系。

如果前置 PR 尚未合并：

- 强依赖：停止代码开发，只做只读研究或等待；
- 仅文档依赖：可基于明确 Commit 研究，但不得把未合并代码复制进新分支；
- 需要堆叠 PR：必须明确 Base 和依赖 PR，且获得用户确认。

## 5. 分支与 PR

建议分支和标题以 Tasks 文档为准。通用命名：

```text
feat/tampermonkey-web-k-<task>
fix/tampermonkey-web-k-<task>
research/tampermonkey-web-k-<task>
docs/tampermonkey-web-k-<task>
```

所有新 PR 默认 Draft。

Commit 标题：

```text
<英文类型>: <中文描述>
```

不得自动添加 `Co-Authored-By`。

## 6. 写入前同步规则

每次写入文件前：

- 重新读取目标分支该文件最新内容；
- 确认 PR Head 未被其他提交推进；
- 对公共文件执行冲突检查；
- 只修改当前 Task 必需内容。

高冲突文件：

```text
tampermonkey/src/web-k/core/settings.js
tampermonkey/src/web-k/core/runtime.js
tampermonkey/src/web-k/app.js
tampermonkey/src/web-k/platform/message-list.js
tampermonkey/src/web-k/features/control-panel/**
tampermonkey/src/web-k/features/continuous-browsing/**
tampermonkey/src/web-k/features/media-stream-continuation/**
tampermonkey/src/web-k/version.js
tampermonkey/telegram-media-continuity-web-k.user.js
docs/tampermonkey-web-k-plugin-priority-roadmap.md
docs/tampermonkey-web-k-post-v1-*.md
```

代码 PR 都可能更新生成 userscript。冲突必须通过最新源码重基后重新构建解决，禁止手工拼接生成文件。

## 7. Task 交付契约

每个 PR 描述至少包含：

1. Task ID、背景与目标；
2. Base 分支与 SHA；
3. Head 分支与 SHA；
4. 前置依赖及其状态；
5. 实现方式；
6. 修改文件；
7. 明确未修改范围；
8. 数据模型或状态机；
9. 隐私和安全边界；
10. 实际执行的命令和结果；
11. CI 状态；
12. 真实浏览器验收；
13. 未验证内容；
14. 风险和重点回归；
15. 回滚；
16. 下一 Task；
17. 给本地 AI 的只读验收 Prompt。

不得把静态阅读写成“测试通过”，不得把未触发 CI 写成“CI 通过”。

## 8. UI 协作

UI-DESIGN 对话产出应通过以下任一方式交接：

- GitHub Issue／PR 评论中的冻结设计说明；
- 独立设计文档 PR；
- 用户明确确认的设计编号、截图和信息架构。

UI-01 开始前必须得到：

- 最终方案标识；
- 宽屏和窄屏布局；
- 展开、收起和二级设置行为；
- 状态、错误和暂停展示；
- 现有功能控件映射；
- P2 未来插槽定义。

UI-01 不得实现：

- 每频道位置；
- 浏览历史；
- 只浏览未看过；
- 收藏；
- 下载；
- 数据导入导出。

后续业务 Task 不得重新决定 UI 视觉，只能接入已预留入口；需要新增视觉模式时回到 UI-DESIGN 讨论。

## 9. 研究 Task 交接

Research PR 必须记录：

- 精确环境；
- 样本数量与类型；
- 可复现步骤；
- 脱敏观察数据；
- 可以确认的事实；
- 不能确认的事实；
- 推荐实现边界；
- PASS、PASS WITH LIMITS 或 FAIL；
- 后续是否允许进入代码实现。

Research 结论不得用单次偶然成功替代稳定证据。

## 10. 旧 PR

#17、#3、#4、#5 仅用于提取仍有效的产品规则。

禁止：

- 直接合并进 Web K 主线；
- cherry-pick 旧桌面源码；
- 复制依赖 Telegram 桌面内部状态的实现；
- 未经授权关闭。

建议处置由独立维护动作完成：

```text
添加 superseded 说明
→ 链接替代路线或已合并 PR
→ 用户授权后关闭
```

## 11. 验收对话

本地验收 AI 必须：

- 拉取远端最新代码；
- 检出精确 PR 分支和 Head；
- 只读取、构建、测试和验收；
- 不修改文件、不格式化、不提交、不推送、不合并；
- 记录操作系统、工具版本、命令、退出码和关键日志；
- 验收前后确认工作区干净；
- 将失败项、复现步骤和可能原因反馈给远端开发对话。

## 12. 冲突和阻塞

发现以下情况立即停止写入并报告：

- 同一逻辑存在另一个开放 PR；
- 稳定 Base 已变化且当前分支未同步；
- 身份、隐私或下载门禁没有证据；
- UI-DESIGN 未确认但 UI-01 准备写代码；
- 前置 Schema 或身份契约未合并；
- GitHub 权限不足；
- 目标行为会绕过内容保护或使用私有 API。

## 13. 完成交接

Task 完成后，在 PR 描述和最终回复中给出：

- 仓库和 PR 链接；
- Base／Head／Commit；
- 修改文件；
- 完成条件；
- 实际验证；
- 尚未验证；
- 风险；
- 回滚；
- 下一 Task；
- 可复制的本地只读验收 Prompt。

下一对话只以 GitHub 中的最新 PR、Commit、文档和评论为准。
