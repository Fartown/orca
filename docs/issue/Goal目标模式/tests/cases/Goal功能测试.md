---
document_type: test-case
status: needs-update
updated_at: 2026-09-05
issue: Goal目标模式
scope: Goal 目标模式
---

# Goal 功能测试

本文件整理既有测试代码与历史验收规格，不代表一次测试执行。2026-09-05 新增目标管理需求后标记为 `needs-update`：原 TC-301～TC-339 保留，尚未覆盖 REQ-116～REQ-120，旧面板命令提示等预期也不能直接用于验收新 UI。本轮只写方案，不新增正式 Test Case 或 Test Run。关联 [需求](../../requirements/Goal目标模式.md)、[目标管理方案](../../solutions/Goal目标管理与交互闭环方案.md) 与 [历史实现基线](../../solutions/Goal目标模式技术说明.md)。

## 覆盖来源与执行边界

| 简称     | 实际测试来源                                                                                                                                                                                                                                                                                       | 测试层级                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| D        | [goal-decision.test.mjs](../../../../../goal-mode/cli/goal-decision.test.mjs)                                                                                                                                                                                                                      | 纯决策、认领、扫描、部分验收真实子命令                    |
| W        | [round-wait-machine.test.mjs](../../../../../goal-mode/cli/round-wait-machine.test.mjs)                                                                                                                                                                                                            | 纯事件序列，不依赖真实 sleep                              |
| L        | [round-error-recovery.test.mjs](../../../../../goal-mode/cli/round-error-recovery.test.mjs)                                                                                                                                                                                                        | runLoop 的 mock I/O/时钟编排                              |
| K        | [worktree-key.test.mjs](../../../../../goal-mode/cli/worktree-key.test.mjs)                                                                                                                                                                                                                        | 临时目录与状态迁移                                        |
| E        | [goal-ergonomics.test.mjs](../../../../../goal-mode/cli/goal-ergonomics.test.mjs)                                                                                                                                                                                                                  | 参数、配置、路径、终端展示与假裁判等                      |
| R        | [driver-resilience.test.mjs](../../../../../goal-mode/cli/driver-resilience.test.mjs)                                                                                                                                                                                                              | 驱动退出/错误记录                                         |
| P        | [prompt-templates.test.mjs](../../../../../goal-mode/cli/prompt-templates.test.mjs)                                                                                                                                                                                                                | 实际磁盘模板与变量契约                                    |
| 宿主控制 | [goal-control-service.test.ts](../../../../../src/main/goals/goal-control-service.test.ts)、[goal-revision-control.test.ts](../../../../../src/main/goals/goal-revision-control.test.ts)、[goal-legacy-adoption.test.ts](../../../../../src/main/goals/goal-legacy-adoption.test.ts)               | 创建/暂停/继续/停止/编辑/换会话/归档/导入的收据与围栏语义 |
| 驱动控制 | [goal-driver-control.test.mjs](../../../../../goal-mode/cli/goal-driver-control.test.mjs)、[goal-loop-stop.test.mjs](../../../../../goal-mode/cli/goal-loop-stop.test.mjs)                                                                                                                         | 意图文件到收据的确认；停止时的中断与本轮结束证据          |
| 渲染层   | [goals-domain-store.test.ts](../../../../../src/renderer/src/goals/goals-domain-store.test.ts)、[goal-session-target.test.ts](../../../../../src/renderer/src/goals/goal-session-target.test.ts)、[right-sidebar-route.test.ts](../../../../../src/renderer/src/store/right-sidebar-route.test.ts) | store 身份保持、会话候选与绑定解析、旧插件路由归一        |
| B        | [plugin-launch-content.test.ts](../../../../../src/main/plugins/plugin-launch-content.test.ts)                                                                                                                                                                                                     | bundled Goal 资源注册与宿主内容契约                       |

表中“既有”只表示已找到相关自动化代码，不宣称覆盖完整。静态源码数量不是测试运行结果；需要实际测试报告后才填写通过数。

