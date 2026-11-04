# Orca 现有能力盘点：super agent 能直接站在哪些东西上

调研日期：2026-11-04，基线 `fork/integration` 3439e2ef9。结论先行：**Orca 已经有 super agent 需要的大部分零件，缺的是把它们串起来的一层**——一个常驻的总管会话、一个记账和裁决的内核、一套「问人」与通知、以及时间触发。下面每项给出入口文件，路径相对仓库根。

## 1. 控制面：CLI 与 RPC

- `orca` CLI 共约 326 条命令路径，声明在 `src/cli/specs/index.ts` 的 `COMMAND_SPECS`，由 `src/cli/dispatch.ts` 按命令路由到懒加载的处理组。
- 运行时 RPC 是一张表：`src/main/runtime/rpc/methods/index.ts` 的 `ALL_RPC_METHODS`（约 863 个方法名），由 `rpc/core.ts` 的 `defineMethod` 定义、`rpc/dispatcher.ts` 分发；每个方法声明权限档（`rpc/rpc-method-permission.ts`）。按命名空间：browser 92、github 53、orchestration 49、agentSession 45、terminal 43、localTasks 33、repo 20、worktree 18、goals 18、automation 7。
- 传输：本机走 unix socket / Windows 命名管道，凭 `<userData>/orca-runtime.json` 里的令牌（`src/cli/runtime/metadata.ts`、`src/main/runtime/transport.ts`）；配对的服务器走 E2EE WebSocket（`--environment` / `ORCA_ENVIRONMENT`）。
- 主机范围：命令级 `--host local|ssh:<targetId>|runtime:<envId>`（`src/cli/execution-host-flag.ts`）；SSH 目标归本机 runtime 管，`runtime:` 会把客户端改路由到那台配对服务器。

与 super agent 相关的命令族：

| 命令族           | 关键子命令                                                             | 说明                                                                       |
| ---------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `repo`/`project` | `list/show/add`；`project list/setups/setup-*`                         | 项目与各主机上的落地                                                       |
| `worktree`       | `list/show/current/create/rm/set/ps`                                   | `create --agent --prompt --surface chat\|terminal --host`；`rm` 标为破坏性 |
| `terminal`       | `list/show/read/wait/create/send/close/...`                            | `wait --for exit\|tui-idle`；`close` 标为破坏性                            |
| `agent`          | `agent launch --agent --worktree --prompt --surface`                   | 桌面、手机、插件、CLI 共用 `agent.launch` RPC                              |
| `orchestration`  | `worker-start/send/check/inbox/reply/ask/worker-*/gate-*/task-*/run-*` | 见第 2 节                                                                  |
| `task`           | `list/show/current/comment/status`                                     | **没有 `create`**；RPC `localTasks.tasks.create` 存在                      |
| `automations`    | `list/show/create/edit/remove/run/runs`                                | 见第 5 节                                                                  |
| `connector`      | `start/send/prompt/answer/cancel/watch/reply`                          | 把外部线程（Slack）绑到会话，见第 8 节                                     |
| Goal             | 无 `orca` 子命令，只有 RPC `goals.*`                                   | 独立的 `orca-goal` 驱动脚本不在 PATH 上                                    |

护栏：`src/cli/command-suggestion.ts` 不会把「你是不是想」建议到破坏性命令；`src/cli/session-caller-flags.ts` 禁止一个智能体会话冒充别的调用方（`consumer_fenced`）。

## 2. 编排：现成的 Router/Worker

`skill-guides/orchestration.md`、`src/main/runtime/orchestration/`。

- **Run** 是命名空间和收件箱（`run:<id>`）；**Task** 是规格、依赖和状态；**Dispatch** 是一次派工，持有完成权（`dispatch:<id>` 邮箱）；**Worker** 是绑在派工上的智能体，提示词前言（`preamble.ts`）教它用 `ask`、`send --type escalation`、`send --type worker_done`；**Decision gate** 是协调者持有、阻塞某个 Task 的问题。
- 任何运行 `worker-start` 的终端或聊天就成为协调者（coordinator）；身份来自 `ORCA_TERMINAL_HANDLE` / `ORCA_PANE_KEY` 或结构化会话的 `ORCA_AGENT_SESSION_ID`。
- **唤醒机制**（`mailbox-notification-coordinator.ts`）：新邮件到达时分两条道——
  - 终端道（`mailbox-pointer-delivery.ts`）：只在智能体安定/空闲时，向终端写一行指针「You have N orchestration messages. Run `orca orchestration check --run X`」（`formatter.ts:111`），500 ms 后回车；经数据库预留，最多投递一次。
  - 聊天道（`structured-mailbox-pointer-delivery.ts`）：同样的文字作为聊天消息发给结构化会话，`holdWhileWorking`（`structured-mailbox-pointer-host-contract.ts:35`）。
