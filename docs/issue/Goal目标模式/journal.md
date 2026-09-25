---
title: Goal 目标模式
slug: Goal目标模式
status: testing
created: 2026-09-05
updated: 2026-09-25
external_ids: []
---

# Goal 目标模式 Journal

## 1. 关键文档链接

| 类型         | 文档                                                                   | 状态         | 说明                                                                |
| ------------ | ---------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------- |
| 需求         | [Goal 目标模式](requirements/Goal目标模式.md)                          | reviewing    | 2026-09-23 新增 REQ-124～REQ-126，修订 REQ-103、106、112～114、121；其余条目状态不变 |
| 交互         | -                                                                      | not-required | 本轮交互示意内嵌方案；没有独立设计事实源，不另建 design 文档        |
| 方案         | [Goal 守卫监工与唤醒兜底修订方案](solutions/Goal守卫监工与唤醒兜底修订方案.md) | completed | 第 3 版：驱动只管机制，守卫一份提示词四种结论，验收清单只做开工对齐；已实施并验证，实施差异见方案 §8 |
| 方案评审     | [修订方案评审报告](solutions/Goal守卫监工与唤醒兜底修订方案.review.md) | completed | 2026-09-23 第 1 版 Claude 与 TRAE CLI 双路评审（2 条 P0、21 条 P1）；第 3 版 Codex 评审（6 高 5 中，结论小改后可实施）；处置均在报告内 |
| 已落地方案   | [Goal 目标管理与交互闭环方案](solutions/Goal目标管理与交互闭环方案.md) | completed    | UI、宿主控制服务、RPC 与草稿仍有效；驱动复用前提与 09-08 实施修订第 4 条由修订方案取代 |
| 历史实现基线 | [Goal 目标模式技术说明](solutions/Goal目标模式技术说明.md)             | superseded   | 保留旧 CLI/插件实现事实与差距；补充宿主命令已支持带参的核对修正     |
| 测试用例     | [功能测试](tests/cases/Goal功能测试.md)                                | reviewing    | TC-344～TC-365 覆盖验收文档、异步草稿、文件查看、草稿删除与 SSH；TC-366～TC-375 覆盖守卫监工与唤醒兜底（REQ-124～REQ-126） |
| 调研         | -                                                                      | not-required | 当前源码事实已归并到技术正文，本次不重复调研                        |
| 历史调研     | [Codex Goal 历史机制对照](research/Codex-Goal历史机制对照.md)          | superseded   | 保留冻结 Codex SHA 的完整参考，不作为当前 Orca 事实                 |
| 历史测试执行 | [验收文档闭环验证](tests/runs/2026-09-08-验收文档闭环.md)              | reviewing    | 自动化、真实守卫及隐藏 Electron 文档流程已验证                      |

| 当前测试执行 | [异步草稿验证](tests/runs/2026-09-12-异步草稿验证.md) | reviewing | REQ-122 自动化、真实 Codex 与独立 App 异步状态验证通过 |
| 草稿删除测试 | [草稿删除验证](tests/runs/2026-09-16-草稿删除.md) | completed | REQ-123 自动化、独立 macOS App 与 loopback SSH 的 9 项检查通过 |
| 守卫监工测试 | [守卫监工验证](tests/runs/2026-09-24-守卫监工.md) | completed | REQ-124～REQ-126：本机 10/10、SSH 6/6 真机检查通过，真实 codex 执行与守卫 |
| 提示词修订测试 | [提示词修订与对话摘要验证](tests/runs/2026-09-24-提示词修订.md) | completed | TC-376～TC-381：本机 Claude 4/4、codex 3/3，SSH 2/2；真机发现 Claude 建议文字被当成草稿，已按用户裁决去掉草稿检查 |

