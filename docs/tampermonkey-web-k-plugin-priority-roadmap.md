# Telegram Web K 插件优先迁移路线摘要

## 1. 路线结论

后续产品开发只面向 Telegram Web K：

```text
https://web.telegram.org/k/*
```

Web A 不再开发、不再维护功能对齐，也不参与验收。

执行主线：

```text
稳定能力
→ 模块化基础设施
→ 浏览体验增强
→ 状态与频道能力
→ 保存与下载
→ 高级队列实验
```

## 2. 状态定义

- **已完成**：已实现，并有真实 Web K 浏览器验收；
- **P0**：下一阶段基础设施，其他新功能的前置依赖；
- **P1**：模块化完成后优先实现；
- **P2**：依赖本地数据 Schema 和频道身份稳定性；
- **P3**：下载和浏览器能力风险较高，先实验再开发；
- **P4**：受虚拟列表和 Telegram 页面行为限制，逐项探索；
- **不开发**：与当前路线、安全边界或浏览器能力不符。

## 3. 已完成能力

| 编号 | 能力 | 当前状态 | 主要模块归属 |
| --- | --- | --- | --- |
| C01 | 图片定时自动切换 | 已完成 | `continuous-browsing` |
| C02 | 视频结束自动切换 | 已完成 | `continuous-browsing` |
| C03 | 悬停、失焦、缩放暂停 | 已完成 | `continuous-browsing` |
| C04 | TT 上一项、下一项 | 已完成 | `continuous-browsing` + `platform/navigation` |
| C05 | Telegram 官方和方向键切换跟踪 | 已完成 | `platform/navigation` + `close-position` |
| C06 | 队列末尾停止 | 已完成 | `continuous-browsing` |
| C07 | 关闭后定位最后媒体消息 | 已完成 | `close-position` |
| C08 | 相册内部映射和整条消息定位 | 已完成 | `close-position` + `platform/message-list` |
| C09 | Shadow DOM 控制条 | 已完成 | `control-panel` |
| C10 | 脱敏调试和关闭探测 | 已完成 | `debug` |

## 4. P0：模块化基础设施

| 编号 | 任务 | 依赖 | 完成标准 | 建议 PR |
| --- | --- | --- | --- | --- |
| F01 | Vite userscript 构建基座 | 稳定 `0.4.0-k5` | 多文件源码生成原路径单文件 | PR-M1 |
| F02 | 版本和 metadata 单一来源 | F01 | metadata 与调试版本一致 | PR-M1 |
| F03 | 生成文件一致性检查 | F01 | 重复构建稳定、无 chunk | PR-M1 |
| F04 | 共享核心抽取 | PR-M1 | runtime/lifecycle/settings/logger 独立 | PR-M2 |
| F05 | Web K 平台适配层 | PR-M1 | Telegram 选择器集中 | PR-M2 |
| F06 | 连续浏览模块 | PR-M2 | session/scheduler/navigation target 独立 | PR-M3 |
| F07 | 关闭定位模块 | PR-M2 | tracker/locator/notice 独立 | PR-M3 |
| F08 | 控制面板模块 | PR-M2 | UI 不直接操作 Telegram DOM | PR-M3 |
| F09 | 调试模块 | PR-M2 | 调试 API 和探测独立且脱敏 | PR-M3 |
| F10 | 全量等价回归 | F01-F09 | PR #7 场景全部通过 | 每个 PR |

P0 完成前不启动新的产品功能代码。

## 5. P1：浏览体验增强

| 编号 | 功能 | 推荐模块 | 主要风险 | 建议分支 |
| --- | --- | --- | --- | --- |
| B01 | 图片/视频/GIF 类型过滤 | `features/media-filter` | 连续跳过、队列末尾 | `feat/tampermonkey-web-k-media-filter` |
| B02 | 正向/反向浏览 | `features/browse-direction` | 左右方向映射 | `feat/tampermonkey-web-k-browse-direction` |
| B03 | 快捷键 | `features/shortcuts` | 输入框和 Telegram 冲突 | `feat/tampermonkey-web-k-shortcuts` |
| B04 | 自定义图片停留时间 | `features/settings-ui` | 输入校验和旧设置兼容 | `feat/tampermonkey-web-k-photo-duration` |
| B05 | GIF/循环短视频策略 | `features/loop-media-policy` | GIF 与循环视频识别 | `feat/tampermonkey-web-k-loop-media-policy` |
| B06 | PiP/全屏暂停策略 | `features/playback-state` | 浏览器事件差异 | `feat/tampermonkey-web-k-playback-state` |
| B07 | 控制条设置入口 | `features/control-panel` | UI 拥挤和状态同步 | `feat/tampermonkey-web-k-settings-panel` |

### P1 推荐顺序

```text
B02 浏览方向
→ B01 类型过滤
→ B03 快捷键
→ B04 时间输入
→ B05/B06 播放状态
→ B07 设置入口整理
```

浏览方向先于类型过滤，是因为自动跳过需要稳定、可配置的方向语义。

## 6. P2：状态与频道能力

