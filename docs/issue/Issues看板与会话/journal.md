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
| --- | --- | --- | --- |
| 需求     | [Issues 看板与会话](requirements/Issues看板与会话.md)                | ready        | 独立目标、范围、分级与 REQ-001～REQ-029                              |
| 交互     | -                                                                    | not-required | 本次仅整理既有文档，不创建新交互设计或修改 UI                        |
| 方案     | [Issues 看板与会话技术说明](solutions/Issues看板与会话技术说明.md)   | ready        | 看板、真实会话行、绑定与恢复；标题现状以2026-09-08专项调研为准 |
| 命名方案 | [Provider优先的会话命名统一方案](solutions/Provider优先的会话命名统一方案.md) | reviewing | 全量目标实施中；Provider证据/排序及部分公共消费链已实施，严格归属与全入口验收未完成；人工名新系统撤出 |
| 身份保护首期 | [Claude在位会话活跃窗口保护方案](solutions/Claude在位会话活跃窗口保护方案.md) | reviewing | 已实现；W=30秒工程默认，冷恢复缺时沿旧逻辑；D-005按红测补后续事件/远端准入，仍是启发式 |
| 首期测试规格 | [Claude活跃窗口保护测试](tests/cases/Claude活跃窗口保护测试.md) | ready | TC-255～260，仅覆盖WP0a；全量命名规格仍待同步 |
| 首期测试执行 | [2026-09-08窗口保护](tests/runs/2026-09-08-Claude活跃窗口保护.md) | completed | 1201通过/9跳过，后台App四检查点通过；全量架构仍340条基线违规，不操作原Provider会话 |
| 真实Provider验证 | [2026-09-09真实Claude](tests/runs/2026-09-09-真实Claude活跃窗口保护.md) | completed | 真实A→B/Agent三个检查点PASS，138次连续采样异常0；仅30秒窗内print模式，不是全部命名验收 |
| Codex真实验证 | [2026-09-09真实Codex](tests/runs/2026-09-09-真实Codex身份与名称验证.md) | completed | 修复前FAIL留档：原生spawn_agent 160采样异常0；独立exec B 201采样97异常 |
| Codex修复规格 | [Codex嵌套调用保护测试](tests/cases/Codex嵌套调用保护测试.md) | ready | TC-261～263，生产端过滤、宿主环境清理与真实合法换会话 |
| Codex修复验证 | [2026-09-09嵌套调用修复](tests/runs/2026-09-09-Codex嵌套调用修复.md) | completed | 真实四检查点PASS；C3 0/174、C2 0/324异常；432通过/4跳过，类型与全量架构门禁通过 |
| 打包验证 | [2026-09-09打包身份保护](tests/runs/2026-09-09-打包身份保护验证.md) | draft | 身份包已替换安装，但隔离C1～C4回归未完成，不记PASS |
| 顶部投影验证 | [2026-09-09顶部名称投影修复](tests/runs/2026-09-09-顶部名称投影修复.md) | completed | 真实metadata定位，46相关回归、隐藏UI三检查点通过；新包就绪但尚未替换，不是全量命名验收 |
| 旧命名初稿 | [会话命名统一方案](solutions/会话命名统一方案.md) | superseded | 人工名第一、Tab例外及Issues快照扩建已撤回，仅留历史 |
| 命名验收 | [Provider优先命名验收](tests/cases/Provider优先命名验收.md) | ready | TC-231～254已同步撤出新人工名系统，按已确认身份与全消费面验收；ready不代表通过 |
| 全量推进 | [2026-09-09全量命名验收推进](tests/runs/2026-09-09-全量命名验收推进.md) | draft | 逐项记录未完成边界；先实测旧排序13项失败与最终组件覆盖反例，再修复，不用局部PASS收尾 |
| 测试用例 | [功能测试](tests/cases/Issues功能测试.md)                            | needs-update | 非命名/历史基线保留；受REQ-025/026/028影响的命名与过滤映射待同步，不含执行结果 |
| 调研     | [会话命名现状调研](research/会话命名现状调研.md) | ready | 当前源码的来源、排序、缓存、全部消费者分类及未知边界 |
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

### D-003 命名先修身份归属，撤出公共人工名新系统

- 日期：2026-09-08。
- 背景：用户要求核对Claude review后收缩方案；旧稿把主/辅助身份归属放在独立任务，并将备用名持久化/RPC/迁移做成本期大工作包。
- 备选项：原计划先改排序与迁移；直接移除身份守卫；或身份/过滤前置、保留有效守卫并缩减人工名范围。
- 最终决定：采用第三项。最新Hook观察不自动成为主pane绑定；合法子Agent可展示但不能顶替父会话；公共人工名新存储/编辑RPC/迁移退出本次，旧数据与过滤语义兼容保留。
- 原因：请求目标错误不能靠排序修复；真正换会话仍须防串名。已有人工名作为回退来源不要求本期建设管理系统，单机空数据也不能证明可删除所有兼容数据。
- 影响范围：REQ-025/026/028、[命名方案](solutions/Provider优先的会话命名统一方案.md)、命名用户动线与验收矩阵；正式Test Case标记needs-update，本轮不执行测试或产品实现。

### D-004 首期采用Claude在位会话活跃窗口保护

- 日期：2026-09-08。
- 背景：用户提供Cloud的近期活动/静默判定方案；评审已指出时间不是存活证明、非SessionStart旁路及共享时间字段缺口，用户仍明确选择“就按这个来吧。更新一下方案”。
- 备选项：完整G0闭合后再改身份；先做SessionStart活跃窗口保护；扩成全事件角色/启动授权系统。
- 最终决定：首期采用第二项。不同ID的SessionStart到达，近期在位者有事件则拒绝，静默/无在位者沿用原逻辑；不改DB/RPC/wire，时间不足时补listener私有状态。W及冷恢复缺时策略待实施前定案，不承诺10行。
- 原因：按用户明确选择先收敛近期抢占问题，保留启发式误判边界；不将该取舍写成可靠身份判据已证实，也不擅自扩建授权系统。
- 影响范围：REQ-028首期范围、[WP0a模块方案](solutions/Claude在位会话活跃窗口保护方案.md)、[命名主稿](solutions/Provider优先的会话命名统一方案.md)的实施顺序与验收范围。D-003的全量归属/命名目标保留，但“全部G0先行”不再阻止WP0a；正式Test Case仍needs-update。

