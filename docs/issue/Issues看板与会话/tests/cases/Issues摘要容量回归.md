# Issues 摘要容量回归

关联需求：REQ-004、REQ-012、REQ-015、REQ-017、REQ-029。仅覆盖摘要查询，不代表完整容量与降级目标验收。

| 用例 | 输入及动作 | 预期结果 |
| --- | --- | --- |
| TC-238 | 384 个会话，各保留 67 个含 4 KiB 输出预览的轮次，连续读取两页会话摘要及未分配摘要 | 每页只解码本页会话最新轮次，摘要不调用全历史读取；顺序与 continuation cursor 保持不变；未解决数准确 |
| TC-239 | 本机与 SSH 分区、不同 folder workspace，存在同时间轮次、已读与已解决轮次 | 主机与工作区隔离；最新轮次按 occurred_at、id 倒序取一条；已读不等于已解决 |
| TC-240 | Issue 包含已绑定身份、未绑定身份以及没有轮次的会话 | Issue 可见会话计数语义不变；空历史保持 latestRound=null 和 unresolvedRoundCount=0 |

自动化入口：`src/main/issues/issue-query-summary-volume.test.ts`，由 Issues 已注册 checks 运行。容量测试约束读取数量，不以机器相关的毫秒阈值作为 CI 断言。

执行结果另见 [2026-10-09 摘要容量验证](../runs/2026-10-09-Issues摘要容量验证.md)。
