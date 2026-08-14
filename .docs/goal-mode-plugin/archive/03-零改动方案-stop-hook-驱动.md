> **已归档** — 被 [10-方案-orca-goal-v2.md](./10-方案-orca-goal-v2.md) 取代。

# Orca Goal 模式插件 · 零改动方案(Stop Hook 驱动)

约束:**不改动 Orca 任何源码**,只用插件机制。
前置阅读:[`01-codex-goal-模式调研.md`](./01-codex-goal-模式调研.md)。
[`02-…设计方案.md`](./02-orca-goal-插件设计方案.md) 是"允许改宿主"的版本,本文取代它成为主方案。

---

## 0. 核心思路的转变

02 方案的困境是:插件想通过 `terminal.sendText` 把续跑提示"打字"进 agent 终端,
于是被卡在三个 v0 API 缺口上(拿不到终端句柄、写不进后台 worktree、提示词必须单行 ≤4096)。

**换一个注入点就全都消失了:不从终端外面打字进去,而是用 agent 自己的 `Stop` hook 从里面拦住它。**

已核实(不是推测):

- **Claude Code**:`Stop` hook 输出 `{"decision":"block","reason":"…"}` 或 exit 2 + stderr
  → **阻止本轮停止,把 reason 交给模型让它继续干**。
  输入 stdin 现成带 `session_id` / `transcript_path` / `cwd` / `stop_hook_active` /
  `last_assistant_message` / `stop_reason`。
  配置文件改动由 **file watcher 即时生效,不需要重启会话**。
- **Codex CLI**:同一套语义,源码里 `StopCommandOutputWire { decision: BlockDecisionWire, reason }`
  (`codex-rs/hooks/src/schema.rs:455`),注释直言"Claude requires `reason` when `decision` is `block`";
  `StopRequest` 字段与 Claude 一一对应(`hooks/src/events/stop.rs:24`)。
  支持仓库级 `REPO/.codex/hooks.json`(`external-agent-migration/src/service.rs:607`)。

也就是说,**Codex 的 `on_thread_idle → continuation steering item` 在 agent 外部有一个天然等价物**:
`Stop hook → decision:block + reason`。Goal 模式的整个运行时可以搬到 hook 脚本里,
Orca 插件只负责控制面(开关、状态、通知)。

### 换注入点带来的收益

| 维度 | `terminal.sendText` 路线 | **Stop hook 路线** |
|---|---|---|
| 需要 terminalHandle | 是,v0 拿不到 ❌ | 不需要 ✅ |
| 需要聚焦 worktree | 是,后台目标写不进去 ❌ | 不需要,纯后台 ✅ |
| 提示词长度/换行 | ≤4096 且**必须单行**(无 bracketed paste)❌ | 无限制、可多行 → **能逐字移植 Codex `continuation.md`** ✅ |
| token 计量 | 不可得 ❌ | stdin 现成给 `transcript_path` ✅ |
| 完成信号 | 需要额外协议 | stdin 现成给 `last_assistant_message` ✅ |
| 时序竞态 | 靠 `done` 事件 + 防抖,可能丢字符 ❌ | agent 生命周期内同步执行,零竞态 ✅ |
| 用户输入优先 | 要自己实现让位闸门 | Stop 只在 agent 自己要停时触发,天然让位 ✅ |
| 适用 agent | 所有 PTY agent ✅ | 仅支持 Stop hook 的(claude / codex / …) |

最后一行是唯一的退步,因此保留 `terminal.sendText` 作为**降级路径**(§9)。

---

## 1. 零改动的三块地基(均已在代码中核实)

| # | 事实 | 位置 | 用途 |
|---|---|---|---|
| **G1** | 插件 worker 是 **plain Node**(`ELECTRON_RUN_AS_NODE`),**无模块沙箱**,可用 `fs` / `child_process` / `os`。consent 指纹把 `main` 标为 `trusted-node-worker`,即"用户已知情同意跑可信 Node 代码" | `plugin-host-entry.ts`、`plugin-consent-fingerprint.ts:29` | 写 hook 配置、读写状态文件、跑 git |
| **G2** | `worktreeId` 的格式是 **`REPO_ID::WORKTREE_PATH`**,而 `agent.status.changed` 事件**带 worktreeId** | `orca-runtime.ts:17974`、`shared/worktree-id.ts:31`(`splitWorktreeIdForFilesystem`) | **插件能推导出 worktree 绝对路径** —— 这是写项目级 hook 和跑 git 的前提 |
| **G3** | worker 的 `process.execPath` 就是 **Orca 的 Electron 可执行文件**(它是被 `fork` 出来的) | `plugin-worker-controller.ts` + `buildPluginWorkerEnv` | hook 命令写成 `ELECTRON_RUN_AS_NODE=1 "EXEC_PATH" "goal-hook.mjs"` → **不依赖用户机器上装了 Node** |

