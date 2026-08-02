# Telegram Web K V1 后 P2–P4 实施计划

## 1. 结论

从稳定基线：

```text
codex/tampermonkey-media-continuity@51a89ebdb4b609023176ee8b1dfdb8dfcacb7377
版本：0.4.0-k11
```

开始，后续开发进入 P2。执行原则是：

1. 先建立版本化本地数据容器；
2. 再以真实公开 DOM 证据冻结身份契约；
3. 等独立 UI 设计确认后，只做 UI-01 壳层实现；
4. 之后串行实现位置、频道覆盖、历史、未看、收藏和数据管理；
5. 下载能力必须先通过 D01 真实页面研究；
6. P4 仅作为独立实验，不承诺交付。

本计划不修改运行代码、构建产物、版本、依赖或 CI。

## 2. 启动核验记录

规划启动时核验：

| 项目 | 结果 |
| --- | --- |
| PR #21 | 已合并 |
| Base 分支 | `codex/tampermonkey-media-continuity` |
| Base HEAD | `51a89ebdb4b609023176ee8b1dfdb8dfcacb7377` |
| `version.js` | `0.4.0-k11` |
| 开放 PR | #17、#3、#4、#5 |
| 新 P2–P4 规划 PR | 未发现 |
| 同名规划分支 | 未发现 |
| 三份 `post-v1-*` 文档 | 尚不存在 |
| Web K CI 路径 | 仅 `.npmrc`、package、`tampermonkey/**` 和工作流；纯 docs PR 不触发 |

## 3. 架构事实与规划影响

### 3.1 设置层

当前 `core/settings.js`：

- 使用唯一 storage key `tt.mediaContinuity.v1`；
- 只验证和保存全局 `settings`；
- 写入时尽量保留顶层其他字段；
- 没有统一 `schemaVersion`、迁移日志、容量治理或分功能清理。

规划影响：

- P2-01 必须先建立容器边界；
- 后续 Task 不得各自创建互不兼容的 storage key；
- 默认建议继续使用现有 key 作为兼容壳，并在容器内部引入 Schema V2；
- 若实现阶段决定新增 v2 key，必须单独说明 v1 回滚、双写或迁移策略，并重新获批。

### 3.2 运行时

当前 `core/runtime.js` 保存查看器会话、关闭定位和调试状态，属于页面会话内存，不适合作为持久化数据层。

规划影响：

- 持久化记录不得直接塞入 `runtime`；
- operation、timer、observer 和 DOM 引用不得写入 localStorage；
- P2 数据服务应提供纯数据读写接口，业务会话只持有必要快照。

### 3.3 消息列表平台层

当前 `platform/message-list.js` 已提供：

- `peerKey + messageKey + albumIndex` 媒体目标；
- 活动消息滚动容器；
- 同频道媒体 DOM 顺序；
- 有界向顶部／底部请求加载；
- 精确目标发现与公开 DOM 点击重开；
- 目标失效、频道变化和未加载的保守结果。

仍缺少：

- 账号身份；
- 话题身份；
- 公开 DOM 身份证据等级；
- 跨页面重建时的完整稳定性保证；
- 持久化身份的正式序列化契约。

规划影响：

- P2-02 必须是研究门禁；
- continuation 的临时身份不能直接等同于 P2 完整身份；
- 身份无法确认时，不得跨账号或跨话题读写记录。

### 3.4 关闭定位

`close-position` 只在媒体成功显示后确认高可信目标，目标丢失时安全降级，不无限滚动。

规划影响：

- P2-03 和 P2-05 应复用“成功显示后确认”的语义；
- 预加载、失败媒体和筛选中间媒体不得写入位置或历史；
- 相册继续按 `albumIndex` 逐项区分。

### 3.5 同频道续流

PR #21 的 `media-stream-continuation` 已具备：

- 唯一 operation；
- 20 秒总超时；
- 最多 8 次滚动；
- 15 秒筛选总时限；
- 用户接管取消；
- peer 变化取消；
- 无更多媒体时重开锚点并安全暂停。

规划影响：

- P2-06 可以复用有界加载和取消契约；
- 不得扩展为无限历史抓取；
- P4 只在独立实验中评估循环、等待和跨频道队列。

### 3.6 控制面板

当前控制面板直接承载所有高频控件和状态，信息密度已经较高。

规划影响：

- UI-01 需要独立实现；
- 业务 Task 不得顺便重做视觉；
- UI 层不得直接查询 Telegram DOM；
- 平台层、数据层和业务层通过明确动作与只读状态向 UI 提供能力。

## 4. 依赖图

```text
PLAN-01
└─ P2-01
   └─ P2-02
      ├─ UI-DESIGN（外部设计确认）
      │  └─ UI-01
      │     └─ P2-03
      │        └─ P2-04
      │           └─ P2-05
      │              ├─ P2-06
      │              └─ P2-07
      │                 └─ P2-08
      │                    └─ D01
      │                       └─ D02
      │                          └─ D03
      │                             └─ D04
      │                                └─ D05
      │                                   └─ D06
      │                                      └─ D07
      │                                         └─ D08
      │                                            └─ P4-01…P4-07
```

补充依赖：

- P2-08 必须覆盖 P2-03 至 P2-07 的全部数据类型；
- D04 复用 P2-01 Schema 和 P2-02 身份；
- UI-01 依赖 UI-DESIGN 的确认结果，但 UI-DESIGN 不修改仓库运行代码；
- P4 Task 之间默认独立，若修改共同平台层或生成 userscript，则按 PR 顺序串行重基。

## 5. 本地数据总原则

P2-01 需要冻结容器，至少分区：

