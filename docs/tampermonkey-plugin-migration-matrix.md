# Telegram Web K 插件优先迁移矩阵

## 1. 路线结论

后续 Tampermonkey 插件只面向：

```text
Telegram Web K：https://web.telegram.org/k/*
```

唯一执行顺序：

```text
M1 构建基座
→ M2 共享核心与 Web K 平台层
→ M3 独立功能模块
→ P1 浏览体验
→ P2 状态与频道
→ P3 保存与下载
→ P4 高级实验
```

模块化 M1、M2、M3 必须串行完成；M3 完成前不启动新的产品功能代码。

仓库中曾存在 Web A userscript：

```text
tampermonkey/telegram-media-continuity.user.js
```

该文件只作为历史参考保留。Web A 不是活动实施目标，不建立适配器、不增加功能、不参与后续验收。

本矩阵是规划和状态索引，不代表尚未实施的能力已经可用，也不以桌面源码中的实现状态代替 Web K 插件验证。

## 2. 基线与来源

### 2.1 当前真实状态

| 项目 | 状态 |
| --- | --- |
| PR #6 Web K 连续浏览兼容 | 已合并并完成真实浏览器验收 |
| PR #7 Web K 关闭后定位 | 已合并；关闭定位、相册消息级定位标记为已完成 |
| 稳定 Web K 版本 | `0.4.0-k5` |
| 规划 PR #8 | Draft，未合并 |
| PR-M1 / PR #9 | Draft，正在建立构建基座 |
| 当前活动平台 | Web K |
| Web A | 历史只读，不再开发 |

### 2.2 来源标签

矩阵只使用以下来源标签，避免把建议写成原计划：

- **原计划**：`docs/Telegram TT 二次开发功能.md` 已明确提出；
- **当前新增需求**：用户在 Web K 插件路线中明确新增或确认；
- **建议功能**：后续规划建议，原桌面需求没有明确同名条目。

### 2.3 可行性

- **完全可实现**：可由公开 DOM、浏览器事件和最小本地存储实现，并能安全失效；
- **部分可实现**：可以实现保守版本，但受虚拟列表、DOM 生命周期或浏览器能力限制；
- **需要实验**：必须先在真实 Web K 和目标浏览器验证，实验通过后才能承诺代码 PR；
- **不开发**：与产品路线、安全边界或浏览器能力不符。

## 3. P0：模块化基础设施

| 编号 | 任务 | 来源 | Web K 可行性 | 依赖模块 | DOM 风险 | 隐私风险 | 浏览器限制 | 优先级 | 建议分支 | 可并行 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | 多文件源码到单文件 userscript 构建基座 | 当前新增需求：模块化规划 | 完全可实现 | 稳定 `0.4.0-k5` | 低；不改选择器 | 低 | 打包器可能改变执行语义 | P0 / M1 | `refactor/tampermonkey-web-k-build-foundation` | 否；M1 独占源码和生成文件 |
| F02 | 版本和 metadata 单一来源 | 当前新增需求：模块化规划 | 完全可实现 | F01 | 无 | 低 | metadata 必须位于首部 | P0 / M1 | 同 F01 | 与 F01 同 PR |
| F03 | 生成文件一致性和静态门禁 | 当前新增需求：模块化规划 | 完全可实现 | F01、F02 | 无 | 低 | 禁止 chunk、动态 import、sourcemap | P0 / M1 | 同 F01 | 与 F01 同 PR |
| F04 | 共享核心：runtime、lifecycle、settings、cleanup、logger | 当前新增需求：模块化规划 | 完全可实现 | M1 已合并 | 中；抽取时序敏感 | 低；设置需最小化 | 无特殊限制 | P0 / M2 | `refactor/tampermonkey-web-k-core-platform` | 否；等待 M1 |
| F05 | Web K 平台适配层：DOM、查看器、消息列表、导航 | 当前新增需求：模块化规划 | 完全可实现 | M1 已合并 | 高；选择器和虚拟列表集中 | 低 | 仅能使用公开 DOM | P0 / M2 | 同 F04 | 与 F04 同 PR；不得和 M3 并行 |
| F06 | 连续浏览模块 | 当前新增需求：模块化规划 | 完全可实现 | M2 已合并 | 高；媒体切换与清理时序 | 低 | 自动播放受浏览器策略限制 | P0 / M3 | `refactor/tampermonkey-web-k-feature-modules` | 否；等待 M2 |
| F07 | 关闭定位模块 | 当前新增需求：模块化规划 | 完全可实现 | M2 已合并 | 很高；消息身份和虚拟列表 | 低；仅会话目标 | 无界历史加载不可用 | P0 / M3 | 同 F06 | 与 F06 同 PR |
| F08 | 控制面板模块 | 当前新增需求：模块化规划 | 完全可实现 | M2 已合并 | 低；Shadow DOM 隔离 | 低 | 不得遮挡 Telegram 控件 | P0 / M3 | 同 F06 | 与 F06 同 PR |
| F09 | 调试模块 | 当前新增需求：模块化规划 | 完全可实现 | M2 已合并 | 中；探测不可升级为猜测行为 | 中；日志必须脱敏 | 无 | P0 / M3 | 同 F06 | 与 F06 同 PR |

