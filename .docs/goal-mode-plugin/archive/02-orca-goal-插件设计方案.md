> **已归档** — 被 [10-方案-orca-goal-v2.md](./10-方案-orca-goal-v2.md) 取代。

# Orca Goal 模式插件设计方案(`orca-goal`)

> ⚠️ **已被取代**。本文假设可以改动 Orca 宿主(5 处 seam 扩展)。
> 用户明确要求**不改 Orca 源码**后,主方案改为
> [`03-零改动方案-stop-hook-驱动.md`](./03-零改动方案-stop-hook-驱动.md) ——
> 把注入点从 `terminal.sendText` 换成 agent 自己的 `Stop` hook,本文列出的缺口 A/B/C 全部消失。
> 本文保留的价值:§2「Orca 侧现状与硬约束」的调研结论仍然准确,且 §9 记录了
> 若将来要把 Goal 内建化时值得补的 seam。

配套调研:[`01-codex-goal-模式调研.md`](./01-codex-goal-模式调研.md)

> **一句话结论**:Codex 的 Goal 循环在 Orca 里完全可以复刻,但 **Orca 插件 API v0 的能力面不足以支撑一个可用的 Goal 模式**——
> 缺三样东西:事件里没有终端句柄、命令不能带参数、面板读不到插件状态。
> 因此本方案是「**一组极小的宿主 seam 扩展(约 5 处,主进程改动 <150 行)+ 一个纯插件**」,
> 并附一个零宿主改动的降级版本(§10)供对比。

---

## 1. 目标与非目标

### 目标
- 用户在任意 agent pane 上开启 Goal 模式后,agent 每次跑完一轮就**自动被推着继续**,直到目标达成 / 判定阻塞 / 触达预算。
- 有一套**真正的护栏**(轮数、时长、无进展检测、错误熔断、连续等待熔断),不是无脑 `while true` 的 Ralph loop。
- 用户输入**无条件优先**,任何时候都能 pause / stop。
- 状态跨 worker 回收、跨应用重启存活。

### 非目标(本期)
- 不做 native-chat(非 PTY)会话的 Goal 模式——插件 API 只能触达终端。
- 不做多 pane 编排(那是 Orca 现有 orchestration 的地盘)。
- 不自动应答权限确认 / AskUserQuestion。**明确禁止**:绕过安全确认不是看门狗的职责。

---

## 2. Orca 侧现状与硬约束(调研结论)

这些是设计的地基,每条都在代码里核实过。

### 2.1 插件运行时
| 事实 | 位置 | 设计含义 |
|---|---|---|
| worker 是 **plain Node 子进程**(`ELECTRON_RUN_AS_NODE`),无模块沙箱 | `src/main/plugins/plugin-host-entry.ts` | 插件可用 `fs` / `child_process`。consent 指纹里 `main` 字段被标注为 `trusted-node-worker`,即用户对此已知情同意 |
| 环境变量是**白名单裁剪**过的 | `plugin-worker-env.ts` | 拿不到用户 shell 里的 token;也拿不到 `ORCA_*` 之类的上下文 |
| worker **空闲 5 分钟被回收** | `PLUGIN_WORKER_IDLE_REAP_MS = 5 * 60_000` | 所有状态必须持久化到 `storage`;**不能依赖长定时器** |
| manifest 声明订阅的事件会 `workerController.ensure()` **懒唤醒** worker | `plugin-event-delivery.ts:31` | 事件驱动的看门狗能在回收后被自动拉起 ✅ |
| 并发 worker 上限 5 | `PLUGIN_WORKER_MAX_ACTIVE_DEFAULT` | 无影响 |

### 2.2 事件面(v0 只有 3 个)
```ts
'worktree.created' | 'worktree.removed' | 'agent.status.changed'
```
`agent.status.changed` 投影后的 payload 仅:
```ts
{ worktreeId: string | null, paneKey: string, state: string, receivedAt: number }
```
而 agent 状态取值是 **`'working' | 'blocked' | 'waiting' | 'done'`**
(`src/shared/agent-status-types.ts:16`,来自 hook 管线,**不是**终端标题猜测 —— 这点很重要,信号质量高)。

