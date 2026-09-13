---
title: Goal 目标模式
slug: Goal目标模式
status: testing
created: 2026-09-05
updated: 2026-09-13
external_ids: []
---

# Goal 目标模式 Journal

## 1. 关键文档链接

| 类型         | 文档                                                                   | 状态         | 说明                                                                |
| ------------ | ---------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| 需求         | [Goal 目标模式](requirements/Goal目标模式.md)                          | approved     | REQ-101～REQ-115 保留原目标；REQ-109、REQ-116～REQ-121 已按方案落地 |
| 交互         | -                                                                      | not-required | 本轮交互示意内嵌方案；没有独立设计事实源，不另建 design 文档        |
| 方案         | [Goal 目标管理与交互闭环方案](solutions/Goal目标管理与交互闭环方案.md) | completed    | 唯一实施主入口；WP1～WP4 已落地；未回推上游                         |
| 历史实现基线 | [Goal 目标模式技术说明](solutions/Goal目标模式技术说明.md)             | superseded   | 保留旧 CLI/插件实现事实与差距；补充宿主命令已支持带参的核对修正     |
| 测试用例     | [功能测试](tests/cases/Goal功能测试.md)                                | reviewing    | TC-344～TC-356 覆盖验收文档、侧栏、异步草稿与文件查看，执行结果见 Test Run          |
| 调研         | -                                                                      | not-required | 当前源码事实已归并到技术正文，本次不重复调研                        |
| 历史调研     | [Codex Goal 历史机制对照](research/Codex-Goal历史机制对照.md)          | superseded   | 保留冻结 Codex SHA 的完整参考，不作为当前 Orca 事实                 |
| 历史测试执行 | [验收文档闭环验证](tests/runs/2026-09-08-验收文档闭环.md)              | reviewing    | 自动化、真实守卫及隐藏 Electron 文档流程已验证                      |

| 当前测试执行 | [异步草稿验证](tests/runs/2026-09-12-异步草稿验证.md) | reviewing | REQ-122 自动化、真实 Codex 与独立 App 异步状态验证通过 |