## 当前行为回归用例

### TC-301

关联需求：REQ-101、REQ-103；优先级：P0。

前置条件与操作：模拟正常轮次，agent 从 busy 到完成并写本轮 claim。

预期与核对证据：仅本轮声明参与判定，目标与下一轮提示保持原 scope，状态/JSONL 轮次一致。

覆盖来源：D、L。

### TC-302

关联需求：REQ-101、REQ-106；优先级：P0。

前置条件与操作：新注入后先收到上一轮 finished，再 busy，再 finished。

预期与核对证据：未见 busy 的 finished 不结束；见 busy 后才结束；attach 允许直接接受已有轮次 finished。

覆盖来源：W。

### TC-303

关联需求：REQ-101；优先级：P0。

前置条件与操作：新注入后 quiet；随后 busy 再 quiet。

预期与核对证据：最初 quiet 不算结束；只有观察到活动后 quiet 达阈值才结束。

覆盖来源：W。

### TC-304

关联需求：REQ-106；优先级：P0。

前置条件与操作：输入 needs-user，等待较长时间后恢复 busy，再停止活动。

预期与核对证据：等用户不注入；start/stuck 时间正确返还；之后超时仍会生效，不能永久豁免。

覆盖来源：W、L。

### TC-305

关联需求：REQ-101、REQ-107；优先级：P1。

前置条件与操作：hook working 早于本轮；PTY 分别持续输出/长期静默。

预期与核对证据：旧 working 不能无条件忙碌；按 PTY 回退。另测 sinceMs=0 的当前查询边界。

覆盖来源：W 已有本轮场景；扩展边界待补。

### TC-306

关联需求：REQ-107；优先级：P0。

前置条件与操作：观察调用偶发失败、恢复；再构造连续超过 observe grace。

预期与核对证据：瞬时故障重试并报告恢复；持续不可观察转本轮 failure，主循环按 round error grace 处理。

覆盖来源：W、L。

### TC-307

关联需求：REQ-107；优先级：P1。

前置条件与操作：agent 一直 busy；另一序列从未启动；另一序列长期无活动且未结束。

预期与核对证据：busy 长轮次只提示；start/stuck 分别触发对应原因；最短轮次不能被误判绕过。

覆盖来源：W、L。

### TC-308

关联需求：REQ-101、REQ-103；优先级：P0。

前置条件与操作：注入带换行文本或公开 CLI 返回 accepted:false；配置含特殊文本。

预期与核对证据：不允许多行直接写入；拒绝输入不能记作成功轮次。控制字符除 CR/LF 外的边界需单独记录。

覆盖来源：E、P；控制字符覆盖待补。

### TC-309

关联需求：REQ-103；优先级：P0。

前置条件与操作：claim 不存在、合法小写/全角冒号、Markdown 包装、普通散文、大小写错误、大文件、目录、旧 mtime。

预期与核对证据：仅合规且属于本轮的 complete/blocked 被采信；其他明确 null/malformed/stale，不被误算完成。

覆盖来源：D。

### TC-310

关联需求：REQ-103、REQ-107；优先级：P0。

前置条件与操作：attach 或发生取证/落盘重试，claim 已由 agent 写好。

预期与核对证据：attach 不清合法在途 claim；旧轮次 mtime 被忽略；清 claim 与新注入绑定。

覆盖来源：L。

### TC-311

关联需求：REQ-104；优先级：P0。

前置条件与操作：完成声明分别无 checks、有 checks 未执行、check 全通过。

预期与核对证据：judge 为 none 且没有任何验收命令时明示未经验证；有 checks 先 verify；仅有效通过进入 verified complete。

覆盖来源：D。

### TC-312

关联需求：REQ-104、REQ-114；优先级：P0。

前置条件与操作：check 判定未通过，失败输出含大量前置噪声与末尾真错误。

预期与核对证据：下一轮含具体失败命令与真实末尾输出；不能只有模糊“未通过”或吞掉尾部。

覆盖来源：D、L。