### D-005 — 实测后补齐同窗后续Hook与远端准入

- 日期：2026-09-08。
- 背景：用户授权实施、验证、发现问题继续修；初版5条生产函数回归中SessionStart与窗口边界已通过，但B下一次UserPromptSubmit仍替换A。
- 备选项：保留已知旁路只交付首事件；把同一窗口扩至携带不同ID的后续Hook；建设角色/身份中心。
- 最终决定：按继续修复的授权采用第二项，并向用户明确说明范围差异；30秒为工程默认，冷恢复无计时沿用旧逻辑，不把这些取值写成用户指定。
- 原因：不补后续事件就不能维持一次完整竞争序列中的身份；不需要新增黑名单、DB、RPC或角色猜测。
- 影响范围：REQ-028首期、shared normalizer/main remote准入与main/relay私有活动记录，TC-255～260；严格G0和全量命名目标不变。

### D-006 — 按真实调用者上下文拦截Codex嵌套Hook

- 日期：2026-09-09。
- 背景：真实Codex后台B抢占已复现；用户明确要求“那你倒是修复啊”。
- 备选项：推广Claude30秒窗口；或利用Codex工具进程继承的调用者线程环境，在managed Hook生产端阻止嵌套事件进入父pane。
- 最终决定：采用第二项。真实探针已确认A/原生subagent Hook的CODEX_THREAD_ID为空，独立B Hook为A。先消费stdin，再阻止嵌套Hook的HTTP与spool；Windows复用已有drain。保留正常重开与原生子Agent。
- 原因：直接使用本轮真实验证的调用上下文，不新增时间窗误拦正常快速重开，不增DB/RPC或身份中心。
- 影响范围：REQ-028、Codex managed脚本的local/posix模板与feature-owned小模块及测试；同时清理local/daemon/relay新PTY继承的外层CODEX_THREAD_ID，避免由Codex启动Orca时误拦正常新pane。未知旧版本无标识、外部手工污染环境等仍需披露。既有失败记录保持原样。

## 3. 开发记录

### 2026-09-10 — 会话命名修复合入集成基线（testing）

- 本轮目标：按用户“合入啊”推进已验证核心修复到 fork/integration，不恢复已暂停的边界扩展。
- 完成内容：完整修复提交为 9493456fb；合并本地集成 754c1efff，保留上游扫描器消息流、sidecar 更新及标题搜索优化。
- 代码或文档变更：扫描器抽取后的状态继续传递 messages；等长原生改名强制重读规则移到现有 cache 调用点。集成中 f9f4855e7 的旧忙碌状态抑制实现被已确认 D-004/005 的 30 秒活动窗口替代，清除旧私有 map/模块；对应准入回归由已登记的 Claude 活动窗口与 relay 测试覆盖，不叠加两套规则。注册表保留双方接缝及检查，索引重新生成。
- 验证证据：9493456fb 提交 Hook 全部通过；合并后类型、注册回归及门禁正在重跑。此前真实 CLI 的 8 个核心检查点属于合并前冻结构建，不冒充新基线 UI 证据。
- 未解决问题：尚未 push、创建 PR 或合入；集成工作区原有未提交文档不纳入本提交。
- 下一步：完成合并后验证并通过 PR 合入，保留集成工作区改动；不安装或重启日常 App。

### 2026-09-10 — 按用户要求先测核心主流程（testing）

- 本轮目标：先跑通真实Claude/Codex启动、Provider名称读取和Top/Workspace左侧/普通Dashboard一致显示、原生改名同步。
- 完成内容：暂停设置、历史、分屏、搜索等边界扩展；真实Codex正常启动复现内部标题任务夺身份/污染prompt，保留原始Hook入口证据，补齐SessionStart与后续事件保护后重建复验。
- 代码或文档变更：TC-266；shared normalizer与main remote既有接缝复用严格标题模板判据，阻止无transcript的新Start覆盖已有主身份，并保留已识别标题任务的短小listener私有记录；无新DB/RPC/wire。保留此前修复与原始FAIL。
- 验证证据：同一新构建两次独立运行，真实Claude print命名/改名4检查点PASS，真实Codex交互启动/改名4检查点PASS；Codex内部B三条真实Hook全部拒收，338采样错误身份0，原生index与最终三面截图已独立核对。88文件844通过/9跳过、9组注册检查与tc/架构/fork/docs/lint/本地化通过；证据在 `.docs/session-name-core-ui-validation/2026-09-10/`。两轮RED及脚本/环境失败保留，不冒充一次全绿运行。
- 未解决问题：Activity原始任务关键词搜索未命中先记录deferred；其他未验边界不阻塞本轮核心执行，但不改记PASS。
- 下一步：核心命名验证已完成并交付截图/报告；不恢复已暂停的边界扩展。Claude交互onboarding不在本轮PASS内；当前未提交、合入或安装。

### 2026-09-10 — Activity 公共命名与历史身份（testing）

