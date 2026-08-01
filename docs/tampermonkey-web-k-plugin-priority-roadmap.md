# Telegram Web K 插件优先迁移路线摘要

## 0. PR-M3 当前状态（2026-08-01）

- M1 / PR #9 与 M2 / PR #11 已合并；
- M3 / Draft PR #12 已完成四类 feature 抽取、`app.js` 装配、`legacy-main.js` 删除和生成 userscript 回填；
- 当前只等待最新 Head 的 Linux / Windows CI 与真实 Telegram Web K 浏览器回归；
- 浏览器验收前保持 Draft，P1 不开始编码。

## 1. 结论

后续 Tampermonkey 插件只开发 Telegram Web K：

```text
https://web.telegram.org/k/*
```

Web A 仅保留历史脚本，不新增功能、不建立适配器、不参与验收。

唯一执行主线：

```text
M1 构建基座（已完成并合并）
→ M2 共享核心与 Web K 平台层（已完成并合并）
→ M3 连续浏览、关闭定位、控制面板、调试模块（Draft PR #12，等待真实浏览器验收）
→ P1 浏览体验
→ P2 状态与频道
→ P3 保存与下载
→ P4 高级实验
```

P0 模块化完成前，不启动新的产品功能代码。

## 2. 当前状态

| 项目 | 状态 |
| --- | --- |
| PR #6 Web K 连续浏览兼容 | 已合并并完成真实浏览器验收 |
| PR #7 Web K 关闭定位 | 已合并；关闭定位和相册消息级定位已完成 |
| 稳定版本 | `0.4.0-k5` |
| 最新稳定基线 | `codex/tampermonkey-media-continuity@13223980777d276bb698a71166edf45710475c6c` |
| 规划 PR #8 | 已完成并合并；Merge Commit `88b359a9171faee33676301ae3fd01e0b367035f` |
| PR-M1 / PR #9 | 已完成并合并；Merge Commit `0d083a6ba31052da139e3a77330c70ab22e6efba` |
| PR-M2 / PR #11 | 已完成并合并；Merge Commit `13223980777d276bb698a71166edf45710475c6c` |
| PR-M3 / Draft PR #12 | 代码、构建和静态检查已完成；真实浏览器验收待完成 |
| 当前路线 | Web K 唯一执行路线 |
| Web A | 历史只读，不开发 |

状态定义：

- **已完成**：有真实 Web K 实现和验收依据；
- **P0**：模块化前置基础设施；
- **P1**：浏览体验；
- **P2**：状态、频道和本地数据；
- **P3**：保存和下载，必须先实验；
- **P4**：虚拟列表、动态加载和高级队列实验；
- **不开发**：已退出路线或违反安全与浏览器边界。

## 3. 已完成能力

| 编号 | 能力 | 来源 | 模块归属 | 依据 |
| --- | --- | --- | --- | --- |
| C01 | 图片定时自动切换 | 原计划 | `continuous-browsing` | PR #6/#7 |
| C02 | 视频结束自动切换 | 原计划 | `continuous-browsing` | PR #6/#7 |
| C03 | 悬停、失焦、缩放暂停 | 原计划 | `continuous-browsing` | PR #6/#7 |
| C04 | TT、Telegram 官方和方向键切换跟踪 | 原计划 | `platform/navigation`、`continuous-browsing` | PR #6/#7 |
| C05 | 队列末尾停止 | 原计划 | `continuous-browsing` | PR #6/#7 |
| C06 | Shadow DOM 控制条 | 原计划 | `control-panel` | PR #6/#7 |
| C07 | 关闭后定位最后成功媒体消息 | 当前新增需求 | `close-position` | PR #7 |
| C08 | 相册内部映射和整条消息定位 | 当前新增需求 | `close-position`、`platform/message-list` | PR #7 |
| C09 | 脱敏调试与关闭探测 | 建议功能 | `debug` | PR #6/#7 |

## 4. P0：模块化

| 阶段 | 任务 | 状态 | 分支 / PR | 串行依赖 |
| --- | --- | --- | --- | --- |
| M1 | 构建基座、版本和 metadata 单一来源、生成文件检查 | 已完成并合并 | `refactor/tampermonkey-web-k-build-foundation` / PR #9 | PR #8 已合并；Merge Commit `0d083a6ba31052da139e3a77330c70ab22e6efba` |
| M2 | runtime、lifecycle、settings、logger、DOM、查看器、消息列表、导航 | 已完成并合并 | `refactor/tampermonkey-web-k-core-platform` / PR #11 | M1 已合并 |
| M3 | 连续浏览、关闭定位、控制面板、调试模块；删除 legacy | Draft PR #12：代码与构建已完成，浏览器验收待完成 | `refactor/tampermonkey-web-k-feature-modules` / PR #12 | M2 已合并 |

P0 必须包含：

- 构建基座；
- 版本和 metadata；
- 共享核心；
- Web K 平台适配层；
- 连续浏览模块；
- 关闭定位模块；
- 控制面板模块；
- 调试模块。

