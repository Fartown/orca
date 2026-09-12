# 本地新增需求索引

本索引由 `pnpm generate:issue-index` 从 `config/fork-features.jsonc` 和各需求的 `journal.md` 生成，不要手改；`pnpm check:fork-docs` 会核对它与事实源一致。每个 Journal 是本需求的文档入口；目标及 P0/P1/P2 在各自需求正文中维护，技术与测试不跨需求合并。

| 需求 | 目标 | 状态 | 需求文档 | 方案 | 测试用例 | 更新 |
| --- | --- | --- | --- | --- | --- | --- |
| [文档预览大小](文档预览大小/journal.md) | 扩大文档文本预览上限，不扩大普通文件读取和 paired RPC 预算 | testing | [文档预览大小](文档预览大小/requirements/文档预览大小.md) | - | [预览大小边界](文档预览大小/tests/cases/预览大小边界.md) | 2026-09-12 |
| [Goal 目标模式](Goal目标模式/journal.md) | 持久目标、既有会话续跑、独立验收与目标管理 UI | testing | [Goal目标模式](Goal目标模式/requirements/Goal目标模式.md) | [Goal目标模式技术说明](Goal目标模式/solutions/Goal目标模式技术说明.md)、[Goal目标管理与交互闭环方案](Goal目标模式/solutions/Goal目标管理与交互闭环方案.md) | [Goal功能测试](Goal目标模式/tests/cases/Goal功能测试.md) | 2026-09-10 |
| [Issues 看板与会话](Issues看板与会话/journal.md) | 组织跨工作区会话，复用公共会话名称与原生恢复 | implementing | [Issues看板与会话](Issues看板与会话/requirements/Issues看板与会话.md) | [Issues看板与会话技术说明](Issues看板与会话/solutions/Issues看板与会话技术说明.md) | [Issues功能测试](Issues看板与会话/tests/cases/Issues功能测试.md) | 2026-09-10 |
| [会话命名与身份保护](会话命名与身份保护/journal.md) | 同一会话在各入口使用一致名称，后台调用不顶替主身份 | implementing | [会话命名与身份保护](会话命名与身份保护/requirements/会话命名与身份保护.md) | [Claude在位会话活跃窗口保护方案](会话命名与身份保护/solutions/Claude在位会话活跃窗口保护方案.md)、[Provider优先的会话命名统一方案](会话命名与身份保护/solutions/Provider优先的会话命名统一方案.md)、[会话命名统一方案](会话命名与身份保护/solutions/会话命名统一方案.md) | [Claude活跃窗口保护测试](会话命名与身份保护/tests/cases/Claude活跃窗口保护测试.md)、[Codex嵌套调用保护测试](会话命名与身份保护/tests/cases/Codex嵌套调用保护测试.md)、[Provider优先命名验收](会话命名与身份保护/tests/cases/Provider优先命名验收.md)、[顶部名称投影测试](会话命名与身份保护/tests/cases/顶部名称投影测试.md) | 2026-09-11 |
| [自托管产物后端](自托管产物后端/journal.md) | 通过现有产物客户端访问局域网服务 | testing | [自托管产物后端](自托管产物后端/requirements/自托管产物后端.md) | [自托管产物后端技术说明](自托管产物后端/solutions/自托管产物后端技术说明.md) | [自托管产物后端功能测试](自托管产物后端/tests/cases/自托管产物后端功能测试.md) | 2026-09-10 |
| ["远程工作区绝对路径打开"](远程工作区绝对路径打开/journal.md) | 弹窗输入绝对路径时本地开本地、SSH 开远端，paired runtime 只放行 worktree 内路径 | done | [远程工作区绝对路径打开](远程工作区绝对路径打开/requirements/远程工作区绝对路径打开.md) | [标签栏新建Tab弹窗远程工作区打开绝对路径方案](远程工作区绝对路径打开/solutions/标签栏新建Tab弹窗远程工作区打开绝对路径方案.md) | [远程工作区绝对路径打开功能测试](远程工作区绝对路径打开/tests/cases/远程工作区绝对路径打开功能测试.md) | 2026-09-11 |

状态是需求整体状态（clarifying / designing / implementing / testing / done / blocked）；各文档自己的状态以 Journal 的关键文档链接表为准。文档 ready、代码存在、单测通过和真实产品验收是不同状态；各自 Test Run 只证明记录的执行范围。

此处仅整理本地需求，不收拢上游 docs/site、通用架构等文档。跨需求的迁移、恢复及文档校验证据放在 [维护记录](../maintenance/本地需求文档整理/2026-09-05-文档归并记录.md)，不另立为产品需求。
