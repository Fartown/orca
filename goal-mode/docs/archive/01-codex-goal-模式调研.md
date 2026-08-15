# Codex Goal 模式调研

调研对象:`openai/codex` @ `3418498f` (2026-07-28),核心实现位于 `codex-rs/ext/goal`(约 4460 行,含 1477 行集成测试)。
本地克隆:`SCRATCHPAD/codex`。

> 📌 本文首版基于 `extension.rs` / `runtime.rs` / `steering.rs` / `spec.rs` / 模板 / SQL schema。
> 补读 `accounting.rs` / `tool.rs` / `api.rs` 与全部 20 个集成测试后,
> **§7 计量、§6 工具语义、§3 状态机各有修正**,已就地更新;
> 完整修正清单与源码出处见 [`05-源码精读修正.md`](./05-源码精读修正.md)。

## 1. 是什么

`/goal` 于 Codex CLI **0.128.0**(2026-04-30)引入。它把"一次性指令"变成"挂在 thread 上的持久目标":
设定目标后,Codex 进入 **plan → act → test → review → iterate** 的自动循环,每当会话空闲就自己再开一轮,
直到目标达成、判定阻塞、或预算耗尽。

用户命令:`/goal [objective]`、`/goal edit`、`/goal pause`、`/goal resume`、`/goal clear`。

## 2. 架构:它是一个"扩展",不是主循环里的 if

`GoalExtension` 通过 `ExtensionRegistryBuilder` 注册了 6 类 contributor,全部是钩子式接入
(`ext/goal/src/extension.rs:460`):


| Contributor                  | 钩子                                                                               | 职责                                               |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| `ThreadLifecycleContributor` | `on_thread_start` / `on_thread_resume` / `on_thread_idle` / `on_thread_stop` | **`on_thread_idle` 是看门狗的心脏**,空闲即续跑              |
| `TurnLifecycleContributor`   | `on_turn_start` / `on_turn_stop` / `on_turn_abort` / `on_turn_error`             | 计量起止、错误终止                                        |
| `TokenUsageContributor`      | `on_token_usage`                                                                 | 累计 token 增量                                      |
| `ToolLifecycleContributor`   | `on_tool_finish`                                                                 | 工具调用后即时结算 + 预算超限即时注入收尾指令                         |
| `ToolContributor`            | —                                                                                | 向模型暴露 `get_goal` / `create_goal` / `update_goal` |
| `ConfigContributor`          | `on_config_changed`                                                              | 开关热更新                                            |


关键设计:**目标状态与 turn 完全解耦**,turn 只是目标的一次推进。

## 3. 数据模型

独立 SQLite 库(`state/goals_migrations/0001_thread_goals.sql`),**一个 thread 至多一个目标**:

```sql
CREATE TABLE thread_goals (
    thread_id TEXT PRIMARY KEY NOT NULL,
    goal_id TEXT NOT NULL,              -- 乐观校验用;仅 replace_thread_goal 换新 id(见下)
    objective TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN
      ('active','paused','blocked','usage_limited','budget_limited','complete')),
    token_budget INTEGER,               -- 可空
    tokens_used INTEGER NOT NULL DEFAULT 0,
    time_used_seconds INTEGER NOT NULL DEFAULT 0,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);
CREATE TABLE thread_goal_continuation_deferrals (
    thread_id TEXT PRIMARY KEY NOT NULL REFERENCES thread_goals(thread_id) ON DELETE CASCADE
);
```

### 状态机(6 态)

```
                 ┌──────────────────────────────── /goal resume ──────────────┐
                 ↓                                                            │
  (无) ──/goal──▶ active ──update_goal(complete)──▶ complete (终态)            │
                 │ ├─ /goal pause ─────────────▶ paused ──────────────────────┤
                 │ ├─ update_goal(blocked) ────▶ blocked ─────────────────────┤
                 │ ├─ turn error (不可重试) ───▶ blocked   ← 防烧钱循环        │
                 │ ├─ UsageLimitExceeded ──────▶ usage_limited ───────────────┘
                 │ └─ tokens_used >= budget ───▶ budget_limited (终态)
```

`is_terminal() = budget_limited | complete`。只有 `active` 会被自动续跑。

**三条 SQL 层的状态规则**(`goals.rs:292`,补读后补充):

- `budget_limited` **不会**被 `paused` / `blocked` 覆盖(终态保护)
- resume 一个已超预算的目标会**立刻回落** `budget_limited`,除非同一次调用抬高 `token_budget`
- `pause` 只作用于 `active`;`usage_limit` 可作用于 `active` 或 `budget_limited`

**goal_id 与用量的关系**(补读后更正):

- 无目标时设定目标 → `replace_thread_goal`:新 `goal_id`,用量**清零**
- 已有目标时编辑 objective → `update_thread_goal`:**保留** `goal_id` 与累计用量(`api.rs:200`)

