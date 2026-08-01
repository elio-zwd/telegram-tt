import { readFile, writeFile } from 'node:fs/promises';

const AGENTS_PATH = 'tampermonkey/src/web-k/AGENTS.md';
const README_PATH = 'tampermonkey/README.md';
const M3_PATH = 'docs/tampermonkey-web-k-feature-modules-m3.md';
const MATRIX_PATH = 'docs/tampermonkey-plugin-migration-matrix.md';
const ROADMAP_PATH = 'docs/tampermonkey-web-k-plugin-priority-roadmap.md';

const agents = "# Telegram Web K 模块源码规则\n\n本文件适用于 `tampermonkey/src/web-k/**`，与仓库根目录和 `tampermonkey/AGENTS.md` 同时生效。PR-M3 完成后，本目录的模块源码是 Web K userscript 的唯一开发真源；生成文件不得手工修改。\n\n## 1. 当前 M3 结构\n\n```text\ntampermonkey/src/web-k/\n├─ core/\n│  ├─ runtime.js\n│  ├─ lifecycle.js\n│  ├─ cleanup.js\n│  ├─ settings.js\n│  └─ logger.js\n├─ platform/\n│  ├─ dom.js\n│  ├─ media-viewer.js\n│  ├─ message-list.js\n│  └─ navigation.js\n├─ features/\n│  ├─ continuous-browsing/\n│  │  ├─ viewer-session.js\n│  │  └─ index.js\n│  ├─ close-position/\n│  │  ├─ target-tracker.js\n│  │  ├─ message-locator.js\n│  │  └─ index.js\n│  ├─ control-panel/\n│  │  ├─ control-panel.js\n│  │  └─ index.js\n│  └─ debug/\n│     ├─ debug-api.js\n│     ├─ probes.js\n│     └─ index.js\n├─ app.js\n├─ entry.js\n└─ version.js\n```\n\n`legacy-main.js` 已删除，不得重新建立兼容转发壳。\n\n## 2. 依赖方向\n\n```text\ncore          platform\n  \\              /\n   \\            /\n      features\n         |\n        app\n         |\n       entry\n```\n\n- `entry.js` 只允许创建并启动应用，不写业务分支。\n- `app.js` 显式装配 lifecycle、platform 和四类 feature，不建立事件总线、服务容器或通用插件框架。\n- `core/**` 不依赖 `platform/**` 或 `features/**`，不得出现 Telegram 专属 DOM 选择器。\n- `platform/**` 集中 Web K 查看器、媒体、消息列表、相册映射和官方导航选择器。\n- `features/**` 可以依赖 core 和 platform，但不得自行复制 Telegram 平台选择器。\n- 不为 Web A 预留抽象，不建立跨客户端适配框架。\n\n## 3. 功能模块边界\n\n### 连续浏览\n\n`features/continuous-browsing/**` 负责 `ViewerSession`、图片倒计时、视频 `ended`、悬停/失焦/缩放/交互暂停、导航超时、队列末尾和媒体资源清理。所有 Telegram 左右导航必须调用 `platform/navigation.js`。\n\n### 关闭定位\n\n`features/close-position/**` 负责来源消息捕获、pending/confirmed target、关闭快照、`sequenceId`、有界 poll、精确消息定位、居中、高亮和安全提示。消息与查看器 DOM 查询必须通过 platform 模块。\n\n### 控制面板\n\n`features/control-panel/**` 是纯 UI。只接收状态和回调，不查询 Telegram DOM，不直接调用 platform，不保存业务状态。\n\n### 调试\n\n`features/debug/**` 维护 `window.TelegramMediaContinuity` 公开 API、脱敏探测和可清理的关闭流程 probe。不得输出聊天正文、频道名称、用户名、原始 href 或完整媒体 URL。\n\n## 4. 行为冻结\n\n模块化和后续维护不得无意改变：\n\n- userscript metadata、`@match https://web.telegram.org/k/*` 和 `@grant none`；\n- 版本 `0.4.0-k5`，除非独立版本 PR 明确升级；\n- storage key `tt.mediaContinuity.v1`、设置字段、默认值和旧数据兼容；\n- Telegram DOM 选择器；\n- timeout、poll、retry、倒计时和高亮时长；\n- listener 的 capture、passive、once 参数；\n- 图片、视频、相册目标映射和关闭后定位顺序；\n- 控制条布局、文案和交互；\n- 调试 API 名称、返回结构和脱敏边界；\n- 单文件未压缩 IIFE，无动态 import、额外 chunk 或 sourcemap。\n\n发现回归时优先检查依赖传递、清理时序和迁移遗漏，不顺手重写算法。\n\n## 5. 后续新功能规则\n\n- 一个产品能力一个独立 feature 目录或在既有 feature 内做最小扩展。\n- Telegram DOM 能力先扩展 `platform/**` 的小接口，再由 feature 调用。\n- UI 只发回调和渲染状态，不直接执行 Telegram 导航或消息定位。\n- 不把所有变量塞入巨型全局对象；跨模块只传递必要参数或小型接口。\n- 不新增第三方依赖、TypeScript 或测试文件，除非用户明确改变当前边界。\n- Web A userscript 只读保留，后续功能只开发 Web K。\n\n## 6. 构建与验证\n\n源码修改后必须重新执行：\n\n```powershell\nnpm ci\nnpm run build:tampermonkey:web-k\nnpm run check:tampermonkey:web-k\nnode --check tampermonkey/telegram-media-continuity-web-k.user.js\n```\n\n- 连续构建两次必须得到相同 SHA-256。\n- `check:tampermonkey:web-k` 必须验证 M3 模块清单、legacy 删除、选择器边界、storage key、metadata、版本和单文件 IIFE。\n- 生成 userscript 必须提交并与重新构建结果一致。\n- 构建和 CI 不能替代真实 Telegram Web K 浏览器验收。\n- 22 项真实浏览器回归完成前，结构变更 PR 保持 Draft，不得声称产品行为通过。\n";
const m3 = "# Telegram Web K PR-M3 功能模块说明\n\n## 1. 范围\n\nPR-M3 基于：\n\n```text\nBase 分支：codex/tampermonkey-media-continuity\nBase SHA：13223980777d276bb698a71166edf45710475c6c\n开发分支：refactor/tampermonkey-web-k-feature-modules\nDraft PR：#12\nuserscript 版本：0.4.0-k5\n```\n\n本阶段只抽取连续浏览、关闭定位、控制面板和调试模块，建立应用装配层并删除临时 `legacy-main.js`。不增加产品功能，不改变 metadata、storage schema、Telegram DOM 选择器、事件参数、时间常量、控制条设计或公开调试 API。\n\n后续仍只开发 Telegram Web K；Web A userscript 只读保留。\n\n## 2. 最终源码结构\n\n```text\ntampermonkey/src/web-k/\n├─ core/\n│  ├─ runtime.js\n│  ├─ lifecycle.js\n│  ├─ cleanup.js\n│  ├─ settings.js\n│  └─ logger.js\n├─ platform/\n│  ├─ dom.js\n│  ├─ media-viewer.js\n│  ├─ message-list.js\n│  └─ navigation.js\n├─ features/\n│  ├─ continuous-browsing/\n│  │  ├─ viewer-session.js\n│  │  └─ index.js\n│  ├─ close-position/\n│  │  ├─ target-tracker.js\n│  │  ├─ message-locator.js\n│  │  └─ index.js\n│  ├─ control-panel/\n│  │  ├─ control-panel.js\n│  │  └─ index.js\n│  └─ debug/\n│     ├─ debug-api.js\n│     ├─ probes.js\n│     └─ index.js\n├─ app.js\n├─ entry.js\n└─ version.js\n```\n\n## 3. 模块职责\n\n### 连续浏览\n\n- 保留 `ViewerSession`；\n- 图片加载后倒计时与 200 ms 状态刷新；\n- 视频 `ended` 自动切换和循环视频提示；\n- 悬停、页面失焦、缩放、拖动和滚轮交互暂停；\n- TT、官方控件和方向键导航协调；\n- 3 秒导航超时、100 ms 轮询和队列末尾停止；\n- media listener、timer、interval、observer 的清理。\n\n模块只通过 `platform/navigation.js` 触发 Telegram 官方导航。\n\n### 关闭定位\n\n- 捕获来源消息与相册 index；\n- 管理 `pendingMediaTarget`、`lastConfirmedMediaTarget` 和映射丢失状态；\n- 新媒体成功显示后才确认目标；\n- 建立关闭快照与 `sequenceId`；\n- 查看器关闭后最多等待约 2.4 秒；\n- 精确匹配当前 peer 和消息；\n- 居中、高亮约 1.2 秒并显示原有提示；\n- 目标未加载、peer 改变或映射不确定时安全降级。\n\n### 控制面板\n\n控制面板只负责 Shadow DOM host、原模板和样式、状态渲染、展开/收起、用户事件转发和销毁。它不导入 platform，不查询 Telegram DOM，也不直接执行导航。\n\n### 调试\n\n继续公开：\n\n```text\nwindow.TelegramMediaContinuity.inspect\nwindow.TelegramMediaContinuity.inspectMessageMapping\nwindow.TelegramMediaContinuity.armCloseFlowProbe\nwindow.TelegramMediaContinuity.getCloseFlowProbe\nwindow.TelegramMediaContinuity.getLastLocationResult\nwindow.TelegramMediaContinuity.cancelCloseFlowProbe\nwindow.TelegramMediaContinuity.enableDebug\nwindow.TelegramMediaContinuity.testPrevious\nwindow.TelegramMediaContinuity.testNext\nwindow.TelegramMediaContinuity.rescan\nwindow.TelegramMediaContinuity.getSummary\n```\n\n`getSummary().version` 来自 `version.js`。探测输出继续排除聊天正文、频道名称、用户名、原始 href 和完整媒体 URL；probe timer 和 listener 可清理，关闭 probe 继续使用 6 秒 timeout。\n\n## 4. 应用装配\n\n```text\nentry.js\n→ createApp()\n→ 创建 debug feature\n→ 注入 control panel factory\n→ 创建 ViewerSession factory\n→ 装配 close-position 与 lifecycle\n→ initializeScript()\n```\n\n`entry.js` 只调用 `createApp().start()`。`app.js` 使用明确参数和小型接口连接 core、platform 与四类 feature；没有事件总线、服务容器、通用插件框架、Web A 抽象或循环依赖。\n\n## 5. legacy 删除\n\n- `tampermonkey/src/web-k/legacy-main.js` 已从源码树删除；\n- Vite 配置已删除 legacy metadata 转换插件；\n- 检查器明确断言 legacy 不存在；\n- CI Linux 与 Windows 都检查四类 feature 目录和 `app.js`；\n- 生成 userscript 仅从 `entry.js` 构建。\n\n## 6. 静态与构建验证\n\n远端开发过程已完成：\n\n- 新增和修改 JavaScript 逐文件 `node --check`；\n- 相对 import 图存在性核对；\n- PR 差异静态审阅；\n- GitHub Actions Linux 已完成远端生成与检查；最终 Linux / Windows 双平台结果以 PR #12 最新 Head 的 CI 记录为准；\n- 生成 userscript 已由构建任务回填，不手工编辑。\n\n本文不把尚未完成的真实浏览器验收写成通过。\n\n## 7. 浏览器验收状态\n\n远端开发对话没有真实 Telegram Web K 浏览器控制能力，因此 PR #12 保持 Draft。PR #11 已通过的 22 项场景必须在当前 M3 Head 上完整重跑；在收到真实浏览器日志前，不得写成“行为等价已通过”。\n\n重点回归：\n\n- 图片、视频、相册和队列末尾；\n- 官方/TT/方向键导航；\n- 悬停、失焦、缩放和交互暂停；\n- 官方关闭、`Esc` 与关闭后定位；\n- 目标未加载、peer 改变和映射不确定时降级；\n- 控制条布局、文案、展开和收起；\n- 调试 API 名称、结构和脱敏；\n- Telegram 输入、收发消息、滚动和聊天导航；\n- 控制台无未捕获异常。\n\n## 8. 风险与回滚\n\n主要风险是媒体节点替换、导航 timeout、目标确认和查看器关闭之间的时序回归，以及 Telegram 虚拟列表导致目标不在 DOM。回滚时可整体回退 PR #12；版本和 storage schema 未变化，不需要迁移本地数据。用户侧可先在 Tampermonkey 中停用脚本恢复 Telegram 原始行为。\n";
const webKReadme = "# Telegram Web K 媒体续播油猴脚本（活动实现）\n\n脚本路径：\n\n```text\ntampermonkey/telegram-media-continuity-web-k.user.js\n```\n\n适用页面：\n\n```text\nhttps://web.telegram.org/k/*\n```\n\n当前版本：`0.4.0-k5`。\n\n## 开发真源\n\n生成 userscript 不再作为开发入口。唯一开发真源是：\n\n```text\ntampermonkey/src/web-k/\n```\n\nPR-M3 后的模块结构：\n\n```text\ncore/       运行时、生命周期、清理、设置、日志\nplatform/   Web K DOM、媒体查看器、消息列表、官方导航\nfeatures/   连续浏览、关闭定位、控制面板、调试\napp.js      显式装配 core、platform 与 features\nentry.js    仅创建并启动应用\nversion.js  版本单一来源\n```\n\n`legacy-main.js` 已删除，不得恢复兼容转发壳。\n\n## 当前能力\n\n- 图片加载后按设置倒计时切换；\n- 普通视频结束后自动切换；\n- 鼠标悬停、页面失焦、缩放和交互期间暂停；\n- 协调 TT 控件、Telegram 官方左右控件和方向键切换；\n- 队列末尾安全停止；\n- 关闭查看器后定位最后成功确认的消息；\n- 相册媒体定位整条来源消息；\n- Shadow DOM 控制条；\n- 脱敏调试和关闭流程探测。\n\n## 构建\n\n在仓库根目录执行：\n\n```powershell\nnpm ci\nnpm run build:tampermonkey:web-k\nnpm run check:tampermonkey:web-k\nnode --check tampermonkey/telegram-media-continuity-web-k.user.js\n```\n\n构建输出必须保持：\n\n- 单个未压缩 IIFE userscript；\n- 无动态 import、额外 chunk 或 sourcemap；\n- metadata 唯一匹配 Web K；\n- `@grant none`；\n- 版本来自 `version.js`；\n- storage key 继续为 `tt.mediaContinuity.v1`；\n- `legacy-main.js` 不存在；\n- 四类 feature 模块存在；\n- 生成文件与重新构建结果一致。\n\n## 调试 API\n\n控制台公开接口保持：\n\n```text\nwindow.TelegramMediaContinuity.inspect\nwindow.TelegramMediaContinuity.inspectMessageMapping\nwindow.TelegramMediaContinuity.armCloseFlowProbe\nwindow.TelegramMediaContinuity.getCloseFlowProbe\nwindow.TelegramMediaContinuity.getLastLocationResult\nwindow.TelegramMediaContinuity.cancelCloseFlowProbe\nwindow.TelegramMediaContinuity.enableDebug\nwindow.TelegramMediaContinuity.testPrevious\nwindow.TelegramMediaContinuity.testNext\nwindow.TelegramMediaContinuity.rescan\nwindow.TelegramMediaContinuity.getSummary\n```\n\n调试输出不得包含聊天正文、频道名称、用户名、原始 href 或完整媒体 URL。\n\n## 验收边界\n\n构建和 CI 只能证明源码、产物和静态门禁成立，不能替代真实 Telegram Web K 浏览器验收。结构变更在完成 PR #11 同等级回归前保持 Draft。\n";

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`未找到文档更新锚点：${label}`);
  return next;
}