P0 的完成标准是保持 PR #7 已验收行为等价，而不是增加产品能力。

## 4. 已完成

| 编号 | 需求 | 来源 | Web K 可行性 | 依赖模块 | DOM 风险 | 隐私风险 | 浏览器限制 | 优先级 | 建议分支 / 依据 | 可并行 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | 图片加载后定时自动切换 | 原计划：第 4、13、16 章 | 已实现 | `continuous-browsing`、`platform/media-viewer`、`platform/navigation` | 中 | 低 | 后台标签页计时会被节流 | 已完成 | PR #6/#7 | 已完成 |
| C02 | 普通视频 `ended` 后切换 | 原计划：第 5、13、16 章 | 已实现 | `continuous-browsing`、`platform/media-viewer` | 中 | 低 | 有声自动播放可能被阻止 | 已完成 | PR #6/#7 | 已完成 |
| C03 | 悬停、失焦、缩放和交互暂停 | 原计划：第 4、12 章 | 已实现 | `continuous-browsing`、`platform/media-viewer` | 中 | 低 | 页面可见性事件存在浏览器差异 | 已完成 | PR #6/#7 | 已完成 |
| C04 | 手动或官方切换后连续模式保持 | 原计划：第 6、16 章 | 已实现 | `continuous-browsing`、`platform/navigation` | 中 | 低 | 依赖官方控件仍存在 | 已完成 | PR #6/#7 | 已完成 |
| C05 | 队列末尾停止 | 原计划：第 3.5、13、16 章 | 已实现 | `continuous-browsing`、`platform/navigation` | 中 | 低 | 只能依据当前公开导航状态 | 已完成 | PR #6/#7 | 已完成 |
| C06 | 相册沿 Telegram 原生顺序浏览 | 原计划：第 3.3 章 | 已实现基础版 | `platform/media-viewer`、`platform/navigation` | 中 | 低 | 不重建完整相册队列 | 已完成 | PR #6/#7 回归 | 已完成 |
| C07 | 关闭查看器后定位最后成功媒体消息 | 当前新增需求 | 已实现 | `close-position`、`platform/message-list` | 很高；目标可能不在虚拟列表 DOM | 低；只保存会话内消息身份 | 不进行无限加载或连续点击 | 已完成 | PR #7 | 已完成 |
| C08 | 相册内部映射并定位整条消息 | 当前新增需求 | 已实现 | `close-position`、`platform/message-list` | 高 | 低 | 只定位当前已加载消息 | 已完成 | PR #7 | 已完成 |
| C09 | Shadow DOM 连续浏览控制条 | 原计划：第 6 章 | 已实现 | `control-panel` | 低 | 低 | 需避让 Telegram 原生控件 | 已完成 | PR #6/#7 | 已完成 |
| C10 | 脱敏调试和关闭流程探测 | 建议功能：维护能力 | 已实现 | `debug`、`platform/*` | 中 | 中；严禁正文、名称、完整 URL | 无 | 已完成 | PR #6/#7 | 已完成 |