- 本轮目标：补 TC-245/247 的实际 Activity 消费链，覆盖只改名、同 pane 换会话和关闭生成设置，保留任务/状态预览。
- 真实失败续修：隐藏App第三轮13个检查点通过后，A4暴露同状态换SID仍复用main旧时钟，Activity把B去重后显示A。省略timing的builder测试没有覆盖真实入口。已保存原始FAIL并补HTTP、携旧timing、重复B及实际IPC→挂载Activity回归；修复main状态时钟与旧host兼容，源码回归15项通过，重建UI验证中。
- 完成内容：Activity 订阅公共精确身份名称，复用同一候选排序；agent-session 保留分离的 native/generated/container 字段，证据变化使投影失效。历史保存自身可选命名身份；明确 SID 替换即使状态相同也封存旧记录、重置状态时间、不沿用旧实时名；legacy 缺证据不猜当前 SID。原历史上限不变，不新增命名持久化系统。
- 代码或文档变更：逻辑位于 session-names owned 路径；Activity、状态构建器、共享可选历史类型及 paired equality/publication 为登记接缝。同步 TC-245/247 的入口、设置和来源断言。
- 验证证据：首批挂载实际 store/Hook 的 4 个反例全部失败；补测 A done→B done 再发现 1 项真实失败；对照 TC-245 又发现关闭生成设置仍派生的反例。逐项修复后扩展回归与隐藏 App 运行中，最终结果见本轮 Test Run 和 `.docs/session-name-activity-ui-validation/2026-09-10/`。
- 未解决问题：不能把单函数或直接完整状态输入的通过当真实入口证明；首版分屏测试使用错误 layout children/sizes，被 typecheck 发现后改为现有 first/second/ratio。UI 仍为隔离 Provider 格式文件/HTTP Hook，不等同真实 Provider CLI、真实 SSH 或用户安装包。全量消费矩阵仍未完成。
- 下一步：冻结源码独立重建、完成 Sidebar Activity/legacy 整页有界验证，保存每次失败与修后证据；门禁完成后继续剩余入口。未提交、合入、安装或重启用户 App。

### 2026-09-10 — 通知事件身份与一次性名称快照（testing）

- 本轮目标：补 TC-247 的通知消费链，测试必须穿过真实入口和持续投影失效，不能把直接注入完整状态的单测当验收。
- 完成内容：renderer 通知复用公共候选排序与执行 host 读取，新增可选 sessionTitle，main 统一 desktop/mobile title，保留正文、状态和通知 ID。冷读复用在途 I/O，事件快照单独保留一次结果；Tab/cache 的 ABA 过期保护不撤销。1500ms 超时发送捕获的 fallback 一次，未读仍先发生。
- 代码或文档变更：新增 owned notification/read-snapshot 模块与测试；通知派发/格式化/类型窄接缝。本地 IPC、paired store-patch 显式携带已接受事件的 providerSession；direct SSH 只取同 agent 已接受状态。共享 ParsedAgentStatusPayload 白名单未放宽，未新增名称数据库/编辑RPC。接缝和额外回归已登记。
- 验证证据：首批6项5FAIL，补边界后发现无ID借旧generated、BEL缺名；分屏夹具错误单独修正。真实 Gate ABA 反例从 Codex A 错误回退到正确事件名；当前 A cache/Tab 保留新结果。tc 揭示原快照无身份，本地 IPC/paired 两条生产入口均FAIL后修复；process-exit丢名另1FAIL后修复，增加过期/不同Provider反例。最新完整8组96/94/14/12/102/64/23/187通过、tc/type-aware/全部门禁通过；changed-quality的457分支变更文件三类0新增。新独立构建1场景34.2秒、6检查点/6图PASS，五次真实事件snapshot含SID/path并到main mobile replay；主流程目视原生“继续”和ABA图，独立重算21141源码/952产物，runtime与产物0差异，仅强化测试有test-only漂移。
- 未解决问题：初版测试传完整 AgentStatusEntry 绕过 producer 字段筛选，是测试遗漏；单独 mock resolver 没覆盖 Gate 失效也是遗漏。新增字段是快照不是新身份权威；未证明真实Provider准入、所有profile/host隔离或完整消费矩阵。本次隐藏App仍使用Provider格式fixture，禁用原生通知 transport，不算系统横幅/声音/真实手机验收。
- 下一步：继续 Activity 等未完成消费者。`.docs/session-name-notification-ui-validation/2026-09-10/final-report.md`已生成，render/validate均exit0；主流程回读报告、三轮清理记录和validator。三个私有App均exited，profile/home/repo已清理、ownSurvivors0；未安装/重启日常App、未提交合入。UI前两轮采集器误读dismiss帧和unread/quiet窗口时序错误均保留，不算产品FAIL或掩盖为首轮全绿。

### 2026-09-10 — 已确认原生名投影仍被输入安静调度阻塞（testing）

- 本轮目标：跟进History续修隐藏App中“History已改名、Top仍旧名”，不能仅验操作弹窗而漏掉用户要求的跨入口一致。
- 完成内容：主流程目视C2发现不一致，执行者回读22个稀疏样本确认14.688秒内slot持续旧值，真实reader已返回新名且身份未换。现cache通知通过已有快照立即投影当前host/identity，沿用绑定校验和Tab setter；文件I/O仍走原批量/TTL/idle调度。
- 代码或文档变更：`ai-vault-tab-title-sync.ts`、`AiVaultTabTitleSyncGate.tsx`既有接缝；新增owned cache投影测试，ABA回流用例接入新getter；TC-234/246增加持续操作中Top/History联合断言。
- 验证证据：local/ssh两条反例修前全FAIL；修后相关3文件36项通过，覆盖其他host、A换B、unavailable保留、cleared合同和旧响应回流。完整注册7命令69/14/12/92/64/23/187通过，tc/type-aware、架构/fork/docs/max-lines、4本地化通过；changed-code-quality的442分支变更文件三类0新增。新构建1场景41.3秒、28检查点/28图PASS；H2在History新名后立即要求Top同名（1秒上限），连续操作及最终仍一致，7条已新名状态中旧Top异常0。主流程目视C2/H2T并重算52源码hash一致；H5独立普通Refresh、两弹窗、父子隔离及取消无副作用也通过。
- 未解决问题：旧构建27项PASS外补H2T FAIL、整体FAIL，原截图/时间序列保留在attempt-04；前3轮测试脚本/数据错误与H2T产品问题分别记录。最终输入是Provider格式文件/HTTP身份fixture，非真实CLI；全入口、真实Provider准入、跨host/profile及生产包仍未完成。
- 下一步：继续通知/Activity等会话标识消费面与真实Provider/多host验收。五轮私有App/profile/repo已清理、ownSurvivors0；未提交合入、未安装或重启日常App。最终报告位于`.docs/session-name-history-actions-ui-validation/2026-09-10/final-report.md`。