- `check` 取最早一批未读并标记已处理；`--wait` 长轮询但技能明确禁止协调者轮询。
- 状态在协调者 CLI 所连的那台 runtime 的 `<userData>/orchestration.db`；`worker-start --on <server>` 把 worker 放到配对服务器，Run 留在本机，消息经 `orchestration.federation*` 回传。
- 恢复与安全（`skill-guides/orchestration/references/recovery-and-cleanup.md`）：同一 `--retry-of` 链 3 次启动失败熔断；`worker-stop` 不能证明已停时返回 `stop_unknown`；沉默或 `unverifiable` 不授权自动停止、重试或释放。

**含义**：super agent 的「主 Session 派工、执行器汇报、问答、唤醒」在 Orca 里已经是编排。总管会话应当就是一个常驻的编排协调者，而不是另写一套派工。

## 3. 本地任务：工单、需要你

`docs/issue/本地任务管理/`、`src/main/local-tasks/`、`src/shared/local-tasks/`。

- 数据：项目（0..n 个仓库）、任务（层级不限、禁止成环、验收条件、状态、优先级、标签）、任务 ↔ 工作区（各至多一个）、任务 ↔ 会话（多个，`hostId`/`worktreeId`/`tabId`/`paneKey`/`sessionId`）。链接只显式建立，不推断。
- 存放：每台 Orca 自己一份 SQLite（桌面、`orca serve`、SSH 主机上的 orcad），客户端按端点路由读写；同一项目在两台主机上是两个库（D-008）。
- 「需要你」：`LocalTaskAttentionMonitor` 在拥有任务库的主机上读本机智能体状态，推送驱动、不轮询；四类：等你批准、等你回答、被卡住、做完一轮你还没看；断线显示 `unverifiable`。
- 回复：一次发送，失败把文字留在输入框，不排队、不重发、不「连上再发」。只有「做完一轮」可以从任务侧回复。
- 写入带 `clientOperationId`（24 小时回执）与 `expectedRevision`。
- 明确不做：研发流程、编排、加锁排队、多仓任务、新增主机能力（D-1）。「开始做」「开会话」只在渲染层实现。

**含义**：super agent 的「工单」就用本地任务，「需要你」就用它的判定；但 super agent 不能把编排塞进本地任务，而是作为上层把两者连起来。缺口：CLI 没有 `task create` 和关联命令，需要由本地任务功能补上。

## 4. Goal：在既有会话上持续推进

`docs/issue/Goal目标模式/`、`src/main/goals/`、`goal-mode/`。

- 一个 Goal 挂在一个已有的、有状态钩子的智能体会话上：目标、四段验收文档、守卫（claude/codex 必选）、检查命令、预算（默认 20 轮 / 180 分钟）。
- 主机控制服务 `GoalControlService` 只写意图文件，独立的驱动进程在检查点读取并通过公开的 `orca terminal send/read/wait` 推进；每次唤醒跑一次守卫，结论为 `wait | instruct | ask_user | done`；只有三种结束：验收通过、预算用完、用户停止。
- 记录在执行主机上；SSH 断开是 `unverifiable`。没有手机界面。

**含义**：「把这件事一直推进到验收通过」交给 Goal，不要在 super agent 里再写一个续跑循环。super agent 负责设 Goal、看 Goal 的结果、把 `ask_user` 转成问用户的卡片。

## 5. 自动化：主机上的定时运行

`src/shared/automations-types.ts:96`、`src/main/automations/`。

- 一条自动化：名称、提示词、可选 precheck 命令、智能体、chat/terminal、工作区（已有或每次新建）、`reuseSession`、rrule + 时区、错过补跑宽限、执行目标（local/ssh）与调度归属（`local_host_service | ssh_bridge | remote_host_service`）。
- `AutomationService` 每 60 秒检查到期项；终端运行用智能体证据加空闲判定观察，聊天运行读结构化会话日志；结果写成 `AutomationRun`。
- 主机围栏：搬到 SSH 主机 orcad 上的自动化在桌面被拒绝调度（`orcad-fenced-automation.ts`）。
- `reuseSession` 只复用**这条自动化自己以前建过的**聊天会话（`automation-chat-session-reuse.ts`）。

**含义**：要在某台主机上「按时干活」（即使总管所在的电脑合盖也要跑），由 super agent 建一条自动化；要「按时叫醒总管自己想一想、汇报一下」，不适合用自动化，需要总管自己的日程。

## 6. 智能体会话、状态与结构化聊天