## 5. P1：浏览体验

| 编号 | 需求 | 来源 | Web K 可行性 | 依赖模块 | DOM 风险 | 隐私风险 | 浏览器限制 | 优先级 | 建议分支 | 可并行 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B01 | 正向和反向浏览 | 原计划：第 3.4 章 | 部分可实现 | `platform/navigation`、`continuous-browsing` | 中；左右含义需真实确认 | 低 | 只能映射官方前后控件 | P1-1 | `feat/tampermonkey-web-k-browse-direction` | 模块化后可独立；涉及 navigation 接口时先基础 PR |
| B02 | 图片、视频、图片加视频筛选 | 原计划：第 3.2、13 章 | 部分可实现 | B01、`platform/media-viewer`、`continuous-browsing` | 高；连续跳过和末尾判定 | 低 | 不能枚举未加载历史 | P1-2 | `feat/tampermonkey-web-k-media-filter` | 可与不改相同模块的 UI 任务并行 |
| B03 | 快捷键 `Space`、方向键、`A`、`D` | 原计划：第 6 章 | 完全可实现 | `control-panel`、`continuous-browsing` | 中；输入区识别 | 低 | 浏览器和 Telegram 可能占用按键 | P1-3 | `feat/tampermonkey-web-k-shortcuts` | 可独立；需避开同时改 control-panel 的 PR |
| B04 | 自定义图片停留时间 | 原计划：第 4.1 章 | 完全可实现 | `core/settings`、`control-panel` | 低 | 低 | 后台计时仍会节流 | P1-4 | `feat/tampermonkey-web-k-photo-duration` | 可与纯导航功能并行 |
| B05 | GIF 和循环短视频策略 | 原计划：第 3.2、5.2 章 | 部分可实现 | `platform/media-viewer`、`continuous-browsing` | 中高；媒体类型识别 | 低 | GIF 可能表现为循环视频 | P1-5 | `feat/tampermonkey-web-k-loop-media-policy` | 可独立；与 B02 可能冲突 |
| B06 | 画中画和系统全屏暂停切换 | 原计划：第 5.5 章 | 部分可实现 | `continuous-browsing` | 中 | 低 | PiP/Fullscreen API 存在兼容差异 | P1-6 | `feat/tampermonkey-web-k-playback-state` | 可与非播放状态任务并行 |
| B07 | 网络断开暂停和恢复 | 原计划：第 12 章 | 完全可实现基础版 | `continuous-browsing`、`core/lifecycle` | 低 | 低 | `online` 不代表媒体一定可访问 | P1-7 | `feat/tampermonkey-web-k-network-state` | 可独立 |
| B08 | 失败媒体跳过和连续失败阈值 | 原计划：第 7、12、16 章 | 部分可实现 | `continuous-browsing`、`platform/media-viewer` | 高；误判会跳过有效媒体 | 低 | 错误事件和超时不完全一致 | P1-8 | `feat/tampermonkey-web-k-media-error-policy` | 与 B02/B05 冲突较高，建议串行 |
| B09 | 视频静音和音量延续 | 原计划：第 5.3、第 10 章 | 部分可实现 | `core/settings`、`platform/media-viewer` | 中 | 低；仅保存偏好 | 自动播放策略仍可能阻止有声播放 | P1-9 | `feat/tampermonkey-web-k-playback-preferences` | 可与导航类任务并行 |
| B10 | 视频倍速持久化 | 原计划：第 5.4、第 10 章 | 部分可实现 | `core/settings`、`platform/media-viewer` | 中 | 低 | Telegram 更换 video 节点时需重新应用 | P1-9 | 与 B09 同 PR | 与 B09 同 PR |
| B11 | 控制条设置入口和状态整理 | 原计划：第 6、9 章 | 完全可实现 | B01-B10 中已确定的设置、`control-panel` | 低 | 低 | 控制条空间有限 | P1-10 | `feat/tampermonkey-web-k-settings-panel` | 建议最后串行整合，避免 UI 冲突 |
| B12 | 图片轻量转场效果 | 原计划：第 14 章 | 部分可实现 | `control-panel` 或插件宿主样式 | 中；不得覆盖 Telegram 动画 | 低 | 浏览器性能和减少动画偏好 | P1-可选 | `feat/tampermonkey-web-k-photo-transition` | 可独立，但非主线阻塞项 |
| B13 | 鼠标额外按键或遥控器输入 | 原计划：第 14 章 | 部分可实现 | `features/shortcuts` | 中；设备事件差异 | 低 | 并非所有设备暴露一致按键 | P1-可选 | `feat/tampermonkey-web-k-extra-controls` | 依赖 B03，之后可独立 |