附加(尽力而为,非必需):`USER_DATA/agent-hooks/last-status.json` 是
`Record<paneKey, EnrichedAgentHookEventPayload>`,含 `payload.prompt` / `payload.agentType` /
`providerSession.transcriptPath` / `connectionId`(`agent-hooks/server.ts:106`,250ms 防抖落盘)。
worker 可读它来**自动取目标文本和 agent 类型**(§5)。这依赖 Orca 内部文件格式,
必须做成"读失败就降级",不能当硬依赖。

---

## 2. 总体架构

```
┌── Orca 插件 worker (控制面) ─────────────────────────────┐
│  Cmd-J 命令: start / pause / resume / stop / status      │
│  订阅 agent.status.changed → worktreeId, paneKey, state  │
│  · 装/卸 Stop hook(项目级配置文件)                       │
│  · 读写目标状态文件                                        │
│  · notifications.show 反馈完成 / 阻塞 / 预算耗尽           │
└───────────────┬──────────────────────────────────────────┘
                │ 共享磁盘状态 ~/.orca-goal/
┌───────────────▼──────────────────────────────────────────┐
│  ~/.orca-goal/                                            │
│    state/KEY.json      目标 + 预算 + 用量 (权威)         │
│    cursor/KEY.json     transcript 增量读取游标           │
│    log/GOAL_ID.jsonl    每轮决策审计                      │
│    runtime/goal-hook.mjs hook 脚本(插件释放,带版本号)     │
└───────────────▲──────────────────────────────────────────┘
                │ 每轮 Stop 时由 agent CLI 执行
┌───────────────┴──────────────────────────────────────────┐
│  Stop hook (数据面 = 看门狗本体)                          │
│  stdin: session_id / transcript_path / cwd /             │
│         stop_hook_active / last_assistant_message        │
│  stdout: {"decision":"block","reason":"<续跑提示词>"}     │
│       或 exit 0 放行                                      │
└──────────────────────────────────────────────────────────┘
```

**权威状态放磁盘而非插件 `storage`**,因为 hook 脚本是独立进程,调不到宿主 API。
插件 `storage` 只存一份索引(活跃目标的 worktreeId 列表),用于命令和通知。

状态 key:`sha256(realpath(cwd))`。hook 只有 `cwd`,worker 由 `worktreeId` 推出同一路径,两边算出同一个 key。

---

## 3. Stop hook 的决策流程

这是整个方案的核心,结构对齐 Codex 的 `continue_if_idle` + `account_thread_goal_usage`:

```
读 stdin → { session_id, transcript_path, cwd, stop_hook_active,
             last_assistant_message, stop_reason }

 0. try { … } catch → exit 0            ← 任何异常一律放行,绝不 fail-closed
 1. state = read(~/.orca-goal/state/KEY.json)
    无 state / status != 'active'                       → exit 0
 2. state.sessionId 已绑定且 != session_id              → exit 0   (同 worktree 的另一个 agent)
    未绑定 → 绑定当前 session_id
 3. 取文件锁(KEY.lock,带 stale 超时)                 → 拿不到就 exit 0
 4. 计量:从 cursor 记录的 offset 增量读 transcript JSONL,
    累加本轮 input/output/cache tokens → tokens_used;
    turns++;time_used += now - lastStopAt
 5. 完成审计
    a. last_assistant_message 匹配 /^ORCA_GOAL_COMPLETE:/m  → status='complete'
    b. 哨兵文件 sentinel/GOAL_ID.json 的 status='complete' → status='complete'
       → 写状态 + 审计日志,exit 0(附 additionalContext 告知已收尾)
 6. 预算审计(任一命中)
    tokens_used >= tokenBudget | turns >= maxTurns | elapsed >= maxWallClock
    → status='budget_limited',exit 0 并输出
      hookSpecificOutput.additionalContext = <budget_limit 收尾提示>
 7. 阻塞审计(对齐 Codex 的三连规则)
    · stop_reason == 'error' 连续 3 轮                    → 'blocked'
    · last_assistant_message 匹配 /^ORCA_GOAL_BLOCKED:/m  → 'blocked'
    · git HEAD + 脏文件哈希连续 3 轮无变化                 → 'blocked'
    → 写状态,exit 0
 8. 否则 → 输出
    {"decision":"block","reason":"<完整多行续跑提示词>"}
    写状态 + 审计日志,exit 0
```

