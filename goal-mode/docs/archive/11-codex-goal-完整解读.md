# Codex Goal 模式 · 完整解读

调研对象:`openai/codex` @ `2b5bdcf6`(2026-08-02)。
覆盖范围:goal 相关全部 53 个文件,含 6 个实现层、20 个后端集成测试、5 个 TUI 模块、3 份提示词、5 次数据库迁移。

本文取代 [01](./01-codex-goal-模式调研.md),并吸收 [05](./05-源码精读修正.md) 的修正与
[06](./06-防偏移与防敷衍机制.md) 的机制分析。

> 文档约定:占位符用大写下划线,不用尖括号(见 [README](./README.md#文档约定))。

---

## 1. 它到底是什么

`/goal` 把一次性指令变成**挂在 thread 上的持久目标**。设定后,每当会话空闲,
系统自动再开一轮把目标往前推,直到达成、判定卡住、或预算耗尽。

用户命令(`goal_display.rs:5`):

```
Usage: /goal [OBJECTIVE|clear|edit|pause|resume]
```

三个前提条件,任一不满足直接拒绝:

| 前提 | 位置 | 失败表现 |
|---|---|---|
| `Feature::Goals` 特性开关打开 | `thread_goal_processor.rs:124`、`slash_dispatch.rs:776` | 命令静默返回 / RPC 报 "goals feature is disabled" |
| thread 必须**非临时**(有 rollout 文件) | `thread_goal_processor.rs:277` | "Goals need a saved session. This session is temporary." |
| 会话已启动(有 thread_id) | `slash_dispatch.rs:802` | "The session must start before you can change a goal." |

---

## 2. 设计演进(从迁移史考古)

五次迁移完整记录了这个功能是怎么长出来的,比任何设计文档都诚实:

| 迁移 | 内容 | 说明了什么 |
|---|---|---|
| `migrations/0029_thread_goals.sql` | 在**主 state 库**建表,`thread_id` 带 `REFERENCES threads(id) ON DELETE CASCADE`,状态只有 **4 个**:active / paused / budget_limited / complete | **初版没有"卡住"这个概念**。目标要么在跑、要么被用户暂停、要么烧完预算、要么完成 |
| `migrations/0033_thread_goal_stopped_statuses.sql` | 重建表,状态加到 6 个:补上 **blocked** 与 **usage_limited** | 跑起来才发现:模型会陷进去(blocked),账号会被限流(usage_limited)。这两个是**实践中学到的**终止原因 |
| `migrations/0034_drop_thread_goals.sql` | `DROP TABLE IF EXISTS thread_goals` | 从主库里删掉 |
| `goals_migrations/0001_thread_goals.sql` | 在**独立库**重建,`thread_id` 变成裸 `TEXT PRIMARY KEY`,**去掉了对 threads 的外键** | 目标状态与 thread 生命周期**解耦**。独立库也意味着独立的连接与锁域 |
| `goals_migrations/0002_thread_goal_continuation_deferrals.sql` | 加 deferral 表 | **"设完目标不抢跑第一轮"是后来补的**,不是初始设计 |

三条可直接迁移的经验:

1. 自动循环的终止原因,初版一定想不全。至少要给「卡住」和「外部限流」留位置。
2. 目标状态不该跟着会话生命周期走,应该独立存储。
3. 「自动接管的时机」会踩坑,需要显式的让位机制。

---

## 3. 分层架构

goal 横跨六层,每层职责清晰:

```text
┌ tui ────────────────────────────────────────────────────────┐
│ slash_dispatch.rs      /goal 参数解析、特性开关、草稿构造        │
│ app/thread_goal_actions.rs  set / edit / clear / 状态切换编排  │
│ goal_files.rs          超长目标与附件落盘、路径校验              │
│ chatwidget/goal_menu.rs     裸 /goal 摘要、编辑框、恢复提示      │
│ chatwidget/goal_status.rs   状态行指示器                       │
│ goal_display.rs        文案与时长/token 格式化                 │
│ chatwidget/interaction.rs   中断即暂停(6 个调用点)            │
└──────────────────────┬──────────────────────────────────────┘
                       │ JSON-RPC: thread/goal/{set,get,clear}
┌ app-server ───────────▼─────────────────────────────────────┐
│ thread_goal_processor.rs  特性门控、rollout 物化、通知定序      │
│ thread_fork_goal.rs       fork 时继承目标快照                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌ ext/goal(扩展层,业务核心)──▼───────────────────────────────┐
│ extension.rs  6 类 contributor 挂载点                        │
│ runtime.rs    看门狗循环 continue_if_idle、外部变更、错误终止    │
│ accounting.rs 进程内计量状态机(token 基线 + 墙钟)             │
│ tool.rs       get_goal / create_goal / update_goal 执行       │
│ spec.rs       三个工具的 schema 与描述(描述本身即约束)         │
│ api.rs        GoalService:外部(用户/客户端)变更入口          │
│ steering.rs   三份提示词渲染与注入                             │
│ events/metrics/analytics  事件、OTel 指标、埋点                │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌ core ─────────────────▼─────────────────────────────────────┐
│ session/inject.rs  try_start_turn_if_idle:所有自动工作的让位闸门 │
│                    inject_if_running:运行中注入               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌ state(独立 SQLite 库)▼─────────────────────────────────────┐
│ runtime/goals.rs   全部 SQL,预算判定与终态保护写在 SQL 里       │
│ model/thread_goal.rs  行模型与状态枚举                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌ protocol ─────────────▼─────────────────────────────────────┐
│ ThreadGoal / ThreadGoalStatus / MAX_THREAD_GOAL_OBJECTIVE_CHARS │
│ validate_thread_goal_objective                               │
└─────────────────────────────────────────────────────────────┘
```

**关键设计**:goal 不是主循环里的 `if`,而是一个**扩展**。
`GoalExtension` 通过 `ExtensionRegistryBuilder` 注册 6 类 contributor(`extension.rs:460`):

| Contributor | 钩子 | 职责 |
|---|---|---|
| `ThreadLifecycleContributor` | `on_thread_start` / `on_thread_resume` / **`on_thread_idle`** / `on_thread_stop` | `on_thread_idle` 是看门狗心脏 |
| `TurnLifecycleContributor` | `on_turn_start` / `on_turn_stop` / `on_turn_abort` / `on_turn_error` | 计量起止、错误终止 |
| `TokenUsageContributor` | `on_token_usage` | 累计 token 增量 |
| `ToolLifecycleContributor` | `on_tool_finish` | 工具调用后即时结算 + 超预算即时注入收尾 |
| `ToolContributor` | 无 | 暴露三个工具 |
| `ConfigContributor` | `on_config_changed` | 开关热更新 |

---

## 4. 数据模型

```sql
-- goals_migrations/0001_thread_goals.sql,独立库
CREATE TABLE thread_goals (
    thread_id TEXT PRIMARY KEY NOT NULL,   -- 一个 thread 至多一个目标
    goal_id TEXT NOT NULL,                 -- 乐观校验用
    objective TEXT NOT NULL,               -- 上限 4000 字符
    status TEXT NOT NULL CHECK(status IN (
        'active','paused','blocked','usage_limited','budget_limited','complete')),
    token_budget INTEGER,                  -- 可空 = 不限
    tokens_used INTEGER NOT NULL DEFAULT 0,
    time_used_seconds INTEGER NOT NULL DEFAULT 0,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);
CREATE TABLE thread_goal_continuation_deferrals (
    thread_id TEXT PRIMARY KEY NOT NULL REFERENCES thread_goals(thread_id) ON DELETE CASCADE
);
```

`is_terminal() = budget_limited | complete`(`model/thread_goal.rs:41`)。
**只有 `active` 会被自动续跑。**

---

## 5. 完整状态流转

### 5.1 状态转移全图

```text
                      ┌──── /goal edit(budget_limited / complete 会被复活)────┐
                      │                                                       │
                      │        ┌── /goal resume ──┐                           │
                      ▼        ▼                  │                           │
  (无) ──/goal OBJ──▶ active ──┴──────────────────┘                           │
                      │                                                       │
     ┌────────────────┼───────────────────────────────────┐                   │
     │                │                                   │                   │
  /goal pause    update_goal(complete)              update_goal(blocked)       │
  ESC / 中断          │                                   │                   │
     │                ▼                                   ▼                   │
     ▼            complete(终态)                      blocked ────────────────┤
  paused ─────────────────────────────────────────────────┤                   │
                                                          │                   │
  turn error(不可重试)──────────────▶ blocked ───────────┤                   │
  UsageLimitExceeded ────────────────▶ usage_limited ─────┤                   │
  tokens_used >= budget ─────────────▶ budget_limited(终态)───────────────────┘

  /goal clear:任意状态 ──▶ 删除记录
  /goal OBJ(已有未完成目标):确认弹窗 ──▶ clear + set(用量清零、换新 goal_id)
```

### 5.2 每条边:谁能触发

| 转移 | 触发者 | 入口 |
|---|---|---|
| 无 → active | 用户 `/goal OBJ`;模型 `create_goal` | `api.rs:143` / `tool.rs:180` |
| active → complete | **仅模型** `update_goal(complete)` | `tool.rs:221` |
| active → blocked | **模型** `update_goal(blocked)`;**系统**在不可重试 turn error 时 | `tool.rs:221` / `extension.rs:308` |
| active → paused | **仅用户**:`/goal pause`、ESC、Ctrl-C 等中断 | `slash_dispatch.rs:797` / `interaction.rs:499` |
| active → usage_limited | **系统**:`UsageLimitExceeded` | `extension.rs:315` |
| active → budget_limited | **SQL 自动**:结算时 `tokens_used + delta >= token_budget` | `goals.rs:548` |
| budget_limited → usage_limited | 系统(唯一允许覆盖终态的转移) | `goals.rs:449` |
| paused/blocked/usage_limited → active | **仅用户** `/goal resume` | `slash_dispatch.rs:798` |
| budget_limited/complete → active | **仅用户** `/goal edit`(改目标即复活) | `goal_menu.rs:edited_goal_status` |

**模型永远只能做两件事:标完成、标卡住。** 暂停、恢复、预算、限流全部不在它权限内
—— 工具描述里明写:"You cannot use this tool to pause, resume, budget-limit, or usage-limit a goal"(`spec.rs:81`)。

### 5.3 SQL 层的三条硬规则(`goals.rs:292`)

```sql
status = CASE
    WHEN status = 'budget_limited' AND :new IN ('paused','blocked') THEN status   -- ① 终态保护
    WHEN :new = 'active' AND token_budget IS NOT NULL
         AND tokens_used >= token_budget THEN 'budget_limited'                    -- ② 复活即回落
    ELSE :new
END
```

1. **终态保护**:`budget_limited` 不会被 pause/blocked 覆盖
2. **复活即回落**:resume 一个已超预算的目标会立刻掉回 `budget_limited`,
   除非同一次调用抬高 `token_budget`(第一分支比较的是新传入的预算)
3. `pause` 只作用于 `active`;`usage_limit` 可作用于 `active` 或 `budget_limited`(`goals.rs:449`)

### 5.4 replace 与 edit 的语义差异(容易搞混)

| 操作 | 路径 | goal_id | 累计用量 | 状态 |
|---|---|---|---|---|
| `/goal NEW_OBJ`,当前无目标 | `replace_thread_goal` | 新 | 清零 | active |
| `/goal NEW_OBJ`,当前有未完成目标 | **弹确认** → `clear` + `set` | 新 | **清零** | active |
| `/goal NEW_OBJ`,当前目标已 complete | 不弹确认,同上 | 新 | 清零 | active |
| `/goal edit` | `update_thread_goal` | **保留** | **保留** | 保留;terminal 态复活为 active |

确认弹窗规则在 `thread_goal_actions.rs:364`:**只有 `complete` 不需要确认**,
其余五态(含 `budget_limited`)都要用户点「Replace current goal」。

---

## 6. 看门狗循环

### 6.1 主流程 `continue_if_idle`(`runtime.rs:359`)

```text
on_thread_idle
  └─ continue_if_idle()
       1. tools_visible()?  ── 否则清 active 标记返回
          tools_visible = 特性开启 && 有持久化 thread 状态 && 不是 Review 子代理
       2. 取 goal_state_lock(信号量,1 permit)
          ── 持锁跨越「读目标 → 启动 turn」,外部 set/clear 无法插队
       3. has_thread_goal_continuation_deferral()? ── 有则返回
       4. thread_manager.upgrade() / get_thread() ── 拿不到活线程放弃
       5. 目标存在且 status == active? ── 否则清标记返回
       6. 构造 continuation steering item
       7. thread.try_start_turn_if_idle(vec![item])
       8. 若当前 turn 未被标记为 goal turn ── 清 active 标记
```

### 6.2 让位闸门 `try_start_turn_if_idle`(`core/src/session/inject.rs:45`)

这是**所有扩展发起的自动工作共用的一道闸**,注释写明"用户/客户端触发的工作优先"。
三条拒绝理由,而且**检查了四次**:

```text
① 入口检查:input_queue 有 trigger-turn 邮件 → PendingTriggerTurn
② 入口检查:collaboration_mode == Plan     → PlanMode
③ 抢占式预留 turn slot(active_turn 已存在 → Busy)
④ 预留后再查一次用户输入                  → 命中则回滚预留
⑤ 构造 turn_context 后再查 Plan 模式       → 命中则回滚
⑥ 再查一次用户输入                        → 命中则回滚
⑦ 最后确认 slot 仍是自己预留的            → 否则回滚
然后才 start_task
```

设计意图很明确:**宁可放弃一次自动续跑,也不能抢用户的输入。**

### 6.3 续跑延迟 deferral

外部设定目标时,**同一事务**里插入一条 deferral 记录(`goals.rs:109`);
它在 `on_turn_start` 时被清除(`extension.rs:210`)。

效果:刚设完目标不抢跑第一轮,让用户自己发出的那一轮先跑,之后看门狗才接管。

### 6.4 运行中注入 `inject_if_running`

两种情况不等空闲,直接把 steering item 塞进正在跑的 turn 的输入队列:

- **预算首次耗尽**:`on_tool_finish` 检测到状态变 `budget_limited`,
  用 `mark_budget_limit_reported_if_new` 保证**只注入一次**(`extension.rs:403`)
- **目标被编辑**:`apply_external_goal_set` 检测到 objective 变化(`runtime.rs:204`)

### 6.5 恢复会话时的时序

`app-server` 显式控制顺序(`thread_goal_processor.rs:68`):

```text
emit_thread_goal_snapshot(thread_id)            // 先把目标快照发给客户端
  ↓
thread.emit_thread_idle_lifecycle_if_idle()     // 再让扩展对空闲线程做出反应
```

注释:"App-server owns resume response and snapshot ordering, so wait until those are sent
before letting extensions react to the idle thread."

**恢复时不会自动续跑 paused/blocked/usage_limited 的目标**,而是 TUI 弹一个
"Resume paused goal?" 选择框(`thread_goal_actions.rs:54`,覆盖这三种状态)。

---

## 7. 计量与预算

### 7.1 口径(唯一权威公式)

```rust
// accounting.rs:331
(Δinput_tokens − Δcached_input_tokens) + Δoutput_tokens
```

先对每个字段求增量,再套公式(`accounting.rs:313`)。含义:

- **`cache_write_input_tokens` 完全不计**
- **`reasoning_output_tokens` 不单独加**(已含在 `output_tokens` 内)
- 缓存命中的输入不计

测试佐证(`tests/accounting.rs:11`):基线 `(100, 10, 30)` → 当前 `(120, 14, 42)` →
`(20 − 4) + 12 = 28`。

### 7.2 结算时机

| 时机 | 钩子 | 说明 |
|---|---|---|
| turn 开始 | `on_turn_start` | 记录 token 基线,标记这一 turn 属于哪个目标 |
| token 变化 | `on_token_usage` | 只更新进程内快照,不落库 |
| 每个工具调用后 | `on_tool_finish` | **落库结算**。排除 `update_goal` 自身;只统计 handler 真正执行过的调用 |
| turn 结束 / 中止 | `on_turn_stop` / `on_turn_abort` | 收尾结算 |
| 外部改目标前 | `prepare_external_goal_mutation` | 冲刷在途计量 |
| **空闲期间** | `account_idle_goal_progress` | **只计墙钟时间** |

### 7.3 五条容易踩错的语义

1. **目标创建之前的本轮消耗不计入**。`create_goal` 会 `reset_baseline_to_current()`
   (`accounting.rs:160`)。测试 `:190`:创建前烧 28、创建后烧 15,最终 `tokens_used == 15`。
2. **Plan 模式的 turn 完全不参与**,token 与时间都不计。
   `account_tokens = !matches!(mode, Plan)`,而 `progress_snapshot` 在 `!account_tokens` 时
   直接返回 `None`(`accounting.rs:199`),所以连时间也不计。Plan turn 上的 usage-limit 也不会停目标(测试 `:688`)。
3. **空闲时间也计入 `time_used_seconds`**。目标是"活着就在烧时间",不是"只在跑 turn 时烧"。
   测试 `:1012`:resume 后单纯 sleep 1.1 秒,`time_used_seconds >= 1`。
4. **`budget_limited` 后继续记账,`usage_limited` 后停止记账**。
   前者结算 mode 是 `ActiveOnly = status IN ('active','budget_limited')`(测试 `:363`,25 → 35);
   后者结算完即 `clear_active_goal`(测试 `:497`,之后再烧仍是 23)。
   设计意图:预算是自己设的线,越线后真实花费仍要如实记;限流是外部强制中断,之后的消耗不算这个目标的。
5. **墙钟结算不丢余数**。`mark_accounted` 让基线**前进已结算的秒数**而非重置为 now
   (`accounting.rs:398`),`.as_secs()` 截断掉的毫秒留在基线里累积。
   `mark_active_goal` 只在 goal_id 变化时才重置基线,所以切换目标不会把旧目标的时间算到新目标头上。

### 7.4 并发安全

- `progress_accounting_permit`(信号量 1)+ `progress_snapshot` / `mark_progress_accounted` 配对
- 测试 `:300`:两个 `tool_finish` 并发 → **只产生一个事件**,`tokens_used == 30`
- 每次结算 SQL 都带 `AND goal_id = :expected_goal_id` —— 目标被替换后,在途的旧结算不会写错账
  (测试 `:913`)
- `stop_active_goal_for_turn` 先查 `turn_is_current_active_goal(turn_id)`,过期 turn 的请求直接忽略(测试 `:725`)

### 7.5 预算判定在 SQL 里原子完成

```sql
-- goals.rs:548
status = CASE WHEN BUDGET_LIMIT_STATUS_FILTER
              AND token_budget IS NOT NULL
              AND tokens_used + :delta >= token_budget
         THEN 'budget_limited' ELSE status END
```

不是先读再判再写,而是一条 UPDATE 完成,天然免疫竞态。

---

## 8. 模型侧的三个工具

只在 `tools_visible()` 时暴露:特性开启 **且** 有持久化 thread 状态 **且** 不是 Review 子代理
(`extension.rs:105`)。

| 工具 | 参数 | 约束 |
|---|---|---|
| `get_goal` | 无 | 读状态、预算、用量、剩余 |
| `create_goal` | `objective`,可选 `token_budget` | **仅在用户明确要求时**创建;只有现有目标 `status = 'complete'` 才能替换(`goals.rs:245` 的 `ON CONFLICT … WHERE`),**budget_limited 虽是终态也会被拒**,报 "this thread has an unfinished goal" |
| `update_goal` | `status: complete \| blocked` | **只能标完成或卡住**。`tool.rs:226` 做二次校验,传其他值直接报错 |

返回体:

```jsonc
{ "goal": {...}, "remainingTokens": 12, "completionBudgetReport": "Goal achieved. Report final usage…" }
```

`completionBudgetReport` 只在 `update_goal(complete)` 且(有预算 或 耗时大于 0)时出现
(`tool.rs:491`),内容是一段**要模型把最终用量讲给用户听**的指令。`blocked` 不带(测试 `:762`)。

工具描述本身就是约束的一部分。`spec.rs:66` 那段 `update_goal` 的 description 有 300 多字,
把「什么时候可以标 blocked」写得极细 —— 因为**宿主侧没有任何计数器执行它**(见 §11)。

---

## 9. 提示词完整解读

三份模板,`ext/goal/templates/goals/` 与 `prompts/templates/goals/` **逐字节相同**
(后者是重构前的旧位置,`prompts/src/goals.rs` 是 `steering.rs` 的副本)。
渲染后作为 `InternalModelContextFragment { source: "goal" }` 注入。

原文见本仓库 [`prompts/`](./prompts)(已按我们的用法改写工具调用部分)。

### 9.1 `continuation.md`(51 行,5261 字节)—— 续跑主提示

七个小节,每节防一种具体失败:

| 小节 | 防的失败 | 关键句 |
|---|---|---|
| **Continuation behavior** | 把目标缩小到本轮能做完的程度 | "Ending this turn does not require shrinking the objective to what fits now" |
| **Budget** | 无(信息告知) | 已用 / 预算 / 剩余 |
| **Work from evidence** | 靠对话记忆而不看实际状态 | "Use the current worktree and external state as authoritative" |
| **Progress visibility** | 多步任务无计划;或用计划替代干活 | "do not treat a plan update as a substitute for doing the work" |
| **Fidelity** | 换一个更容易通过测试的更小方案 | "An edit is aligned only if it makes the requested final state more true" |
| **Completion audit** | 假完成 | "treat completion as unproven";逐条需求找权威证据;"Treat uncertain or indirect evidence as not achieved" |
| **Blocked audit** | 一遇阻力就放弃 | 同一阻塞**连续 3 轮**才允许标 blocked |

两条贯穿始终的硬约束:

- 不许因为预算快用完就标完成
- objective 用 objective XML 标签包裹并转义,明确声明是**用户数据而非高优先级指令**(防提示注入)

最长的一段是 Completion audit 的收尾,值得整段引用它的逻辑结构:

```text
不许拿意图、局部进展、对早前工作的记忆、或一个看起来合理的最终答复当作完成的证明。
标记完成 = 声称完整目标已经做完,且能经受逐条需求的推敲。
只有当前证据证明每条需求都已满足、且没有必需工作剩余时,才允许标完成。
如果证据不完整、薄弱、间接、仅仅与完成相容、或有任何一条需求缺失/未完成/未验证,
继续工作,不要标完成。
```

### 9.2 `budget_limit.md`(16 行)—— 预算耗尽收尾

"系统已把目标标为 budget_limited,不要开新工作;总结进展、列出剩余工作与阻塞、给用户明确下一步。"
末尾一句关键:"Do not call update_goal unless the goal is actually complete."

### 9.3 `objective_updated.md`(16 行)—— 目标被编辑

新目标取代旧目标;"Avoid continuing work that only served the previous objective."
这里 objective 用的标签是 `untrusted_objective`,比另外两份更强调不可信。

---

## 10. TUI 层的用户体验设计

### 10.1 超长目标的落盘机制(`goal_files.rs`)

`MAX_THREAD_GOAL_OBJECTIVE_CHARS = 4000`。超长时:

1. 正文落盘到 `CODEX_HOME/attachments/UUID/goal-objective.md`
2. objective 本身改写成一句
   `Read the Codex goal objective file at ABS_PATH before continuing.`
3. 这句话本身还要再校验一次长度(`objective_file_reference`)

顺带处理的还有:粘贴的长文本 → 单独文件、本地图片 → 复制进附件目录、远程图片 URL → 追加成引用段落。

**路径校验值得抄**(`objective_file_path:157`):把 objective 反解成路径时,
严格要求它等于 `CODEX_HOME/attachments/UUID/goal-objective.md` 且 UUID 可解析,
否则拒绝。这是防路径穿越 —— objective 是用户数据,不能让它指向任意文件。

`/goal edit` 会把文件内容**读回来**给用户编辑(`objective_text_for_edit`)。

### 10.2 状态呈现

`blocked` 对用户显示为 **"stalled"**,不是 "blocked"(`goal_display.rs:36`)——
措辞上弱化了"失败"的意味。

状态行指示器(`goal_status.rs`):

| 状态 | 显示 |
|---|---|
| active | 有预算显示 `12.5K / 50K`,无预算显示已用时长 `2m` |
| paused / stalled / usage limited | 只显示状态 |
| limited by budget | `63.9K / 50K tokens` |
| complete | 有预算显示 tokens,无预算显示时长 |

active 状态下,指示器会把**当前 turn 已经跑的时间实时加上去**再显示
(`goal_status.rs:30`),所以数字是滚动的而不是上次落库的快照。

裸 `/goal` 打印摘要,并按状态给出可用命令(`goal_menu.rs:109`):

- active → `/goal edit, /goal pause, /goal clear`
- paused / stalled / usage limited → `/goal edit, /goal resume, /goal clear`
- limited by budget / complete → `/goal edit, /goal clear`

### 10.3 中断即暂停

`pause_active_goal_for_interrupt`(`interaction.rs:499`)在**六个中断路径**上被调用:
ESC 打断、Ctrl-C、会打断任务的模态按键等。

两个前置守卫:

```rust
if !self.turn_lifecycle.agent_turn_running { return; }        // 没有在跑的 turn 就不管
if !current_goal_status.is_some_and(GoalStatusState::is_active) { return; }  // 目标不是 active 就不管
```

语义:**用户按 ESC 的意思是"停下",不只是"停这一轮"** —— 所以顺带把目标也暂停,
否则下一次空闲又会自动跑起来,用户会觉得打不断。这是个很细但很重要的体验决策。

### 10.4 其他细节

- 设定目标成功后调 `maybe_send_next_queued_input()`,让排队的输入接着走
- 目标物化失败时清理已写入的附件目录(`cleanup_materialized_goal_files`)
- 所有异步操作后都检查 `current_displayed_thread_id() != Some(thread_id)`,
  防止用户切走后把结果写到别的会话里
- 临时会话的错误有专门文案,不是抛裸错误

---

## 11. app-server 层的三个设计点

### 11.1 目标可以"先于"会话存在

`thread_goal_set_inner`(`:161`)有一段特殊处理:如果 thread 还没有 rollout 文件,
设定目标会**顺带物化 rollout**,并把 thread settings 一起写进去。

注释:"Goal-first threads need their settings captured when the goal creates the rollout."

也就是说,可以先定目标再开始干活。

### 11.2 目标变更写进 rollout

每次 set/clear 都会往 rollout 追加一条 `RolloutItem::EventMsg(ThreadGoalUpdated)`。
**目标的变更史在会话记录里**,不只在数据库里。

### 11.3 通知定序

`emit_thread_goal_updated_ordered` 优先走 thread listener 的 command channel,
拿不到才直接发。目的是让 goal 通知和其他 thread 事件保持顺序,
避免客户端收到乱序的状态。

### 11.4 fork 继承目标(含用量)

`thread_fork_goal.rs`:fork 一个 thread 时,把源目标**整个快照**复制过去,只换 `thread_id`。
`replace_thread_goal_snapshot` 复制全部字段 —— 包括 `tokens_used` 和 `time_used_seconds`。

**fork 不重置预算。** 而且 fork 前会先 `flush_thread_goal_progress_for_fork` 冲刷在途计量,
保证快照是准的。继承前还会重新校验 objective,校验失败就跳过继承。

---

## 12. 失败与边界处理

| 情形 | 行为 | 位置 |
|---|---|---|
| 不可重试的 turn error | → **blocked** | `extension.rs:308` |
| `UsageLimitExceeded` | → usage_limited | `extension.rs:315` |
| 临时会话(无 rollout) | 拒绝,专门文案 | `thread_goal_processor.rs:277` |
| Review 子代理 | 不暴露 goal 工具 | `extension.rs:108` |
| Plan 模式 | 不计量、不续跑、usage-limit 不生效 | `accounting.rs:80` |
| 拿不到活线程 | 跳过续跑 | `runtime.rs:379` |
| 目标已被替换 | 在途结算被 `expected_goal_id` 拦掉 | `goals.rs:583` |
| 过期 turn 的停止请求 | 忽略 | `runtime.rs:257` |
| 模板渲染失败 | **panic**(嵌入模板视为不变量) | `steering.rs:33` |

`on_turn_error` 那条的注释值得原文引用,它解释了为什么不可重试错误要直接 blocked:

```
The turn has ended because the error was non-retryable or its retries were exhausted.
Block the goal to prevent automatic continuation from looping and consuming tokens,
as can happen with compaction errors.
```

**这是整个设计里唯一一条明确的"防烧钱"熔断。**

---

## 13. 设计上的两处空白

读完全部代码后,有两件事必须点明,因为它们直接决定了能不能照搬。

### 13.1 完成声明零验证

`update_goal(complete)` **没有任何验证**。`tool.rs:221` 的 `handle_update` 只做三件事:
校验 status 属于 {complete, blocked}、结算用量、写状态。

对 `ext/goal` 全模块 grep `review|verify`,唯一的 `validate_*` 是校验 objective 长度和
budget 为正数。没有任何一行代码检查"目标真的完成了吗"。

**模型说完成,循环立刻停止。**

(顺带排除一个容易产生的猜测:Codex 确实有 `Guardian` 和 `auto_review`,
但那是**工具调用的安全审批** —— 审批 `rm -rf` 这类命令,`ApprovalReviewer::Guardian`。
它和 goal 的唯一交集是「Review 子代理不发放 goal 工具」。不是完成验证器。
快照名 `guardian_goal_continuation_drops_stale_reviews` 有误导性,
对应测试 `guardian_cleanup_drops_stale_reviews_and_restores_mcp_status` 压根不涉及 goal。)

### 13.2 "blocked 连续三轮"由模型自己数

```
$ grep -rn "streak|consecutive|blocked_count" ext/goal/src/*.rs state/src/runtime/goals.rs
# 宿主侧零个计数器
```

"at least three consecutive goal turns" 只出现在两个地方:`spec.rs:66/77`(工具描述)
和 `continuation.md`(提示词)。`thread_goals` 表也没有任何 streak 字段。

模型完全可以第一轮就报 blocked,宿主不会拦。**这是提示词,不是机制。**

### 13.3 那什么是真机制

| 保证 | 靠什么 | 机制还是提示词 |
|---|---|---|
| 模型不能改小目标 | `update_goal` 只有 status 参数;`create_goal` 遇未完成目标硬失败 | **机制**(权限边界) |
| 目标不随压缩丢失 | 存 DB,每轮原文重注入 | **机制** |
| 目标文本不能当指令 | XML 包裹 + 转义 + 显式声明 | **机制** |
| 续跑与否不由模型决定 | 宿主 `continue_if_idle` + SQL 预算 | **机制** |
| 不烧钱死循环 | 不可重试错误强制 blocked + SQL 硬预算 | **机制** |
| 用户输入优先 | `try_start_turn_if_idle` 四重检查 | **机制** |
| **完成是真的完成** | continuation.md 的 Completion audit | **提示词** |
| **不轻易放弃** | Blocked audit 的三轮规则 | **提示词** |
| **不偷换更容易的方案** | Fidelity 段 | **提示词** |

结论:**Codex 用权限边界解决了"不偏移",用提示词处理"不敷衍"。**
前者可以直接照搬,后者如果照搬就只是搬了段文字。

---

## 14. 可迁移的十二条

1. 目标持久化,与单次 turn 解耦;存的是意图 + 预算 + 用量,不是对话
2. 自动续跑必须走**统一的"仅空闲时启动"闸门**,并且反复检查用户输入
3. **deferral**:外部设定目标后不抢第一轮
4. 模型只能设两个终止标志,其余状态转移全在宿主手里
5. blocked 与 usage_limited 是**必须预留**的终止原因(Codex 初版没有,后来补的)
6. 目标状态独立存储,不挂在会话生命周期上(Codex 从主库迁到独立库)
7. 预算判定写进原子更新,配合 `expected_goal_id` 乐观校验
8. 任何不可重试的错误直接终止循环 —— 唯一的防烧钱熔断
9. 计量要区分:创建前不算、Plan 轮不算、空闲时间要算、限流后不算、超预算后仍要算
10. 中断即暂停 —— 用户按 ESC 的意思是"停下",不是"停这一轮"
11. 超长目标落盘 + 单行引用,并对反解路径做严格校验(objective 是用户数据)
12. **完成判定是唯一的空白**;要真正防敷衍必须自己补一层可证伪的验收

---

## 15. 文件索引

| 层 | 文件 | 行数 | 已读 |
|---|---|---|---|
| protocol | `protocol/src/protocol.rs`(goal 部分) | — | 是 |
| state | `state/src/model/thread_goal.rs` | 117 | 全 |
| state | `state/src/runtime/goals.rs` | 1728 | 非测试部分全读 |
| state | `goals_migrations/*.sql`、`migrations/0029/0033/0034` | 81 | 全 |
| ext/goal | `extension.rs` | 504 | 全 |
| ext/goal | `runtime.rs` | 586 | 全 |
| ext/goal | `accounting.rs` | 442 | 全 |
| ext/goal | `tool.rs` | 500 | 全 |
| ext/goal | `api.rs` | 357 | 全 |
| ext/goal | `spec.rs` / `steering.rs` / `events.rs` / `metrics.rs` / `analytics.rs` / `lib.rs` | 446 | 全 |
| ext/goal | `tests/goal_extension_backend.rs` | 1477 | 20 个测试全读 |
| ext/goal | `tests/accounting.rs` | 69 | 全 |
| ext/goal | `templates/goals/*.md` | 83 | 全 |
| core | `core/src/session/inject.rs` | 140 | 全 |
| app-server | `thread_goal_processor.rs` | 462 | 全 |
| app-server | `thread_fork_goal.rs` | 28 | 全 |
| tui | `app/thread_goal_actions.rs` | 464 | 全 |
| tui | `goal_files.rs` | 242 | 全 |
| tui | `chatwidget/goal_menu.rs` | 143 | 全 |
| tui | `chatwidget/goal_status.rs` | 228 | 全 |
| tui | `goal_display.rs` | 111 | 全 |
| tui | `chatwidget/slash_dispatch.rs`(goal 部分) | — | 全 |
| tui | `chatwidget/interaction.rs`(中断部分) | — | 全 |
| prompts | `prompts/src/goals.rs` | 110 | 全(是 steering.rs 的重复副本) |

未读:TUI 快照文件(纯渲染断言)、`chatwidget/tests/goal_menu.rs` 与 `goal_validation.rs`
的测试体(测试名已核对,覆盖超长目标、多行目标、粘贴保留、队列中断)。