> ⚠️ **缺口 A**:内部 `AgentStatusEntry` 有 `terminalHandle` / `agentType` / `prompt` / `interrupted` / `stateStartedAt`,
> 但插件投影全部丢弃。插件**无法把 `paneKey` 映射到可写入的终端**。

### 2.3 宿主 API 面(v0 共 13 个方法)
`workspace.readContext` / `terminal.sendText` / `notifications.show` / `storage.*` / `secrets.*` / `settings.*` / `events.subscribe`

关键细节:
- `workspace.readContext` 只返回 `{branch, displayName, terminals:[{id}]}` —— **没有 worktree 路径**(内部有,被投影掉了)。
- `terminal.sendText` **只允许写"当前聚焦 worktree"内的终端**
  (`plugin-host-method-bindings.ts:98`:先 `resolveActiveWorktreeContext()`,再校验 terminalId 属于它)。
  > ⚠️ **缺口 B**:用户切到别的 worktree,后台目标就写不进去了。
- 文本上限 `PANEL_ACTION_TEXT_MAX_LENGTH = 4096`。
- **`buildSendPayload` 是裸文本 + `\r`,没有 bracketed paste**(`orca-runtime.ts:32485`)。
  > ⚠️ **约束 C**:多行提示词会在第一个 `\n` 处被 TUI 当成回车提交。**续跑提示词必须是单行**。

### 2.4 UI 面
- 面板是 **opaque-origin sandbox iframe**,CSP `default-src 'none'; connect-src 'none'`
  (`plugin-panel-shell.ts:21`)—— 面板无法 fetch 任何东西。
- 面板只能通过 postMessage 桥调用 `panel: true` 的三个方法
  (`workspace.readContext` / `terminal.sendText` / `notifications.show`)。
  > ⚠️ **缺口 D**:面板**读不到 `storage`**,也**没有 panel→worker 通道**,所以无法渲染目标状态。
- 命令通过 Cmd-J 快捷动作 / 键位触发,调用形如 `invokeCommand({pluginKey, commandId})`。
  > ⚠️ **缺口 E**:**命令不能带参数**,用户无法输入目标文本。
- 插件设置(`settings:own`)是 worker 私有 KV,**没有用户可编辑的 UI**(`PluginsSettingsSection.tsx` 只管安装/启停)。

### 2.5 结论
缺口 A + E 是**致命**的(拿不到终端、输不进目标),B + D 是**体验级**的。
所以:纯 v0 插件只能做到"无参数的持续推进看门狗,且要求聚焦 worktree 内只有一个终端"。
本方案选择补齐 seam。

---

## 3. 概念映射

| Codex | Orca |
|---|---|
| thread | **pane**(`paneKey = TAB_ID:LEAF_ID`),其中运行一个 agent CLI |
| `thread_goals` 表 | 插件 `storage`,key = `goal:PANE_KEY` |
| `on_thread_idle` | `agent.status.changed` 且 `state === 'done'` |
| `try_start_turn_if_idle` 闸门 | 本插件自己的 `canContinue()` 前置检查(§5.3) |
| continuation steering item | `terminal.sendText(单行续跑提示, enter: true)` |
| `update_goal(complete/blocked)` 工具 | **哨兵文件协议**(§6)——插件无法向 agent 注册工具 |
| `TokenUsageContributor` | ❌ v0 拿不到 → 用"轮数 + 墙钟"代理预算(§7) |
| `on_turn_error → blocked` | 超短 turn 连击检测 + 连续 `waiting/blocked` 检测(§7) |
| 状态行指示器 | 通知 + (P1)右侧栏面板 |

---

## 4. 架构