当前处于 testing：REQ-122 异步草稿和 Markdown 文件查看已实现并通过隔离验证，交付经 [PR #13](https://github.com/Fartown/orca/pull/13) 合入 `fork/integration`，最终合并与 CI 状态以该 PR 为准。最新文件查看结果见 [文档文件查看验证](tests/runs/2026-09-13-文档文件查看.md)，此前异步生命周期结果见 [异步草稿验证](tests/runs/2026-09-12-异步草稿验证.md)。旧 `orcad-entry.ts` 本地架构提示已定位为引用了尚未合入的上游 main；使用与 fork CI 相同的镜像基准检查通过，无需修改该文件或放宽规则。用户 App 未替换。REQ-121 历史完整执行/守卫证据保留在 [当前交付核查](tests/runs/2026-09-09-当前交付核查.md)。

## 2. 决策点记录

### D-005 生成改为持久异步草稿

- 日期：2026-09-12。
- 背景：用户指出生成可能很久，关闭会自动取消，重新打开找不到进度与结果。
- 最终决定：关闭仅保存并收起；显式停止才取消。草稿列表保存入口，后台完成待审阅，独立进程跨 App 重启继续，迟到结果不覆盖人工稿。
- 原因：用户确认“按这个改吧，改完之后测一遍”；复用 Goal Home、RPC、驱动打包与进程执行设施。
- 影响范围：REQ-122、TC-348～TC-355、目标表单与草稿生成；执行守卫仍依据同一最终文档验收。


### D-004 方案评审修订：复用 Issues 基础设施，直接替换旧插件

- 日期：2026-09-05。
- 背景：评审对照仓库发现方案未纳入架构门禁；`issues.status`、`AgentHookServer`、`PtyLivenessVerdict` 三处已有基础未复用；契约字段与现有 `TerminalHandle`、`MutationEnvelope` 形状不一致；另有版本化执行缓存、跨端分页等可删设计。
- 备选项：保留原稿逐项打补丁；或按仓库现状整体修订并删减。
- 最终决定：整体修订。可用性探测、本轮证据、判定词汇、围栏字段全部对齐现有实现；删除跨端聚合、列表分页、版本化缓存；旧内置插件在原生面板可用的同一发布直接移除，不做共存层；不加功能开关。
- 原因：AGENTS 的 Reuse Before Reimplementing；门禁不过则 `pnpm lint` 直接失败；插件只在本分支存在，共存层没有服务对象；用户明确不需要功能开关。
- 影响范围：方案 §1、§2.2～2.3、§3、§4.2～4.6、§5.2～5.10、§6、§7。需求与测试文档未改，旧插件相关“当前状态”表述待 WP2 移除插件时更新。待用户确认：上游意图、直接移除旧插件。

### D-003 先写目标管理方案，停止代码实施

- 日期：2026-09-05。
- 背景：用户明确指出 Goal 新建入口与管理流程不可发现，确认交互调整方向后又要求“先写方案”。
- 备选项：直接进入开发；或先将用户流程、技术边界与分期写成可评审方案。
- 最终决定：本轮只更新方案与必要上游需求/Journal；保留旧实现基线，测试规格标 needs-update，不实施代码。
- 原因：遵守用户最新阶段要求；区分已确认产品方向和仍待评审的接口、迁移、平台技术选择。
- 影响范围：REQ-109、REQ-116～REQ-120；主入口切换到 [目标管理方案](solutions/Goal目标管理与交互闭环方案.md)。本次不对旧 Goal 运行数据、插件启用状态或会话做操作。

### D-001 独立管理本需求

- 日期：2026-09-05。
- 背景：首次归并将三项独立能力放在一个总 issue 下；用户随后确认改为三个 issue。
- 备选项：一个总 issue 下设子需求；或三项独立 issue 配轻量索引。
- 最终决定：采用三个独立 issue；本目录只管理 Goal 目标模式，技术、测试和目标分级随本需求归属。
- 原因：三项能力的目标、实现职责和验收边界独立，避免共享一个完成状态。
- 影响范围：REQ-101～REQ-115、本 Journal 及关联文档；原 REQ/TC 编号不变，不增加运行时耦合。

### D-002 保留已核对正文与证据边界

- 日期：2026-09-05。
- 背景：旧方案包含撤回目标、未实现提案和不同版本的测试结果。
- 备选项：按最新文件整篇替换；或保留逐条核对后的目标、现状和差距。
- 最终决定：沿用已核对正文及测试断言，历史证据保留执行版本与未覆盖项，不把文档拆分当作重新测试。
- 原因：文件日期、代码存在及历史 PASS 均不能证明当前产品完整交付。
- 影响范围：需求、技术说明、测试规格及本需求的执行证据。

## 3. 开发记录

### 2026-09-13 CI 渲染期间引用写入修复

- 本轮目标：修复 PR #13 React Doctor 0.9.1 对渲染期间写入 ref 的阻断。
- 完成内容：把当前草稿 session 引用更新移到 `useLayoutEffect`，只在 React 提交后更新迟到结果比较所用的引用。
- 代码或文档变更：`use-acceptance-draft.ts` 与本记录；不放宽 lint 规则或取消迟到结果保护。
- 验证证据：120 项 Goal/调用清单测试、`pnpm tc`、`check:react-doctor:changed -- Fartown/main` 通过。日志位于 `.docs/goal-acceptance-generation-ui-validation/2026-09-13/evidence/pr13-ref-{tests,typecheck,react-doctor}.log`；CI 原始报告在 `pr13-static-analysis.log`。独立 Mac App 重新构建复验，最终图文报告与远端结果以 PR #13 为准。
- 未解决问题：等待新提交完整 CI 与隐藏 App 复验，不把上一包证据直接算作本次修改通过。
- 下一步：核实最终源码的界面和全部远端门禁通过后合并。


### 2026-09-13 CI 调用清单登记修复

- 本轮目标：修复 PR #13 全仓库 CI 发现的 Goal 文档工作区激活清单遗漏。
- 完成内容：本地复现原检查 1 项失败；在现有 surface-provider 调用清单登记 `open-goal-document.ts`，同时纳入 Goal 注册测试、检查命令和精确测试接缝。
- 代码或文档变更：仅调用清单、功能登记、接缝允许路径与本记录；保留调用清单完整相等断言，不改变运行逻辑。
- 验证证据：修复后调用清单与文档打开两个测试文件通过，共 17 项；前后日志为 `.docs/goal-acceptance-generation-ui-validation/2026-09-13/evidence/pr13-census-before.log` 和 `pr13-census-after.log`。远端完整回归继续由 PR #13 验证。
- 未解决问题：远端最终 CI 与合并尚待完成；GitHub 浏览器未登录，图片附件尚未上传，本地真实 App 图文证据完整保留。
- 下一步：通过所有远端检查后正常 merge commit 合入集成分支。


### 2026-09-13 提交与集成分支合码

- 本轮目标：按用户“提交合入”授权，提交本功能并通过 PR 合入集成分支。
- 完成内容：功能提交 `d6b7746cb`，合入最新集成基线 `dab56ab8a` 无冲突；创建 [PR #13](https://github.com/Fartown/orca/pull/13)，保留全部检查。
- 代码或文档变更：合码时仅更新功能交付记录；集成分支带来的既有自动更新功能保持原样，不混入本 PR 的差异。
- 验证证据：合入基线后 `pnpm tc`、110 项 Goal 相关测试通过；`check:architecture-policies --base Fartown/main`、fork-features/fork-docs、RPC 目录通过。日志为 `.docs/goal-acceptance-generation-ui-validation/2026-09-13/evidence/merge-validation.log` 和 `merge-gates.log`；远端完整检查与合并结果见 PR。
- 未解决问题：本地 `origin/main` 指向 stablyai 最新上游，fork CI 的 `origin/main` 指向 Fartown 镜像；前述 `orcad-entry.ts` 与 `Fartown/main` 的 blob 完全相同，不是本功能改动或 CI 基线破损。标准安装/更新用户 App 不在此次提交合入操作内。
- 下一步：依 PR 门禁完成合并；后续安装交付另按用户指令执行。


### 2026-09-13 文档路径与原生 Markdown 标签页

- 本轮目标：按用户要求，以文件地址展示生成文档，复用已有 Markdown 标签页查看。
- 完成内容：当前稿与候选文件入口、查看前保存并收起编辑器、原生 Markdown 预览与本地宿主路由；人工编辑和显式采用保持。
- 代码或文档变更：Goal 文档结果与草稿记录增加可选文件路径；复用原子写入生成当前稿文件；移除弹窗内 Markdown 预览，更新 REQ-122 与 TC-356；修复保存队列收尾遗漏新修改，以及文件打开未激活工作区的实测缺陷。
- 验证证据：110 项相关自动化、类型/质量/本轮架构/RPC/本地化/fork 门禁通过；独立 Mac App 的 9/9 项界面检查通过，含真实文件渲染、同文件 tab 复用、即时修改查看、候选查看及采用。结果见 [文档文件查看验证](tests/runs/2026-09-13-文档文件查看.md)。
- 未解决问题：沿用已确认的集成架构基线差异；本轮尚未提交、合并或安装。
- 下一步：本轮验证完成；代码仍在功能 worktree，按后续交付指令提交、合并或安装。

### 2026-09-12～13 异步草稿、真实进度与恢复

- 本轮目标：实现 REQ-122，关闭后继续生成，重新打开找回状态、输入与文档。
- 完成内容：持久草稿列表、独立后台生成进程、真实活动/耗时、后台完成提醒、停止与重试、跨 App 正常重启恢复、迟到候选保护；起草不依赖有效执行会话，兼容普通文件夹。
- 代码或文档变更：复用 Goal Home/RPC/驱动打包/通用进程与原子写入；注册 stdout 观察接缝及异步测试。顺带修复 CLI 回归发现的单块长输出截断问题；需求、方案与 TC-348～TC-355 更新。
- 验证证据：147 项 Goal 相关自动化、164 项 CLI 回归、19 个最终隔离 App 检查点通过；真实 Codex 99.075 秒返回 4587 字，列表待审阅与完成提醒截图已核对。类型、质量、本轮架构、本地化、RPC、fork-features/fork-docs 通过，详见 Test Run。
- 未解决问题：默认全分支架构门禁仍报基线 `orcad-entry.ts` 差异；本轮未引入，未掩盖。用户安装包未替换，代码未提交或合并。
- 下一步：用户进入交付阶段时提交本功能分支，并处理集成基线门禁后推进 MR；不用历史安装包证据代替本轮验证。

### 2026-09-12 — 补齐已注册 RPC 的生成目录

- 本轮目标：按用户授权在 PR #9 修复既有 CI 基线，不修改 Goal 需求或行为。
- 完成内容：原生成器重新读取 host 方法清单，补入 `goals.status` 的共享 schema 及无共享 schema 的方法清单；登记生成目录接缝。
- 代码或文档变更：仅生成产物、接缝清单与本记录；没有新增 RPC 方法或更改协议。
- 验证证据：`pnpm verify:rpc-params-catalog` 修复前失败、生成后通过，`pnpm tc` 通过；远端 CI 以 [PR #9](https://github.com/Fartown/orca/pull/9) 为准。
- 未解决问题：PR 其它既有 CI 失败仍在修复，不声明本需求重新完成验收。
- 下一步：完成 PR #9 门禁并合入集成分支。

### 2026-09-10 提交并推进隔离验收修复合入

- 本轮目标：把 2026-09-09 已隔离验证的 Goal 修复提交并通过 PR 合入 fork/integration。
- 完成内容：核实修复仍未提交；保留主工作区的文档改动与 f9f4855e7 Claude hook 本地提交，本 PR 仅包含 Goal 原文保留、侧栏路由和打包工件排除。
- 代码或文档变更：沿用昨日受测实现与回归测试；本轮更新交付状态与验证记录。
- 验证证据：昨日 132 项功能/持久化、164 项 CLI、49 项打包测试通过；真实 Codex 独立守卫 PASS 和最终包表单保留已验收。重定基线后的检查与远端 CI 将单独记录，不能把昨日测试等同于本轮远端通过。
- 未解决问题：PR 和远端检查尚在推进；用户日常 App 保持原状，安装不属于本轮合码操作。
- 下一步：通过远端检查后以 merge commit 合入集成分支，并核对最终 ancestry。

### 2026-09-09 当前安装包与真实验收链路复核

- 本轮目标：根据用户质疑，实证检查当前安装交付是否满足 REQ-121，并补齐真实 Codex 经 GUI 的完整链路验证。
- 完成内容：只读核查安装包、历史 Goal 与现有证据；独立隐藏 App 复现旧表单缺少文档生成入口；从集成代码创建独立 worktree、构建并打包。实际打包发现 `.docs` 验证工件被带入安装包，补充排除规则。真实 Codex GUI 又复现 4141 字符确认稿被裁成 4140 字符，修复表单、RPC 校验与整体裁判输入三处原文裁剪；随后真实稳定会话又复现填表内容消失，补齐主进程持久化中遗漏的 `goals` 路由注册。
- 代码或文档变更：既有 packaging seam 排除 `.docs`；Goal 编辑器和共享 schema 保留确认文档，裁判将 criteria 文件原文传给独立进程；空白文档仍拒绝；为主进程 UI 归一化和现有 Store 测试登记两个 seam，扩展功能注册检查，新增 TC-347。增强边界测试，修正本需求合入/安装/验证边界，新增当前 Test Run；保留用户主 worktree 未提交变更与历史 Goal 原始记录。
- 验证证据：原文保存回归修复前两项失败，修复后 96 项 Goal 通过；侧栏路由修复扩充注册范围后 132 项通过；裁判进程输入回归修复前一项失败，修复后 12 项通过；最终 164 项 CLI 注册回归、类型检查、main/preload/renderer/driver 构建、built-skills、web 与四项本地化检查通过；49 项打包测试通过，真实包资源哈希匹配且无 `.docs`。最终包的稳定自然第二轮表单保留与可见 PASS 判词已实测通过。真实 Codex GUI 主链路的 8 个检查点通过：3459 字符确认稿在 spec、版本、criteria 和独立裁判参数中逐字相同，原 worker 自行声明完成，守卫 PASS，Goal complete / verified。当前用户包 main/renderer 均无文档流程，历史 Goal 验收命令为空且以未经验证结束。具体版本、SHA256、截图与新包测试见 Test Run 和 `.docs/goal-live-audit-ui-validation/2026-09-09/`。
- 未解决问题：本轮真实链路走 PASS，没有实测 FAIL 回灌；全分支架构检查有 3 项来自集成基线 f9f4855e7 的 Claude hook 路径登记问题，不属于本次修改；当前用户 App 尚未更新，本轮修复尚未提交。
- 下一步：补充时序和截图已收齐；按后续授权提交、合入本轮修复，替换用户正在运行的 App 前按项目规则确认。

### 2026-09-08 验收文档生成与确认闭环

- 本轮目标：落实 REQ-121，恢复以验收文档为中心的创建流程。
- 完成内容：新建默认选守卫，生成、编辑、预览验收文档后再开始；生成不启动执行，失败保留输入，取消/过期响应不覆盖文档；文档存入定义与历史，执行和整体裁判使用同一原文。命令为高级可选项；旧目标兼容保留。
- 代码或文档变更：生成任务宿主服务和三个 Goal RPC；复用共享 Agent 参数及解析、宿主 runProcess、Goal 存储与版本、Markdown 渲染组件；补充 REQ-121、TC-344～TC-346 和方案当前实施修订。工作分支为 feat/goal-acceptance-document。
- 验证证据：95 项 Goal 自动化、163 项 CLI 回归、pnpm tc、应用及驱动构建、四项本地化、fork-features、fork-docs、改动范围代码质量检查通过；真实 Codex 对隔离样例生成了基于源码的验收文档且未修改实现；再将同一文档交给真实守卫，返回 FAIL、5 个真实失败输出与具体缺口（另有范围证据不足被正确标为无法核实）。隐藏 Electron 中生成、预览、修改、上下文变化、失败保留、取消和创建共 8 项检查点通过，重启文档逐字一致，中文显示通过。实际 driver/judge 的 CLI 参数包含用户最终编辑的完整文档，界面显示 FAIL 与具体缺口，原执行进程 stdin 实际收到失败反馈。验证发现并修复取消确认前误采纳迟到文档、长路径撑宽表单和英文按钮文字溢出。真实进程测试确认忽略 SIGTERM 的守卫树也在取消后退出。证据保存在 `.docs/goal-acceptance-document-ui-validation/2026-09-08/`。
- 未解决问题：默认全分支架构门禁存在 340 项已有上游范围差异；以 HEAD 为基线检查本轮变更通过。用户已授权复用仓库 Playwright Electron fixture 并完成界面验证；UI 使用固定 CLI 测试替身，真实 Codex 证据来自独立宿主/CLI 验证。未运行用户 App，也未操作历史 Goal。
- 下一步：本轮功能验证完成，待后续处理全分支基线门禁并合并/发布；当前 status 为 testing，不把功能通过等同于全仓库门禁或发布完成。

### 2026-09-08 整体文本裁判

- 本轮目标：用户选了 codex 当裁判却发现什么都没被验收；查明是 WP5 少实现了方案 §5.4/§5.7 已写明的整体文本模式，把它补上。
- 完成内容：见方案 §8「2026-09-08：整体文本裁判落地」。设计先经一轮 4 侦察 + 4 设计 + 1 仲裁的工作流定稿，再按稿实现。
- 代码或文档变更：新增 `src/shared/goals/goal-judge-contract.ts`、`goal-mode/cli/judge-whole-verdict.mjs` 与四个测试文件；改动 `goal-store.ts`、`goal-store-layout.ts`、`goal-control-contract.ts`、`goal-rpc-results.ts`、`goal-evidence-projection.ts`、`goal-summary-projection.ts`、`goal-record-projection.mjs`、`goal-driver-entry.mjs`、`acceptance-judge.mjs`、`acceptance-gate.mjs`、`GoalProgress.tsx`、`GoalEditor.tsx`、`GoalCriteriaEditor.tsx`、中英文案、功能清单、需求、测试用例与本记录。
- 验证证据：goal-mode/cli node:test 163/163；goal 相关 vitest 14 文件 76 例；`pnpm tc:node`、`pnpm tc:web`；`verify:localization-extraction/catalog/coverage`；`check:architecture-policies`、`check:fork-features`、`check:fork-docs`；`pnpm build:goal-driver` 后用打包产物真跑整体模式（PASS 退 0、散文退 3）。未用真实 claude/codex 裁判在真机跑过一轮完整验收。
- 未解决问题：真机上用 codex 跑一轮整体验收；判词原文目前截断到 4000 字，完整文本只在 `~/.orca-goal/verdict/<key>-turn<N>.md`，把它接到证据的「查看证据」是另一片；整体判词为 FAIL 时各验收项按方案保持「尚未验证」，如果期望改成一并标红需要先改方案。
- 下一步：重装后在真机建一个只写目标、选 codex 的目标，跑到整体验收出结论。

### 2026-09-07 WP5 条目级 judge

- 本轮目标：补上方案 §5.7 的条目级 judge，让没有命令的验收项也能被独立验证并逐条显示结果。
- 完成内容：见方案 §8「WP5 条目级 judge 落地」。在功能分支 `feat/goals-judge-items` 上完成，合回 `fork/integration`。
- 代码或文档变更：`src/shared/goals/`（契约、记录、布局）、`src/main/goals/`（存储、新证据投影模块、导入调整）、goal-mode/cli（裁判、gate、记录投影、驱动入口、循环、新解析模块）、打包脚本、编辑器/进度组件、中英文案、功能清单登记、方案与本记录。
- 验证证据：CLI node:test 149/149；goal vitest 11 文件 54 例；`pnpm tc:node`/`tc:web`；`verify:localization-extraction/catalog/coverage`；架构门禁与 `check:fork-features` 通过；`pnpm build:goal-driver` 产出 `goal-driver.js` 与 `acceptance-judge.js`。未用真实 claude/codex 裁判跑过真机验收。
- 未解决问题：真机上选 claude 裁判跑一次完整验收；Windows 下裁判命令的引号规则只有单测覆盖。
- 下一步：用户确认重装后，在真机建一个带无命令验收项的目标并选 claude 裁判跑一轮。

### 2026-09-06 代码评审与修复

- 本轮目标：用户追问“review 代码了吗”，对 WP1～WP4 全部改动做一轮独立代码评审并修复确认项。
- 完成内容：评审 19 条正确性候选（17 确认、2 可能、0 否决）；修复 12 项：`child_process` 直连改 `spawnProcess`（ratchet 回到 158）、空 goalId 恒真、收据/意图写入顺序、resume 先写意图再拉起、非安全上下文 crypto、同工作区多目标覆盖 v1 记录、终端句柄失效判 exited、暂停态保存死锁、resume 丢 objective、编辑草稿被轮询冲掉、导入未校验 schema、admitSelector 不可达分支；另加驱动命令行读取缓存。细节见方案 §8「代码评审修复」。
- 代码或文档变更：`src/main/goals/` 8 个模块、`src/shared/goals/goal-store-records.ts`、`rpc/methods/goals.ts`、渲染层 `goal-client-operation.ts` 与 `GoalEditor.tsx`、goal-mode/cli 三个文件；新增/更新 5 个测试；方案 §8。
- 验证证据：`pnpm tc:node`、`pnpm tc:web` 通过；vitest：goal 主进程 7 文件 42 例、渲染/共享/插件/ratchet/路由 9 文件 31 例通过；goal-mode/cli node:test 138/138；驱动重新打包后真实 fork 测试通过；架构门禁在 src/goal-mode/config 无违规。含修复的安装包正在重新打包（`.docs/goal-ui-validation/2026-09-06/build/build-mac-3.log`），未重装：按用户要求，退出 App 前先确认。
- 未解决问题：评审列出的四项已知限制未修（多意图不排队、验收期间 stop 要等超时、存储层无 Windows 重试、两个固定值字段）；修复后的包未在真机复验。
- 下一步：用户确认后重装复验；建立第一份真实 Test Run。

### 2026-09-06 WP2～WP4 界面、控制动作、打包与遗留迁移

- 本轮目标：按用户“继续吧，直到全部改完”一次完成方案 §6.1 剩余三个工作包，并在真实 App 里看一遍。
- 完成内容：WP2 原生“目标”页签、面板（列表/详情/新建/编辑）、终端标题栏“设置目标”入口、命令面板两条原生条目、Issues 式同步门与 domain store、中英文案，内置插件与 `goal-mode/plugin/` 同一改动删除，旧插件页签路由归一到 goals；WP3 `goals.control` 加 stop（驱动在等轮次检查点发一次中断，宽限内没有结束证据则收据 confirmation_pending）、`goals.amend`/`rebind`/`archive`/`versions`，驱动注入前套用 reload；WP4 `out/goal-driver` 进 extraResources 并加打包契约测试，`build:goal-driver` 挂进 build:desktop/build:release，v1 CLI 目标只读列出并可显式导入。
- 真机发现与修复：安装包已删内置插件，但命令面板仍出现旧插件三条命令（查看当前状态/停止/开始），来源是用户数据目录 `plugins/stablyai.orca-goal` 里早先引导安装的 bundled 副本。内置插件引导新增退役步骤：锁文件里来源为 bundled、但已不在当前清单的安装，先 `deactivatePlugin` 再删安装目录、数据目录与锁条目，并触发一次插件刷新；单测覆盖退役与二次引导无残留。
- 代码或文档变更：上述实现与测试；方案 §5.2 文件树、§7 第 6 条、§8 记录；需求 REQ-109/116～120 状态；测试用例索引；本 Journal。门禁白名单补入插件引导相关文件。
- 验证证据：`pnpm tc` 与 `pnpm tc:node` 通过；goal 相关 vitest 161 例、插件引导相关 11 例、goal-mode/cli node:test 137 例通过；本地化 extraction/catalog 通过（coverage 只剩 Issues 既有文件）；架构门禁 19 条违规全在其他会话的文档、工作流与 docs/site 文件，goal 与插件路径无违规。真机（Orca (local) 1.4.197-local.1788682563518，CDP 9333）：右侧栏“目标”页签就绪，副标题为默认文案、“新建目标”可点、列表空态；新建表单渲染目标/验收标准/验收说明/工作区（dev，在本机执行）/Agent 会话下拉列出 2 个 hook 识别的 claude 会话/高级设置，取消可关闭；命令面板搜“目标”出现原生两条；切到 agent 页签后标题栏出现“设置目标”。证据在 `.docs/goal-ui-validation/2026-09-06/evidence/goals-*.png` 与 `.docs/goal-ui-validation/2026-09-06/evidence/verify-goals-panel.log`。含退役修复的新包（1.4.197-local.1788701972147，`.docs/goal-ui-validation/2026-09-06/build/build-mac-2.log` BUILD_EXIT=0）已重装并启动，复验：用户数据里 `plugins/stablyai.orca-goal`、`plugins-data/stablyai.orca-goal` 与锁条目全部消失，命令面板搜“目标”只剩原生两条（`.docs/goal-ui-validation/2026-09-06/evidence/verify-goals-panel.log` 末段、`.docs/goal-ui-validation/2026-09-06/evidence/goals-quick-actions-after-retire.png`）；这次面板截图被“手机正在控制”弹层挡住，面板本身沿用上一包的验证结果。
- 未解决问题：本次重装退出了用户正在用的 App，用户随后要求以后退出前先确认，已记入长期记忆；条目级 judge 输出模式未做；Windows/Linux/SSH/WSL 无真实回归；改动未提交；未创建过真实目标（不碰用户在跑的会话）。
- 下一步：见上方「代码评审与修复」记录。

### 2026-09-06 WP1 控制内核

- 本轮目标：按方案 §6.1 落地第一个工作包：契约、`goals.status` 探测、宿主控制服务、hook 证据投影、驱动启动与暂停/恢复、门禁白名单。
- 完成内容：`src/shared/goals/` 四个文件（契约、记录形状、目录布局、工作区键移植）；`src/main/goals/` 十个模块加 `startup/main-process-goals.ts` 与 `rpc/methods/goals.ts`；goal-mode/cli 新增驱动入口、runtime 直连后端、意图/收据检查点，循环加四处检查点；`config/scripts/build-goal-driver.mjs` 与 `build:goal-driver` 脚本；`architecture-policies.jsonc` 两条白名单。
- 代码或文档变更：上述实现代码、6 个 vitest 套件与 1 个 node:test 文件、方案 §5.2 文件树与 §8 记录、本 Journal。未改需求与测试规格文档。
- 验证证据：`pnpm tc` 通过；goal 相关 vitest 通过；goal-mode/cli 原有 128 个 node:test 与新增 4 个通过；驱动打包成功，真实 fork 一次完成 ready 握手并落下 v1 记录与锁；架构门禁对本次路径无违规。`check:code-quality:changed` 报出的 9 条 type-aware 发现分别在分支既有文件 goal-loop.mjs 原逻辑、desktop-notification.mjs、goal-mode/plugin/verify，不属于本次改动；门禁另有 15 条违规全在 Issues 与自托管产物文档目录。未做真实 App 端到端验证。
- 未解决问题：`goals.*` 尚无渲染层调用方，进 App 验证要等 WP2；打包进安装包（extraResources）留在 WP4；stop/amend/rebind/archive 留在 WP3。
- 下一步：WP2 界面。

### 2026-09-05 方案评审修订

- 本轮目标：评审目标管理方案，并按评审结论修订。
- 完成内容：逐项核对方案引用的 50 余个路径与源码事实；修正旧插件“只生成命令”的描述；新增 §5.10 门禁与依赖边界；契约对齐现有 schema；删减跨端聚合、分页、版本化缓存；状态层改为照搬 Issues 同步门；界面示意改为字段表。
- 代码或文档变更：仅方案文档与本 Journal；无实现代码变更，未改门禁配置。
- 验证证据：方案内全部相对链接可解析；正文无尖括号占位符；改名与删除概念无残留。未执行功能单测、类型检查、构建或真实 UI。
- 未解决问题：上游意图与直接移除旧插件待用户确认；`docs/issue/**` 不在门禁白名单，本目录文档已触发 worktree 门禁，待 WP1 随白名单一并处理。
- 下一步：用户确认后进入 WP1；不因修订完成自动实施。

### 2026-09-05 目标管理交互方案

- 本轮目标：先写方案，回答 UI 从哪里新建、看全部目标、看真实进度，以及停止/修改/改绑/归档。
- 完成内容：形成目标态交互示意、用户动线与系统图、复用候选、组件与状态归属、RPC 契约、操作确认、版本/迁移、工作包与验证建议；补充插件宿主已支持带参调用的源码事实。
- 代码或文档变更：本 issue 的主需求、新方案、历史技术基线、测试状态、Journal，以及本地需求总索引；无实现代码变更。
- 验证证据：6 份文档的 105 个本地链接、结构、20 个 REQ / 39 个 TC 唯一性和已有测试正文保留检查通过；4 张 Mermaid 图语法解析通过，方案 IDL 语法与 6 项 schema 断言通过（仅文档契约检查）。没有执行 Goal 功能单测、项目类型检查、构建或真实 UI。原有 sidebar/index.tsx 的 diff 指纹保持不变。
- 未解决问题：原生宿主技术路线和能力分期需用户评审；headless/peer、各 provider 停止确认、三平台包内资源与真实 UI 都没有本轮运行证据；测试规格尚未覆盖新增需求。
- 下一步：评审方案后，按用户明确授权进入开发或修订；不因文档生成自动实施。

### 2026-09-05 拆分独立 issue

- 本轮目标：按用户确认，将 Goal 目标模式从总 issue 独立出来。
- 完成内容：迁移一份主需求、一份主技术说明、一份测试规格及本需求的已有证据；更新旧入口，不扩写新功能。
- 代码或文档变更：仅本 issue、相关导航、跨需求维护记录和窄范围 Git ignore 例外；原功能源码与暂存区不调整。
- 验证证据：本需求结构与链接校验、完整 REQ/TC 及正文保留校验记录在 `docs/maintenance/本地需求文档整理/2026-09-05-三需求拆分校验.md`；本次不重新执行功能测试。
- 未解决问题：删除空转熔断等最新目标尚未实现，旧待决清单仍有差距；真实目标、插件 UI 以及 Windows/SSH/WSL 支持没有本次执行证明。
- 下一步：后续仅在本 issue 内推进对应开发和验收，每次真实执行新增 Test Run。