P1 推荐顺序：

```text
B01 浏览方向
→ B02 类型过滤
→ B03 快捷键
→ B04 图片时间
→ B05/B06/B07/B08 播放与异常策略
→ B09/B10 播放偏好
→ B11 设置入口整理
```

## 6. P2：状态与频道

| 编号 | 需求 | 来源 | Web K 可行性 | 依赖模块 | DOM 风险 | 隐私风险 | 浏览器限制 | 优先级 | 建议分支 | 可并行 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | 全局设置 Schema 和迁移 | 原计划：第 9、10、13 章 | 完全可实现 | `core/settings` | 低 | 中；需版本、上限、损坏清理 | `localStorage` 可能禁用或满额 | P2-1 | `feat/tampermonkey-web-k-settings-schema` | 先独立基础 PR |
| S02 | 每频道独立设置 | 原计划：第 9、14 章 | 部分可实现 | S01、`platform/message-list` | 中高；频道/话题身份 | 中；保存匿名频道键 | 本地存储容量有限 | P2-2 | `feat/tampermonkey-web-k-channel-settings` | 等 S01；可与不改 settings 的任务并行 |
| S03 | 每频道最后浏览位置 | 原计划：第 10、14 章 | 部分可实现 | S01、`close-position`、`platform/message-list` | 很高；虚拟列表和消息删除 | 中；保存 peer/message/index/time | 目标未加载时只能安全降级 | P2-3 | `feat/tampermonkey-web-k-channel-position` | 先独立 Schema/身份评审，不与 S04 同时写 |
| S04 | 相册内部持久位置 | 原计划：第 3.3、10、14 章 | 部分可实现 | S03 | 高 | 中 | 依赖相册 index 可复原 | P2-4 | 与 S03 同 PR或后续小 PR | 与 S03 串行 |
| S05 | 重新进入频道继续上次位置 | 原计划：第 10、14 章 | 部分可实现 | S03、S04 | 很高 | 中 | 不能保证跨虚拟列表自动加载 | P2-5 | `feat/tampermonkey-web-k-resume-position` | 等 S03/S04 |
| S06 | 媒体浏览历史 | 原计划：第 14 章中的未看和下载历史需求 | 部分可实现 | S01、稳定媒体身份 | 高 | 高；记录浏览行为 | 需数量上限和淘汰 | P2-6 | `feat/tampermonkey-web-k-view-history` | 独立数据 PR，避免与 S07 并发写 Schema |
| S07 | 只浏览未看过媒体 | 原计划：第 14 章 | 部分可实现 | S06、B01、B02 | 很高；连续跳过和动态加载 | 高 | 只能处理可访问、可定位项目 | P2-7 | `feat/tampermonkey-web-k-unviewed-only` | 等 S06；与导航功能冲突高 |
| S08 | 收藏或稍后查看 | 原计划：第 14 章 | 部分可实现 | S01、稳定媒体身份 | 高 | 高；用户主动收藏记录 | 目标可能已删除或未加载 | P2-8 | `feat/tampermonkey-web-k-bookmarks` | 可与只读 UI 任务并行 |
| S09 | 数据导出、导入和清理 | 建议功能：完整导入导出；原计划含退出清理 | 完全可实现 | S01-S08 Schema 稳定 | 低 | 高；导出含频道和消息身份 | 浏览器文件选择/下载限制 | P2-9 | `feat/tampermonkey-web-k-data-management` | 建议在 Schema 稳定后统一实现 |
| S10 | 频道黑名单/白名单 | 建议功能 | 部分可实现 | S01、S02 | 中；频道身份 | 中 | 仅本地规则 | P2-可选 | `feat/tampermonkey-web-k-channel-rules` | 可在 S02 后独立 |
| S11 | 本地使用统计 | 建议功能 | 完全可实现基础版 | S01 | 低 | 高；必须默认关闭或明确开启 | 本地存储容量有限 | P2-可选 | `feat/tampermonkey-web-k-local-stats` | 可独立，但需隐私评审 |

