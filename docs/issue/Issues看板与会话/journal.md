---
title: Issues 看板与会话
slug: Issues看板与会话
status: implementing
created: 2026-09-05
updated: 2026-09-10
external_ids: []
---

# Issues 看板与会话 Journal

## 1. 关键文档链接

| 类型     | 文档                                                                 | 状态         | 说明                                                                 |
| -------- | -------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| 需求     | [Issues 看板与会话](requirements/Issues看板与会话.md)                | ready        | 独立目标、范围、分级与 REQ-001～REQ-029                              |
| 交互     | -                                                                    | not-required | 本次仅整理既有文档，不创建新交互设计或修改 UI                        |
| 方案     | [Issues 看板与会话技术说明](solutions/Issues看板与会话技术说明.md)   | ready        | 看板、真实会话行、绑定与恢复、标题稳定化，同类旧稿的唯一有效技术正文 |
| 测试用例 | [功能测试](tests/cases/Issues功能测试.md)                            | ready        | TC-001～TC-230，保留编号及完整断言，不含执行结果                     |
| 调研     | -                                                                    | not-required | 已核对的实现链和源码索引在技术正文，本次不新建重复调研               |
| 历史执行 | [2026-08-30 App 验证](tests/runs/2026-08-30-Issues历史App验证.md)    | completed    | 冻结隔离 App 的历史结果，不证明当前标题实现已验收                    |
| 测试执行 | [2026-09-05 标题纯函数验证](tests/runs/2026-09-05-标题纯函数验证.md) | completed    | 原联合执行中的 5 项单测，仅迁移记录，没有重跑                        |

ready 只表示文档已按当前源码整理；本需求仍为 implementing，不等于当前产品已完成验收。

## 2. 决策点记录

### D-001 独立管理本需求

- 日期：2026-09-05。
- 背景：首次归并将三项独立能力放在一个总 issue 下；用户随后确认改为三个 issue。
- 备选项：一个总 issue 下设子需求；或三项独立 issue 配轻量索引。
- 最终决定：采用三个独立 issue；本目录只管理 Issues 看板与会话，技术、测试和目标分级随本需求归属。
- 原因：三项能力的目标、实现职责和验收边界独立，避免共享一个完成状态。
- 影响范围：REQ-001～REQ-029、本 Journal 及关联文档；原 REQ/TC 编号不变，不增加运行时耦合。

### D-002 保留已核对正文与证据边界

- 日期：2026-09-05。
- 背景：旧方案包含撤回目标、未实现提案和不同版本的测试结果。
- 备选项：按最新文件整篇替换；或保留逐条核对后的目标、现状和差距。
- 最终决定：沿用已核对正文及测试断言，历史证据保留执行版本与未覆盖项，不把文档拆分当作重新测试。
- 原因：文件日期、代码存在及历史 PASS 均不能证明当前产品完整交付。
- 影响范围：需求、技术说明、测试规格及本需求的执行证据。

## 3. 开发记录

### 2026-09-10 跟进上游同步 PR 的 CI

- 本轮目标：完成 PR #4 的远端验证，保持会话默认标题与上游扫描器一致。
- 完成内容：上游将默认标题表达式抽取为 generatedSessionTitle，原标题测试的源码字符串断言失效；改为调用真实 createAccumulator / finalizeSession，比对全部 AI Vault Provider 在 macOS、Linux、Windows 和短 ID 情况下的最终标题。
- 代码或文档变更：将扫描器契约验证放入 Issues 主进程测试，保留共享模块自身的三个单测并全部登记到同步检查；避免共享测试把 Electron 依赖带入独立 CLI 编译。产品标题算法保持原样。
- 验证证据：默认标题与搜索的 24 项定向测试通过；网络恢复后完整 pnpm sync:upstream 已通过此前的 500 项注册测试。日志见 .docs/upstream-sync-ui-validation/2026-09-10/evidence/。
- 未解决问题：PR CI 仍需在修复后的提交完成；Fork 缺少上游发布标签和增量质量基线问题由同一同步分支的独立维护提交处理。
- 下一步：完成 PR 检查并合入远端 fork/integration，保留主工作区其他会话的提交及未提交文档。

### 2026-09-10 同步上游并保留会话标题搜索