```
┌─ Orca 主进程 ────────────────────────────────────────────────┐
│  agentHookServer.subscribeEnrichedStatus                     │
│        │  (+ terminalHandle / agentType / interrupted) ← P0-1 │
│        ▼                                                      │
│  pluginService.emitEvent('agent.status.changed')             │
└────────┬─────────────────────────────────────────────────────┘
         │ 懒唤醒 + 投递
         ▼
┌─ 插件 worker (plain Node) ───────────────────────────────────┐
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ GoalStore    │◀─▶│ GoalMachine  │──▶│ ContinuationSender│ │
│  │ (storage KV) │   │ (纯函数状态机)│   │ terminal.sendText │ │
│  └──────────────┘   └──────┬───────┘   └──────────────────┘  │
│                            │                                  │
│                     ┌──────▼────────┐  ┌──────────────────┐  │
│                     │ SentinelWatcher│  │ ProgressProbe    │  │
│                     │ (fs, 完成/阻塞)│  │ (git, 无进展检测) │  │
│                     └───────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**核心原则:`GoalMachine` 是纯函数** —— 输入 `(当前 goal 状态, 事件, now)`,输出 `(新状态, 动作列表)`。
所有 I/O(storage / sendText / fs / 通知)由外层执行。这样状态机可以用假时钟做穷尽的单元测试,
这是这类"会自动花用户钱"的功能里最重要的可测性设计。

---

## 5. 状态机与事件处理

### 5.1 状态(照搬 Codex 六态,语义对齐)

```
active | paused | blocked | limited | complete | cancelled
```
(Orca 无法区分 `usage_limited` 与 `budget_limited`,合并为 `limited`,附 `limitReason`。)

### 5.2 持久化结构

```jsonc
// storage key: "goal:PANE_KEY"
{
  "goalId": "uuid",
  "paneKey": "tab-1:leaf-abc",
  "worktreeId": "…",
  "terminalHandle": "…",          // P0-1 后从事件直接拿到
  "objective": "…",                // P0-4 后从命令参数拿到
  "status": "active",
  "createdAt": 1753..., "updatedAt": 1753...,
  "turns": 3,                      // 已注入的续跑次数
  "budget": { "maxTurns": 25, "maxWallClockMs": 5400000 },
  "lastContinuationAt": 1753...,
  "lastDoneAt": 1753...,
  "turnStartedAt": 1753...,
  "consecutiveWaiting": 0,         // 对齐 Codex blocked audit
  "shortTurnStreak": 0,            // 疑似崩溃检测
  "noProgressStreak": 0,           // git 无变化轮数
  "lastHeadSha": "…", "lastDirtyHash": "…",
  "deferred": true,                // 对齐 Codex continuation deferral
  "sentinelPath": "/tmp/orca-goal/GOAL_ID.json",
  "limitReason": null
}
```
另有全局 key `goals:index` 保存活跃 paneKey 列表(worker 冷启动时重建订阅视图)。

### 5.3 `agent.status.changed` 处理

```
收到事件 e:
  goal = store.get(e.paneKey);  if (!goal || goal.status !== 'active') return

  switch (e.state):
    'working':
       goal.turnStartedAt = e.receivedAt
       取消任何 pending 的续跑定时器            ← 用户自己发了消息,让位
       goal.consecutiveWaiting = 0

    'waiting' | 'blocked':
       goal.consecutiveWaiting++
       notify("Goal 暂停中:agent 在等你确认")   ← 只通知,绝不自动应答
       if (consecutiveWaiting >= 3) → status='blocked'   // 对齐 Codex 三连阻塞审计

    'done':
       goal.lastDoneAt = e.receivedAt
       ① 哨兵检查   → complete / blocked 则落状态 + 通知,结束
       ② 预算检查   → 超限则注入一次收尾提示,status='limited',结束
       ③ 熔断检查   → 超短 turn 连击 / git 无进展连击 → status='blocked',结束
       ④ deferral   → goal.deferred 为真则清标记并返回(不抢第一轮)
       ⑤ 防抖 4s 后进入 §5.4 注入流程