### 2026-09-10 — History 操作、子日志隔离与无Tab独立刷新（testing）

- 本轮目标：覆盖TC-234/243/246遗漏的History删除/接续旁路和Provider改名，不借其他消费者的读取制造通过。
- 完成内容：操作显示接公共排序，保留原始ID/path；共用父SID的子日志不能读写父slot。真实子日志侧车name补可选native证据，旧title不变。History新scan发现改名时通过公共exact reader重新确认，保留较新direct cache与在途已确认名，不把扫描直接视为较新结果。
- 代码或文档变更：History三个消费接缝、Claude subagent scanner窄接缝及owned身份/证据函数；公共store seed增加去重重确认；扩充真实hook/cache/action与临时文件链测试，更新TC-246约束和全量验收账本，登记fork/架构scope。
- 验证证据：History action/父子缓存6项修前全失败、相关19项修后通过；真实子文件3项中1失败后修复、相关17项通过；无Tab刷新2项失败后修复、相关26项通过。完整注册7命令67/14/12/92/64/23/187通过，批次交叉不相加；tc、跨层测试专用tsc、定向type-aware、架构/fork/docs/max-lines和本地化均通过。跨层测试最初放main触发TS6307，迁到既有e2e unit目录并新增独立类型门禁，未删断言或放宽生产tsconfig。隐藏App新构建测试在2026-09-10证据目录进行中，未提前声称通过。
- 未解决问题：本轮代码门禁已全部通过，完整changed-code-quality相对`98b0c329ff39`检查441个分支变更文件、三类0新增，摘要见UI目录`evidence/main-validation.json`；仍待完整UI报告。通知/Activity、其他消费面、真实Provider ownership、跨host/profile、新旧端和生产包验收仍未完成。
- 下一步：完成History真实菜单/取消/子日志/独立刷新验收，若失败继续定位；再补通知与Activity事件时命名。未提交合入、未安装或重启日常App。

### 2026-09-09 — 分屏新PTY就绪后选择状态未同步（testing）

- 本轮目标：跟进本轮隐藏App B2I新增失败，不能用额外点回A再点empty的通过掩盖初始化错误。
- 完成内容：真实Split后10个自然样本跨度944ms，两个PTY已存在、manager/document均选empty，但store/Top仍A。源码中首次persist在新PTY未就绪时规范到旧A，后续layout binding仅补PTYmap。现于同leaf、同numeric pane lifetime仍被manager选中时，同步已有选择；不调用focus，不把迟到的非当前pane重新选中。
- 代码或文档变更：新增owned `session-name-bound-pane-selection.ts`，在`use-terminal-pane-layout-bindings.ts`登记窄接缝；补真实Hook、实际Layout store和Name Gate的初始化/迟到测试，登记fork及架构scope。
- 验证证据：4条新测试修前local/remote形式2 FAIL、2 PASS；修后含PTY spawn/leaf/binding/cache的10文件68项通过。测试首次误选未安装的jsdom导致worker启动失败，改用仓库已有happy-dom，不安装新依赖，该次不记产品反例。完整注册6命令55/12/92/64/23/187通过；tc、架构/fork/docs/max-lines、本地化及定向type-aware/React Doctor通过，完整changed-code-quality相对`98b0c329ff39`的429个分支变更文件三类0新增。新独立构建两场景64.1秒通过：25个UI检查点PASS、2项NOT RUN；Split无需额外点击，33条自然选择样本无不一致，主流程目视B2I与B3R并重算37源码hash均匹配。
- 未解决问题：旧构建24项PASS外另有B2I FAIL、2项NOT RUN，整体FAIL历史保留；旧B2I仅有state时间序列没有精确时刻截图，不能补造。新B2I已有当时截图通过。本轮仍是Provider格式文件/HTTP身份fixture和真实IPC受控交付，不是真实CLI；可信live无人工名、真实sleep场景未运行。真实Provider/全入口/host/安装包总验收仍未完成。
- 下一步：继续未统一的通知/History操作旁路及真实Provider/多host验收，再验证新生产安装包。两个隔离App与profile/repo已清理、残留0，用户App未安装替换、未重启；未提交或合入。

### 2026-09-09 — 绑定代次与公共缓存迟到回流（testing）

- 本轮目标：落实 TC-243/244 的真正换会话、ABA、分屏与断联后更换反例，不把 renderer 保护当成上游身份准入正确的证明。
- 完成内容：请求绑定选中 leaf 的 PTY/generation，每个同步观察到的绑定变更使用独立代次；新身份立即撤旧 native/manual 及无归属的旧 generated。空 shell、歧义 split、已移除 leaf、另一 Provider 不能继续借旧身份。库存缺失保留已确认名并记住最后绑定，直到出现明确替换证据。
- 代码或文档变更：复用既有请求收集、sync、Tab setter；新增 feature-owned 绑定跟踪和反例。公共 cache 增加按 identity 废弃未完成读/TTL 的操作，保留已确认记录；旧读不再发布，新读走正常解析。Gate 接入该操作，不增加 RPC 或持久化字段；登记 store/layout 类型依赖。
- 验证证据：最初 6 条绑定反例全失败；随后旧 generated、其他 Provider/歧义 split/移除 leaf、真实公共 cache ABA、库存缺失后再换 pane 各反例逐项失败后修复。绑定与旧同步 3 文件 41 项通过；完整注册 6 命令通过（51/12/92/64/23/187，交叉不相加），`pnpm tc` 通过。新测试 settings 类型错误已纠正；fork 依赖注册门禁曾报 3 项缺失，补登记后通过。架构、fork/docs、max-lines、本地化三门禁通过；changed-code-quality 相对 `98b0c329ff39` 检查426个分支变更文件，三类0新增。test-only fixture 按既有命名规范改名后，绑定/cache 3文件28项再通过，不新增本地化排除。
- 未解决问题：当前冻结源码的隐藏 App 测试在 `.docs/session-name-binding-ui-validation/2026-09-09/` 进行，尚未取得本轮 UI PASS；上一轮 18 项截图对应旧构建，不能覆盖新增绑定实现。上游准入、真实 Provider、其他消费面/host 和生产包仍未完成。
- 下一步：隔离 UI 实际分屏、A→B 与同路径 ABA 迟到验证，检查 Top/Sidebar 中间态；失败继续修并重建。未安装或重启用户 App，未提交、合入。

