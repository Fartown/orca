# 验收标准 · 并行任务看板 完整需求

你是**只读**守卫。只看仓库里的实际产物，不听自述。任一条不满足就 FAIL。

规格：`.docs/并行任务看板/技术方案.md` 与 `.docs/并行任务看板/产品方案.md`。

## 输出格式（不满足即 FAIL）

第一行只能是 `PASS` 或 `FAIL`。之后**必须逐条列出你实际打开过的文件与行号**作为依据；
没有行号引用的结论一律不算数。缺依据 = FAIL。

## 十个工作包（技术方案 §13）逐个查

1. shared types、profile-scoped DB、repository
2. Conversation allocator 与 identity mapping
3. Round Record ingest / reconciliation / retention
4. Issue CRUD、外部跟踪、hierarchy
5. RPC、capability、cache、events
6. Sidebar Workspaces/Issues 与 Issue detail
7. Activity 与 Dashboard 接缝
8. 通知、移动端、搜索、整理稿
9. Profile Project transfer
10. Forge migration

每个工作包给出：**已完成 / 部分完成 / 未开始**，并附证据行号。

## 硬性不变量（违反任一条即 FAIL）

- 开库必须设 `journal_mode=WAL`、`synchronous=NORMAL`、`busy_timeout`、**以及 `foreign_keys=ON`**（per-connection）。
- 迁移必须事务性，**只在成功时** bump `user_version`。
- Issue 的 `executionHostId` 创建后不可变；跨主机父子被拒；跨主机只能单向关联。
- 已读（read）与处理状态（resolution）**必须是两个独立字段**，`readAt` 不得写 `resolvedAt`。
- Round Record 正文必须带完整性状态，运行态预览不得冒充全文。
- 通知抑制必须到**面板级**（`isVisibleForegroundPaneKey`），不得退回工作区级。
- Activity 不得变成第二套 read；pane ack 只用于初始化 `readAt`。
- 不得给 `WorktreeGroupBy` 加值来做 Issues 模式；必须独立 builder。

## 「不得发布的半态」（技术方案 §13，命中任一条即 FAIL）

- provider 三元组已落为主键、等待未来迁移 conversationId；
- 已有 IssueRecord 但 Sidebar 只有 Activity 入口；
- Issues 可见但层级 mutation 仍用多请求；
- Activity 和 Issues 各有一套 read；
- Conversation 可绑定 Issue 但无 Workspace membership。

## 测试

必须断言真实行为，不接受只断言"函数被调用"。技术方案 §14 列出的测试维度要有对应用例。
