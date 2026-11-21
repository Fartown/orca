---
title: 终端聊天视图恢复
document_type: journal
status: testing
created: 2026-10-23
updated: 2026-11-16
issue: 终端聊天视图恢复
external_ids:
  [Fartown/orca#112, Fartown/orca#119, Fartown/orca#118, Fartown/orca#121, Fartown/orca#127]
---

# 终端聊天视图恢复

## 1. 关键文档链接

| 类型     | 文档                                                    | 状态         | 说明                                             |
| -------- | ------------------------------------------------------- | ------------ | ------------------------------------------------ |
| 需求     | [终端聊天视图恢复](requirements/终端聊天视图恢复.md)    | ready        | REQ-1801～1804                                   |
| 交互     | -                                                       | not-required | 恢复已有菜单与快捷键                             |
| 方案     | -                                                       | not-required | 接入现有 toggleViewMode；不新增会话控制链路      |
| 测试用例 | [切换与绑定](tests/cases/切换与绑定.md)                 | ready        | 双向入口、本地、SSH、历史只读                    |
| 测试执行 | [本机与SSH验收](tests/runs/2026-10-23-本机与SSH验收.md) | completed    | 双向菜单、进程及 transcript 保留；正式发布待完成 |

- 本轮测试：[持续绑定恢复验收](tests/runs/2026-11-15-持续绑定恢复验收.md)，completed；覆盖 REQ-1804。
- #118 测试：[恢复提醒与内容验收](tests/runs/2026-11-16-恢复提醒与内容验收.md)，completed；覆盖 REQ-1806，本机、全局浮动及真实 SSH 的受控恢复点击通过。

- #127 测试：[恢复态首条提交验收](tests/runs/2026-11-16-恢复态首条提交验收.md)，completed；覆盖 REQ-1811。

## 2. 决策点记录

- 2026-11-16：[持久提交闭环需求](requirements/持久提交闭环.md)、[现状调研](research/持久提交现状.md)、[方案](solutions/持久提交闭环.md)、[用例](tests/cases/持久提交闭环.md)。REQ-1807～1810 扩展同一终端聊天功能；前次写入结算不等于 provider 消费，不能当作根治证据。

- 2026-10-23：根因是标签右键菜单用 isChatView 隐藏了终端到聊天的方向；终端面板右键和快捷键已支持。恢复同一标签的现有切换，不把它替换为创建新会话或恢复 provider。
- 界面展示由客户端持有，终端和 transcript 继续由本地或 SSH 执行主机持有；不新增协议、主机连接或配置。

## 3. 开发记录

### 2026-10-23 登记与实施（implementing）

- 本轮目标：恢复标签入口，并校验指定历史会话绑定。
- 完成内容：核对现有两个菜单及切换回调；建立独立功能分支和需求登记。
- 代码或文档变更：登记、需求和验收用例；实现放在功能拥有目录。
- 验证证据：源码核对；真实界面和自动化验证待执行。
- 未解决问题：历史标签的实际元数据仍需核对；尚未出包安装。
- 下一步：实现入口、完成本地与 SSH 验收及所有门禁，合入正式发包。

### 2026-10-23 双向菜单和历史绑定验收（testing）

- 本轮目标：完成入口回归与真实本机、SSH 验证。
- 完成内容：功能拥有目录中的菜单项调用已有回调，支持双向标签切换并复用跨平台快捷键与现有翻译。历史标签通过已有 hook 入口重放 transcript 已记录的完成事件，补齐 provider 元数据；未向 provider 发送消息或恢复进程。
- 代码或文档变更：SortableTabContextMenu 接线、既有菜单回归测试、需求及登记。
- 验证证据：26 项相关测试、四目标 pnpm tc、三项本地化、架构、fork 功能和文档、变更代码质量通过。本机与 SSH 使用正常 AppImage 的后台隔离实例，双向菜单及历史正文可见；原 handle、incarnation、shell PID 保持，测试 transcript SHA256 保持。用户历史 transcript 的大小、mtime 和 SHA256 前后一致，已有 Codex PID 4013571 保留。证据见本轮 Test Run 与 .docs/native-chat-view-ui-validation/2026-10-23/。
- 未解决问题：代码尚未随正式包交付；网页端旧的独立 folderWorkspace 目录入口在隔离实例未显示，本轮菜单验收采用已有 folder 项目，未将该目录问题计作通过。
- 下一步：提交、合入 fork/integration，正式安装后复核原标签菜单和更新状态。

### 2026-10-23 标签菜单入口改用「切到聊天视图」（testing）

- 本轮目标：与「终端头部切到聊天视图」合流后，标签右键的就地切换项不再与「在新聊天中接管」同名。
- 完成内容：该功能把上游 key `components.tab.bar.SortableTabContextMenu.switchToChatView` 的中文改为「在新聊天中接管」（接管按钮与标签菜单里的接管项仍读这个 key）；本功能的就地切换项若继续用它，中文会显示成接管。改为读 `terminalChatViewButton.switchToChatView`，中英文为「切到聊天视图 / Switch to Chat View」，与头部按钮、窗格右键一致；切回终端的文案不变。
- 代码或文档变更：`TerminalTabViewSwitch.tsx` 换文案 key；`SortableTabContextMenu.test.tsx` 中本功能新增的三处断言跟随新名字；REQ-1801 文案；登记表在「终端头部切到聊天视图」下为本文件加守护接缝。
- 验证证据：见「终端头部切到聊天视图」同日开发记录与测试记录。
- 未解决问题：无新增。
- 下一步：随 PR #65 合入 `fork/integration`。

### 2026-11-15 持续失去输入绑定的恢复门禁（testing）

- 本轮目标：定位并修复用户确认的持续禁用、必须切回终端才能继续的问题，不把瞬时附着提示当作已覆盖。
- 完成内容：真实安装包配对主机、隔离隐藏实例的故障注入证明，同一恢复请求在聊天模式被拒绝，终端模式获准。源码追到 structured native chat 引入的 blanket viewMode 禁令，与 fork 恢复的原终端聊天展示冲突。
- 代码或文档变更：复用现有恢复实例注册表，登记实例所属 tab 和实时的可见终端聊天覆盖层；保留两种 tab 索引的保护，但为当前真实终端聊天放行，并在等待 liveness 后再次确认所有权。新增 REQ-1804、TC-1805～1808；登记新接缝、依赖与测试。未新增主机连接或重试器。
- 验证证据：4 项新增恢复用例在旧版失败；功能检查 80 项、额外终端回归 45 项通过（两组含交集）；pnpm tc、E2E 构建、架构、fork 登记与文档、三项本地化通过。修复版在真实本地、mini 配对及经 SSH 隧道访问 mini 的隐藏实例中，调用同一真实恢复入口后均保持 viewMode=chat、原 PTY 身份并恢复 contenteditable=true；不向 provider 发消息。详见 [持续绑定恢复验收](tests/runs/2026-11-15-持续绑定恢复验收.md)。原始证据位于主 checkout 的 .docs/mini-chat-terminal-binding-ui-validation/2026-11-15/。
- 未解决问题：历史截图最初丢失绑定的事件未留下完整状态轨迹；“不能自愈”的门禁已实证，不能将故障注入说成历史触发证明。SSH 真实验收为隧道访问配对服务，未覆盖原生 SSH relay 自动部署；本轮未修改该流程。运行中的用户 .81 安装包未替换。
- 下一步：完成最终 check:changed，提交关联 Issue #112 的 PR，等待 CI 并合入；保持用户正在运行的程序及终端不动。

### 2026-11-16 Codex 发送结果与 UI 气泡（testing）

- 本轮目标：修复终端聊天显示已发、Codex 原始会话未收到时没有投递状态的问题。
- 完成内容：真实 .84 安装包、pending cache、mini 原始 transcript 三方对照，确认 11:17 原消息仍在本地缓存且无 delivery 标记；11:28 是措辞不同的后一次消息。安装包确认只有 Claude 接入 verified outcome，Codex 仍忽略 fire-and-forget 结果。
- 代码或文档变更：登记 Codex 发送接缝与 REQ-1805，新增整合真实 composer hook、PTY 发送队列和 pending delivery 的回归；接入既有确认发送、拒绝提示与未知投递保留。真实本地 UI 又发现默认 verified 会把 false 回退为无确认发送，因此 Codex 增加已有 onDeliverySettled 回调以请求严格写入确认；Claude 策略保留。
- 验证证据：6 项新增整合回归在旧版失败；补齐严格确认和图片、Claude 保留回归后，11 份相关测试共 143 项通过。真实旧 .84 与修复版后台 UI 对照：同样不存在的 PTY，旧版普通气泡，修复版“消息未发送”且不发 Enter。真实 SSH 隧道下 mini 对缺失 handle 返回 terminal_handle_stale，修复版同样正确标记，用户原终端未写入任何测试文字。详见 [Codex投递验收](tests/runs/2026-11-16-Codex投递验收.md)。现场数据仅本地 .docs/native-chat-terminal-send-ui-validation/2026-11-16/ 保存。
- 未解决问题：没有逐写回执能唯一解释原 11:17 RPC 失败原因，不能把同时存在的连接错误当作精确逐写证据。
- 下一步：跑完最后编辑后的完整门禁，提交 Issue #119 的 PR 并等 CI。用户 .84 原消息的缓存已标记 unconfirmed，文字保留、未补发；运行中程序未替换。

### 2026-11-16 持久提交闭环（testing）

- 本轮目标：解决普通 Codex Chat 的假已发、原文仅内存保存、页面持有异步 Enter，以及丢回执后无同请求恢复的问题。
- 完成内容：Issue #121；独立 feat/native-chat-durable-submit 工作树；分层调研；main 持久 outbox 与同请求查询；执行端整体提交、写入结算、原 session/incarnation fence；正文边界与唯一 user-row 对账接入。
- 代码或文档变更：feature 拥有目录增 main/shared 模块；旧文件只作 IPC、capability、composer 与发送队列接线；新增需求、调研、方案、用例。
- 验证证据：最终注册 renderer 检查 125 项、专项及 IPC/requestShow 兼容组 59 项通过；早期终端运行时组 1,510 项通过（各组有交集）。真实本地 Git/文件夹、图片、丢主机回执后 renderer/App 重开，以及独立 Mini SSH 文件夹、丢回执后主机服务重启均以真实 Codex/模型请求/JSONL/DOM 验证一次送达和同 ID 查询。类型、本地化、架构、登记/文档、变更质量通过；CI 最终结果随 PR #126。详见 [持久提交闭环验收](tests/runs/2026-11-16-持久提交闭环验收.md)。
- 未解决问题：服务重启且没有当前 provider 身份证据时保留输入并拒绝，不从历史恢复行猜身份；legacy relay/旧能力同样诚实拒绝。用户运行中的 .84 未换包，本轮未补发用户历史消息；历史首次 RPC 丢失原因仍缺逐写证据。
- 下一步：PR #126 最终 CI 全绿后合入 fork/integration；发布包准备后遵循 AGENTS 的退出 App 约束处理现场更新。

### 2026-11-16 恢复行内容与提醒一致性（testing）

- 本轮目标：修复 Issue #118 中恢复未确认的 Activity 提醒及空聊天入口，并保持原终端与历史事件。
- 完成内容：核对 MBP5 preview84 元数据，确认聊天展示偏好、恢复未确认 waiting 行、缺失 provider 绑定及原 PTY 身份；先写 waiting/blocked 事件、未读和同 tab/pane 点击红测，再复用 fresh live state 与现有 setTabViewMode 切回原终端。旧历史和已读标记未清除。
- 代码或文档变更：本功能登记 Activity 的最小接缝、必需文件与测试；新增 REQ-1806、TC-1813～1815；实现恢复未确认行的当前提醒过滤与原终端展示判定，不新建会话或改通知派发。
- 验证证据：旧逻辑定向 3 文件 32 项为 27 通过、5 失败，分别指向 waiting/blocked 当前事件及未读和无绑定点击；补齐目标 split leaf 回归后，最终同 3 文件 35/35、合入基线 #120 后联合功能登记 10 文件 122/122 通过。隔离隐藏 Electron 实例使用真实 PTY 的 1 项受控场景通过：恢复未确认 waiting 无当前行、徽标 0，旧 done 历史行仍可选；点击后保持同 tab、leaf、PTY，原终端 marker 仍在；新鲜绑定的 waiting 元数据对照有当前行、徽标 1。原始结果见 `.docs/attention-content-ui-validation/2026-11-16/evidence/{red/targeted-red.log,controlled/restored-chat-controlled.json,controlled/controlled-final2.log}`，截图见同目录 `controlled/restored-chat-activity-history.png`、`controlled/restored-chat-returned-terminal.png`、`controlled/fresh-bound-waiting-contrast.png`。MBP5 只读元数据见另一工作区 `.docs/local-tasks-session-wide-ui-validation/2026-11-16/evidence/mbp5/`。
- 未解决问题：MBP5 原 PTY 历史仅 68 字节、1 行，无可核实会话 ID 或 prompt 模式，不能推断旧 provider；对照的 providerSession 是受控元数据，不是真实 provider。隐藏实例已在 fdfe5c51 基线上复验普通及全局浮动真实 PTY 的展示路径；SSH 真实 hook 发布 waiting/provider 身份，单次受控客户端恢复后，点击前 guard 确认仍恢复未确认、无绑定且含旧历史；真实标题点击返回同 tab/leaf/canonical PTY 并保留 marker（r10 1/1），未证明用户历史故障 producer 或每条系统通知的来源。失联仍是 unverifiable，不推断 exited。
- 下一步：完成最终门禁与交付；TC-1815 已完成真实 SSH 与远端镜像的受控点击验证；最后 check:changed 后按授权提交、CI 全绿合入。终端、transcript 与会话证据归执行主机，客户端只切视图，本轮不新增 RPC、端口、环境变量、服务或重试。

### 2026-11-16 恢复态首条提交（testing）

- 本轮目标：补齐重启后下一条新 Chat，闭合恢复态 provider 门禁循环。
- 完成内容：复现 #126 的旧路径失败；新客户端 opt-in 在原恢复物理 authority 精确匹配时整体提交一次，身份后证与最终正文确认分开。后证使用原 PTY/incarnation、严格 provider、真实 hook transition 和本次提交后的 turnStartedAt；Stop 后仍可证明，OSC/replay 不能证明。completed 原 ledger 持久后证，未知只查询原 ID，不补发。
- 代码或文档变更：owned submitter/runtime/transcript verifier 和 renderer host-push 边沿；原 authority 比较提取复用，旧兼容调用者 token attestation 不变；可选参数和 receipt 字段保持混合版本。需求、方案、用例及[本轮验收](tests/runs/2026-11-16-恢复态首条提交验收.md)已补齐。
- 验证证据：169 项相关测试、pnpm tc、三项本地化、架构/fork/docs/changed-quality 通过。本地 Git/folder App 重开、SSH folder 丢回执+host 重启+客户端重开后下一条，模型/user/UI 各一次、outbox 空、原 handle/PTY/incarnation 相同，全程隐藏窗口。证据在 .docs/native-chat-restored-submit-ui-validation/2026-11-16/。
- 未解决问题：用户两端 .84 未换包；没有重启用户 App 或补发用户历史消息。#126 漏测的 c5acbc 发布构建已取消，待本补修 CI/集成包。
- 最终审查补修：dispatching 通知先占 contact query、main active 时直接 return 的竞态由新增失败回归实证；active 改为本地完成 barrier，query 等原 dispatch finally 后查同 ID，遗留 dispatching 仍可直接查，无重发/host 轮询。
- 下一步：按现有授权提交、CI 全绿合入；核验集成包签名、兼容性、回滚包和两端 PTY 后，再按 AGENTS.md 请求退出安装的最后确认。

### 2026-11-21 上游同步到 fa60d0a566（testing）

- 本轮目标：`fork/integration` 从 `e723de1bfd` 合入上游到 `fa60d0a566`（四次合并：`22afb84f6a`、`9c3b42f644`、`d725f407e8`、`31df22fb1a`，冲突都在第一次），保持终端标签与聊天视图双向切换、持久提交闭环、恢复行内容与提醒一致。
- 完成内容：本功能 24 个冲突（UU 15、UD 9）。`register-core-handlers.ts` 以上游为底，注册改为一行 `registerTerminalChatHandlers(runtime)`；`NativeChatResolvedView.tsx` 的 `durableMessages` 追加在上游 `pendingSendsAsMessages(..., sendWorkingEpoch)` 之后；`use-native-chat-pending-delivery.ts`（已搬到 `session/terminal/delivery/`）以上游为底加回持久提交；`use-native-chat-pty-composer-send.ts`（UD，移植到 `composer/submit/`）适配上游收 `retry`、返回 boolean 与 `clearInput === null` 拒发，持久提交分支放在该检查之后且只走非 retry；`terminal-send-method.ts` 保留两处 `|| params.chatComposer`，持久聊天校验与发送选项搬进自有 `durable-chat-send-options.ts`，上游新增的「同时带文本和回车就拒绝」没有扩展到 `chatComposer`（否则持久聊天发不出）；`terminal-unary-params.ts` 改为 `TerminalSend.extend({ chatComposer: ... })`；`connect-pane-pty.ts` 的覆盖判断移到自有 `terminal-chat-recovery-instance.ts`，接缝只剩 `registerTerminalChatRecoveryInstance(session)`（原文件 303 行超限）。`activity-pane-events.ts` 的历史行判定只排除 `restoredUnconfirmed` 行，去掉了原来附带的「状态未变」条件：REQ-1806 只针对恢复未确认行，那个条件还会藏掉上游现在有意保留的过期 waiting/blocked 行。上游以低价值删除的 `SortableTabContextMenu.test.tsx`（#38310）、`activity-thread-actions.test.ts`（#39365）、`useActivityUnreadCount.test.ts`（#42670）里守护本功能的用例移到自有 `sortable-tab-chat-view-switch.test.tsx`、`activity-restored-thread-actions.test.ts`、`activity-restored-unread-count.test.ts`；`register-core-handlers.test.ts`（#38828）随上游删除。`codex-chat-delivery.test.tsx` 跟随上游：去掉已被上游删除的「Delivery unconfirmed」提示断言，清行改为先做一次确认过的 `AGENT_TUI_CLEAR_INPUT_MAX` 写入再写正文，其余正文、提示与回车断言保留。上游把 `agentStatusByPaneKey` 改成 `AcceptedAgentStatuses` 类，`use-durable-chat-delivery.ts` 的方括号取值改为 `.get()`。
- 代码或文档变更：`config/fork-features.jsonc` 接缝 30→26 条：18 条换路径，`connect-pane-pty.ts` 与 `activity-pane-events.ts` 换 mustContain，退役 4 条随上游删除的测试接缝；`tests` 换成上述 3 个自有测试；checks 只留自有目录；`dependsOn` 48→55 条（31 条换路径，补 `rpc/core.ts`、`rpc-method-registry.ts`、`agent-prompt-write-options.ts`、`agent-prompt-signals.ts`、`native-chat-covered-pane.ts`、`non-secure-context-uuid.ts` 等）。合并后没有本功能的单独修复提交。新棘轮基线登记 5 条（计数 7）：main-blocking-helper `durable-chat-transcript-boundary.ts` 1；react-compiler-bailout `use-durable-chat-delivery.ts` 1、上游接缝 `use-native-chat-pty-composer-send.ts` 1；render-path-translate `TerminalTabViewSwitch.tsx` 2、`use-durable-chat-delivery.ts` 2。React Compiler 相关的这几个文件不编译，行为同合并前（提交 `6244eac0a4`）。
- 验证证据：登记 checks 渲染端 7 文件 35 项、主进程与共享 7 文件 31 项通过（`/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/sync-checks-run3.log`）；冲突解法与上述判断见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/report-D-terminal-chat.md`、`phase2-D.tsv`、`decisions.tsv`；棘轮清单 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/ratchet-refactor-backlog.tsv`，当前 HEAD 复核 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/journal-records/ratchets-at-2abf3d8ad1.log`；最终门禁见 `/Users/bytedance/dev/orca/.docs/upstream-sync/2026-11-20/final-gates.log`。本机真机抽查通过：头部按钮与标签右键 ⌘⇧J 都能切到聊天视图（空会话「Start a chat with Codex」，测试桩无转录属预期），「Show terminal」切回（`/Users/bytedance/dev/orca/.docs/upstream-sync-ui-validation/2026-11-21/README.md` 第 4 项，截图 `evidence/cv-1`～`cv-3`）。持久提交、恢复行与 SSH 没有在同步后真机复验。
- 未解决问题：retry 不走持久提交、`chatComposer` 不受上游新发送守卫约束这两处取舍只有单测覆盖；持久提交闭环与 SSH 场景未真机复验；棘轮基线登记的 5 条待重构，跟踪：Fartown/orca#153。
- 下一步：下次真机回归按「持久提交闭环」「恢复态首条提交」用例在本机与 SSH 各跑一轮；按 Fartown/orca#153 改写渲染期翻译与 try/finally 写法后缩减基线。