- 本轮目标：合入上游 main 的 137 个提交（截至 aac38d698），保留已登记的 Goal、Issues 和自托管产物能力。
- 完成内容：解决会话历史过滤器及其测试的两处冲突；保留上游预计算工作区匹配器、排序时间和按需搜索文本的优化，同时继续匹配用户重命名的会话标题与扫描器原始标题。
- 代码或文档变更：合并 ai-vault-session-filters.ts 与既有测试；将标题搜索接缝和测试补入 Issues 功能登记及同步检查，重新生成需求索引。
- 验证证据：合并后的 20 项过滤器测试通过，包含用户标题搜索、空查询不读取预览、排序解析次数及 Windows/WSL 路径匹配；两文件 oxlint、完整类型检查、四项本地化检查和 Goal 驱动构建通过。同一注册检查入口的全部 4 组命令通过，共 500 项测试（Goal 132、CLI 164、Issues 与搜索 195、自托管产物 9），架构、功能登记及文档门禁通过。提交钩子引入的纯上游测试 import 格式变化按维护规则还原，不扩大 fork 差异预算。结果保存在 .docs/upstream-sync-ui-validation/2026-09-10/，最终远端结果以同步检查记录为准。
- 未解决问题：首次远端同步因上述冲突停止，随后创建冲突 Issue 又因 GitHub 集成令牌权限失败；本轮在独立检出处理冲突；之后 GitHub 域名解析与公网连通性均失败，推送和 PR CI 尚未完成。未操作用户日常 App 或历史 Goal，主工作区未提交内容保留恢复副本。
- 下一步：将已验证合并同步到本地集成分支并恢复主工作区改动；网络恢复后推送同步分支，完成远端 CI 和集成分支合入。

### 2026-09-09 集成分支 CI 基线修复

- 本轮目标：修复 Goal PR #1 首次运行 CI 暴露的集成分支既有阻塞，独立于 Goal 功能提交。
- 完成内容：启动代码移除冗余中间变量以恢复 300 行门禁；调用清单补登记既有 Issue 入口；补齐 AI Vault 测试的 i18n mock；CSS 测试支持已有合并选择器；lint 对照测试识别 PR 显式基线参数并继续拒绝额外未知参数。上游社区登记任务按仓库已有方式限 stablyai/orca 运行，不修改代码 CI 的执行条件。
- 代码或文档变更：现有启动接入点、四个测试文件及上游专用工作流，登记接缝和测试路径；没有提高行数限制、跳过断言或调整产品行为。
- 验证证据：原 CI 失败文件与集成基线 9899e714 逐字相同；91 项定向测试、pnpm tc、全量 oxlint、native/type-aware 质量检查、改动质量、fork-features、fork-docs 及相对 HEAD 架构检查通过。日志位于 `.docs/ci-baseline-validation/2026-09-09/`。
- 未解决问题：上游社区 PR 同步任务缺少 stablyai 私钥，与代码验证分开记录。
- 下一步：完成本地及远端检查后通过独立 PR 合入，再推进 Goal PR #1。

### 2026-09-07 记录两处越过 max-lines 的上游接缝文件

- 本轮目标：第一次跑完整 `pnpm lint` 时发现 oxlint 的 `max-lines` 在两个 Issues 接缝文件上变红，定位原因并决定处理方式。
- 完成内容：核实两处都是「上游本来就接近上限、fork 的改动把它顶过线」，不是上游自身的问题。`src/renderer/src/lib/launch-agent-in-new-tab.ts`：上游版本 lint 干净，fork 只加了 4 行把 `launchToken` 串过启动链路（参数类型、解构、web host 调用、启动配置各一行），计数 302 / 上限 300。`src/renderer/src/components/right-sidebar/ai-vault-session-launch-actions.ts`：上游版本 lint 干净，fork 把 hook 内联的续跑逻辑抽成导出的 `resumeAiVaultSession` 供 Issues 复用，净增 14 行，计数同样 302。两处都不能加 `max-lines` 关闭注释（AGENTS.md 明令禁止）。
- 代码或文档变更：仅本记录。未改代码：两种可行解都需要真正的归属决策，且本轮没有真机运行条件，不适合顺手改。
- 验证证据：分别 `git checkout origin/main -- <文件>` 后 `npx oxlint` 两文件均无告警，切回后复现 302/302，确认增量来自 fork；`rg` 确认 `resumeAiVaultSession` 在上游不存在，其依赖的三个私有 helper 在该文件内各有 3 处引用。
- 未解决问题：两个方案各有代价。(a) 把 `resumeAiVaultSession` 连同它依赖的三个私有 helper 一起挪进 fork 自己的新文件（如 `ai-vault-session-resume-action.ts`），行数立刻降下来、对上游文件的 diff 也变小，但那三个 helper 是上游代码、文件内另有调用方，搬走会扩大上游 diff；只搬函数不搬 helper 会形成循环 import。(b) 从上游函数里抽一块（如 `launch-agent-in-new-tab.ts` 顶部的 agent 启动环境解析）换取空间，但纯粹为了 2 行余量去改上游代码，每次同步都会在那一段冲突。在决定之前，`pnpm lint` 在本分支保持红；周同步工作流跑的是门禁与各功能 checks，不含 oxlint，所以自动落地不受影响——这也是有意为之，不想让一个已知的独立问题卡住上游同步。
- 下一步：由 Issues 线决定 `resumeAiVaultSession` 的归属后一并处理；处理完再考虑把 oxlint 加进同步工作流的验证列表。

### 2026-09-07 消除两处顺序敏感的断言