P2 开始前必须先确认最小 Schema：版本、字段、匿名身份、记录上限、淘汰、损坏修复、导出范围和清除入口。

## 7. P3：保存与下载

所有下载类功能必须先完成 D01 可行性实验。D01 未通过前，不创建自动保存功能 PR，不把桌面源码能力直接写成 Web K 已可实现。

| 编号 | 需求 | 来源 | Web K 可行性 | 依赖模块 | DOM 风险 | 隐私风险 | 浏览器限制 | 优先级 | 建议分支 | 可并行 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D01 | Web K 下载能力可行性实验 | 当前新增需求：下载门禁 | 需要实验 | `platform/media-viewer`、保护状态探测 | 很高；下载入口和媒体生命周期 | 高；媒体地址和权限 | URL、文件名、大小、完成状态均可能不可见 | P3-0 门禁 | `research/tampermonkey-web-k-download-feasibility` | 可在模块化后作为只读实验独立进行 |
| D02 | 手动保存当前媒体 | 原计划：第 8、12 章 | 等待 D01 | D01、`features/save-current` | 高 | 高 | 只能使用 Telegram/浏览器允许的下载 | P3-1 | `feat/tampermonkey-web-k-save-current` | 等 D01 |
| D03 | 浏览时自动保存 | 原计划：第 8、13 章 | 等待 D01/D02 | D02、`continuous-browsing` | 很高；误触发和媒体确认 | 很高 | 自动下载权限和多文件提示 | P3-2 | `feat/tampermonkey-web-k-auto-save` | 否；需独占保存主链路 |
| D04 | 只保存实际成功浏览的媒体 | 原计划：第 8.2、8.5、13 章 | 等待 D03 | D03、成功媒体判定 | 高 | 高 | 快速切换和资源加载时序 | P3-2 | 与 D03 同 PR | 与 D03 同 PR |
| D05 | 图片/视频/GIF 保存类型开关 | 原计划：第 8.3、13 章 | 等待 D03 | D03、B02/B05 | 中高 | 高 | 媒体分类可能不完整 | P3-3 | `feat/tampermonkey-web-k-save-filters` | D03 后可独立 |
| D06 | 单文件大小限制 | 原计划：第 8.4、13 章 | 需要实验 | D01、D03 | 高 | 中 | 浏览器可能无法预知响应大小 | P3-4 | `feat/tampermonkey-web-k-save-limits` | 与 D07 同 PR可行 |
| D07 | 单次会话保存总量 | 原计划：第 8.4 章 | 部分可实现 | D03、下载结果计数 | 中 | 中 | 页面刷新后任务状态不保证 | P3-4 | 与 D06 同 PR | 与 D06 同 PR |
| D08 | 每日保存上限 | 原计划：第 14 章 | 完全可实现为本地规则 | D03、S01 | 低 | 中 | 只能按插件已知成功记录计数 | P3-5 | `feat/tampermonkey-web-k-daily-save-limit` | D03 后可独立 |
| D09 | 自定义文件命名模板 | 原计划：第 8.7、14 章 | 等待 D02 | D02、`core/settings` | 中 | 高；可能暴露频道/消息身份 | 浏览器可能覆盖或清洗文件名 | P3-5 | `feat/tampermonkey-web-k-filename-template` | 可与不改下载入口的任务并行 |
| D10 | 重复媒体跳过 | 原计划：第 8.5、8.6、13 章 | 需要实验 | 稳定媒体身份、D03 | 很高 | 高；保存下载身份历史 | 无稳定 ID 时不能可靠去重 | P3-6 | `research/tampermonkey-web-k-download-dedup` | 先研究，后独立实现 |
| D11 | 下载历史 | 原计划：第 8.9、14 章 | 部分可实现 | D03、S01 | 中 | 很高；记录保存行为 | 浏览器最终下载结果可能不可见 | P3-7 | `feat/tampermonkey-web-k-download-history` | 与 D12 Schema 需协调 |
| D12 | 下载队列、取消和有限重试 | 原计划：第 8.9、14 章 | 部分可实现 | D03 | 高 | 高 | 不能保证浏览器下载过程可控 | P3-8 | `feat/tampermonkey-web-k-download-queue` | 独占下载队列模块 |
| D13 | 下载限速 | 原计划：第 14 章 | 部分可实现任务启动节奏 | D12 | 低 DOM | 高 | 不能控制单连接真实带宽 | P3-实验 | `research/tampermonkey-web-k-download-throttle` | D12 后实验 |
| D14 | 固定目录或按频道/日期子目录 | 原计划：第 8.8、14 章 | 需要实验且不承诺完整 | D01、D09 | 低 DOM | 很高；文件系统权限 | 普通下载无法保证任意目录；File System Access 非通用 | P3-实验 | `research/tampermonkey-web-k-directory-access` | 只做实验，不与主下载 PR 混合 |