`objective` 上限 4000 字符(`MAX_THREAD_GOAL_OBJECTIVE_CHARS`);超长时 TUI 把正文落盘成
`attachments/goal-objective.md`,objective 本身改写成一句
`Read the Codex goal objective file at PATH before continuing.`(`tui/src/goal_files.rs`)。
**这个"长提示词落盘 + 单行引用"的技巧对 Orca 直接可复用。**

## 4. 看门狗循环:`continue_if_idle`

`runtime.rs:359`。这是全部机制里最值得抄的一段:

```
on_thread_idle
  └─ continue_if_idle()
       1. tools_visible()?            → 否则清空 active 标记直接返回
       2. 取 goal_state_lock (信号量,1 permit)
          ── 持锁跨越「读目标 → 启动 turn」,外部 set/clear 无法插队
       3. has_thread_goal_continuation_deferral()? → 有则返回(见下)
       4. thread_manager.upgrade() / get_thread() → 拿不到活线程就放弃
       5. 目标存在且 status == active? → 否则清标记返回
       6. 构造 continuation steering item
       7. thread.try_start_turn_if_idle(vec![item])
       8. 若当前 turn 未被标记为 goal turn → 清 active 标记
```

### 让位闸门 `try_start_turn_if_idle`(`core/src/session/inject.rs:45`)

这是**所有扩展发起的自动工作共用的一道闸**,用户永远优先:

- `has_trigger_turn_mailbox_items()` → 用户输入已排队 → 拒绝(`PendingTriggerTurn`)
- `collaboration_mode == Plan` → 拒绝(`PlanMode`)
- 已有 active turn → 拒绝(`Busy`)
- 抢占式预留 turn slot 后**再检查三次**用户输入/Plan 模式,任一命中就回滚预留

### 续跑延迟 `continuation_deferrals`

外部(用户/客户端)设置目标时,同一事务里插入一条 deferral 记录
(`state/src/runtime/goals.rs:109`);它在 `on_turn_start` 时被清除。
效果:**刚设完目标不抢跑第一轮**,让用户自己发出的那一轮先跑,之后看门狗才接管。

### 运行中注入 `inject_if_running`

预算耗尽、目标被编辑这两种情况不等空闲,直接把 steering item 塞进正在跑的 turn 的输入队列。

## 5. 提示词协议(真正的 IP)

`ext/goal/templates/goals/` 三个模板,由 `steering.rs` 渲染后作为
`InternalModelContextFragment{source: "goal"}` 注入。

### `continuation.md`(约 3.8k 字符)—— 续跑主提示

结构化为六个小节,每一节都在防一种失败模式:


| 小节                        | 防的问题                                                         |
| ------------------------- | ------------------------------------------------------------ |
| **Continuation behavior** | 防"把目标缩小到本轮能做完的程度"                                            |
| **Budget**                | 告知已用/剩余 token                                                |
| **Work from evidence**    | 以当前 worktree 实际状态为准,不信任对话记忆                                  |
| **Progress visibility**   | 多步任务用 `update_plan`                                          |
| **Fidelity**              | 防"选一个更容易通过测试的更小方案";明确"对齐 = 朝向请求的终态移动"                        |
| **Completion audit**      | **完成默认视为未证明**:逐条需求找权威证据(文件/命令输出/测试结果/PR 状态),证据弱、间接、缺失一律视为未完成 |
| **Blocked audit**         | 同一阻塞**连续 3 轮**才允许标 blocked;"难/慢/不确定"不算阻塞                     |


另外两条硬约束反复出现:

- 不许因为"预算快用完了"就标完成
- objective 用 objective XML 标签包裹并转义,明确声明是**用户数据而非高优先级指令**(防提示注入)

### `budget_limit.md` —— 预算耗尽收尾

"系统已把目标标为 budget_limited,不要开新工作;总结进展、列出剩余工作、给用户明确下一步。"

### `objective_updated.md` —— 目标被编辑

"新目标取代旧目标;不要继续只服务旧目标的工作。"

## 6. 模型侧工具

`spec.rs` 定义三个函数工具,只在 `tools_visible()`(启用 + 有持久化 thread 状态 + 不是 Review 子代理)时暴露:

- `get_goal()` —— 读状态/预算/用量
- `create_goal(objective, token_budget?)` —— **仅在用户明确要求时**创建;
只有当现有目标 `status = 'complete'` 时才能替换(`goals.rs:245` 的 `ON CONFLICT … WHERE`),
**`budget_limited` 虽是终态但也会被拒绝**,报 "this thread has an unfinished goal"
- `update_goal(status: "complete" | "blocked")` —— **只能标完成或阻塞**;
明确禁止用它 pause/resume/budget-limit(那些是用户/系统的权限)

工具返回体 `{goal, remainingTokens, completionBudgetReport}`。
`completionBudgetReport` 只在 `complete` 且(有预算 或 耗时大于 0)时出现,
内容是一段**要模型把最终用量讲给用户听**的指令(`tool.rs:491`)。