### ⚠️ 关于 `stop_hook_active`

Claude/Codex 用这个标志让 hook 自己防死循环。**我们必须主动忽略它**——否则只能续跑一轮。
代价是:**防无限循环的责任 100% 落到我们的预算逻辑上**。因此下面几条是硬性的,不是可选项:

- **预算必填**:`goal-start` 不允许在没有 `maxTurns` 的情况下开启
- **绝对天花板**(即使用户设更大也会被夹住):`turns ≤ 200`、`wallclock ≤ 6h`
- **原子写**:状态文件一律 `write tmp + rename`,写一半的 JSON 不能让计数丢失
- **fail-open**:读状态失败、锁超时、脚本异常 → 一律 `exit 0` 放行
- **熔断兜底**:状态文件里存 `hookVersion`,与脚本版本不符 → 放行(防旧脚本配新状态)

---

## 4. 续跑提示词:直接移植 Codex

因为 `reason` 没有单行/长度限制,可以**逐段搬 `codex-rs/ext/goal/templates/goals/continuation.md`**,
只替换工具相关的两处:

| Codex 原文 | Orca 版替换 |
|---|---|
| `call update_goal with status "complete"` | `output a final line: ORCA_GOAL_COMPLETE: one-line summary` |
| `call update_goal with status "blocked"` | `output a final line: ORCA_GOAL_BLOCKED: one-line reason` |
| `If update_plan is available…` | 原样保留(Claude 的 TodoWrite / Codex 的 update_plan 都适配) |

其余六个小节(Continuation behavior / Budget / Work from evidence / Progress visibility /
Fidelity / Completion audit / Blocked audit)**一字不改** —— 这是 Codex 花了大量迭代打磨的部分,
也是"看门狗"和"无脑 Ralph loop"的唯一区别。

`budget_limit.md` 和 `objective_updated.md` 同样移植:
- 预算耗尽 → 走 `additionalContext`(不 block,让它自然收尾)
- 目标被 `goal-edit` 改写 → 下一轮 `reason` 前置 objective_updated 段落

objective 仍然用 objective XML 标签包裹 + XML 转义 + 明示"用户数据,非高优先级指令"(防提示注入)。

---

## 5. 目标文本从哪来(v0 命令不能带参数)

三级回退,全部零宿主改动:

1. **首选**:读 `USER_DATA/agent-hooks/last-status.json` 里该 pane 的 `payload.prompt`
   —— 就是用户刚在这个 pane 里发给 agent 的那条消息。
   语义天然:"把我刚让你做的这件事,持续做到完成"。
   userData 路径:安装态由 `import.meta.url` 上溯三级(`USER_DATA/plugins/KEY/main.mjs`);
   dev 态回退到平台默认路径(`~/Library/Application Support/Orca` / `~/.config/Orca` /
   `%USERPROFILE%\AppData\Roaming\Orca`)。**读失败不报错,进入第 2 级。**
2. **回退**:hook 首次运行时从 `transcript_path` 读第一条 user message 作为 objective。
3. **兜底**:读 `~/.orca-goal/objective.md`(用户可手动编辑),`goal-start` 前提示。

同一份 `last-status.json` 还给出 `payload.agentType`(决定装哪种 hook)和
`connectionId`(非 null = 远程会话 → 拒绝开启,见 §8)。

---

## 6. Hook 的安装位置与卸载

**只写项目级,永不碰 Orca 的地盘。**

| Agent | 写入 | 与 Orca 的关系 |
|---|---|---|
| Claude Code / OpenClaude | `WORKTREE/.claude/settings.local.json` 的 `hooks.Stop` | Orca 装在 **`~/.claude/settings.json`**(`claude/hook-settings.ts:65`)→ **零重叠**,两个 hook 并存都会跑 |
| Codex | `WORKTREE/.codex/hooks.json` 的 `stop` | Orca 装在 **`~/.codex/hooks.json`** 并维护 trust hash(`codex-real-home-hook-install.ts`)→ 路径不重叠,但 **Codex 会要求用户对新的项目级 hook 批准一次**(§8 风险 2) |

hook 命令(跨平台,不依赖用户装 Node,见 G3):