下载功能共同门禁：

- 默认关闭；
- 不读取 Telegram 私有模块或 IndexedDB；
- 不保存或导出完整媒体 URL；
- 不处理受保护、付费未解锁或无权访问内容；
- 下载失败不得阻断浏览；
- 浏览器能力不明确时必须安全停止。

## 8. P4：高级实验

P4 只允许先做小范围实验和风险报告。虚拟列表、高级队列和动态加载不得提前承诺完整实现。

| 编号 | 需求 | 来源 | Web K 可行性 | 依赖模块 | DOM 风险 | 隐私风险 | 浏览器限制 | 优先级 | 建议分支 | 可并行 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q01 | 下一项预加载 | 原计划：第 7、13 章 | 需要实验 | `platform/media-viewer` | 高；资源和活动项判定 | 中高 | 优先依赖 Telegram 自身预加载 | P4-1 | `research/tampermonkey-web-k-preload` | 可独立实验 |
| Q02 | 播放完等待新媒体 | 原计划：第 3.5、14 章 | 部分可实现前台有界版 | `core/lifecycle`、`platform/message-list` | 高 | 中 | 后台标签页和休眠不可靠 | P4-2 | `research/tampermonkey-web-k-wait-new-media` | 独立实验 |
| Q03 | 队列循环 | 原计划：第 3.5 章 | 部分可实现当前会话版 | `continuous-browsing` | 高 | 低 | 不能保证完整历史队列 | P4-2 | `research/tampermonkey-web-k-session-loop` | 与 Q04 不并行 |
| Q04 | 有界动态加载更多媒体 | 原计划：第 12、13 章 | 需要实验 | `platform/message-list`、`platform/navigation` | 很高；虚拟列表 | 中 | 禁止无限滚动、无限点击和无界历史加载 | P4-3 | `research/tampermonkey-web-k-dynamic-load` | 独占消息列表实验 |
| Q05 | 当前序号和总数 | 原计划：第 6 章 | 部分可实现可见范围版 | `platform/media-viewer` | 很高 | 低 | 无法可靠枚举全部历史 | P4-4 | `research/tampermonkey-web-k-visible-count` | 可独立；只显示公开可见数据 |
| Q06 | 随机浏览 | 原计划：第 14 章 | 需要完整候选集，暂不承诺 | Q04、稳定队列 | 很高 | 中 | 虚拟列表无法提供完整集合 | P4-暂缓 | `research/tampermonkey-web-k-random-browse` | 等 Q04 结论 |
| Q07 | 从指定日期开始 | 原计划：第 14 章 | 需要实验 | 官方公开日期跳转、Q04 | 很高 | 低 | 不使用私有搜索 API | P4-暂缓 | `research/tampermonkey-web-k-date-start` | 独立实验 |
| Q08 | 多频道媒体播放列表 | 原计划：第 14 章 | 高风险实验 | S03-S08、页面导航 | 很高 | 很高 | 跨频道切换、权限和后台生命周期复杂 | P4-暂缓 | `research/tampermonkey-web-k-multi-channel-queue` | 不与其他导航 PR 并行 |
| Q09 | 保存预加载媒体 | 原计划：第 8.2 章后续模式 | 不推荐；仅在 D01/Q01 后重新评估 | D01、D03、Q01 | 很高 | 很高 | 会保存未实际浏览内容 | P4-暂缓 | 不创建代码 PR | 否；默认不实施 |