## 7. 计量与预算

### 口径(补读 `accounting.rs` 后更正)

```rust
// accounting.rs:331 —— 先对每个字段求增量,再套这个公式
(Δinput_tokens − Δcached_input_tokens) + Δoutput_tokens
```

**不含 `cache_write_input_tokens`;`reasoning_output_tokens` 不单独加**(已在 `output_tokens` 内)。
测试佐证 `tests/accounting.rs:11`:基线 `(100,10,30)` → 当前 `(120,14,42)` → `(20−4)+12 = 28`。

### 时机

- `on_turn_start`:记录 token 基线,标记"这一 turn 属于某目标";
**Plan 模式的 turn 既不计 token 也不计时间**(`account_tokens=false` 时 `progress_snapshot` 直接返回 `None`)
- `on_token_usage`:累计增量
- `on_tool_finish`:每个工具调用后结算一次(排除 `update_goal` 自身;只统计 handler 真正执行过的调用)。
**并发工具结算只记一次**(信号量 + snapshot/mark 配对,测试 `:300`)
- `on_turn_stop` / `on_turn_abort`:收尾结算
- **空闲也计时**:没有活跃 turn 时按墙钟结算(`account_idle_goal_progress`,测试 `:1012` 断言 resume 后单纯 sleep 也会累加)。
墙钟基线是"前进已结算秒数"而非重置为 now,不足 1 秒的余量累积不丢

### 两条容易踩错的语义

- **目标创建之前的本轮消耗不计入**:`create_goal` 会 `reset_baseline_to_current()`。
测试 `:190`:创建前消耗 28、创建后消耗 15 → `tokens_used == 15`
- **`budget_limited` 后继续记账,`usage_limited` 后停止记账**。
前者结算 mode 是 `ActiveOnly = status IN ('active','budget_limited')`(测试 `:363`,25 → 35);
后者结算完即 `clear_active_goal`(测试 `:497`,之后再消耗仍是 23)

预算判定在 **SQL 里原子完成**(`goals.rs:499`):

```sql
status = CASE WHEN status='active' AND token_budget IS NOT NULL
              AND tokens_used + :delta >= token_budget
         THEN 'budget_limited' ELSE status END
```

并且每次结算都带 `AND goal_id = :expected_goal_id` —— 目标被替换后,在途的旧结算不会写错账。
首次跨越预算时,`on_tool_finish` 用 `mark_budget_limit_reported_if_new` 保证**只注入一次**收尾提示。

## 8. 错误处理(防跑飞)

`on_turn_error`(`extension.rs:308`)只有两条分支,注释写得很直白:

- `UsageLimitExceeded` → `usage_limited`
- **其他一切不可重试错误 → `blocked`**,注释:*"Block the goal to prevent automatic continuation
from looping and consuming tokens, as can happen with compaction errors."*

## 9. UI 表面

- 状态行指示器:active(带 token/耗时)、paused、blocked、usage limited、limited by budget、complete
- `/goal` 菜单:按状态给出可用命令(`goal_menu.rs:109`)
- 恢复会话时若存在 paused 目标 → 弹"Resume paused goal?"
- 替换**未完成**目标前需确认;替换已完成目标不需要
- ESC 打断 → 目标转 paused
- OTel 指标:created / resumed / blocked / usage_limited / budget_limited / completed 计数
  - token、时长直方图

## 10. 可迁移到 Orca 的八条原则

1. 目标**持久化**且与单次 turn 解耦,存的是"意图 + 预算 + 用量",不是对话
2. 自动续跑必须走**统一的"仅空闲时启动"闸门**,用户输入无条件优先
3. **deferral**:外部设定目标后不抢第一轮
4. 完成判定交给模型,但用**证据审计式提示词**强约束("完成默认未证明")
5. blocked 需要**连续 N 轮同一阻塞**,避免一遇阻力就停
6. **硬预算 + 终态**;预算耗尽 ≠ 完成,且要注入收尾指令
7. **任何不可重试的错误直接终止循环**,这是防烧钱的最后一道闸
8. 状态变更全部**原子写 + 乐观校验(goal_id)**,防止在途结算写到已被替换的目标上

## 参考链接

- [Codex CLI 0.128.0 adds /goal — Simon Willison](https://simonwillison.net/2026/Apr/30/codex-goals/)
- [openai/codex#20536 — Document the /goal CLI command and Goals lifecycle](https://github.com/openai/codex/issues/20536)
- [How to Use OpenAI Codex's /goal Command — MindStudio](https://www.mindstudio.ai/blog/openai-codex-goal-command-autonomous-tasks)
- [OpenAI Codex /goal: The New Long-Horizon Mode — Kingy AI](https://kingy.ai/ai/openai-codex-goal-the-new-long-horizon-mode-for-agentic-coding/)