- 启动：一切走 `agent.launch`（`src/main/agent-launch/agent-launch-executor.ts`），模式 `structured | terminal`，结构化被拒时回退终端。约 45 个智能体。
- 身份：`paneKey`（`src/shared/stable-pane-id.ts`）、`ORCA_TERMINAL_HANDLE`、`ORCA_AGENT_SESSION_ID`、provider 自己的会话号。
- 状态：`working | blocked | waiting | done`（`src/shared/agent-status-types.ts:50`），来自各智能体的托管钩子（本机回环 HTTP 钩子服务），PTY 的 OSC 7501 作兜底；`agent-turn-idle-verdict.ts` 判定一轮结束。
- 结构化会话（Orca 管进程）：Claude 经 `@anthropic-ai/claude-agent-sdk` 驱动用户自己的 CLI，Codex 经 `codex app-server`，Pi 经 RPC，Grok/OpenCode/OMP/Antigravity 经 ACP；界面 `src/renderer/src/components/native-chat/`，接口 `agentSession.*`。
- 限制：Claude 结构化会话固定 `claude_code` 预设、`settingSources user/project/local`，`--system-prompt` 被剥掉；ACP 的 `mcpServers` 恒为空。**但工作目录里的 `CLAUDE.md`/`AGENTS.md`、`.claude/settings.json`、技能都会生效**——总管的身份与规则可以写在它自己的工作区里，不需要改上游启动参数。
- Orca 自己**不直接调用任何大模型 API**；文本生成一律以一次性方式调用智能体 CLI（`src/main/text-generation/`）。凭据是各 CLI 自己的登录。
- Orca **没有对智能体暴露 MCP 服务**；智能体靠 `orca` CLI 加内置技能（`skill-guides/` 编进 `src/cli/bundled-skill-guides.ts`，`orca skills get <name>`）控制 Orca。
- 注入终端的环境：`ORCA_PANE_KEY`、`ORCA_TAB_ID`、`ORCA_WORKTREE_ID`、`ORCA_TERMINAL_HANDLE`、`ORCA_WORKSPACE_ID`、`ORCA_CLI_COMMAND`、`ORCA_USER_DATA_PATH` 等。

## 7. 通知与手机

- 桌面通知投递：`src/main/notifications/notification-delivery-service.ts`；离开判定 `desktop-away-state.ts`（锁屏或空闲超过阈值即「离开」）。
- 手机推送契约：`src/shared/mobile-push-contract.ts`，来源只有 `agent-task-complete | terminal-bell | plugin`，智能体状态映射成 `needs-input | finished`，过滤项 `onlyWhenDesktopAway` 等；字符串要与云端网关和手机端保持一致，**不能随意加枚举值**。
- 手机连桌面 Orca 或 `orca serve`/orcad（直连 E2EE WebSocket 或经 Orca Cloud 中继）；手机可调 `agentSession.*`（`runtime-rpc-mobile-agent-session-methods.ts`）、`agent.launch`、`terminal.*`、`worktree.*`、`automation.*`，编排只有 worker 级的少数方法。
- 手机会话页能显示结构化会话的原生聊天（`mobile/src/session/MobileNativeChat*`）。

**含义**：总管如果是结构化会话，手机上**现在就能和它聊天**；总管等你回答时，现有的 `needs-input` 推送也会响。

## 8. 外部渠道与插件

- Slack 连接器：`src/main/connector-cloud/`、`src/main/external-conversations/` 把外部线程绑到 claude/codex 会话，智能体用 `orca connector reply` 回复（`src/cli/specs/connector.ts:87`）。这是「在任何地方和总管说话」的现成样板。
- 插件（Host API 1.3）能加右侧面板与受信 worker，能 `workspace.list/open`、`terminal.create/sendText/read`、`agent.launch`、`notifications.show`；但不能建工作区、不能开结构化会话、没有编排与自动化接口、没有手机界面。**插件太薄，当不了总管本体**，可以作为以后扩展渠道或面板的方式。

## 9. 主机联系与判定

- 判定词只有 `live` / `unverifiable` / `exited`（`src/shared/agent-process-presence.ts:24` 等）。失联不是死亡的证据。
- `getReachableRuntimeEnvironmentIds`、`sshConnectionStates`、`createRuntimeClientEventsSync` 都在**渲染层**（`src/renderer/src/hooks/...`、`store/slices/ssh.ts`）；主进程里的总管内核需要使用主进程一侧等价的联系状态，并遵守同一规则：不自己重连、不重试、不读不在联系的主机，重新联系上才触发下一次读。

## 10. 缺口清单（super agent 要新做的）

| 缺口                                           | 归属                       |
| ---------------------------------------------- | -------------------------- |
| 常驻、唯一、可恢复的总管会话与它的工作区       | super agent                |
| 跨主机概览（一条命令看全局，带判定）           | super agent                |
| 结构化的「问人」卡片与送达（桌面/手机/通知）   | super agent                |
| 总管自己的时间：一次性复查、条件复查、周期日程 | super agent                |
| 动作分级与审批（破坏性、对外、驱动用户会话）   | super agent（RPC 层接缝）  |
| 预算、并发槽位、跳数熔断、暂停                 | super agent                |
| 活动记录与「为什么」                           | super agent                |
| 记忆文件                                       | super agent                |
| `orca task create` 与任务关联 CLI              | 本地任务功能（另开分支补） |
| Goal 的 `orca` 子命令                          | Goal 功能（另开分支补）    |
