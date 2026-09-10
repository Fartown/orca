# 本地新增需求索引

本索引由 `pnpm generate:issue-index` 从 `config/fork-features.jsonc` 和各需求的 `journal.md` 生成，不要手改；`pnpm check:fork-docs` 会核对它与事实源一致。每个 Journal 是本需求的文档入口；目标及 P0/P1/P2 在各自需求正文中维护，技术与测试不跨需求合并。

| 需求 | 目标 | 状态 | 需求文档 | 方案 | 测试用例 | 更新 |
| --- | --- | --- | --- | --- | --- | --- |
| [Goal 目标模式](Goal目标模式/journal.md) | 持久目标、既有会话续跑、独立验收与目标管理 UI | testing | [Goal目标模式](Goal目标模式/requirements/Goal目标模式.md) | [Goal目标模式技术说明](Goal目标模式/solutions/Goal目标模式技术说明.md)、[Goal目标管理与交互闭环方案](Goal目标模式/solutions/Goal目标管理与交互闭环方案.md) | [Goal功能测试](Goal目标模式/tests/cases/Goal功能测试.md) | 2026-09-10 |
| [Issues 看板与会话](Issues看板与会话/journal.md) | 组织跨工作区会话，关闭后准确恢复，保持标题稳定 | implementing | [Issues看板与会话](Issues看板与会话/requirements/Issues看板与会话.md) | [Issues看板与会话技术说明](Issues看板与会话/solutions/Issues看板与会话技术说明.md) | [Issues功能测试](Issues看板与会话/tests/cases/Issues功能测试.md) | 2026-09-10 |
| [自托管产物后端](自托管产物后端/journal.md) | 通过现有产物客户端访问局域网服务 | implementing | [自托管产物后端](自托管产物后端/requirements/自托管产物后端.md) | [自托管产物后端技术说明](自托管产物后端/solutions/自托管产物后端技术说明.md) | [自托管产物后端功能测试](自托管产物后端/tests/cases/自托管产物后端功能测试.md) | 2026-09-05 |

状态是需求整体状态（clarifying / designing / implementing / testing / done / blocked）；各文档自己的状态以 Journal 的关键文档链接表为准。文档 ready、代码存在、单测通过和真实产品验收是不同状态；各自 Test Run 只证明记录的执行范围。

此处仅整理本地需求，不收拢上游 docs/site、通用架构等文档。跨需求的迁移、恢复及文档校验证据放在 [维护记录](../maintenance/本地需求文档整理/2026-09-05-文档归并记录.md)，不作为第四个需求。