M1、M2、M3 每个阶段都必须保持 PR #7 行为等价，并重复真实 Web K 核心回归。

## 5. P1：浏览体验

推荐顺序：

```text
浏览方向
→ 媒体类型过滤
→ 快捷键
→ 自定义图片时间
→ GIF/短视频策略
→ PiP/全屏、网络、失败策略
→ 音量和倍速偏好
→ 控制条设置入口
```

| 功能 | 来源 | 主要依赖 | 主要风险 | 建议分支 | 并行说明 |
| --- | --- | --- | --- | --- | --- |
| 正向/反向浏览 | 原计划 | `platform/navigation` | 方向语义和官方控件 | `feat/tampermonkey-web-k-browse-direction` | 先稳定 navigation 接口 |
| 图片/视频/GIF 类型过滤 | 原计划 | 浏览方向、媒体识别 | 连续跳过和末尾 | `feat/tampermonkey-web-k-media-filter` | 与循环媒体策略冲突较高 |
| 快捷键 | 原计划 | 控制面板、会话状态 | 输入框和 Telegram 冲突 | `feat/tampermonkey-web-k-shortcuts` | 可独立 |
| 自定义图片停留时间 | 原计划 | 设置模块 | 输入校验、旧设置迁移 | `feat/tampermonkey-web-k-photo-duration` | 可独立 |
| GIF/循环短视频策略 | 原计划 | 媒体识别 | 类型识别和循环事件 | `feat/tampermonkey-web-k-loop-media-policy` | 与过滤功能协调 |
| PiP/全屏暂停 | 原计划 | 会话状态 | 浏览器事件差异 | `feat/tampermonkey-web-k-playback-state` | 可独立 |
| 网络断开与失败阈值 | 原计划 | 会话和媒体状态 | 误判或误跳过 | 独立稳定性 PR | 与过滤/循环策略建议串行 |
| 音量和倍速偏好 | 原计划 | 设置和 video 节点 | 自动播放限制、节点替换 | `feat/tampermonkey-web-k-playback-preferences` | 可独立 |
| 控制条设置入口 | 原计划 | 上述设置已稳定 | UI 拥挤和状态同步 | `feat/tampermonkey-web-k-settings-panel` | P1 后段统一整理 |

## 6. P2：状态与频道

| 功能 | 来源 | 前置依赖 | 本地数据 | 主要风险 | 建议分支 |
| --- | --- | --- | --- | --- | --- |
| 设置 Schema 和迁移 | 原计划 | `core/settings` | version、global settings | 损坏数据和容量 | `feat/tampermonkey-web-k-settings-schema` |
| 每频道独立设置 | 原计划 | 设置 Schema、频道身份 | channel/topic overrides | 身份稳定性 | `feat/tampermonkey-web-k-channel-settings` |
| 每频道最后位置 | 原计划 | 关闭定位、消息身份 | peer/message/index/time | 虚拟列表和消息删除 | `feat/tampermonkey-web-k-channel-position` |
| 相册内部位置和恢复 | 原计划 | 每频道位置 | album index | index 复原 | 同位置 PR或后续小 PR |
| 浏览历史 | 原计划：第 14 章中的未看和下载历史需求 | 稳定媒体身份 | 有上限历史 | 记录用户行为 | `feat/tampermonkey-web-k-view-history` |
| 只浏览未看过 | 原计划 | 浏览历史、方向、过滤 | viewed identity | 跳过和动态加载 | `feat/tampermonkey-web-k-unviewed-only` |
| 收藏/稍后查看 | 原计划 | 稳定身份 | 用户主动记录 | 目标失效 | `feat/tampermonkey-web-k-bookmarks` |
| 导入导出和清理 | 建议功能：完整导入导出；原计划：退出清理 | Schema 稳定 | versioned JSON | 导出隐私 | `feat/tampermonkey-web-k-data-management` |
| 黑白名单频道 | 建议功能 | 频道设置 | channel keys | 保存频道身份 | 可选独立 PR |
| 本地统计 | 建议功能 | 设置 Schema | opt-in counters | 行为隐私 | 可选独立 PR |

P2 在编码前先审查：匿名身份、记录上限、淘汰、Schema 版本、损坏修复、退出清理和导出范围。

## 7. P3：保存与下载

第一步只能是：

```text
D01 Web K 下载能力可行性实验
```

实验必须确认：

- 当前媒体和官方下载入口的真实 Web K 行为；
- URL 生命周期；
- 文件名可控范围；
- 文件大小是否可见；
- 下载开始、完成、失败状态是否可见；
- 浏览器多文件下载和权限提示；
- 受保护、付费和无权内容的保守识别；
- 不读取私有 webpack 模块和 IndexedDB。

D01 未通过前，不启动自动保存代码。