- 本轮目标：fork 同步工作流在 CI 上跑 Issues 套件时两次变红，定位并修掉与顺序相关的断言，让「上游合并是否安全」这个信号可信。
- 完成内容：`conversation-hook-identity-ingestor.test.ts` 与 `conversation-title-refresh.test.ts` 各有一处按数组顺序断言。根因同一个：`conversations.list()` 的排序是 `host_partition_key, created_at, id`，同一毫秒创建的两条记录只能按随机 UUID 决出先后，本机与 CI 结果不同。两处都改为顺序无关断言并写明原因；标题回填那处额外确认过 `resolveAndApply` 按 sessionId 匹配结果、不按位置，所以批内顺序对行为没有意义。
- 代码或文档变更：上述两个测试文件、本记录。未改产品代码。
- 验证证据：`pnpm tc:node` 通过；两个测试文件本地通过；Issues 全量套件 43 文件 175 例通过；随后由 fork 同步工作流在 Ubuntu runner 上复跑。
- 未解决问题：`conversation-record-repository.ts` 的列表排序以随机 `id` 作最后一级 tie-break，同毫秒创建时对用户也是不稳定顺序。改成按插入顺序（rowid）更符合直觉，但会改变列表语义，留作单独决策，不在本轮顺手改。
- 下一步：若要改排序，先在需求里明确「会话列表按什么排」再动代码。

### 2026-09-07 补齐渲染层本地化

- 本轮目标：`verify:localization-coverage` 报 Issues 线 17 个文件 112 处未本地化文案，是本地 `pnpm lint` 唯一红项；在独立分支 `feat/issues-localization` 上补齐。
- 完成内容：用仓库自带的 `config/scripts/localize-renderer-strings.mjs` 包裹为 `translate('auto.…', 默认文案)`，只保留 Issues 三个目录的改动（codemod 顺带碰到的 19 个上游文件已撤回，对应 en.json 条目已删）；手工修复一处嵌套模板字符串被改坏的调用（`IssueConversationList.tsx` 的 Cannot forget 提示）；en.json 新增 107 个 key，zh.json 同步补齐 107 条中文，术语沿用既有译法（Issue 议题、Conversation 对话、Workspace 工作区、Agent 智能体）。
- 代码或文档变更：17 个 Issues 源文件、`en.json`、`zh.json`、本记录。
- 验证证据：`verify:localization-coverage`、`verify:localization-extraction`、`verify:localization-catalog` 通过；`pnpm tc:web` 通过；Issues 渲染层 19 文件 77 例通过；架构门禁与 `check:fork-features` 通过。未做真机截图核对中文。
- 未解决问题：key 为 codemod 生成的路径加哈希形式，与 Goal 线手写的 `goals.*` 命名不同；如需统一可在后续按文件重命名。
- 下一步：真机里切中文看一遍 Issues 面板文案。

### 2026-09-07 与 Goal 共用主进程注入点

- 本轮目标：首次用 `pnpm sync:upstream` 合并上游 268 个提交后跑 Issues 套件，修复暴露出的一处既有失败。
- 完成内容：`src/main/index.ts` 的 `afterTerminalRuntimeStartup` 自 Goal WP1 起是组合回调（先 `startIssueFeatureForMainProcess()` 再 `startGoalFeatureForMainProcess()`），`issue-host-lifecycle.test.ts` 仍按旧字面量查找而失败；改为在回调内查找 Issue 启动调用，顺序断言不变。
- 代码或文档变更：仅该测试文件与本记录。合并上游时 Issues 线另有两处接缝冲突已解决：`AiVaultVirtualRow.tsx`（上游从 `AiVaultSessionVirtualList.tsx` 拆出，canonicalTitle 接缝随之迁移并登记到 `config/fork-features.jsonc`）、`ai-vault-session-launch-actions.ts`（保留 fork 的 `resumeAiVaultSession`，解析器改回上游的 `ai-vault-session-launch-target.ts`）。
- 验证证据：Issues 相关 vitest 43 文件 175 例通过（见 `.docs/fork-sync/2026-09-07/`）；`pnpm check:fork-features` 与架构门禁通过。
- 未解决问题：无新增。
- 下一步：Issues 线继续在自己的功能分支推进，见 `docs/reference/fork-maintenance.md`。

### 2026-09-05 拆分独立 issue

- 本轮目标：按用户确认，将 Issues 看板与会话从总 issue 独立出来。
- 完成内容：迁移一份主需求、一份主技术说明、一份测试规格及本需求的已有证据；更新旧入口，不扩写新功能。
- 代码或文档变更：仅本 issue、相关导航、跨需求维护记录和窄范围 Git ignore 例外；原功能源码与暂存区不调整。
- 验证证据：本需求结构与链接校验、完整 REQ/TC 及正文保留校验记录在 `docs/maintenance/本地需求文档整理/2026-09-05-三需求拆分校验.md`；本次不重新执行功能测试。
- 未解决问题：当前 App 标题链、并发刷新、迁移及真实 SSH/Windows/Linux/paired runtime 仍需按范围验收；Node-only orcad 的生产装配缺口和其他后续目标见需求与技术正文。
- 下一步：后续仅在本 issue 内推进对应开发和验收，每次真实执行新增 Test Run。