### 2026-09-09 — 人工候选投影不等待后台扫描（testing）

- 本轮目标：跟进隐藏App严格U1的Top/Sidebar不同步，区分数据到达、显示投影和测试预期问题。
- 完成内容：不同容器/人工文字暴露旧测试假通过风险；同构建自然计时确认旧U1会收敛而非永久丢名。另以canonical已通知且idle未释放的反例证实显示更新被后台扫描阻塞，复用原投影逻辑改为通知时即时更新，不新增存储、RPC或命名系统。
- 代码或文档变更：`ai-vault-tab-title-sync.ts`及其测试、全量推进Test Run、本Journal；生产输入冻结后交隔离构建复测。
- 验证证据：新反例23项中1 FAIL，修后相关6文件39项通过；完整issues-board注册6命令通过（31/12/92/64/23/187，批次交叉不相加）；类型、代码质量三类0新增、max-lines、fork与架构门禁通过。最终冻结e2e构建40.4秒场景通过，18个核心DOM/稳定截图检查点PASS，2项NOT RUN；主流程目视Top/Sidebar/U1/Dashboard，详情见全量Test Run及`.docs/shared-session-names-ui-validation/2026-09-09/`。
- 未解决问题：原有15秒authority轮询仍可能延迟人工候选到达；不能将独立idle反例说成旧U1全部延迟的根因。全量未完成项仍按Test Run，不安装用户App、不提交或合入。
- 下一步：继续未覆盖消费面和身份代次，再做真实Provider及新生产包验收；本轮测试格式文件不能替代这些项。

### 2026-09-09 — 隐藏App发现等长改名缓存缺陷（testing）

- 本轮目标：让真实读取与最终DOM验收发现单测没有覆盖的错误，失败后继续修复。
- 完成内容：五入口初始自然读取形成证据；Claude等长重写改名在API层仍旧值。独立文件反例复现mtime已变/size相同时的缓存问题，修为仅真实增长才追加解析；不靠换成append把失败抹掉。
- 代码或文档变更：既有session-scanner-parse-cache.ts增长条件、feature seam/architecture登记、provider-name-file-chain.test.ts及本轮Test Run。
- 验证证据：[全量推进记录](tests/runs/2026-09-09-全量命名验收推进.md)：新3项1红，修后含缓存/persist/多Provider的7文件73项通过；隔离旧轮S3失败与append成功分别保留，最终新构建复测进行中。
- 未解决问题：第二轮脚本把absent误期望manual回退，已明确归为测试预期错误并纠正计划；缺少原重写现场stat不补造；Provider格式文件/HTTP身份fixture仍不是实际CLI或用户安装包。全量剩余清单仍未完成。
- 下一步：按修正后的四态预期重新构建/采证，核验等长重写、append、缺名保留及初始无名manual回退，不预记最终PASS。

### 2026-09-09 — 公共名称读取、History与Dashboard续修（implementing）

- 本轮目标：回应反复漏测的问题，补实际写入和消费者反例，不再只测公共排序。
- 完成内容：修renderer低信息旧generated与容器标签阻断；公共renderer读取/订阅复用64条分host批次，Issues退出私有显示请求与缓存；History搜索/主行/拖拽、Dashboard自身pane接同一缓存。修并发新path被吞及无原生名却按5分钟轮询；保留旧人工兼容和幽灵过滤。
- 代码或文档变更：`src/renderer/src/session-names/`、对应title gate/History/Dashboard/Issues seams、renderer写入三处、registry/architecture窄范围登记与Test Run。batcher仅推广输入类型，不改变批次上限与host调度，由原行为测试替代该文件byte-parity pin；没有新增人工名持久化或RPC。
- 验证证据：[全量推进记录](tests/runs/2026-09-09-全量命名验收推进.md)：History旧3项2红、Dashboard旧2项1红、path补全8项1红、缺名轮询22项1红、index兜底2项1红均先复现；扩大23文件153项通过；tc、fork、架构、max-lines、diff及四项本地化检查通过。changed-code-quality三类0新增，issues-board注册6条命令全部通过（批次不累加）。新隔离UI报告进行中，不预记通过。
- 未解决问题：History删除/接续/子行、Activity/通知/其他消费者仍有旁路；同scope全身份、真实切换与ABA/PTY代次未完成，30秒Claude启发式不是全量归属保证。本轮UI采用格式fixture走真解析链，不能冒充真实CLI或用户安装包。
- 下一步：冻结当前构建做hidden Electron证据，再按剩余清单继续修复；不把151项或局部界面PASS当完整交付。未安装、重启用户App、提交或合入。

### 2026-09-09 — 恢复完整命名要求与验收（implementing）