```

### 5.4 注入前的"让位闸门"(对标 `try_start_turn_if_idle`)

防抖到期后**逐条重新校验**,任一不满足就放弃本次:

1. `store.get(paneKey).status === 'active'`(期间可能被 pause)
2. 最后一次收到的 state 仍是 `'done'`(期间可能又 working / waiting)
3. `now - lastContinuationAt > COOLDOWN_MS`(默认 10s,幂等去重;事件可能重放)
4. 目标终端仍存活且可写:
   - **P0 前**:`workspace.readContext()` 的 terminals 里存在该 id
   - **P0-2 后**:直接发,由宿主校验 worktree 归属
5. 若第 4 条因"不在聚焦 worktree"失败 → **不放弃,转入退避重试队列**
   (1s→2s→4s…上限 60s,累计 5 分钟仍失败则 `paused` + 通知)

通过后:`terminal.sendText({terminalId, text: 单行续跑提示, enter: true})`
→ `turns++`、`lastContinuationAt = now`、持久化。

### 5.5 worker 被回收后的恢复

worker 冷启动(被下一个事件唤醒)时执行 `reconcile()`:
- 读 `goals:index`,对每个 active 目标检查 `now - lastDoneAt`;
- 若 `> RECOVERY_IDLE_MS`(默认 60s)且最后已知 state 是 `done` → 立即走 §5.4(补上丢失的定时器)。

**丢失定时器是可接受的,重复注入不可接受** —— 所以恢复路径必须复用同一套 cooldown 去重。

---

## 6. 完成 / 阻塞判定:哨兵文件协议

插件无法向 agent 注册工具,也读不到终端输出。方案:**让 agent 把结论写进一个插件自己指定的绝对路径**。

- 路径由插件生成:`path.join(os.tmpdir(), 'orca-goal', GOAL_ID.json)`
  —— 用 `os.tmpdir()` + `path.join`,天然跨平台;**不依赖 worktree 路径**(v0 拿不到)。
- 续跑提示词末尾固定携带一句(单行):
  > `When the objective is fully achieved and verified, write {"status":"complete","summary":"…"} to ABS_PATH; if the same blocker has recurred for three turns, write {"status":"blocked","reason":"…"} there instead. Do not write it for partial progress.`
- 插件在每次 `done` 事件时读一次该文件(不是 `fs.watch`,避免 worker 回收后监听丢失)。
- 读到后:落状态 → `notifications.show` → 删除哨兵文件。

**限制(必须写进插件说明)**:SSH / 远程 worktree 场景,agent 写的是**远端** tmp,本地 worker 读不到 →
该场景自动降级为"仅轮数/时长护栏",并在开启目标时通知用户。
(检测方式:P0-1 后事件带 `connectionId`,非 null 即远程。)

> 替代方案 C(备选):解析 provider 的 session transcript(Orca 在 `src/main/native-chat/transcript-*` 已有成熟解码器,
> 覆盖 claude / codex / grok)。它能同时拿到 **token 用量**,是 P2 的正解,但需要宿主暴露
> `usage.readForPane` 而不是让插件自己去猜 transcript 路径。

---

## 7. 预算与护栏

| 护栏 | 触发条件 | 结果 | 对应 Codex 机制 |
|---|---|---|---|
| **轮数预算** | `turns >= maxTurns`(默认 25) | 注入收尾提示 → `limited` | `budget_limited` |
| **时长预算** | `now - createdAt >= maxWallClockMs`(默认 90 min) | 同上 | — |
| **连续等待** | `consecutiveWaiting >= 3` | `blocked` + 通知 | blocked audit |
| **超短 turn 连击** | 连续 3 次 `done - turnStartedAt < 3s` | `blocked`(疑似 agent 崩溃/立即退出) | `on_turn_error → blocked` |
| **无进展检测** | 连续 3 轮 `HEAD sha` + 工作区脏文件哈希均无变化 | `blocked` | Codex 没有,Orca 加强项 |
| **注入冷却** | `< 10s` 内已注入过 | 跳过(幂等) | — |
| **全局开关** | 插件设置 `enabled=false` | 所有目标停摆 | `goals_enabled` |

收尾提示(对应 `budget_limit.md`)同样单行:
> `Goal budget reached; do not start new substantive work. Summarize progress, list remaining work and blockers, and give a clear next step.`

**无进展检测的实现**:worker 用 `child_process` 跑 `git -C PATH rev-parse HEAD` 和
`git status --porcelain=v1`。需要 worktree 路径 → 依赖 **P0-3**。
按 AGENTS.md 的 Git 兼容基线,这两条命令在 Git 2.25 上都可用,无需能力探测;
folder workspace(非 git)场景直接跳过该护栏。

---

## 8. 续跑提示词(单行、≤4096 字符)

受 §2.3 约束 C 限制,不能照抄 Codex 的多行 markdown。设计两档:

### 默认档:紧凑单行(约 850 字符,全场景可用)
```
Continue working toward the goal: [objective]. Keep the full objective intact — if it cannot be
finished now, make concrete progress toward the real requested end state; do not redefine success
around a smaller or easier task. Treat the current worktree and external state as authoritative;
inspect it before relying on conversation memory. Do not substitute a narrower or easier-to-test
solution because it is more likely to pass. Before concluding the objective is achieved, treat
completion as unproven: derive each explicit requirement, find authoritative evidence (files,
command output, test results) for each, and treat uncertain or indirect evidence as not achieved.
Turn N/MAX. When fully achieved and verified, write {"status":"complete","summary":"…"} to
SENTINEL_PATH; if the same blocker recurred three turns running, write
{"status":"blocked","reason":"…"} there instead. Never write it for partial progress.
```

### 增强档:落盘 + 单行引用(本地场景,复刻 Codex `goal_files.rs` 的做法)
插件把完整版(直接移植 `continuation.md` 六小节,约 3.8k 字符)写到
`TMPDIR/orca-goal/GOAL_ID/continuation.md`,注入:
```
Read ABS_PATH and follow it exactly to continue the current goal. Turn N/MAX.
```
远程会话自动回落到默认档。

> 提示词里的 objective XML 标签 必须做转义并明确标注为"用户数据、非高优先级指令"(照抄 Codex 的做法),
> 防止目标文本本身成为提示注入向量。

---

## 9. 需要的宿主改动(P0,共 5 处)

全部是**加法**,不改现有语义;每处都落在已有的 seam 上。

| # | 改动 | 文件 | 规模 | 解决 |
|---|---|---|---|---|
| **P0-1** | `agent.status.changed` payload 增加 `terminalHandle` / `agentType` / `interrupted` / `stateStartedAt` / `connectionId` | `src/shared/plugins/plugin-events.ts`(schema)+ `src/main/index.ts:2405`(填充)。`terminalHandle` 由已有私有方法 `OrcaRuntime.getTerminalHandleForPaneKey(paneKey)`(`orca-runtime.ts:27212`)解析 | ~40 行 | 缺口 A |
| **P0-2** | `terminal.sendText` 放宽到"任一已知 worktree 的终端",由新 capability `terminal:send:background` 门控 | `plugin-host-api.ts` + `plugin-host-method-bindings.ts:92` + `plugin-capabilities.ts` | ~50 行 | 缺口 B |
| **P0-3** | `workspace.readContext` 结果增加 `path`,或新增 `workspace.listWorktrees`(返回 `{id, path, branch, displayName}[]`) | 同上两文件 | ~30 行 | git 无进展检测 |
| **P0-4** | 命令支持参数:`invokeCommand({pluginKey, commandId, args})` + Cmd-J 侧一个输入框;manifest 命令加 `argument?: {label, placeholder}` | `plugin-manifest.ts`、`plugin-command-execution.ts`、`plugin-quick-actions.ts` | ~60 行 | 缺口 E |
| **P0-5** | 把 `storage.get` / `storage.keys` 标为 `panel: true`(只读) | `plugin-host-api.ts`(改两个布尔) | ~2 行 | 缺口 D(面板 UI) |

**P0-1 与 P0-4 是必须项**;P0-2/3/5 是体验项,可延后。
所有改动都要同步 `plugin-host-conformance.test.ts` 与 consent 文案(`PLUGIN_CAPABILITY_DESCRIPTIONS`)。

---

## 10. 降级方案:零宿主改动能做到什么

如果一定要先出一个不碰主进程的版本:

- **目标输入**:没有。命令无参数 → 只能是"继续推进当前会话里已经交代过的任务"(agent 自己有上下文)。
  续跑提示词写成 `Continue working toward the objective established earlier in this session…`。
- **终端定位**:`goal.start` 时调 `workspace.readContext()`;
  聚焦 worktree 恰好只有 1 个终端 → 用它;多于 1 个 → 通知用户"无法确定目标终端"并拒绝开启。
- **后台运行**:不支持。用户切走 worktree 就退避重试,5 分钟后自动 pause。
- **完成判定**:哨兵文件仍可用(路径由插件生成,不需要 worktree 路径)。
- **无进展检测**:不可用(拿不到 worktree 路径)。
- **UI**:只有 Cmd-J 命令 + 桌面通知,没有面板。

**评价**:能验证核心循环与提示词效果,适合做内部 dogfood(通过 `devPluginPaths` 加载),
但不适合作为面向用户的功能发布。

---

## 11. 插件形态

### manifest(`orca-plugin.json`)
```jsonc
{
  "manifestVersion": 1,
  "id": "goal",
  "publisher": "orca",
  "name": "Goal Mode",
  "version": "0.1.0",
  "description": "Keeps an agent working toward a persistent objective, with budgets and guardrails.",
  "engines": { "orca": ">=1.x.y" },
  "pluginApi": 1,
  "main": "main.mjs",
  "contributes": {
    "panels":   [{ "id": "goal", "title": "Goal", "icon": "target", "entry": "panel.html" }],
    "commands": [
      { "id": "goal-start",  "title": "Goal: Start…",  "context": "worktree",
        "argument": { "label": "Objective", "placeholder": "e.g. Migrate to Pydantic v2, all tests green" } },
      { "id": "goal-pause",  "title": "Goal: Pause",   "context": "worktree" },
      { "id": "goal-resume", "title": "Goal: Resume",  "context": "worktree" },
      { "id": "goal-stop",   "title": "Goal: Stop",    "context": "worktree" },
      { "id": "goal-status", "title": "Goal: Status",  "context": "global" }
    ],
    "events": [{ "on": "agent.status.changed" }, { "on": "worktree.removed" }]
  },
  "capabilities": [
    { "kind": "workspace:read" }, { "kind": "terminal:send" },
    { "kind": "notifications:show" }, { "kind": "storage" },
    { "kind": "events:subscribe" }, { "kind": "settings:own" }
  ]
}
```

### 文件布局
```
plugins/goal/
├── orca-plugin.json
├── main.mjs                  # 入口:注册命令 + 事件,装配依赖
├── goal-machine.mjs          # 纯函数状态机(核心,零 I/O)
├── goal-store.mjs            # storage KV 读写 + index 维护
├── continuation-prompt.mjs   # 单行提示词构造 + 转义 + 长度守卫
├── completion-sentinel.mjs   # 哨兵文件读写/清理
├── progress-probe.mjs        # git HEAD/dirty 探测
└── panel.html                # 目标看板(P0-5 之后可读 storage)
```
文件命名遵循 AGENTS.md:按承载的领域概念命名,不出现 `utils` / `helpers`。

### 面板(P0-5 之后)
右侧栏 `Goal` 面板,用 `PANEL_DESIGN_TOKEN_ALLOWLIST` 里的 CSS 变量(`--background` / `--foreground` /
`--muted-foreground` / `--border` …)渲染,不引入任何字体、颜色硬编码,符合 STYLEGUIDE。
内容:每个活跃目标一行 —— 状态徽章、objective 摘要、`turns/maxTurns`、已用时长、pause/stop 按钮
(按钮通过 `terminal.sendText` 做不到状态变更 → 需 P0-4 之后由命令承担,或面板只读 + 操作走 Cmd-J)。

---

## 12. 跨平台 / SSH / folder workspace

| 场景 | 处理 |
|---|---|
| **Windows** | 哨兵路径用 `os.tmpdir()` + `path.join`;git 探测用 `child_process.execFile`(不走 shell,避免引号问题) |
| **SSH / 远程 worktree** | 哨兵文件不可达 → 开启目标时检测 `connectionId !== null`,通知用户"完成判定不可用,仅轮数/时长护栏生效";git 探测同样跳过 |
| **WSL** | 同远程处理(路径命名空间不同) |
| **folder workspace(非 git)** | 跳过无进展检测,其余护栏照常 |
| **agent 类型差异** | `agentType`(P0-1)用于选择提示词方言;未知 agent 用默认档。所有 agent 都走同一套 hook 状态,信号是统一的 |

---

## 13. 安全与信任

- **绝不自动应答权限确认 / AskUserQuestion**。`waiting` / `blocked` 只通知并计数,不发任何按键。
- objective 与哨兵内容在拼进提示词时做 XML 转义并显式标注为不可信数据(照搬 Codex)。
- 每次注入都是一次**审计事件**:`terminal.sendText` 是 mutation,宿主已按 `plugin:ID` actor 写审计日志。
- 全局 kill switch:插件设置 `enabled`,以及 Orca 自身的插件启停。
- 注入频率上限(cooldown 10s + 轮数上限)本身就是防失控的速率限制。

---

## 14. 测试策略

| 层 | 内容 |
|---|---|
| **状态机单测(主力)** | `goal-machine` 是纯函数 → 用事件序列 fixture + 假时钟穷举:让位、防抖、deferral、幂等去重、五种熔断、worker 回收后恢复、目标被替换后的在途事件 |
| **提示词守卫** | 断言生成的续跑文本**不含 `\n`** 且 `< 4096` 字符(这两条一旦破就是线上事故) |
| **哨兵协议** | 合法/非法 JSON、部分写入、陈旧文件(goalId 不匹配)、权限错误 |
| **宿主 seam** | P0-1..5 各自补 `plugin-host-conformance.test.ts` 与 capability 文案测试 |
| **集成** | 用 `devPluginPaths` 挂载,跑一个真实 agent 会话:目标达成、预算耗尽、连续等待、切走 worktree 后退避 |

---

## 15. 分期

| 阶段 | 内容 | 产出 |
|---|---|---|
| **M0** | P0-1 + P0-4 两处宿主改动 | 插件能拿到终端句柄、能收到目标文本 |
| **M1** | 插件核心:状态机 + storage + 续跑注入 + 轮数/时长预算 + 哨兵协议 + 通知 | 可用的 Goal 模式,Cmd-J 驱动 |
| **M2** | P0-2/3 + 无进展检测 + 后台 worktree 续跑 + 远程降级提示 | 真正的后台看门狗 |
| **M3** | P0-5 + 面板看板 + 增强档提示词(落盘引用) | 完整体验 |
| **M4(可选)** | 宿主 `usage.readForPane`(复用 `native-chat/transcript-*` + `claude-usage`/`codex-usage`)→ 真 token 预算 | 与 Codex 对齐 |

---

## 16. 未决问题(需要决策)

1. **哨兵协议 vs transcript 解析**:前者简单、跨 agent、但依赖模型守约;后者准确、能拿 token、但需要宿主支持且 per-provider 维护。
   建议 M1 用哨兵,M4 补 transcript 作为交叉验证(两者不一致时以 transcript 为准)。
2. **目标粒度**:一个 pane 一个目标(对齐 Codex 的 thread 语义),还是一个 worktree 一个目标?
   建议 pane —— 与 hook 事件的天然粒度一致,也允许同一 worktree 并行两个目标。
3. **这该是插件还是内建功能?** 目前 Orca 的 orchestration / automations 都是内建的。
   Goal 模式做成插件的代价是要撬开 5 处 seam;做成内建则可以直接复用 `AgentStatusEntry` 全字段、
   transcript 读取和 usage 统计,实现会干净得多。
   **建议**:先按插件做(验证提示词与循环参数,迭代快、可单独开关),
   若验证成功且要成为默认能力,再内建化 —— 撬开的这 5 处 seam 对其他插件同样有价值,不算浪费。