当前处于 testing：2026-09-22 travel 目标事故暴露守卫设计问题，修订需求并出 [守卫监工修订方案](solutions/Goal守卫监工与唤醒兜底修订方案.md)，用户确认后已实施（分支 `feat/goal-guard-supervisor`，未提交）；自动化、门禁与本机、loopback SSH 真机验证通过，见 [守卫监工验证](tests/runs/2026-09-24-守卫监工.md)，待提交与合并。用户 App 装有未合入的热修，按用户要求保留不回退，新实现落地时整体替换。此前 REQ-122、REQ-123 的交付与测试记录不变：交付经 [PR #13](https://github.com/Fartown/orca/pull/13) 合入 `fork/integration`，结果见 [文档文件查看验证](tests/runs/2026-09-13-文档文件查看.md)、[异步草稿验证](tests/runs/2026-09-12-异步草稿验证.md) 与 [草稿删除验证](tests/runs/2026-09-16-草稿删除.md)。

## 2. 决策点记录

### D-012 提示词评审后的用户裁决

- 日期：2026-09-24。
- 背景：复盘 6 个历史目标、4 份执行 agent 对话记录与 92 个普通会话后，发现守卫「读完工具结果」做不到、Claude 记录里驱动消息会变形，续跑消息每轮重发目标原文是截断诱因；评审稿（`.docs/goal-prompt-review/2026-09-24/prompt-revision-draft.md`）提出两个待决问题与逐句改写。
- 备选项：守卫读法——驱动先整理对话摘要，或只在提示词里教守卫按家族过滤；续跑消息——只带目标原文文件路径，或照旧每轮带原文。清单生成——「开工前请确认」里扩充授权类别，或不罗列。
- 最终决定：两个待决问题都按推荐（驱动整理摘要、续跑只带路径）；清单生成里授权类别整句去掉。批注单独点了「真实下单、付款、花钱或积分」，据此守卫 G1 第 5 条「只有用户能处理的事」也不再含「花钱或积分」（守卫自己查证时不花钱这条保留）。
- 原因：用户批注「这个去掉」「都去掉」「按你推荐的来」。
- 追加（同日）：用户对 G1 第 5 条「只有用户能处理的事」批注「删除这条，我希望尽量都由 agent 自己处理」——整条删去，问用户只剩「守卫和 agent 都拿不到、只能由用户本人给的东西」一句，并入第 4 条。
- 追加（同日，真机验证中）：Claude 一轮结束后的暗色建议被读成输入框草稿，驱动连续 3 次不发续跑。备选：让上游屏幕解析标出「只是建议」（改约 6 个上游文件）、驱动按时机推断、去掉草稿检查。用户裁决「不要引入复杂度，不要管用户有没有输入」——去掉草稿检查，只在停在确认框时不发。
- 影响范围：方案 §0、§4.1、§5.4、§5.5、§5.6、§5.7、§6、§8；REQ-124、REQ-125 修订与更正；TC-369、TC-376～TC-381。

### D-011 第 3 版 Codex 评审的用户裁决

- 日期：2026-09-23。
- 背景：Codex 评审第 3 版，结论小改后可实施，列出 11 项问题与 12 条提示词改写；其中第 5 项（恢复依赖面板轮询）与第 6 项（SSH 通知弹在远端）需要新增执行主机恢复扫描与客户端通知监听，超出第 3 版「驱动四件事」的范围。
- 备选项：只修方案内的断点，恢复与通知留到下期；或两项都做。
- 最终决定：两项都做——恢复扫描放在执行主机，覆盖所有进行中的目标；通知由执行主机记录、客户端发出；其余 9 项与提示词改写一并采纳，「试过了」一条改为要求执行 agent 贴出命令与输出；「重启后核对已收到消息再恢复发送」不做。
- 原因：用户裁决「5 和 6 都做，改进方案」；REQ-126 要求目标不得静默停摆，SSH 下用户必须收到非人不可的提问。
- 影响范围：修订方案 §0～§6、§8（C18、F12～F15、U5、§5.4.8、§5.4.9）；REQ-125、REQ-126 修订说明；评审报告新增一节。

### D-010 方案简化为第 3 版

- 日期：2026-09-23。
- 背景：第 2 版为回应评审堆了 10 个模块、12 份提示词。用户逐条纠正：只读与脱敏靠提示词、验收文档在提示词里要求 2000 字以内即可、不设「没变化」计数、执行 agent 不需要轮数时长、守卫与裁判是同一个 agent，并问「你的设计合理吗」。
- 备选项：在第 2 版上继续修补；或回到骨架重写。
- 最终决定：重写为第 3 版——驱动只做本轮结束判断、唤醒守卫、发送、预算四件事；守卫一份提示词，四种结论（等一等、给指示、问用户、完成），完成验收在同一次调用里做；验收清单只做开工对齐，目标已有需求文档时只引用原文条目。
- 原因：用户确认「可以」；第 2 版重蹈了「每个问题加一条机制」的覆辙。
- 影响范围：修订方案全文；REQ-121 写法；评审报告增加「第 3 版的进一步简化」。

### D-009 第 1 版评审意见的用户裁决

- 日期：2026-09-23。
- 背景：第 1 版修订方案双路评审提出 2 条 P0（守卫无强制只读边界、凭证泄露）与 21 条 P1，其中若干建议引入沙箱、脱敏、「N 轮无变化」计数、面板回答通道与复盘预筛。
- 备选项：照单全收评审建议；或按产品本质与用户原则逐条取舍。
- 最终决定：守卫约束靠提示词，不做强制只读与脱敏；不设任何「N 轮无变化」规则；不做面板回答通道，用户在终端直接回答，驱动让位、守卫判断是否已回答；每轮完整复盘，不加预筛；守卫用时计入预算并单独显示；已装热修不回退；每轮给执行 agent 的消息按五块组织。其余评审意见按报告末节的处置表采纳或部分采纳。
- 原因：用户原话「只读这个告诉守卫不需要改代码就行了吧；为什么不允许它改，验收本来就是不那么简单的事情」「为什么老是要讨论没有变化这件事情呢」；执行 agent 会偷懒但不会恶意攻击，且本身以完整权限运行；「没变化」计数是换了出口的空转熔断。
- 影响范围：REQ-105、REQ-124、REQ-125 与产品取舍；修订方案第 2 版；评审报告处置表。

### D-008 验收文档改为四节固定格式并限长

- 日期：2026-09-23。
- 背景：用户指出生成的验收文档太长。travel 目标的文档 17,757 字，通过条件只占 11%；生成提示词要求每份文档都写来源日志、验证方法、证据存放和判定规则，上限 32,000 字，且同时写给用户、执行 agent 和守卫。
- 备选项：只调低字数上限；或改变文档的读者与结构，把通用规则移回固定提示词。
- 最终决定：读者只保留用户和守卫；固定「需要你提供」「开工前请确认」「验收项」「不在范围」四节；待确认问题必须带默认做法；全文目标 6,000 字、生成上限 12,000 字，超限或缺节时自动压缩修复一次，编号不得减少。
- 原因：用户确认「可以，补进方案，数字就按这个」；只调上限会压掉验收项本身，真正该删的是与验收无关的内容。
- 影响范围：REQ-121；修订方案 §5.5.9 与 WP-G1；`src/shared/goals/goal-acceptance-prompt.ts`、`src/main/goals/goal-acceptance-draft-runner.ts`。

### D-007 守卫从完成时的裁判改为每轮复盘的监工

- 日期：2026-09-23。
- 背景：2026-09-22 travel 目标跑了 4 小时 22 分、19 轮，验收一次未跑；第 10 轮因后台 shell 让状态一直是 working，空等 48 分钟后撞时长预算；第 11～14 轮 agent 侧 API 报错被判空转并终结；用户写的目标原文 19 轮未发给执行 agent。用户确认：连续没进展应查原因而不是结束；不要轻易叫人，agent 会偷懒；守卫要有唤醒时机和定时兜底。
- 备选项：在现有规则引擎上继续调阈值、加规则（当晚热修 #2～#5 即此路线）；或让守卫 agent 每轮复盘并决定下一步，驱动只保留机制层。
- 最终决定：按后者修订需求与方案，方案进入评审；评审通过前不改代码。终局只保留 complete、budget_exhausted、aborted，以及目标与验收文档分离，列为待用户确认的建议。
- 原因：规则引擎的判据都是影子指标，删空转提案早已指出「在猜错的地基上挪动阈值」无效；用户 2026-09-09 定下的模型本来就是守卫 agent 加验收文档。
- 影响范围：REQ-124～REQ-126 新增；REQ-103、REQ-106、REQ-112～REQ-114、REQ-121 修订；闭环方案的驱动复用前提与 09-08 实施修订第 4 条被取代；测试用例 needs-update。

### D-006 定向引入上游 import 修复

- 2026-09-16 用户明确批准仅带入上游 `7ec2986fd`，修正 `agent-status-store-snapshot-budget.ts` 的重复类型 import；不执行整批上游同步。
- 源码保持该上游提交的原始内容，仅在 fork 差异预算登记这个文件；下次正常同步包含该提交后移除临时登记。此例外不改变运行逻辑或质量检查规则。

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

### 2026-09-25 不在线的主机不读，草稿按需轮询

- 本轮目标：排查 Issues 离线请求风暴时发现 Goals 的 5 处定时读取在主机离线后照发不误；用户定下项目规则「重连不要自己做，就用公共的；不在线就不读」，按改法一（不改主机、relay 与协议）落地。
- 完成内容：
  - **统一在线判定**：新增 `goal-host-contact.ts`，只组合公共判定：远程 Orca 看 `getReachableRuntimeEnvironmentIds`，SSH 看 `sshConnectionStates` 是否 `connected`，本机总在线。Goals 不探测、不重连。
  - **列表、详情、待确认操作**：主机不在线时不发请求，面板显示已有的「The host is offline.」；恢复联系时立即读一次，再回到原节奏。
  - **草稿**：原来一直每 2 秒读。改为只在主机在线且（Goals 面板打开，或有草稿正在生成）时每 2 秒读；其余时间只在挂载和恢复联系时读一次。点「生成验收文档」后立即读一次，面板关掉也能跟到生成结束并弹提示。
  - **生成进度**：编辑器里每秒一次的 `getAcceptanceDraft` 在主机离线时暂停，已显示的结果保留。
  - **通知**：`GoalNoticeWatcher` 只轮询在线主机；主机恢复联系时立即拉一次。
  - **项目规则**：`AGENTS.md` 新增「Remote Host Reads」。
- 代码或文档变更：
  - 代码：`src/renderer/src/goals/goal-host-contact.ts`（新增）、`GoalDomainSyncGate.tsx`、`goal-editor-drafts-sync.ts`、`GoalNoticeWatcher.tsx`、`src/renderer/src/components/goals/use-acceptance-draft.ts`，及对应测试。
  - 登记：`config/fork-features.jsonc` 的 goals 新增 2 个上游依赖、2 个测试。
  - 文档：`AGENTS.md`；方案「Goal 守卫监工与唤醒兜底修订方案」中通知轮询一句改为只拉在线主机。
- 验证证据：
  - 自动化：新增在线判定 3 例、同步入口 1 例、草稿按需 2 例、通知 1 例；去掉「不在线不读」后同步入口与通知两例失败。Goals 注册套件 37 个文件 259 例通过；`pnpm tc`、`check:fork-features`、`check:fork-docs`、三项本地化检查、React Doctor 通过；`check:code-quality:changed` 310 条与改动前本分支 HEAD 相同（本次文件无新增）；`check:architecture-policies` 7 条 reference-drift 与改动前 HEAD 相同。
  - 真机（隐藏实例；测试版临时叠加 Issues 分支源码构建，以免 Issues 旧的请求风暴拖慢定时器掩盖结果，构建后已撤回）：远程 Orca 在线安静 30 秒草稿请求 0 次（原来约 15 次），杀主机、不可达地址各 45 秒对远程主机的 Goals 请求 0 次；SSH 已连接 20 秒 0 次（原来草稿 10 次），断线 180 秒草稿 0 次、状态 0 次（原来草稿 92、列表 12、状态 6），剩下 7 次列表是通知在读本机。证据在 `.docs/ssh-reconnect-cpu-ui-validation/2026-09-24/evidence/`（`profile-goals-1790303433922`、`drop-1790303661381`）。
- 未解决问题：
  - 完整的「主机推送变化」没有做：Goals 状态由驱动进程直接写文件、SSH 由远端 relay 持有，推送要在三类主机上监视文件并扩展 relay 协议；relay 恢复扫描还依赖客户端来问 `goals.list`。
  - 面板关闭且不是本客户端发起的草稿生成，完成时不再弹提示（打开面板即可看到结果）。
- 下一步：用户确认后提交并开 PR；和 Issues 的 PR #43 合并顺序无关。

### 2026-09-24 提示词评审与修订

- 本轮目标：复盘历史 Goal 与普通 agent 会话，评审提示词是否合理、冗余、够通用；按用户裁决修订并验证。
- 完成内容：
  - **复盘**：6 个历史目标、4 份执行 agent 对话记录、92 个普通会话。更正 travel 事故的两处说法：TOTP 确属非人不可；第 12～14 轮是同一轮被误判结束。
  - **守卫读对话**：改读驱动整理的对话摘要。新增 `goal-transcript-digest.ts` 与 `goal-transcript-entries.ts`，复用原生聊天解码器与 `harness-injected-user-turns`，按字节位置续读，结论生效后才前移。
  - **续跑消息**：只带 `guard/objective.md` 路径。
  - **提示词**：G1、W1、W2、D1 按评审稿修订；D1 删去授权类别；G1 删去「只有用户能处理的事」整条，问用户只限用户本人才能给的东西。
  - **草稿检查**：真机发现 Claude 一轮结束后的暗色建议被读成草稿，驱动因此不发续跑。按用户裁决去掉草稿检查。
  - **发送方式**：改按 agent 提示词投递，整段一次粘贴，避免 Claude 截断。
- 代码或文档变更：
  - 代码：`src/main/goals/goal-transcript-*.ts`（新增）、`goal-mode/cli/guard-materials.mjs`（新增，守卫材料从 goal-loop 移出）、`goal-loop.mjs`、`goal-runtime-terminal.mjs`、5 份模板、`src/shared/goals/goal-acceptance-prompt.ts`。
  - 登记：`config/fork-features.jsonc` 新增 6 个上游依赖与 3 个必需文件、1 个测试。
  - 文档：方案 §0、§2.1、§4.1、§5.4～§5.7、§6、§8；REQ-124、REQ-125 修订与更正；TC-369 修订，新增 TC-376～TC-381。
  - 未提交。
- 验证证据：
  - 自动化：驱动 node:test 133/133；goals vitest 35 个文件 252/252；`pnpm tc`、`check:fork-features`、`check:fork-docs`、四项本地化与两项棘轮通过；`check:code-quality:changed` 本次改动的文件 0 条；`check:architecture-policies` 5 条上游基线差异，与 Goal 无关。
  - 真机：本机 Claude 执行 4/4、codex 执行与口令 3/3，loopback SSH 2/2，见 [提示词修订与对话摘要验证](tests/runs/2026-09-24-提示词修订.md) 与 `.docs/goal-prompt-revision-ui-validation/2026-09-24/`。
- 未解决问题：
  - codex 有一次记录里的首轮消息比发出的长 60 字，原因未查明（那次没有留会话记录）；
  - 守卫补发残缺消息、等外部事件时 wait 没有真机覆盖；
  - `check:architecture-policies` 的 5 条基线差异要等同步上游后消除；
  - 集成分支已前进（#38、#41），提 PR 前需要先合并。
- 下一步：用户同意后合并最新集成分支、提交并开 PR；合入后安装替换用户 App 里的热修。

### 2026-09-23 守卫监工实施

- 本轮目标：按用户确认的修订方案实施 WP-G1～WP-G4，覆盖本机与 SSH。
- 完成内容：驱动主循环重写为「唤醒 → 守卫 → 复核 → 执行结论」，删掉空转、假完成、受阻计数与 20 分钟、5 分钟两个失败出口；守卫一份提示词、四种结论、格式校验与重跑；目标原文还给执行 agent；待答问题保留、只通知一次；判完成后跑用户配置的检查并写入验收结果；执行主机恢复扫描（本机与 relay），relay 借最近的客户端解析终端、重连立即扫描；通知事件由执行主机记录、客户端 `GoalNoticeWatcher` 发出；`worktree ps` 行带 `transcriptPath`（4 处接缝）；编辑器守卫必选、默认另一家；独立 CLI 需要 `--guard`；D1 验收清单改为四节。
- 代码或文档变更：`goal-mode/cli/**`（新增 guard-call、guard-verdict、goal-notices、first-turn 与 guard 模板；删除 goal-claim、tamper-scan 与 4 份旧模板）、`src/shared/goals/**`（新增 goal-agent-run）、`src/main/goals/**`（新增 goal-driver-recovery）、`src/renderer/src/goals/GoalNoticeWatcher.tsx`、面板 4 个组件、4 处运行时接缝、中英文文案、`config/fork-features.jsonc`、`config/architecture-policies.jsonc`；方案 §5.3、§5.5、§8 与测试用例 TC-366～TC-375。未提交。
- 验证证据：驱动 node:test 130/130；goals vitest 37 个文件 260/260（含 runtime 行投影、导出一致性与驱动包端到端）；`pnpm tc` 通过；`check:fork-features`、四项本地化门禁通过；`check:architecture-policies` 仅剩 4 条干净集成分支上同样存在的既有违规；`check:code-quality:changed` 在本次新增行上 0 问题（其余为 fork 既有）。真机：本机 10/10、loopback SSH 6/6，真实 codex 执行与守卫，见 [守卫监工验证](tests/runs/2026-09-24-守卫监工.md) 与 `.docs/goal-guard-ui-validation/2026-09-23/`。真机发现「历史会话」指向 `~/.codex/sessions` 而非 Orca 托管目录，已改为从对话记录路径推出。
- 未解决问题：U1 仅录到 codex 的对话记录（claude 未真机录制）；U3 实测守卫单次 31～37 秒；D1 生成不读 Orca 托管的 codex 会话目录；驱动被 SIGKILL 时在跑的守卫子进程会跑完才退出。
- 下一步：用户同意后提交、开 PR 合入 `fork/integration`，再安装替换用户 App 里的热修。

### 2026-09-23 修订方案按 Codex 评审修订

- 本轮目标：按用户裁决（D-011）把 Codex 评审意见与提示词改写落进第 3 版方案，只写文档。
- 完成内容：唤醒事件只消费一次、守卫给指示即视为本轮结束；待答问题保留且只通知一次；问用户条件改为默认做法与别的路都满足不了目标；结论执行前复核；执行主机恢复扫描；执行主机记录通知事件、客户端 `GoalNoticeWatcher` 发出；会话来源在执行主机解析并透出 `transcriptPath`；预算顺序；`done` 写入 `lastAcceptance`；五字段校验；没有守卫的旧目标拒绝启动；四份提示词修订并加「【Goal 自动消息】」前缀；补回第 2 版确认过的「非人不可」例子；测试与工作包同步。
- 代码或文档变更：`solutions/Goal守卫监工与唤醒兜底修订方案.md`、`solutions/Goal守卫监工与唤醒兜底修订方案.review.md`、`requirements/Goal目标模式.md`（REQ-125、REQ-126）、本 Journal。未提交。
- 验证证据：Codex 指出的源码位置逐条回源码核实（F12～F15）；`check:fork-docs`、`check:fork-features` 与 task-leader 结构校验结果见本轮回复。
- 未解决问题：方案待用户确认；U1～U5 需实现期实测。
- 下一步：用户确认后按 WP-G1～WP-G4 实施。

### 2026-09-23 修订方案第 3 版

- 本轮目标：按用户确认的骨架重写修订方案，只写文档。
- 完成内容：方案重写为 476 行；提示词从 12 份降到 4 份（守卫、执行 agent 消息、预算收尾、清单生成），全文写入 §5.6；删除升级登记表、事件流核对、单独验收与验收后复盘、巡检提示词、让位细则、降级续跑、驱动心跳与监督、总开关；REQ-121 改为清单引用需求文档条目；评审报告补说明。第 2 版终稿存于本机 `.docs/goal-guard-plan-review/plan-v2-final.md`。
- 代码或文档变更：`solutions/Goal守卫监工与唤醒兜底修订方案.md`、`solutions/Goal守卫监工与唤醒兜底修订方案.review.md`、`requirements/Goal目标模式.md`、本 Journal。未提交。
- 验证证据：`check:fork-docs`、`check:fork-features` 通过；task-leader 结构校验 PASS（26 条 REQ、10 条决策）。
- 未解决问题：方案待用户确认；U1～U4 需实现期实测。
- 下一步：用户确认后按 WP-G1～WP-G4 实施。

### 2026-09-23 修订方案第 2 版

- 本轮目标：按双路评审与用户裁决改写修订方案；只写文档，不改代码。
- 完成内容：方案按两层重组（守卫判断，驱动管机制与校验），新增守卫输出契约、五块消息与示例、验收后复盘、升级登记表（只通知一次、已查位置对照事件流）、注入让位、唤醒去重、守卫离线确定性降级、总开关、驱动心跳文件、守卫用时记账、证据可得性表，并写入守卫复盘、心跳巡检、执行 agent 消息、验收文档生成与压缩五份提示词正文；目标原文同时给裁判；轮内出错改叫人；新字段不用严格枚举。需求同步 REQ-105、REQ-112、REQ-124、REQ-125 与产品取舍；评审报告补逐条处置表。
- 代码或文档变更：`solutions/Goal守卫监工与唤醒兜底修订方案.md`（重写，844 行）、`solutions/Goal守卫监工与唤醒兜底修订方案.review.md`、`requirements/Goal目标模式.md`、本 Journal。分支 `feat/goal-guard-supervisor`，未提交。
- 验证证据：新增依据已在源码核实：状态行 `prompt` 字段来自 `UserPromptSubmit`；终端读取结果的 `draft` 只覆盖 Orca 输入框（`src/shared/runtime-terminal-contracts.ts`），用户直接在 agent 界面打字未提交时不可见，已列为已知限制。`check:fork-docs`（刷新生成索引后）、`check:fork-features` 通过；task-leader 结构校验 PASS（26 条 REQ、9 条决策）。
- 未解决问题：方案 §2.5 共 5 项默认值待确认（巡检间隔、降级轮数、重拉上限、非人不可清单、守卫模型家族）；U1、U2、U3、U7 需实现期实测。
- 下一步：用户确认默认值后，按 WP-G1～WP-G5 实施，先做 WP-G1 纯减法与还原。

### 2026-09-23 修订方案双路评审

- 本轮目标：按用户要求开两个子任务，从 goal 的本质需求出发重新评审修订方案，重点看 agent 执行与逻辑的合理性、关键提示词设计。
- 完成内容：Claude 子任务与 TRAE CLI 各自独立评审（同一评审维度、同一段追加重点、互不共享结论），主流程逐条核实后合并。两路结论一致为需重大修改；合并出 2 条 P0（守卫没有强制只读边界；凭证可经复盘记录、面板、注入泄露）、21 条 P1、若干 P2，以及守卫复盘、心跳巡检、执行续跑、验收文档生成四份提示词的改写要点。
- 代码或文档变更：新增 `solutions/Goal守卫监工与唤醒兜底修订方案.review.md`；修订方案状态改为 needs-update；本 Journal。
- 验证证据：单路发现已在源码核实，包括调用裁判时从不传 sandbox、回复截断到 8,000 字符、codex provider 读取回复字段、`worktree ps` 透出所需字段、面板结果裸 parse、`relaunch` 为 private、catch 分支仍写 blocked、回放素材只在本机。两路原始输出在本机 `.docs/goal-guard-plan-review/`（未入库）。
- 未解决问题：U2（codex 真机 hook）、U4（Esc 后注入答复）、`spawnProcess` 等价性、复盘真实成本仍需实测；R3 级别存在分歧（B 定 P0、A 定 P1），主流程倾向 P1。
- 下一步：等用户确认后按评审修订方案，优先处理两条 P0 与去重、升级、确定性兜底相关的 P1。

### 2026-09-23 验收文档生成补进修订方案

- 本轮目标：按用户要求研究验收文档怎么生成更合适，结论补进修订方案；只写文档，不改代码。
- 完成内容：拆解 travel 文档 17,757 字的构成（通过条件 11%、读文件日志 22%、重复的通用规则 16%、代码基线 4%、待确认问题 9%）；定位根因在生成提示词；方案新增 §5.5.9（四节格式、写作规则、长度与格式校验、压缩修复一次且编号不得减少），补事实 F14～F16、风险与自测，WP-G1 纳入；REQ-121 追加用户已确认的修订。
- 代码或文档变更：`requirements/Goal目标模式.md`、`solutions/Goal守卫监工与唤醒兜底修订方案.md`、本 Journal。分支 `feat/goal-guard-supervisor`，未提交。
- 验证证据：本轮改动后重跑，task-leader 结构校验 PASS（26 条 REQ、8 条决策），`check:fork-docs`、`check:fork-features` 通过。文档构成数字由脚本从目标记录里的验收文档统计得出。
- 未解决问题：方案 §2.5 其余 10 项待评审；已装热修的处置待确认。
- 下一步：用户评审方案；通过后按 WP-G0～WP-G4 实施。

### 2026-09-23 守卫修订：需求与方案

- 本轮目标：按用户要求，把守卫改为每轮复盘、先解后叫人、唤醒与兜底写进需求和修订方案；只写文档，不改代码。
- 完成内容：从 git 历史和 09-05 原稿备份恢复最早方案、v4、删空转提案，查清两处没按方案实现（删空转从未排期；提交 `ea2eb6c347` 让验收文档顶替了目标）与方案本身的四个问题；新增 REQ-124～REQ-126，修订六条既有需求；新建修订方案，含复用评估、系统交互图、用户动线图、模块设计、面板契约可选字段、SSH 机器归属与工作包；在闭环方案中标注被取代的部分。
- 代码或文档变更：`requirements/Goal目标模式.md`、`solutions/Goal守卫监工与唤醒兜底修订方案.md`（新增）、`solutions/Goal目标管理与交互闭环方案.md`、本 Journal、生成的 `docs/issue/README.md`。分支 `feat/goal-guard-supervisor`，未提交。
- 验证证据：`check:fork-docs`（刷新生成索引后）与 `check:fork-features` 通过；task-leader 结构校验 PASS（26 条 REQ、7 条决策）；`check:architecture-policies` 报 3 条侧栏组件的既有差异，撤掉本轮改动在同一基线重跑结果相同，与本轮无关。方案中的源码事实均在 `fork/integration`（`144f0ac71b`）上核对。事故复盘与热修证据在本机 `.docs/goal-monitoring-hotfix/2026-09-23/`（未入库）。
- 未解决问题：方案 §2.5 共 10 项待用户确认；用户 App 当前装有未合入的热修 `0.1.0+0d74381e8d2f`（#1～#5），其中 #2～#5 与本方案冲突，建议回退到只含 #1 的版本，待确认；热修分支 `feat/goal-monitoring-round-end` 未推送。
- 下一步：用户评审修订方案；确认后按 WP-G0～WP-G4 顺序实施，先做 WP-G0 回退与 WP-G1 纯减法。

### 2026-09-16 草稿删除

- 本轮目标：实现 REQ-123 的本机与 SSH 草稿删除入口及停止反馈。
- 完成内容：列表常显删除入口、确认、所属主机停止检查、错误保留和重试、持久删除标记、迟到保存/启动/列表响应防护；生成 Markdown 文件保留。首轮 CI 发现渲染时客户端重复初始化，已改为点击删除入口时创建。
- 代码或文档变更：Goal 草稿列表、存储、RPC、需求及测试。
- 验证证据：Goal 224/224、CLI 166/166、最终存储 13/13 和删除生命周期 8/8 通过，类型及质量门禁通过；隐藏 App 真实 SSH 9/9，14 张截图，错误和测试残留进程均为 0。见 [本轮 Test Run](tests/runs/2026-09-16-草稿删除.md)。
- 未解决问题：CI/合入尚待结果；首轮侧栏既有测试出现环境销毁后的定时器错误，本地 18 项未复现，保留证据并检查下一轮结果。初始化修复后 15 项回归与 Web 类型检查通过，独立 App 正在复测；未安装用户 App。真实模型、异机 SSH 和其他系统未做本轮实测。
- 下一步：完成提交与集成检查，交付范围以 PR 和运行记录为准。


### 2026-09-16 SSH 修复 PR 静态检查

- 本轮目标：推进 [PR #26](https://github.com/Fartown/orca/pull/26) 的远端检查与集成合入。
- 完成内容：恢复 GitHub CLI 认证并推送 SSH 修复；修正 Goal 投影模块的重复类型 import，以及 Claude 输出解析在 Node 18 上调用 `toReversed()` 的兼容性问题。
- 代码或文档变更：合并 `goal-turn-evidence` 导入声明；输出解析按下标倒序扫描，保留最后一个结果事件语义；将现有 relay 子进程兼容性测试加入 Goal 固定检查。
- 验证证据：PR 首轮类型检查、Node 18 宿主检查、Linux/Windows 打包通过；本地 Goal/relay 35 项回归及真实 Node 18.20.8 输出解析 5 项通过。记录见 [SSH 运行记录](tests/runs/2026-09-16-SSH执行主机.md)，日志位于 `.docs/goal-remote-host-ui-validation/2026-09-16/evidence/pr26-*.log` 和 `provider-node18-smoke.log`。
- 未解决问题：用户已批准定向带入基线 import 修复 `7ec2986fd`；源码与上游一致。完整远端检查尚待最终结果，尚未合入。
- 下一步：完成全部 PR 检查后合入，安装与用户远端升级另行记录。

### 2026-09-16 SSH 执行主机支持修复

- 本轮目标：修复 REQ-111 的远程执行遗漏，用户明确要求远程机器能够使用 Goal。
- 完成内容：补入 SSH relay 上的既有 GoalControlService、远端打包驱动/生成器/守卫、界面按工作区主机路由和草稿归属、远程 Markdown 文件查看；断联保持不可验证而不认定退出。
- 代码或文档变更：独立 `feat/goal-remote-host` 分支；沿用 Goal 状态机、操作收据、文件存储、公共终端 CLI 与 SSH RPC；补充远程运行时入口和必要部署清单。orcad 组合根的旧逐字上游固定规则转为已登记接缝，既有生命周期测试及本轮真实重启验证保护服务注册；没有删除功能。
- 验证证据：修改前隔离 App 复现 SSH 终端可用而 Goal 列表为空；最终同机真实 SSH 12/12 通过（含 folder、后台生成、断联重连、独立验收、主机隔离）。集成后再次 12/12，相关 tests 200/200、CLI 166/166，tc、构建、架构/fork/localization 门禁通过；纯 Node orcad 注册、文档落盘与重启恢复 3/3。详见 [SSH 运行记录](tests/runs/2026-09-16-SSH执行主机.md)，原始证据位于 `.docs/goal-remote-host-ui-validation/2026-09-16/`。
- 未解决问题：验证采用同机独立 sshd 和受控 provider，未覆盖异机 Linux、真实模型与 WSL；未更换用户 App，未更新用户远端 relay。
- 下一步：已合入最新集成基线并完成回归，最终文案/Markdown 补测 3/3；本地提交已就绪。恢复 GitHub 推送凭据后创建 PR、等待 CI 并合入。安装包交付与实际机器升级另行记录。

### 2026-09-15 Goal 运行时 fence 收敛到单一铸造点

- 本轮目标：修掉上游合并后 `src/shared/agent-session-fence-mint-boundary.test.ts` 对 Goal 文件的阻断，让 fork/integration 的 CI 重新可绿。
- 完成内容：上游新增的源码级棘轮按正则扫描整个 `src/`，把 Goal 自有的 `GoalRecord.runtimeFence` 直接自增判成 agent-session lease 的裸铸造（`goal-run-commit.ts:14` 甚至是三元表达式的冒号被正则误配）。Goal fence 与 agent-session lease fence 是两套语义，不能改走 `nextAgentSessionFence`（后者带 `minimumNextFence` 恢复下限，GoalRecord 没有该字段）。改为给 Goal 域自己的单一铸造点 `nextGoalRuntimeFence(record)`，四处自增全部改走它。
- 代码或文档变更：新增 `src/shared/goals/goal-runtime-fence.ts`；`src/main/goals/goal-revision-control.ts`（3 处）、`src/main/goals/goal-run-commit.ts`（2 处）改为调用它；本记录。
- 验证证据：`pnpm exec vitest run config/scripts/check-changed-code-quality.test.mjs src/shared/agent-session-fence-mint-boundary.test.ts src/main/goals` 11 文件 83 用例通过（此前该棘轮用例失败）；`pnpm tc`、`oxlint`、`check:architecture-policies`、`check:fork-features`、`check:fork-docs` 通过。
- 未解决问题：无。行为未变——每处仍然是「当前 fence 加一」，只是收敛到一个有名字的调用点。
- 下一步：合回 `fork/integration`，解除对其他 PR 的阻塞。

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

### 2026-09-23 修复验收文档打不开与草稿写放大

- 本轮目标：修两个缺陷。其一，SSH / 配对主机下点「打开 Markdown 标签」报 `ENOENT ... stat '<工作区>/acceptance-155.md'`；其二，一次编辑会在草稿目录里堆出几十上百份同样的 33 KB 文档。
- 完成内容：
  - `openGoalDocument` 改为按绝对路径寻址。验收文档在工作区之外，编辑器的读取链路只有 `relativePath === filePath` 这一支会刷新客户端授权、或用 grant 抵达主机；原来传 `basename(filePath)`，配对主机的 `files.read { worktree, relativePath }` 就把它当工作区相对路径解析，于是去 stat 一个从来不存在的文件。现在沿用「绝对路径开标签页」那条既有链路：工作区外先经 `files.grantHostPath` 取 grant 并盖在标签页上。
  - 草稿文档不再按 revision 命名。`acceptance-<revision>.md` 每保存一次就新铸一个文件、旧的不回收，用户复制走的路径转眼就不是当前文档了。改为每份草稿固定一个 `acceptance.md`。
  - 内容没变就不算新版本：`save()` 先比对内容，相同则原样返回，顺带覆盖了「重试丢失的响应」这条老路径。
  - 编辑保存加 300 ms 防抖，把一串按键并成一次落盘；`flush()` 仍立即写，所以打开文档、关闭编辑器前的保存不受影响。
- 代码或文档变更：`src/renderer/src/goals/open-goal-document.ts`、`src/renderer/src/goals/goal-editor-draft-session.ts`、`src/main/goals/goal-editor-draft-store.ts` 及其三份测试；`config/fork-features.jsonc` 补登 6 个新依赖。
- 验证证据：`pnpm tc` 干净；goals feature check 228 项全过；新增用例覆盖「工作区外走 grant」「工作区内仍用相对路径」「SSH 不授权客户端本地路径」「连续编辑合并为一次保存」「内容未变不涨版本」「一份草稿只留一个文档文件」；真机 e2e 见 `.docs/goal-acceptance-doc-open-ui-validation/2026-09-22/`。
- 未解决问题：配对主机（用户报错的那类环境）只有单测覆盖，没有真机证据——本机没有可配对的远端。另外发现一次编辑器挂载会起两份草稿记录，是既有现象，不在本轮范围。
- 下一步：请用户在出问题的那台机器上复验；确认后合入 `fork/integration`。

### 2026-09-23 配对主机真机复现与归属修正

- 本轮目标：自己搭出用户报错的拓扑并复现，不再把 SSH / 远程验证退回给用户。
- 完成内容：
  - 先用本机 root sshd 搭了 SSH 工作区，跑通了，但那条路读文件用的是绝对 `filePath`，**复现不出**报错——修复前后都通过。说明用户碰到的不是 SSH 工作区，而是**配对主机**（客户端 `activeRuntimeEnvironmentId` 指向一个 runtime），读取走 `files.read { worktree, relativePath }`。
  - 改用 `createRuntimeDesktopPairingOffer` + `launchPairedElectronClient`，在本机起客户端与主机两个实例配对（127.0.0.1，不需要 Docker），复现成功。
  - 复现过程暴露上一版修复判断错了归属：它按**客户端当前的** active runtime 决定要不要申请 grant，于是一个本地目标的文档也会去问主机要授权，主机没有那个路径，开都开不起来。改为按**目标自己的执行主机**决定：`runtime` 才取 grant，`local` / `ssh` 直接用绝对路径，读取端的 `settingsForRuntimeOwner` 会据标签页的 `runtimeEnvironmentId` 回到本机。
  - 把这套做法固化成 `docs/reference/ssh-real-app-validation.md`，并在 AGENTS.md 写明：SSH 场景由改动者自己搭，不要退回给用户。
- 代码或文档变更：`src/renderer/src/goals/open-goal-document.ts` 与其测试；`docs/reference/ssh-real-app-validation.md`（新增，并在 `.gitignore` 放行）；`AGENTS.md`。
- 验证证据：`.docs/goal-acceptance-doc-open-ui-validation/2026-09-23-ssh/`
  - `run-8`（修复后，配对主机）：`relativePath` 为绝对路径、`hasGrant: true`、无报错、文档渲染，**通过**。
  - `run-9`（修复前，同一拓扑）：`relativePath: "acceptance.md"`、`hasGrant: false`、
    `ENOENT: no such file or directory, stat '<工作区>/acceptance.md'` —— 与用户截图同形，**失败**。
  - `run-2`/`run-5`：SSH 工作区拓扑，修复前后均通过（该路径本就按绝对路径读），记录在案以说明覆盖边界。
  - 新增单测：客户端配对着主机、但目标是本地时不得申请 grant。
- 未解决问题：无。红→绿闭环已在用户报错的拓扑上取得。
- 下一步：合入 `fork/integration`。