- 本轮目标：回应用户对未按要求实现/测试的质疑，按已确认REQ-025/026/028继续实施，保留完整目标，不把阶段通过当最终交付。
- 完成内容：规格撤出新人工名存储/迁移；公共排序、候选质量、顶部投影修复。Claude/Codex原生证据与首任务分开，经缓存、worker、validator、slot及workspace恢复保留；旧人工名只作兼容候选。Dashboard补同身份校验，合成子会话不继承父名。
- 代码或文档变更：公共session-names与main/session-names、既有读写/解析/组件接缝，登记fork边界；不新建人工名数据库/RPC，不改Provider运行数据。旧混合parse cache提升缓存版本，旧wire title保留，证据为可选字段。
- 验证证据：[全量推进记录](tests/runs/2026-09-09-全量命名验收推进.md)：旧18项13红、parser7项6红、Dashboard3项2红均记录；扫描/命名104文件706项、Dashboard与既有身份保护12文件93项、Issues注册检查46文件186项分别通过（不相加）。实际格式文件和实际store序列化链已测；类型、fork/架构/文档、max-lines、本地化、changed-code-quality均通过。
- 未解决问题：renderer旧提前保护、共享读取/订阅、Issues/History私有读链、真实撤销、真实身份准入及ABA代次、全消费面、default具体归属、生产包端到端仍未完成；前一轮新包已落后于工作区，不能安装它后声称完整修复。
- 下一步：继续逐项修复全量清单，不把706项或任何局部PASS当完整验收；当前App未替换、未重启、未合入，保持implementing。

### 2026-09-09 — 截图中顶部与左侧标题分叉修复（testing）

- 本轮目标：针对用户截图中顶部“继续”/左侧“Read prior Orca session”等不一致，找到首次丢失 Provider 名的显示环节，不用身份保护 PASS 代替命名验收。
- 完成内容：只读核对两条真实 Codex 的 index、SQLite name、Orca aiVaultTitle、Issues provider_title，原生名已经正确读入。确认 TabGroup 重建 TerminalTab 时漏传 aiVaultTitle，TabBar 二次解析转而选择 generatedTitle；补齐该字段，并用 backing terminal 的显式 null 防止复活滞后镜像。
- 代码或文档变更：useTabGroupItemProjections 接缝、feature-owned 回归、fork 注册；不改 Provider 数据、Hook、DB、RPC 或命名排序，不新增 Issues 命名逻辑。
- 验证证据：[顶部名称投影执行记录](tests/runs/2026-09-09-顶部名称投影修复.md)。先复现 4 项红测（含截图两个精确文本），修后新 7 项及相关 39 项共 46 项通过；隔离真实 UI 回放三检查点全部通过，已截图核对左右两条同名。类型、注册检查、架构、文档及本地化门禁通过；新 production 包与 860 个 renderer 资源逐项核对一致。
- 未解决问题：全候选 Provider 第一排序、原生/派生证据分层、default 行具体归属与全消费矩阵尚未验收。用户当前 App 无 CDP，未动其窗口或进程；未将本次修复安装到用户 App。
- 下一步：等待用户确认重启当前 App 后替换新包；保留隔离回放、production 包完整性与用户实时 DOM 的证据边界。全量命名方案仍未完成。

### 2026-09-09 — 生产包身份保护验证（testing）

- 本轮目标：按用户“那你打包测试吧”及追加“打完包 替换安装 测试”，生成当前修复的macOS arm64包，替换本地安装，再从真实app.asar回归；不合入或远端发布。
- 完成内容：生产包已构建并替换到Applications；旧主App退出，旧包备份，常规profile新App已后台启动，未停止终端daemon。修复.docs证据会被打包的真实遗漏；Codex guard独立解包的初判被包体事实否定，已撤掉多余配置/断言，guard实际在main chunks中。
- 代码或文档变更：electron-builder增加.docs排除并登记fork接缝；新增验证产物包边界测试与本轮Test Run。未改身份/名称运行规则。
- 验证证据：[本轮执行记录](tests/runs/2026-09-09-打包身份保护验证.md)，过程位于`.docs/packaged-owner-ui-validation/2026-09-09/`；既有开发构建PASS不代替本轮包验收。
- 未解决问题：安装路径的Codex真实UI回归尚在进行；本轮不重跑Claude全链。
- 下一步：完成已安装包的Codex C1～C4并记录结果与隔离资源清理。

### 2026-09-09 — 修复Codex嵌套Hook抢占（done）

- 本轮目标：修复已实证的独立exec B污染，回归真实subagent和同pane正常重开。
- 完成内容：生产端在HTTP/spool前过滤独立B的完整Hook；检查中发现宿主可能继承外层线程标识，继续补齐新PTY环境清理。最终真实C1/C3/C2/C4均PASS，正常主会话/原生子Agent不误拦，同pane真实退出后可立即新开。
- 代码或文档变更：Codex managed Hook接缝及src/main/codex-session-ownership、local/daemon/relay新PTY接缝、CLI include、fork registry/policy、REQ-028、D-006及TC-261～263；不改Claude窗口、DB/wire或原用户会话/运行包。
- 验证证据：[本轮Test Run](tests/runs/2026-09-09-Codex嵌套调用修复.md)。本轮65个测试文件432通过/4跳过，类型/lint/本地化/fork feature/全量架构门禁通过；真实C3 174、C2 324冻结采样异常0。主流程复核13项源码/build指纹与C2/C4截图；36个测试进程exited、隔离profile删除、精确路径进程残留0，报告render/validate通过。
- 未解决问题：旧/其他Codex版本缺失调用者变量、自定义wrapper重注入变量、真实SSH/Windows及全部交互式TUI未覆盖；首prompt仍被现有槽标成provider，本轮不冒称完成原生人工名与全量命名统一。
- 下一步：本修复切片完成，未提交、合并、替换用户包；后续命名来源/排序仍按主方案另行推进，不将本条done作为整个Issues需求完成。

### 2026-09-09 — 真实Codex身份与名称验证（testing）