### TC-313

关联需求：REQ-104、REQ-114；优先级：P0。

前置条件与操作：check 超时、spawn error、退出 3、普通非零，分别喂决定函数。

预期与核对证据：无法判定与判定失败区分；inconclusive 不加 falseClaims。记录同步 spawn/command-not-found/claude is_error 的现有边界。

覆盖来源：D、E；部分边界待补。

### TC-314

关联需求：REQ-104；优先级：P1。

前置条件与操作：两条 checks 第一条失败，分别默认与 check-all。

预期与核对证据：默认第二条不执行；check-all 两条都执行并汇总。

覆盖来源：D、E。

### TC-315

关联需求：REQ-104；优先级：P0。

前置条件与操作：使用测试假裁判分别输出 PASS/FAIL/无判词/超时前部分判词/错误。

预期与核对证据：检查 0/1/3 退出语义与部分证据输出；不可用真实模型作为这项单测依赖。

覆盖来源：E。

### TC-316

关联需求：REQ-104；优先级：P1。

前置条件与操作：为两种裁判配置默认/显式 read-only，核对实际启动 argv；真实沙箱验证另立运行任务。

预期与核对证据：默认不宣称只读；codex 显式 sandbox，claude 只禁写工具不是 OS 沙箱。

覆盖来源：E 或新增 argv 用例；真实裁判本次未执行。

### TC-317

关联需求：REQ-105；优先级：P0。

前置条件与操作：设置轮数/时长预算，模拟观察、验收、停驱动、显式等用户，再恢复。

预期与核对证据：已用轮数/activeMs 不重置；验收时间计入，停驱动与显式 waitForUser 不计；0 不限。

覆盖来源：D、L、K。

### TC-318

关联需求：REQ-105；优先级：P0。

前置条件与操作：最后一轮完成且验收通过；另一路在 busy 中耗尽时长。

预期与核对证据：前者 complete 优先；后者 budget_exhausted 且记录当前轮并尝试收尾；不声称 agent 已停止。

覆盖来源：D、L。

### TC-319

关联需求：REQ-106；优先级：P0。

前置条件与操作：一次 blocked 后普通轮；再连续两次 blocked，ask 与 verify 分别执行。

预期与核对证据：非连续清计数；ask 等用户；verify 全绿发 blocked-but-passing 继续，其余等用户；用户回复 busy 后 attach。

覆盖来源：D、L。

### TC-320

关联需求：REQ-108；优先级：P1。

前置条件与操作：临时 git repo 修改已跟踪/未跟踪文件、仅 commit、改真实 index；另用非 git folder。

预期与核对证据：tree 覆盖内容与新文件、HEAD 变化算进展；真实 index 不受快照干扰；folder 明确 unavailable。

覆盖来源：D、K 及真实临时 Git 场景。

### TC-321

关联需求：REQ-108；优先级：P1。

前置条件与操作：中文测试路径删断言、加 skip、只增断言、改门禁配置；linked worktree 改 common exclude。

预期与核对证据：分类和 findings 准确；合法补断言不报净删；exclude 独立哈希变化可见。

覆盖来源：D 与临时 Git 场景。

### TC-322

关联需求：REQ-108；优先级：P1。

前置条件与操作：gate 类变更后执行 judge check，观察 env 和 diff；再用普通 check。

预期与核对证据：judge 收到原始 diff 与原意说明；普通 check 不能凭环境变量存在就宣称已作语义审查。

覆盖来源：L、D。

### TC-323

关联需求：REQ-107、REQ-108；优先级：P1。

前置条件与操作：同 tree 重试验收；改 tree；非 git；另改变 check/外部环境但不改 tree。

预期与核对证据：前两类按现有缓存命中/失效，非 git 不缓存；配置/外部环境变化展示缓存缺口，不能误写预期为已修复。

覆盖来源：L；缓存缺口用例待补。

### TC-324

关联需求：REQ-107；优先级：P0。

