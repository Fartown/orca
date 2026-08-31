# 方向三调研：Activity 现在有什么问题

2026-08-22 · 全部结论来自读源码与实机数据，逐条给证据

## 一句话结论

**Activity 的形态是对的，缺的是持久层。** 它不是一个记录，是一个**活着的视图**——事件只存在于内存里的 `stateHistory`，重启即归零、没有正文、每面板 20 条上限、按 `paneKey` 索引。它 90% 的问题都由这一个根因派生。

所以方向三的答案不是"重做"，而是**给它换一个底**：事件源从 `stateHistory` 换成持久化的轮次记录，身份从 `paneKey` 换成稳定会话 id，已读从面板水位换成逐条 + 处理状态。UI 层的分组、筛选、append-only 心智、终端下钻**全部保留**。

## 它是什么

- `src/renderer/src/components/activity/ActivityPrototypePage.tsx`，**2042 行**，`activeView === 'activity'` 时渲染，lazy 加载，**不在任何 feature flag 后面**——是真在用的视图，不是藏起来的原型
- 两层数据模型：
  - **`AgentPaneThread`** = 一行 = **一个面板**（`paneKey`），带 `events: ActivityEvent[]`、`unread`、`responsePreview`、`currentAgentState`
  - **`ActivityEvent`** = 一次停止，`state: 'done' | 'blocked' | 'waiting'`，各带 `unread`

## 已经做对、应当原样保留的

| 项 | 证据 |
| --- | --- |
| **停止分型与产品方案一致** | `ActivityEventState = Extract<AgentStatusState, 'done' \| 'blocked' \| 'waiting'>`——完成型/等待型的切分现成 |
| **会话边界已正确排除** | `if (!isActivityEventState(entry.state) \|\| entry.sessionBoundary === true) return`，注释注明 STA-3386："SessionStart creates an idle row, not an 'Agent finished' activity event" |
| **append-only 的心智已经是对的** | 源码注释：`// Why: Activity is append-only; when a pane continues (done→working), stateHistory is the only record of the previous done/blocking event.` |
| **事件去重键形状对** | `id = agent:${paneKey}:${state}:${timestamp}` + `seenEventIds` —— 与技术方案提的 `dedupe_key` 同构，只是主语错了（见问题 5） |
| **已读可反悔** | 同时有 `acknowledgeAgents` 与 `unacknowledgeAgents`，能把已读改回未读 |
| **分组与筛选骨架已在** | `ActivityGroupBy = 'status' \| 'project' \| 'worktree' \| 'agent'`；`ThreadReadFilter = 'all' \| 'unread'` |
| **活终端下钻已在** | `ActivityTerminalPortalTarget`，双槽 `'primary' \| 'secondary'` |
| **陈旧状态会衰减** | `freshActivityLiveAgentState` 用 `AGENT_STATUS_STALE_AFTER_MS` 判新鲜度，hook 静默后不会一直转圈 |

## 问题清单

### A 级 · 同一个根因：事件没有持久层

| # | 问题 | 证据 |
| --- | --- | --- |
| **A1** | **重启后历史事件全部消失** | `stateHistory` **不写进 `last-status.json`**。实测本机 `~/Library/Application Support/orca/agent-hooks/last-status.json`（version 2，12 个面板）：每条 entry 只有 `connectionId` / `hookEventName` / `launchTokenHash` / `paneKey` / `payload` / `providerPromptId` / `providerSession` / `receivedAt` / `source` / `stateStartedAt` / `tabId` / `worktreeId`，payload 里只有 `agentType` / `lastAssistantMessage` / `prompt` / `state` / `toolInput` / `toolName`——**12 个面板无一有 `stateHistory`**。所以每面板只有最新一条能跨重启存活 |
| **A2** | **历史事件没有正文** | `historyEntrySnapshot` 显式置空：`lastAssistantMessage: undefined`、`toolName: undefined`、`toolInput: undefined`。**只有每个面板最新那一条带内容**，往前翻全是空壳 |
| **A3** | **每面板最多 20 条，滚动丢弃** | `AGENT_STATE_HISTORY_MAX = 20`，注释写明是 rolling log |
| **A4** | **正文是 8 KB 预览，不是全文，且不标注截断** | `AGENT_STATUS_ASSISTANT_MESSAGE_MAX_LENGTH = 8000`；实测本机一条 771 字符、另一条完全没有 |

> **A1 + A2 合起来的实际观感**：能回答"这个面板刚才停了"，回答不了"它上一次停下来说了什么"。而产品方案的核心诉求是"介入的时候把信息给全"。

### B 级 · 身份与状态语义

| # | 问题 | 证据 |
| --- | --- | --- |
| **B1** | **身份是 `paneKey`，不是会话** | `AgentPaneThread.paneKey`；事件 id 也以它为前缀。面板关掉或换 split，线索就断；同一位置重开会话会串进同一行 |
| **B2** | **已读是面板级单水位** | `unread: acknowledgedAt < timestamp`；ack / unack 都按 `[paneKey]` 整批。**做不到"这条已读、那条未读"**——点开一个面板，它全部历史事件一起变已读 |
| **B3** | **只有已读，没有处理状态** | 全部动作只有 `acknowledgeAgents` / `unacknowledgeAgents` / `markAllThreadsRead`。**看过 = 办完**，正是产品方案 §2.3 花三轮否掉的语义 |
| **B4** | **选中一行即自动标已读** | 选中时 `storeData.acknowledgeAgents([selectedThread.paneKey])`。扫一眼就清空，叠加 B2 更严重 |

### C 级 · 组织与呈现

| # | 问题 | 证据 |
| --- | --- | --- |
| **C1** | **分组维度里没有"一件事"** | `ActivityGroupBy = 'status' \| 'project' \| 'worktree' \| 'agent'`——全是执行位置维度。十件事跨仓时，一件事被拆散在多个 worktree 组里 |
| **C2** | **下钻是原始终端，不是渲染过的会话** | 挂的是 live terminal portal，页面内无任何 native-chat 引用。长输出得自己在终端里翻，产物路径与链接不可点 |
| **C3** | **产物没有一等位置** | `ActivityEvent` 只有 `entry` / `prompt` / `preview`，没有"本轮明确引用的文件与链接"的容身处 |
| **C4** | **没有"事情"的持久容器** | 没有标题、没有结论、没有归档/找回。会话关掉结论就丢——这正是最初的原始诉求 |

## 对技术方案的影响

| 原计划 | 改为 |
| --- | --- |
| §4.1 新建 Issues 入口的"需要我"视图 | **复用 Activity 的呈现层**（分组、筛选、append-only、终端 portal、状态衰减），只换数据源 |
| §5 采集管线 | 仍然需要——A1~A4 就是它要解决的；但**分型逻辑与去重键形状可直接照 Activity 现有实现**（含 `sessionBoundary` 排除这类踩过的坑） |
| §3 会话身份 | 仍然需要——B1 是它要解决的 |
| §7 三态模型 | 仍然需要——B2/B3/B4 是它要解决的；`unacknowledgeAgents` 说明"可反悔"已有先例 |
| §10.2 未读迁移 | 简化——不是"迁移到新页面"，是**同一个页面换底**，面板级 ack 水位继续作为客户端本地投影（技术方案 §7.2 已改成这个方向） |

## 顺带捡到的、对会话身份有用的事实

`last-status.json` 的每条 entry **已经持久化了** `launchTokenHash` 与 `providerSession`（实测两个面板都有 `providerSession`）。技术方案 §3.3 的续接判定要用的两类证据，**至少有一类是跨重启存活的**。