- 本轮目标：按用户“测啊”补Codex真实主/子会话验证，不将Claude或合成兼容测试视为Codex真实通过。
- 完成内容：完成正常Orca入口的真实Codex A→spawn_agent→独立exec B链路，预检/C1/C3通过，C2产品FAIL。原生子任务160份冻结采样异常0，独立B的201份冻结采样97份异常；A后续恢复不能抵消中途抢占。
- 代码或文档变更：新增本轮Test Run及忽略目录中的测试脚本/证据；保留既有Claude保护和上一轮证据，不改产品、不替换用户运行包。
- 验证证据：见[Codex Test Run](tests/runs/2026-09-09-真实Codex身份与名称验证.md)。29条原始Hook、364份总采样、4张hidden截图；主流程独立复算异常并核对8项源码/build指纹。真实子session_meta标v2，以落盘事实而非features预检推断代际。测试App及记录中的32个PID均exited，私有profile及认证副本已删除；用户App仍运行。
- 未解决问题：P1独立B无agent_id却继承同pane/token，顶替主身份/父rollout并污染标题槽，A的运行时attachment脱离；持久issueId未变。A可见名曾退化为短ID，末帧DOM仍detached，未证明所有界面恢复。原生改名、其他命名消费面、SSH/relay均未覆盖；不能把Claude窗口直接视为Codex规则。
- 下一步：以真实FAIL作为Codex独立调用保护的后续修复回归，同时验证合法换会话；本轮只完成用户要求的真实测试，不擅自新增Codex时间窗或身份系统，不发布“全部修好”的结论。

### 2026-09-09 — 真实Claude链路验证（testing）

- 本轮目标：响应用户“真实验证”，补足昨日真实App加合成Hook的证据边界，不更改30秒启发式契约或扩做全量命名。
- 完成内容：从正常Orca入口启动全新真实A，实际Bash调用headless B，再调用真实Agent；最终第七轮1/1 E2E、C1/C2/C3全部PASS。B完整序列在前一A活动后5,302ms内完成；138次连续审计采样异常0，main/renderer身份、父路径、Provider名、DOM行及Issues attachment稳定。只修测试采集、HOME隔离、B认证及选择器，没有改变产品契约。
- 代码或文档变更：本轮只新增Test Run、Journal及忽略目录中的测试脚本/证据，产品源码保持昨日版本；没有恢复原Provider会话或替换用户运行包。
- 验证证据：见[本轮Test Run](tests/runs/2026-09-09-真实Claude活跃窗口保护.md)；9项源码/build指纹一致，三个hidden CDP截图及A/B原生custom-title均保留，主流程独立核对141份总快照并查看C2/C3图片。最终App及profile已清理。首轮测试新会话曾落入默认Provider项目目录，已精确移入可恢复的隔离证据，未清理其他会话；前六轮环境/采集问题全部留痕。
- 未解决问题：30秒外误放、快速重开误拦、其他同ID/OSC/异步候选与全量命名仍为已知边界；本轮不覆盖真实SSH或交互式TUI，不把离散采样说成每帧证明，全量架构基线未解决。
- 下一步：等待用户后续部署/合并指令；本次真实验证已完成，不擅自提交、合并或替换用户运行包，整个Issues需求不标done。

### 2026-09-08 — Claude活跃窗口实施与验证（testing）

- 本轮目标：执行用户“改完验证，有问题接着修”，实现D-004选择的首期保护，不做全量命名重构。
- 完成内容：在独立`feat/claude-owner-window` worktree实现公共30秒窗口，接入shared早期准入、main远端入口及main/relay接受后计时；生命周期清理/移位复用原state，重放不续期。仅SessionStart版本红测仍被下一次prompt绕过，已按D-005补齐同窗后续事件。
- 代码或文档变更：新增领域中立`src/shared/claude-session-ownership/`及main集成测试；5处生产接缝均登记fork registry/policy。更新首期/主方案、REQ-028及TC-255～260；原工作目录的Goal/UI改动保持不动，没有恢复旧Claude会话。
- 验证证据：见[本轮Test Run](tests/runs/2026-09-08-Claude活跃窗口保护.md)。仅启动版本5条有1条后续事件失败，修复后最终142文件1201条通过/9跳过；类型检查、修改文件lint、四项本地化、fork feature/docs及Issues范围门禁通过。最新bundle后台App1条E2E/4检查点通过，9项源码/build指纹一致；两条并发超时用例单独及整组有界重跑通过，未改阈值。
- 未解决问题：全量架构门禁340条范围违规均来自本轮未改路径，未扩大白名单；长静默误放、快速重开误拦、同ID路径/OSC/异步标题和完整命名工程仍未解决。
- 下一步：由用户决定是否合并/启动到实际使用环境；全量架构基线、严格身份/同ID污染与后续命名工程另行处理。不擅自合并/提交/替换用户运行包，整个Issues需求不标done。

### 2026-09-08 按用户选择更新活跃窗口首期方案（designing）

- 本轮目标：按用户“就按这个来吧。更新一下方案”记录Cloud活跃窗口路线，不实施产品代码。
- 完成内容：新增WP0a模块稿并接入命名主方案，明确近期在位活动拒绝不同ID的SessionStart，静默/无在位者沿用原逻辑；W及冷恢复缺时策略未定，补listener私有时间状态而非新DB/wire。保留非启动事件旁路、长静默误放、快速重开误拦和同ID候选污染风险；严格G0/WP0不再阻止首期准备，但仍约束全量完成。
- 代码或文档变更：首期方案、命名主稿、REQ-028阶段边界和D-004；通过仓库生成器刷新docs/issue/README.md，未手改索引。正式用例保持needs-update，原始采样调研、脱敏证据、产品源码及他人Goal/UI修改均未改动。
- 验证证据：4份文档49处本地链接及锚点存在、围栏配对检查通过，git diff --check通过；刷新索引后fork-docs门禁通过。validate_task.py仍报既有TC-201/202表格定义识别问题，未计为通过。本轮未运行产品单测、typecheck或App；首次pnpm文档检查触发环境自动依赖准备及node-pty构建脚本，非产品构建/实现验收，后续直接运行同一仓库文档检查器。
- 未解决问题：W和冷恢复缺时策略、实际时间接缝及注册范围待实施前确定；启发式规则不证明存活/角色，不能以单次headless不跳名宣布完整隔离。
- 下一步：用户另行授权实现后，先明确上述参数，再落实既有listener接线与规则/完整序列分层验证；不自动扩大到新绑定服务或全部命名改造。