前置条件与操作：验收完成后写日志异常；模板缺失；长期取证故障；未捕获异常。

预期与核对证据：终态不复活；错误留下原因；取证可降级；claim/已落盘判词保留；driverError 不等价为 agent 失败。

覆盖来源：L、R、P。

### TC-325

关联需求：REQ-102、REQ-115；优先级：P0。

前置条件与操作：同目录不同 terminal、相对路径/大小写、软链别名、终端关闭后按工作区定位。

预期与核对证据：同一归一路径 key 相同；换 terminal 不换目标；文档准确列软链/大小写策略，不虚构 realpath。

覆盖来源：K、E。

### TC-326

关联需求：REQ-102、REQ-115；优先级：P0。

前置条件与操作：构造多条旧 terminal key、不同 updatedAt、归档日志及活驱动组，再迁移两次。

预期与核对证据：最新记录占工作区 key，旧记录归档；侧车/归档日志搬迁；活驱动组跳过；再次迁移幂等。

覆盖来源：K。

### TC-327

关联需求：REQ-102、REQ-115；优先级：P0。

前置条件与操作：临时锁指向不存在 PID、无关存活 PID、不可验证进程；stop/status/start/forget 分别核对。

预期与核对证据：必须区分 PID 存活与驱动身份；当前部分路径未闭环，不能只看一个 stop 用例宣称全部修复。

覆盖来源：E、R；身份全路径待补。

### TC-328

关联需求：REQ-102、REQ-110；优先级：P1。

前置条件与操作：停驱动后 resume，覆盖预算/check，改绑同目录和不同目录 terminal；后台使用相对配置。

预期与核对证据：原目标/累计数据保留，baseline 重取；rebind 拒绝其他工作区；后台路径从父进程固定。

覆盖来源：K、E、L。

### TC-329

关联需求：REQ-110；优先级：P1。

前置条件与操作：配置含数组 objective、整行注释、未知字段、非法数字；分别 start/resume/judge。

预期与核对证据：有明确配置优先级和错误；记录 resume/judge 数值及 onBlocked 文件字段缺口，不按 start 校验推定全部正确。

覆盖来源：E。

### TC-330

关联需求：REQ-109、REQ-115；优先级：P1。

前置条件与操作：worker 读取多目标、大日志、driverAlive，写入成功/失败，推进心跳与停表时间。

预期与核对证据：只读取主目标日志尾部；按预算裁轮次；写成功才去重；活动目标心跳，停止后可回收；全局选择策略明确。

覆盖来源：UI。

### TC-331

关联需求：REQ-109；优先级：P1。

前置条件与操作：面板读新/旧快照、宿主不响应、driverError、用户正在编辑，再触发 refresh 与操作。

预期与核对证据：有超时/过期/中断原因，不清用户表单；按钮显示命令；通知失败仍可见结果。

覆盖来源：UI。

### TC-332

关联需求：REQ-109、REQ-110；优先级：P1。

前置条件与操作：目标包含引号，判据含与 heredoc 同名行；切换裁判、budget=0，多目标执行 stop 命令。

预期与核对证据：POSIX 命令转义及定界符避碰正确；显示不限；多个 active 不猜停哪个；不声称 Windows 脚本可用。

覆盖来源：UI。

### TC-333

关联需求：REQ-109；优先级：P1。

前置条件与操作：验证真实 bundled manifest/schema、token/host-call、资源内容索引与测试 HERE。

预期与核对证据：三件套从 resources 读取；contentHash/manifest 不漂移；原运行模板仍可按路径加载。

覆盖来源：UI、B、P。

### TC-334

关联需求：REQ-111；优先级：P2。

前置条件与操作：核对 Linux 命令名；分别计划 Windows、SSH/WSL、folder 执行边界验证。

预期与核对证据：不在未适配平台误宣称成功；远端执行必须可证明 host，断联应保留不可验证状态；folder 降级明确。

覆盖来源：命令名已有源码；完整平台/远端验收未执行。

## 最新目标的待实现用例