| 顺序 | 功能 | 来源 | 状态 | 建议分支 |
| --- | --- | --- | --- | --- |
| D01 | 下载可行性实验 | 当前新增需求：门禁 | 需要实验 | `research/tampermonkey-web-k-download-feasibility` |
| D02 | 手动保存当前媒体 | 原计划 | 等 D01 | `feat/tampermonkey-web-k-save-current` |
| D03 | 浏览时自动保存、只保存实际浏览媒体 | 原计划 | 等 D01/D02 | `feat/tampermonkey-web-k-auto-save` |
| D04 | 图片/视频/GIF 保存开关 | 原计划 | 等 D03 | `feat/tampermonkey-web-k-save-filters` |
| D05 | 单文件、会话和每日总量限制 | 原计划 | 部分需实验 | `feat/tampermonkey-web-k-save-limits` |
| D06 | 文件名模板 | 原计划 | 等 D02 | `feat/tampermonkey-web-k-filename-template` |
| D07 | 去重和下载历史 | 原计划 | 需稳定身份 | 独立研究和功能 PR |
| D08 | 下载队列、取消和有限重试 | 原计划 | 等 D03 | `feat/tampermonkey-web-k-download-queue` |
| D09 | 下载限速和目录访问 | 原计划 | 只做能力实验，不承诺完整 | 独立 research PR |

## 8. P4：高级实验

| 功能 | 来源 | 限制 | 当前决策 |
| --- | --- | --- | --- |
| 下一项预加载 | 原计划 | 资源生命周期和误加载 | 先实验，优先依赖 Telegram 原生预加载 |
| 等待新媒体 | 原计划 | 后台页面不可靠 | 只研究前台有界版本 |
| 队列循环 | 原计划 | 无完整历史队列 | 只研究当前会话范围 |
| 动态加载更多 | 原计划 | 虚拟列表和大量历史加载 | 高风险实验；禁止无限滚动 |
| 当前序号和总数 | 原计划 | 无法枚举完整历史 | 只显示公开可见数据 |
| 随机浏览 | 原计划 | 需要完整候选集 | 暂缓 |
| 日期起点 | 原计划 | 依赖公开日期跳转 | 暂缓并先实验 |
| 多频道队列 | 原计划 | 跨频道、权限、生命周期复杂 | 暂缓 |
| 保存预加载媒体 | 原计划后续模式 | 会保存未实际浏览内容 | 默认不实施 |

虚拟列表、高级队列和动态加载均不得提前承诺桌面客户端级完整实现。

## 9. 不开发

- Web A 新功能；
- Web A 平台适配器；
- Web A/K 统一安装入口；
- Telegram API、Bot API、MTProto；
- Telegram 私有 webpack 模块和内部运行时；
- Telegram IndexedDB 账号、认证和缓存数据；
- 绕过受保护、付费或禁止下载内容；
- 一键下载整个频道；
- 无限滚动、无上限历史爬取或无限点击；
- 云端媒体备份；
- 自动转发或删除 Telegram 原消息；
- 浏览器关闭后的永久运行；
- 任意本地目录的完整保证；
- 移动端后台长期下载。

## 10. 多 AI 对话

### 当前可并行

| 对话 | 任务 | 分支 / PR | 冲突范围 |
| --- | --- | --- | --- |
| A | M2 共享核心与 Web K 平台层 | `refactor/tampermonkey-web-k-core-platform` / PR #11 | 修改 M2 源码、构建检查、Tampermonkey README 和生成 userscript；不修改本路线两份文档 |
| B | 迁移矩阵刷新 | `docs/tampermonkey-web-k-migration-matrix-refresh` / PR #10 | 仅两份路线文档 |
| C | M2 真实浏览器只读回归 | 不创建开发分支 | 只检出和验收 PR #11，不修改文件 |

### 后续串行

```text
PR #8 已合并
→ M1 / PR #9 已完成、验收并合并
→ M2 / PR #11（下一实施目标）
→ M2 合并
→ M3
→ M3 合并
→ 新功能
```

模块化完成后，不同 `features/**` 目录可并行；公共 `core/**` 或 `platform/**` 变化先单独建基础 PR。

## 11. 共同生成文件

所有代码 PR 都会修改：

```text
tampermonkey/telegram-media-continuity-web-k.user.js
```

合并前必须从最新 Base 重基、重新构建并重新验收。生成文件冲突只能通过源码重基后重新构建解决，禁止手工拼接。

## 12. 产品确认门禁

进入对应阶段前仍需确认：

1. P1 类型过滤默认值和跳过提示；
2. P2 是否只覆盖频道，还是同时覆盖群组和话题；
3. 位置、历史、收藏、下载历史的上限和保留周期；
4. D01 通过后优先手动保存还是自动保存；
5. 文件名是否允许包含频道显示名称；
6. P4 中哪些实验值得继续；
7. 队列循环是否只限当前会话。

## 13. 路线维护

每个 PR 合并后更新：

- 状态；
- 实际分支、Commit 和 PR；
- 静态、CI 和真实浏览器验证；
- 已知边界；
- 下一依赖；
- 是否允许并行。

路线只记录真实状态，不把计划、实验或桌面源码能力写成 Web K 已完成。
