# 验收标准 · 工作包 1：shared types、profile-scoped DB、repository

你是**只读**守卫。只看仓库里的实际产物，不听自述。任一条不满足就判不通过。

规格来源：`.docs/并行任务看板/技术方案.md`（§4 数据模型、§13 工作包 1）。

## 必须存在且真实实现（不是空壳、不是 TODO）

1. **shared types**：`src/shared/issues/` 下有 Issue / Conversation / RoundRecord 的类型与常量，导出可被 main 引用。
2. **profile 隔离的 DB**：`src/main/issues/` 下有库的打开与迁移模块，且：
   - 复用 `src/main/sqlite/sync-database.ts`，不自己 new 别的 sqlite 驱动；
   - 开库时设置 `journal_mode = WAL`、`synchronous = NORMAL`、`busy_timeout`，**并显式设置 `foreign_keys = ON`**（per-connection，漏设会让外键静默失效）；
   - 迁移在事务内进行，**只在成功时** bump `user_version`（全成或全不成）；
   - 库文件路径经 `getOrcaProfileDirectory`（`src/main/orca-profiles/profile-storage-paths.ts`）取得，随 profile 隔离；
   - 对 db / `-wal` / `-shm` 三个文件收紧权限（win32 可跳过）。
3. **repository**：有 Issue 与 Conversation 的增删改查封装，并实现 **mutation receipt 幂等**（同一 mutationId 重复提交不产生第二次副作用）。
4. **主机约束**：Issue 记录带 `executionHostId`，且**创建后不可变**；跨主机的父子关系被拒绝。

## 测试必须真实覆盖以下行为

不接受"有测试文件"就算数，必须断言到行为：

- 迁移失败时 `user_version` 未被 bump（全成或全不成）；
- `foreign_keys` 确实为 ON（查 `PRAGMA foreign_keys` 得 1）；
- 同一 mutationId 重复提交幂等；
- 不同 profile 得到不同库文件、互不可见；
- Issue 的 `executionHostId` 不可变；跨主机 parent 被拒。

## 判不通过的情形

- 任一 `pnpm run typecheck:node` 或单测失败；
- 用 `PRAGMA foreign_keys` 之外的方式假装外键生效；
- 迁移不是事务性的，或失败后 `user_version` 已被改；
- 测试只断言"函数被调用"而不断言真实行为；
- 改动了 sidebar、Activity、通知、移动端相关文件（本工作包不含它们）。

## 输出

先给结论行 `PASS` 或 `FAIL`，再逐条列出你**实际查看的文件与行号**作为依据。没看过的不要写。