这些用例是需求期望，不是当前实现回归结果；部分预期与当前代码相反。

### TC-335

关联需求：REQ-112；优先级：P1。

前置条件与操作：多轮只读调研/铺环境，tree 与 HEAD 连续不变，但没有完成/受阻且预算未尽。

预期与核对证据：继续推进，不生成新的 stalled。

覆盖来源：未实现；D 现有测试反而要求 stalled。

### TC-336

关联需求：REQ-112；优先级：P1。

前置条件与操作：删除空转后继续采快照、changed、scanRound、缓存，并读取旧 stalled JSON。

预期与核对证据：证据链保留；旧 stalled 可显示；新目标没有空转计数出口。

覆盖来源：未实现。

### TC-337

关联需求：REQ-113；优先级：P1。

前置条件与操作：无 hook、无认领，终端尾部是明确权限提示/崩溃/无法识别文本。

预期与核对证据：明确权限不注入、明确崩溃留原文原因、未知保持 continuation。

覆盖来源：没有已定签名集合或 obs.tail 实现。

### TC-338

关联需求：REQ-114；优先级：P1。

前置条件与操作：同一批失败项反复未收敛；期间插入真实进展与不同失败；门禁自身失败。

预期与核对证据：按证据识别需要用户处理，不把累计次数误叫连续，不将不可判定归咎 agent。

覆盖来源：部分实现；同批匹配与 await-user 未实现。

### TC-339

关联需求：REQ-115；优先级：P2。

前置条件与操作：同工作区连续多个运行、崩溃、PID 复用、forget，检查所有侧车与历史归属。

预期与核对证据：进程身份/运行代际/清理行为与用户看到的结果一致，历史不串代、不误删。

覆盖来源：完整 runId 暂缓；当前 forget 仅删 JSON。

REQ-112 原提案规定的验证次序仍保留：先增加“连续不变仍继续”用例并确认当前代码失败，再实施移除转绿，最后重新注入旧空转判定以证明用例能重新失败；本次不执行代码修改或变异。

## 目标管理用例（2026-09-07 新增）

### TC-340

关联需求：REQ-116、REQ-117；优先级：P0。

前置条件与操作：宿主 Goal 服务就绪；存在两条 v2 记录（一条本工作区、一条其他工作区）和一条未导入的 v1 CLI 记录。切换“当前工作区/全部”范围与“进行中/待处理/历史”筛选，搜索目标，选择一条进入详情再返回，对 CLI 目标行执行导入。

预期与核对证据：列表按范围与筛选过滤，搜索只匹配目标正文；详情可返回列表且选择不被自动改写；CLI 目标以只读行列出，导入后成为暂停态的受管目标，旧驱动仍在时导入被拒为 conflict。执行端只有本机，其余端不列出。

覆盖来源：宿主控制（goal-control-service.test.ts 的 list/get、goal-legacy-adoption.test.ts）、渲染（goals-domain-store.test.ts）、真机记录 `.docs/goal-ui-validation/2026-09-06/`（面板与新建表单截图）。

### TC-343

关联需求：REQ-104、REQ-118；优先级：P0。

前置条件与操作：目标只写了目标正文（验收项为空、额外检查命令为空），在高级设置里选 codex 或 claude 作为独立裁判。agent 声称完成后触发验收。

预期与核对证据：验收命令列表非空，末尾是一条 `--criteria-file` 整体裁判命令，工作目录为该工作区，只读沙箱，超时沿用检查超时；裁判说 PASS 落成“整体验收 · 通过”，说 FAIL 落成“整体验收 · 未通过”，两者都保留判词原文；判词缺失、无法解析、裁判起不来、超时一律记“无法判定”，绝不显示为通过；详情页不因整体判词生成逐项通过数；不再出现“未配置验收命令（未经验证）”。