```jsonc
{ "type": "command",
  "command": "\"EXEC_PATH\" \"<~/.orca-goal/runtime/goal-hook.mjs>\"",
  "timeout": 20 }
```
并在 hook 进程 env 里设 `ELECTRON_RUN_AS_NODE=1`。
`execPath` 会随 Orca 升级/移动而变 → **每次插件激活时重写一遍 hook 命令**(幂等)。

写入规则:
- 读 → 合并 → **原子写(tmp + rename)**;首次写入前备份 `*.pre-orca-goal`
- 条目带唯一标记 `"// orca-goal": "VERSION"`,卸载时按标记精确移除,绝不整体覆盖
- `goal-stop` / 插件禁用 / 插件卸载(`deactivate`)都触发卸载
- worktree 被删(`worktree.removed` 事件)→ 清理该 worktree 的状态与 hook

---

## 7. 插件本体

### manifest
```jsonc
{
  "manifestVersion": 1,
  "id": "goal",
  "publisher": "orca-labs",
  "name": "Goal Mode",
  "version": "0.1.0",
  "description": "Keeps an agent working toward a persistent objective via its Stop hook, with token/turn budgets and guardrails.",
  "engines": { "orca": ">=1.4.0" },
  "pluginApi": 1,
  "main": "main.mjs",
  "contributes": {
    "commands": [
      { "id": "goal-start",  "title": "Goal: Start on this workspace", "context": "worktree" },
      { "id": "goal-pause",  "title": "Goal: Pause",                   "context": "worktree" },
      { "id": "goal-resume", "title": "Goal: Resume",                  "context": "worktree" },
      { "id": "goal-stop",   "title": "Goal: Stop and remove hook",    "context": "worktree" },
      { "id": "goal-status", "title": "Goal: Status",                  "context": "global"   }
    ],
    "events": [{ "on": "agent.status.changed" }, { "on": "worktree.removed" }]
  },
  "capabilities": [
    { "kind": "workspace:read" }, { "kind": "notifications:show" },
    { "kind": "storage" }, { "kind": "events:subscribe" }, { "kind": "settings:own" }
  ]
}
```
**不申请 `terminal:send`** —— 主路径用不到(降级路径才需要,可作为独立的可选版本)。
不做面板:面板 CSP 是 `default-src 'none'; connect-src 'none'`,且 `storage.get` 不是
`panel: true`,没有 panel→worker 通道,面板拿不到任何状态。状态一律走 `goal-status` + 通知。

### 文件布局
```
plugins/goal/
├── orca-plugin.json
├── main.mjs                    # 命令 + 事件装配
├── goal-state-file.mjs         # 磁盘状态原子读写 + 文件锁(worker/hook 共用)
├── stop-hook-installer.mjs     # 项目级 hook 配置的合并写入与精确卸载
├── objective-discovery.mjs     # §5 三级回退
├── runtime/
│   ├── goal-hook.mjs           # ★ Stop hook 本体(独立进程,零宿主依赖)
│   ├── continuation-prompt.mjs # 移植自 Codex 三个模板
│   ├── transcript-usage.mjs    # 增量解析 JSONL 取 token 用量(claude/codex 两种解码)
│   └── progress-probe.mjs      # git HEAD + dirty 哈希
└── README.md
```
命名遵循 AGENTS.md:按承载的领域概念命名,无 `utils`/`helpers`。

### 事件处理(worker 侧,很轻)
`agent.status.changed` 只用来做**通知与状态同步**,不参与续跑决策:
- `state === 'done'` → 读状态文件,若刚变成 `complete`/`blocked`/`budget_limited` → `notifications.show`
- `state === 'waiting'` → 通知"agent 在等你确认",并把目标临时挂起(写 `pausedByWaiting`),
  用户处理完后 `working` 事件自动恢复
- worker 被 5 分钟 idle-reap 无所谓:hook 是独立进程,循环不依赖 worker 存活 ✅
  (这是相对 02 方案的又一个结构性优势)

---

## 8. 风险清单(全部需要在插件 README 与首次运行提示中明说)