## 9. 不开发

| 编号 | 项目 | 来源 | Web K 可行性 | 依赖模块 | DOM 风险 | 隐私风险 | 浏览器限制 | 优先级 | 建议分支 | 可并行 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N01 | Web A 新功能和维护对齐 | 当前新增需求：用户确认取消 | 不开发 | 无 | 高且无产品价值 | 低 | 非活动平台 | 不开发 | 不创建 | 不适用 |
| N02 | Web A 平台适配器 | 当前新增需求：用户确认取消 | 不开发 | 无 | 高 | 低 | 不需要跨平台 | 不开发 | 不创建 | 不适用 |
| N03 | Web A/K 统一安装入口 | 建议功能 | 不开发 | 无 | 高 | 低 | Web A 已退出路线 | 不开发 | 不创建 | 不适用 |
| N04 | Telegram API、Bot API、MTProto | 当前新增需求：安全边界 | 不开发 | 无 | 不适用 | 极高；需凭据或账号数据 | 超出 Tampermonkey 公开 DOM 范围 | 不开发 | 不创建 | 不适用 |
| N05 | Telegram 私有 webpack 模块或内部运行时 | 当前新增需求：安全边界 | 不开发 | 无 | 极高 | 极高 | 页面升级不可控 | 不开发 | 不创建 | 不适用 |
| N06 | Telegram IndexedDB 账号、认证或缓存数据 | 当前新增需求：安全边界 | 不开发 | 无 | 中 | 极高 | 涉及账号和认证隐私 | 不开发 | 不创建 | 不适用 |
| N07 | 绕过保护内容、付费媒体或下载限制 | 原计划：第 11、15 章明确禁止 | 不开发 | 无 | 高 | 极高 | 违反权限边界 | 不开发 | 不创建 | 不适用 |
| N08 | 一键下载整个频道 | 原计划：第 15 章明确不纳入 | 不开发 | 无 | 很高 | 很高 | 易形成无边界批量下载 | 不开发 | 不创建 | 不适用 |
| N09 | 无限滚动、无上限历史爬取或无限点击 | 原计划：第 15 章；当前新增安全边界 | 不开发 | 无 | 极高 | 高 | 虚拟列表和资源消耗不可控 | 不开发 | 不创建 | 不适用 |
| N10 | 云端媒体备份 | 原计划：第 15 章明确不纳入 | 不开发 | 无 | 低 | 极高 | 违反本地数据原则 | 不开发 | 不创建 | 不适用 |
| N11 | 自动转发媒体 | 原计划：第 15 章明确不纳入 | 不开发 | 无 | 高 | 极高 | 外部写操作 | 不开发 | 不创建 | 不适用 |
| N12 | 自动删除 Telegram 原消息 | 原计划：第 15 章明确不纳入 | 不开发 | 无 | 高 | 极高 | 高风险写操作 | 不开发 | 不创建 | 不适用 |
| N13 | 浏览器关闭后的永久运行 | 当前新增需求：浏览器边界 | 不开发 | 无 | 无 | 中 | Tampermonkey 生命周期不保证 | 不开发 | 不创建 | 不适用 |
| N14 | 任意固定本地目录的完整保证 | 原计划：第 8.8 章桌面能力 | 不开发完整承诺 | 无 | 低 | 高 | 普通浏览器下载不支持 | 不开发完整实现 | 仅保留 D14 实验 | 不适用 |
| N15 | 移动端后台长期下载 | 原计划：第 15 章明确不纳入 | 不开发 | 无 | 中 | 高 | 移动浏览器后台限制 | 不开发 | 不创建 | 不适用 |