| 编号 | 功能 | 前置依赖 | 本地数据 | 建议分支 |
| --- | --- | --- | --- | --- |
| S01 | 每频道最后浏览位置 | 稳定消息身份 | peer/message/index/time | `feat/tampermonkey-web-k-channel-position` |
| S02 | 相册内部位置 | S01 | album index | 与 S01 同 PR 或后续小 PR |
| S03 | 全局/频道独立设置 | 设置 Schema | channel overrides | `feat/tampermonkey-web-k-channel-settings` |
| S04 | 浏览历史 | 稳定媒体身份 | 有上限的最小历史 | `feat/tampermonkey-web-k-view-history` |
| S05 | 只浏览未看过 | S04 | viewed identity | `feat/tampermonkey-web-k-unviewed-only` |
| S06 | 收藏/稍后查看 | S04 | 用户主动记录 | `feat/tampermonkey-web-k-bookmarks` |
| S07 | 数据导入导出和清理 | S01-S06 | Schema version | `feat/tampermonkey-web-k-data-management` |

### P2 门禁

在 S01 前必须先独立确认：

- peer key 在频道、群组和话题中的稳定性；
- message key 和相册 index 的复原能力；
- 最大记录数量；
- Schema 版本；
- 损坏数据处理；
- 删除、迁移和隐私说明。

## 7. P3：保存和下载

| 编号 | 功能 | 可行性状态 | 风险 | 建议分支 |
| --- | --- | --- | --- | --- |
| D01 | Web K 下载能力实验 | 需要实验 | URL 生命周期、保护内容 | `research/tampermonkey-web-k-download-feasibility` |
| D02 | 手动保存当前媒体 | 等待 D01 | 文件名和浏览器下载 | `feat/tampermonkey-web-k-save-current` |
| D03 | 浏览时自动保存 | 等待 D01/D02 | 自动下载权限、误保存 | `feat/tampermonkey-web-k-auto-save` |
| D04 | 保存类型开关 | 等待 D03 | 媒体分类 | `feat/tampermonkey-web-k-save-filters` |
| D05 | 大小和会话总量限制 | 需要元数据实验 | 大小不可见 | `feat/tampermonkey-web-k-save-limits` |
| D06 | 文件名模板 | 等待 D02 | 隐私和非法字符 | `feat/tampermonkey-web-k-filename-template` |
| D07 | 去重和下载历史 | 等待稳定身份 | 本地记录、误判 | `feat/tampermonkey-web-k-download-history` |
| D08 | 下载队列和重试 | 等待 D03 | 并发、失败状态 | `feat/tampermonkey-web-k-download-queue` |

下载功能默认关闭，不绕过 Telegram 保护和权限。

## 8. P4：高级队列实验

| 编号 | 功能 | 主要限制 | 决策 |
| --- | --- | --- | --- |
| Q01 | 等待新媒体 | 后台运行和页面生命周期 | 实验后决定 |
| Q02 | 动态加载更多 | 虚拟列表和大量历史加载 | 高风险实验 |
| Q03 | 当前序号/总数 | 无法可靠扫描全部历史 | 只显示公开可见数据 |
| Q04 | 随机浏览 | 需要可枚举队列 | 暂缓 |
| Q05 | 日期起点 | 需要官方搜索/历史加载 | 暂缓 |
| Q06 | 多频道队列 | 页面上下文和自动切换 | 暂缓 |

## 9. 不开发清单

| 项目 | 原因 |
| --- | --- |
| Web A 新功能 | 用户已确认取消 |
| Web A 适配器 | 不再需要跨平台架构 |
| Telegram API/Bot API/MTProto | 超出插件安全边界 |
| 私有 webpack 模块 | 页面更新风险和安全风险 |
| Telegram IndexedDB 账号数据 | 隐私和认证风险 |
| 绕过保护或付费媒体 | 不允许 |
| 任意下载目录 | 浏览器能力不支持 |
| 浏览器关闭后永久运行 | Tampermonkey 生命周期不保证 |
| 无限滚动或无限点击 | 可能破坏页面和账号使用 |

## 10. 多 AI 对话执行地图

### 当前阶段

| 对话 | 任务 | 是否可并行 | 文件冲突 |
| --- | --- | --- | --- |
| A | PR-M1 构建基座 | 主任务 | 独占源码和生成文件 |
| B | 完整迁移矩阵文档 | 可并行 | 只改矩阵和路线文档 |
| C | 浏览器回归模板 | 可并行 | 只新增验收文档 |

### 模块化阶段

```text
M1 合并
→ M2 开始
→ M2 合并
→ M3 开始
→ M3 合并
→ P1 功能可以并行开发
```

### 模块化完成后

多个功能对话可并行修改不同 feature 目录，但：

- 公共 core/platform 变更需先单独 PR；
- 每个功能独立分支和 PR；
- 合并前重基；
- 重新构建生成单文件；
- 重新执行浏览器回归；
- 生成文件冲突只通过重建解决。

## 11. 路线维护

每个功能 PR 合并后更新：

- 状态；
- 实际 Commit/PR；
- 浏览器验收；
- 已知边界；
- 下一依赖；
- 是否允许并行。

路线文档只记录真实状态，不把计划写成已完成。