| # | 风险 | 缓解 |
|---|---|---|
| **1** | **插件会修改你的 agent 配置文件**,而 Orca 的 capability 模型**不会在安装时告诉用户这件事**(fs 访问不在 capability 里,`main` 只被笼统标为 trusted-node-worker) | 绝不静默安装:`goal-start` 首次执行时用 `notifications.show` 明示将写入哪个文件,并要求再执行一次 `goal-start` 确认;README 首屏说明;`goal-stop` 精确卸载 + 保留备份 |
| **2** | **Codex 的 hook trust**:新增项目级 hook 后 Codex 会要求批准一次 | `goal-start` 检测到 Codex 时提前提示"请在 Codex 里批准 orca-goal hook";Claude 无此摩擦 |
| **3** | **忽略 `stop_hook_active` = 自己承担死循环风险** | §3 的五条硬性护栏;预算必填;绝对天花板;fail-open |
| **4** | **SSH / 远程 worktree 不支持**:agent 与 hook 在远端,本地 worker 写不进去 | `goal-start` 用 `last-status.json` 的 `connectionId !== null` 检测并拒绝,给出明确原因 |
| **5** | **依赖 Orca 内部文件格式**(`last-status.json`、`worktreeId` 拼接规则) | 全部做成尽力而为 + 版本探测;`last-status.json` 读失败降级到 §5 第 2/3 级;`worktreeId` 解析失败则拒绝开启并提示 |
| **6** | **每轮 fork 一个进程解析 transcript** | 用 cursor 记录 offset 只增量读尾部;hook `timeout: 20`;超时由 agent 侧放行 |
| **7** | **同一 worktree 多个 agent pane** | 状态绑定首个 `session_id`,其余 session 直接放行 |
| **8** | **Orca 升级后 `execPath` 变化导致 hook 失效** | 每次插件激活重写 hook 命令;hook 脚本自身版本校验 |
| **9** | 提示注入:objective 或 transcript 内容进入 reason | XML 转义 + 明确标注为用户数据(照搬 Codex) |
| **10** | 绝不自动应答权限确认 / AskUserQuestion | hook 只在 `Stop` 触发,天然碰不到权限流程;`waiting` 状态只通知 |

---

## 9. 降级路径:不支持 Stop hook 的 agent

对 gemini / amp / opencode 等没有 block 语义 Stop hook 的 agent,回落到 02 方案的
`terminal.sendText` 路线,并接受它的三条限制(单终端 worktree、必须聚焦、单行 ≤4096 提示词)。
建议**作为独立的 opt-in 开关**,而不是默认行为 —— 两条路线的可靠性差距太大,混在一起会让用户
误以为体验一致。

---

## 10. 交付与验证

**开发期**:设置里加 `devPluginPaths` 指向 `plugins/goal/`,`PluginDevWatcher` 会热刷新 manifest/panel。
**分发**:打包成插件目录安装(`USER_DATA/plugins/`),或走私有 marketplace。

### 测试策略
| 层 | 内容 |
|---|---|
| **hook 决策纯函数**(主力) | `decide(state, stdinPayload, now) → {nextState, output}`,零 I/O。用事件序列 + 假时钟穷举:预算三种触发、三连阻塞、完成双通道、session 绑定、状态损坏 fail-open、版本不匹配 |
| **死循环回归测试** | 构造 300 轮连续 block 的序列,断言在 `maxTurns` 处必停;断言任何异常输入都走 exit 0 |
| **hook 配置合并** | 已有其他 Stop hook、已有 orca-goal 旧版本、JSON 损坏、只读文件、符号链接;断言**从不丢失第三方条目** |
| **transcript 解析** | claude/codex 两种 JSONL 格式、截断行、增量 offset 回退 |
| **端到端** | 真实 Claude Code 会话:目标达成停下、预算耗尽收尾、无进展熔断、`goal-stop` 后 hook 干净移除 |

### 里程碑
| | 内容 |
|---|---|
| **M1** | hook 脚本 + 磁盘状态 + 移植的续跑提示词 + 轮数/时长预算;手工写配置验证循环跑通(Claude) |
| **M2** | 插件 worker:5 个命令 + hook 安装卸载 + 通知;objective 三级发现 |
| **M3** | transcript token 计量 → 真 token 预算;git 无进展熔断 |
| **M4** | Codex 支持(含 trust 提示);降级路径(`terminal.sendText`)作为可选开关 |

---

## 11. 一句话总结

不改 Orca 一行代码是**可行的,而且方案反而比改宿主的版本更强**:
把注入点从"往终端里打字"换成"agent 自己的 Stop hook",
就同时拿到了后台运行、无限长的多行提示词、现成的 token 计量和完成信号,
Codex `ext/goal` 里最有价值的那套提示词与审计规则可以近乎逐字移植。

代价是三条,都必须对用户讲清楚:
**要写用户的 agent 配置文件**、**只支持有 block 语义 Stop hook 的 agent**、
**远程/SSH 会话不支持**。
以及一条工程上的硬要求:因为要主动忽略 `stop_hook_active`,
**防死循环完全靠我们自己的预算逻辑,它必须是必填的、有绝对天花板的、异常时 fail-open 的。**