## 10. 多 AI 对话执行地图

### 10.1 当前阶段

| 对话 | 任务 | 分支 / PR | 文件范围 | 并行结论 |
| --- | --- | --- | --- | --- |
| A | M1 构建基座 | `refactor/tampermonkey-web-k-build-foundation` / PR #9 | `package.json`、构建配置、模块入口、生成 userscript、Tampermonkey README/AGENTS | 主开发窗口；独占代码和生成文件 |
| B | 本矩阵和路线摘要刷新 | `docs/tampermonkey-web-k-migration-matrix-refresh` | 仅本文件和 `tampermonkey-web-k-plugin-priority-roadmap.md` | 可与 A 并行；无文件重叠 |
| C | 浏览器回归模板 | 独立文档分支 | 只新增验收文档 | 可与 A/B 并行，前提是不修改上述两份文档 |

### 10.2 必须串行

```text
PR #8 合并并校正 stacked Base
→ M1 / PR #9 完成、验收、合并
→ M2
→ M2 合并
→ M3
→ M3 合并
→ P1/P2/P3/P4 功能
```

- M1、M2、M3 不得由不同对话同时从同一 legacy 文件拆分；
- M2 不得提前基于未合并的 M1 接口开发；
- M3 不得提前基于未合并的 M2 接口开发；
- 公共 `core/**` 或 `platform/**` 接口变化必须先建立独立基础 PR。

### 10.3 生成 userscript 冲突规则

所有代码 PR 都会生成同一个共同冲突文件：

```text
tampermonkey/telegram-media-continuity-web-k.user.js
```

代码 PR 合并前必须：

1. 从最新 Base 重基；
2. 解决模块源码冲突；
3. 删除或覆盖旧生成结果；
4. 重新构建完整 userscript；
5. 重新执行静态检查；
6. 重新执行真实 Web K 浏览器回归；
7. 串行合并。

禁止手工拼接生成 userscript 的冲突内容。

## 11. 尚需产品确认

下列项目不阻塞 P0 模块化，但进入对应阶段前需要用户确认：

1. P1 中图片/视频/GIF 过滤的默认值和跳过提示；
2. P2 本地数据覆盖范围：仅频道，还是包含群组和话题；
3. 频道位置、浏览历史、收藏和下载历史的记录上限与保留周期；
4. D01 通过后，先做“手动保存当前媒体”还是直接进入“浏览时自动保存”；
5. 下载文件名是否允许包含频道显示名称，或只使用匿名键、日期和消息 ID；
6. P4 中等待新媒体、动态加载、随机、日期起点和多频道队列是否值得继续实验；
7. 队列循环是否默认关闭，以及是否只限当前会话已浏览范围。

在这些决策完成前，路线保持保守默认值，不提前承诺完整桌面客户端体验。

## 12. 维护规则

- 每个功能一个分支和一个 PR；
- 新任务开始前检查开放 PR 和近期提交；
- 只从真实合并基线创建后续分支；
- 不把建议功能写成原计划；
- 不把静态阅读写成浏览器验收；
- 不把实验写成已实现；
- Telegram DOM 证据冲突时停止自动行为；
- 每个 PR 合并后更新状态、Commit/PR、真实验证、边界和下一依赖；
- 未经用户明确授权不得合并。