### 2026-09-08 评审后前置身份并撤出人工名工程（designing）

- 本轮目标：按用户明确“方案”的授权，修订命名方案，不实现产品代码。
- 完成内容：G0补实际归属证据、WP0先处理主pane绑定和内部调用；区分原始观察、已确认绑定与角色可见性。保留有效异步守卫和合法worker展示；原WP2公共人工名存储/RPC/迁移撤出，Provider四态与提示词质量规则保留，旧人工数据/旧端生产路径显式兼容。按方案写作与task-leader流程同步需求和D-003，正式Test Case只标记needs-update，不推进测试阶段。
- 代码或文档变更：命名方案、REQ-025/026/028及用户动线、旧技术说明提示、两份测试规格状态/影响说明、本Journal；通过仓库生成命令刷新需求索引，未手改索引。产品源码、配置、运行数据和Provider文件未改。
- 验证证据：6份相关文档链接/围栏及关键合同检查通过，29个REQ与24个原命名TC编号保留且唯一，`git diff --check`通过；生成索引后`pnpm check:fork-docs`通过。通用`validate_task.py`仍报TC-201/202未定义：已核对两条均在当前及HEAD的既有表格中，校验器只按H2～H6标题收集定义，不识别表格，属规格格式与工具识别不匹配；未记成该校验通过。未执行产品单测、typecheck、构建或App操作。
- 未解决问题：G0的各Provider/入口证据与具体wire补充仍待实施前核验；正式用例需按新矩阵同步，旧人工来源缺席的跨端兼容及旧字段完全退场未解决，不宣称全局命名已经修复。
- 下一步：后续进入实施前先完成G0和feature范围登记，再做WP0/WP1与消费面接线；进入测试阶段前同步正式用例。此次方案维持reviewing，文档交付不等于产品done。

### 2026-09-08 补齐有效摘要优先的准入规则（designing）

- 本轮目标：按用户确认补充提示词派生名与实时标题的顺序和实现边界，继续修订方案，不实施产品代码。
- 完成内容：有效摘要排普通实时标题前；纯确认/继续/注入输入跳过；短有效任务不误删；同session保持首次有效任务摘要。可靠Provider正式名经终端传输仍归第一层，普通OSC不能按“像名字”升级。复用现有派生、注入、短回复和实时过滤，不增LLM、DB或RPC。
- 代码或文档变更：当前方案、REQ-025、TC-245及TC-251～254、本Journal；产品源码、运行数据未改。
- 验证证据：回读现有deriveGeneratedTabTitle、实时标题过滤及Activity短回复规则；4份文档31个相对链接检查通过，围栏平衡，TC-231～254共24例连续且无重复，`git diff --check`通过；未执行功能测试或App操作。
- 未解决问题：这些质量门槛尚未实现；确定性规则不等于完整语言语义理解，需按短有效任务和明确命名反例验收。
- 下一步：在WP1实现并验证共享候选准入，其余命名归属和跨端工作包保持不变。

### 2026-09-08 按用户确认修订Provider优先方案（designing）

- 本轮目标：修改方案而非产品代码；同时考虑统一规则、Issues职责和实现成本。
- 完成内容：Provider第一，人工备用名第二，保留稳定prompt/可信实时等回退；左侧/Tab/仪表盘/通知等同一结果。命名迁出Issues，复用AI Vault及profile Store，不新增标题DB；全Conversation存储合并另列。新稿替代上一版并同步REQ-025/026和TC-231～250，旧名称数据先复制核验再切读停写。
- 代码或文档变更：新方案、命名验收；旧方案替代提示；需求、现状关联链接、旧技术说明/测试规格提示和本Journal。产品源码和运行数据未改。
- 验证证据：源码基线仍为`cabf7f675e36af68ba95e7b095b695f38bee38f2`；复核现有Store domain/profile字段、AI Vault缓存及Issues写入接口；6份核心文档45个相对链接全部存在、围栏平衡，TC-231～250共20例连续且无重复；现状文档结构校验和`git diff --check`通过。不执行产品测试或App操作。
- 未解决问题：各host装配、WSL/account-home精确scope以及异常主/辅助identity仍需对应工作包核验；未升级端不保证新优先级，旧存储兼容清理另设放行条件。
- 下一步：按WP1～WP4分批实施和验收；名称迁移纳入本次，全会话模型重构不混入；没有实际执行证据前维持proposed/designing。

### 2026-09-08 会话命名现状与统一方案（designing）

- 本轮目标：回答名字有几个来源、谁优先、用在哪里、预期如何修改；只调研与方案，不实施。
- 完成内容：按当前HEAD核实七类语义来源与缓存副本，覆盖Tab/Workspace/Issues/History及Dashboard、Activity、选择器、mobile/headless/structured等旁路；分开正式会话名与容器/任务名，制定来源保留、共享订阅、身份核验和兼容工作包。撤回旧技术说明两节缺乏证据的因果/统计定性，保留历史原文供审计。
- 代码或文档变更：新增现状调研、统一方案与忽略目录中的过程件，更新旧技术说明提示和本Journal；无产品源码变更。
- 验证证据：基线`cabf7f675e36af68ba95e7b095b695f38bee38f2`，开工工作树干净；主干源码回读及有界子代理消费者核实。`validate_research_doc.py`通过（2张Mermaid、59个源码索引）；两份新文档13个相对链接均存在，代码围栏平衡；`git diff --check`通过。本轮未执行产品测试/构建/CDP，不证明App行为已修复。
- 未解决问题：实际异常identity归属需host/launch/事件实证；通用主/辅助身份判别、同host的WSL/account-home歧义和跨端逐类型接线仍需对应工作包细化。旧端无provenance，不能承诺严格原生名一致。
- 下一步：按用户选定的目标范围实施工作包；实施前登记feature-owned路径与seams，之后逐项完成代码与真机验收，不把本文proposed状态转成已实现。

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