function upsertSnapshot(source, title, body) {
  const pattern = /^## 0\. PR-M3 当前状态（2026-08-01）\n[\s\S]*?(?=^## 1\.)/m;
  const section = `## 0. PR-M3 当前状态（2026-08-01）\n\n${body.trim()}\n\n`;
  if (pattern.test(source)) return source.replace(pattern, section);
  const anchor = `${title}\n\n`;
  if (!source.startsWith(anchor)) throw new Error(`文档标题不匹配：${title}`);
  return `${anchor}${section}${source.slice(anchor.length)}`;
}

await writeFile(AGENTS_PATH, agents, 'utf8');
await writeFile(M3_PATH, m3, 'utf8');

let readme = await readFile(README_PATH, 'utf8');
const webKMarker = '# Telegram Web K 媒体续播兼容脚本';
const markerIndex = readme.indexOf(webKMarker);
if (markerIndex < 0) throw new Error('README 缺少 Web K 章节锚点');
readme = `${readme.slice(0, markerIndex).trimEnd()}\n\n${webKReadme}`;
await writeFile(README_PATH, readme, 'utf8');

let matrix = await readFile(MATRIX_PATH, 'utf8');
matrix = upsertSnapshot(
  matrix,
  '# Telegram Web K 插件优先迁移矩阵',
  `- PR-M1 / PR #9 已合并；\n- PR-M2 / PR #11 已合并，稳定基线为 \`13223980777d276bb698a71166edf45710475c6c\`；\n- PR-M3 / Draft PR #12 已完成代码迁移、应用装配、legacy 删除和构建产物回填；\n- 真实 Telegram Web K 浏览器回归尚未完成，因此 M3 不标记为产品验收完成，也不启动新的产品功能 PR。`,
);
matrix = replaceRequired(
  matrix,
  /M1 构建基座（已完成并合并）\n→ M2[^\n]*\n→ M3[^\n]*/,
  'M1 构建基座（已完成并合并）\n→ M2 共享核心与 Web K 平台层（已完成并合并）\n→ M3 独立功能模块（Draft PR #12，等待真实浏览器验收）',
  '矩阵执行主线',
);
matrix = matrix.replace(
  '模块化 M1、M2、M3 必须串行完成；M3 完成前不启动新的产品功能代码。',
  '模块化 M1、M2、M3 串行实施；M3 已完成代码和构建侧工作，但真实浏览器验收完成前不启动新的产品功能代码。',
);
matrix = replaceRequired(matrix, /^\| 最新稳定基线 \|.*$/m, '| 最新稳定基线 | `codex/tampermonkey-media-continuity@13223980777d276bb698a71166edf45710475c6c` |', '矩阵稳定基线');
matrix = replaceRequired(matrix, /^\| PR-M2 \/ PR #11 \|.*$/m, '| PR-M2 / PR #11 | 已完成并合并；Merge Commit `13223980777d276bb698a71166edf45710475c6c` |', '矩阵 M2 状态');
matrix = replaceRequired(matrix, /^\| PR-M3 \|.*$/m, '| PR-M3 / Draft PR #12 | 代码、构建和静态检查已完成；真实浏览器验收待完成 |', '矩阵 M3 状态');
const matrixRows = {
  F04: '| F04 | 共享核心：runtime、lifecycle、settings、cleanup、logger | 当前新增需求：模块化规划 | 已完成 | M1 已合并 | 中；抽取时序敏感 | 低；设置需最小化 | 无特殊限制 | 已完成 / M2 | `refactor/tampermonkey-web-k-core-platform` / PR #11 | 已完成并合并 |',
  F05: '| F05 | Web K 平台适配层：DOM、查看器、消息列表、导航 | 当前新增需求：模块化规划 | 已完成 | M1 已合并 | 高；选择器和虚拟列表集中 | 低 | 仅能使用公开 DOM | 已完成 / M2 | 同 F04 | 已完成并合并 |',
  F06: '| F06 | 连续浏览模块 | 当前新增需求：模块化规划 | 代码与构建已完成 | M2 已合并 | 高；媒体切换与清理时序 | 低 | 自动播放受浏览器策略限制 | P0 / M3 | `refactor/tampermonkey-web-k-feature-modules` / Draft PR #12 | 与 M3 同 PR；浏览器验收待完成 |',
  F07: '| F07 | 关闭定位模块 | 当前新增需求：模块化规划 | 代码与构建已完成 | M2 已合并 | 很高；消息身份和虚拟列表 | 低；仅会话目标 | 无界历史加载不可用 | P0 / M3 | 同 F06 | 与 M3 同 PR；浏览器验收待完成 |',
  F08: '| F08 | 控制面板模块 | 当前新增需求：模块化规划 | 代码与构建已完成 | M2 已合并 | 低；Shadow DOM 隔离 | 低 | 不得遮挡 Telegram 控件 | P0 / M3 | 同 F06 | 与 M3 同 PR；浏览器验收待完成 |',
  F09: '| F09 | 调试模块 | 当前新增需求：模块化规划 | 代码与构建已完成 | M2 已合并 | 中；探测不可升级为猜测行为 | 中；日志必须脱敏 | 无 | P0 / M3 | 同 F06 | 与 M3 同 PR；浏览器验收待完成 |',
};
for (const [id, row] of Object.entries(matrixRows)) {
  matrix = replaceRequired(matrix, new RegExp(`^\\| ${id} \\|.*$`, 'm'), row, `矩阵 ${id} 状态`);
}
await writeFile(MATRIX_PATH, matrix, 'utf8');

let roadmap = await readFile(ROADMAP_PATH, 'utf8');
roadmap = upsertSnapshot(
  roadmap,
  '# Telegram Web K 插件优先迁移路线摘要',
  `- M1 / PR #9 与 M2 / PR #11 已合并；\n- M3 / Draft PR #12 已完成四类 feature 抽取、\`app.js\` 装配、\`legacy-main.js\` 删除和生成 userscript 回填；\n- 当前只等待最新 Head 的 Linux / Windows CI 与真实 Telegram Web K 浏览器回归；\n- 浏览器验收前保持 Draft，P1 不开始编码。`,
);
roadmap = replaceRequired(
  roadmap,
  /M1 构建基座（已完成并合并）\n→ M2[^\n]*\n→ M3[^\n]*/,
  'M1 构建基座（已完成并合并）\n→ M2 共享核心与 Web K 平台层（已完成并合并）\n→ M3 连续浏览、关闭定位、控制面板、调试模块（Draft PR #12，等待真实浏览器验收）',
  '路线摘要执行主线',
);
roadmap = replaceRequired(roadmap, /^\| 最新稳定基线 \|.*$/m, '| 最新稳定基线 | `codex/tampermonkey-media-continuity@13223980777d276bb698a71166edf45710475c6c` |', '路线稳定基线');
roadmap = replaceRequired(roadmap, /^\| PR-M2 \/ PR #11 \|.*$/m, '| PR-M2 / PR #11 | 已完成并合并；Merge Commit `13223980777d276bb698a71166edf45710475c6c` |', '路线 M2 状态');
roadmap = replaceRequired(roadmap, /^\| PR-M3 \|.*$/m, '| PR-M3 / Draft PR #12 | 代码、构建和静态检查已完成；真实浏览器验收待完成 |', '路线 M3 状态');
roadmap = replaceRequired(roadmap, /^\| M2 \|.*$/m, '| M2 | runtime、lifecycle、settings、logger、DOM、查看器、消息列表、导航 | 已完成并合并 | `refactor/tampermonkey-web-k-core-platform` / PR #11 | M1 已合并 |', '路线 P0 M2');
roadmap = replaceRequired(roadmap, /^\| M3 \|.*$/m, '| M3 | 连续浏览、关闭定位、控制面板、调试模块；删除 legacy | Draft PR #12：代码与构建已完成，浏览器验收待完成 | `refactor/tampermonkey-web-k-feature-modules` / PR #12 | M2 已合并 |', '路线 P0 M3');
await writeFile(ROADMAP_PATH, roadmap, 'utf8');

console.log('[update-m3-docs-once] 已更新 AGENTS、README、M3 说明、迁移矩阵和优先路线');