覆盖来源：[acceptance-judge-whole.test.mjs](../../../../../goal-mode/cli/acceptance-judge-whole.test.mjs)、[goal-record-projection.test.mjs](../../../../../goal-mode/cli/goal-record-projection.test.mjs)、[goal-judge-contract.test.ts](../../../../../src/shared/goals/goal-judge-contract.test.ts)、[GoalProgress.test.tsx](../../../../../src/renderer/src/components/goals/GoalProgress.test.tsx)、[goal-control-service.test.ts](../../../../../src/main/goals/goal-control-service.test.ts)。未用真实 claude/codex 裁判在真机执行。

### TC-341

关联需求：REQ-118；优先级：P1。

前置条件与操作：目标带三类验收项：有命令的、无命令的（选了独立裁判）、额外检查命令。驱动写回一次验收结果，其中裁判命令输出条目判词；随后修改目标定义产生新版本。

预期与核对证据：带命令的项映射 gate 结果；无命令的项映射 `source: 'judge'` 的条目判词，未声明的 id 不挂到任何验收项；缺失、重复、无法解析的判词记 inconclusive，不显示为通过；定义版本变更后旧证据显示“证据已过期”；轮次与预算分开显示，不用轮次表示完成度。

覆盖来源：宿主控制（goal-control-service.test.ts 的两条证据用例、goal-evidence-projection.ts）、裁判（judge-item-verdicts.test.mjs、acceptance-judge-items.test.mjs、goal-record-projection.test.mjs）。真实 claude/codex 裁判未在真机执行。

### TC-342

关联需求：REQ-119、REQ-120；优先级：P0。

前置条件与操作：驱动运行中，在途一轮未结束。依次执行暂停、恢复、停止；驱动缺席时再执行停止与恢复。

预期与核对证据：暂停只关闭下一次注入并在收据里说明在途轮次照常结束；停止在关闸后向在途轮次发一次中断，等到本轮结束证据才写 turnStopped=true，宽限内没有证据则收据为 confirmation_pending 并显示“中断未确认”；恢复沿用累计轮次与时长，重新拉起驱动前先写本次意图，新驱动不会读到上一次的停止；驱动缺席时由宿主按缺席结算收据。

覆盖来源：宿主控制（goal-control-service.test.ts、goal-revision-control.test.ts）、驱动（goal-driver-control.test.mjs、goal-loop-stop.test.mjs、goal-loop-reload.test.mjs）。

## 历史证据的使用方式

历史 CLI README 曾记录真 agent 完成、假完成被拒后修复、原地快照不动 index、篡改 diff、后台运行、resume、prompt-file、claude/codex 裁判等场景。它们提供回归场景来源，不提供本次版本的通过证明；其中 prompt-file 旧文明确只有单次验证，默认关闭。

2026-08-15 评审事故保留为 TC-310/312/317/324 等针对性断言：不能使用仅匹配源码文本、`not pending` 或“测试全绿”代替真实状态/注入次数/认领/判词检查；阈值字段名必须正确，关键修复应有能让对应行为用例失败的反事实验证。

`goal-mode/docs/mockup/` 中截图是历史探索/检查资产。`goal-mode/plugin/verify/panel-check.mjs` 的 CDP 脚本能做浅色/暗色和溢出等观察，但本次未执行。其他项目的 `markdown-figma-verdict.md` 是失败裁判样例，且原文说明浏览器被中断，不属于 Orca UI 验收通过证据。

## 后续执行记录要求

安全的自动化入口是 CLI 目录内 `node --test --experimental-test-module-mocks *.test.mjs`，以及仓根 `pnpm test src/main/goals src/shared/goals src/renderer/src/goals`（插件目录已于 2026-09-06 移除）。使用项目 Node 版本；测试以临时目录、假终端和假裁判为主，不能将用户真实 `~/.orca-goal` 状态作为测试 fixture。

每次 Test Run 记录代码版本、Node/平台、命令、实际覆盖的 TC、结果和证据路径。真实 Orca UI 验收遵守项目 Electron/CDP 流程；真实 agent 长跑、权限框、预算超时、应用重启、三平台和 SSH 的证据各自独立，不由 DOM 单测推导。