```text
schemaVersion
metadata
globalSettings
channelPositions
channelOverrides
viewHistory
bookmarks
downloadRecords
```

共同规则：

- 持久化值只包含必要的匿名身份和时间；
- 不持久化 DOM 节点、对象引用、媒体 URL 或聊天正文；
- 所有集合必须有上限和确定性淘汰；
- 单分区损坏优先隔离修复，不因一个分区损坏清空全部数据；
- 迁移失败时保留可回滚备份或安全回退；
- 每次写入先验证、规范化，再持久化；
- localStorage 不可用、配额不足或 JSON 损坏时功能降级，不阻断 Telegram；
- 导入数据必须在写入前完成 Schema、类型、上限和隐私校验。

## 6. 身份契约研究原则

P2-02 只允许使用公开 DOM 和标准浏览器能力，研究对象：

```text
accountKey
peerKey
topicKey
messageKey
albumIndex
mediaType
```

每个字段必须记录：

- 公开来源；
- 可靠性等级；
- 生命周期；
- 节点替换后的稳定性；
- 虚拟列表回收后的可恢复性；
- 频道／话题切换行为；
- 缺失和冲突时的降级。

冻结规则：

- `messageKey` 缺失：不记录位置、历史、收藏或下载去重；
- `peerKey` 缺失：不记录频道级数据；
- `topicKey` 不可靠：不得把话题数据混入主频道；
- `accountKey` 不可靠：只允许全局设置，禁止跨账号复用频道记录；
- 相册索引无法确认：只允许消息级提示，不跳到猜测项；
- 同一身份出现冲突：暂停自动行为并提示，不选“最像”的候选。

## 7. UI 契约

UI-DESIGN 负责视觉与交互，UI-01 负责代码实现。业务能力只定义以下接口：

### 7.1 只读状态

- 连续浏览开关和临时暂停；
- 当前方向、筛选、图片时间、视频偏好；
- 当前 viewer／媒体状态；
- continuation operation 状态；
- 错误、缓冲、离线、用户操作要求；
- 当前频道是否有可恢复位置；
- 未看模式、收藏和数据管理能力是否可用；
- 当前身份是否可信。

### 7.2 动作

- 开关连续浏览；
- 暂停／继续；
- 上一项／下一项；
- 更新全局设置；
- 打开二级设置；
- 触发频道位置恢复；
- 打开频道设置；
- 开关未看模式；
- 收藏／取消收藏；
- 打开数据管理；
- 取消当前 continuation 或下载 operation。

### 7.3 明确禁止

- UI 直接查询 Telegram DOM；
- UI 保存完整业务数据；
- UI-01 混入 P2-03 之后的业务实现；
- 业务 PR 顺便调整最终视觉风格；
- 未确认设计时提前冻结颜色、图标、尺寸或动画。

## 8. P3 门禁判定

D01 结论只能是：

```text
PASS
PASS WITH LIMITS
FAIL
```

- `PASS`：允许进入 D02；
- `PASS WITH LIMITS`：只实现证据支持的子集，不承诺目录、完整进度或自动下载；
- `FAIL`：D02–D08 标记 `Cancelled` 或继续 Research，不进入功能开发。

D01 必须记录环境、页面版本、样本类型、操作步骤、可观察证据、内容保护样本和失败样本。单一成功样本不足以通过。

## 9. 验证策略

### 9.1 纯文档规划 PR

- 比对 Base、版本、PR 状态和开放 PR；
- 检查 Task ID 唯一；
- 检查依赖全部存在且无循环；
- 检查每个 Task 只有一个主要目标；
- 检查 UI、业务和下载研究边界；
- 检查 P4 未写成承诺；
- 检查旧 PR 未被建议直接合并；
- 检查 Web A 保持历史只读；
- 使用 GitHub Compare 审查最终净差异。

当前 GitHub 连接器没有本地工作区，不能真实执行 `git status --short`。纯 docs 路径也不会触发 Web K userscript CI，因此必须由本地只读验收补充：

```text
git diff --check
git status --short
```

### 9.2 后续代码 PR

至少要求：

- 现有 Web K build 和 verifier；
- 生成 userscript 语法与一致性；
- Linux／Windows CI；
- 真实 Telegram Web K 浏览器矩阵；
- localStorage 损坏、配额、迁移和回滚；
- 账号、频道、话题、相册和节点替换；
- 快速切换、快速关闭、用户接管和重复 listener；
- Web A 与 Telegram 原页面无回归。

## 10. 风险

- Telegram Web K DOM 和公开属性变化；
- 多账号和话题身份无法稳定确认；
- localStorage 配额和迁移中断；
- UI-01 与后续业务入口产生耦合；
- 下载能力受浏览器和 Telegram 内容保护限制；
- 各代码 PR 都修改生成 userscript，存在重基冲突；
- 旧桌面 PR 的产品规则被误当成可直接移植源码；
- P4 被误解为承诺的完整媒体数据库或后台任务。

## 11. 回滚

规划 PR 只修改文档，可整体 revert。

后续实现统一要求：

- 每个 PR 提供独立回滚；
- Schema 变更必须保留旧设置读取或明确迁移回退；
- 用户可停用 userscript 恢复 Telegram 原行为；
- 不自动删除旧数据，除非用户主动清理或迁移规则明确允许；
- D01 失败时停止后续下载开发，不用代码绕过门禁。

## 12. 下一步

本规划 PR 合并后，第一个实现 Task 是：

```text
P2-01 本地数据 Schema V2
建议分支：feat/tampermonkey-web-k-storage-schema
建议 PR 标题：feat: 建立 Web K 本地数据 Schema V2
```

P2-01 不增加用户可见功能，不修改最终 UI，只建立数据容器、迁移、验证、容量和清理基础。
