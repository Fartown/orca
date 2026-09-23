# 本地新增需求索引

本索引由 `pnpm generate:issue-index` 从 `config/fork-features.jsonc` 和各需求的 `journal.md` 生成，不要手改；`pnpm check:fork-docs` 会核对它与事实源一致。每个 Journal 是本需求的文档入口；目标及 P0/P1/P2 在各自需求正文中维护，技术与测试不跨需求合并。

| 需求 | 目标 | 状态 | 需求文档 | 方案 | 测试用例 | 更新 |
| --- | --- | --- | --- | --- | --- | --- |
| [集成分支自动出包](集成分支自动出包/journal.md) | 同源发布 fork 内测包，并提供桌面更新清单和 Android 应用内更新 | testing | [集成分支自动出包](集成分支自动出包/requirements/集成分支自动出包.md) | [macOS自动更新签名修复方案](集成分支自动出包/solutions/macOS自动更新签名修复方案.md) | [自动出包](集成分支自动出包/tests/cases/自动出包.md) | 2026-09-17 |
| [文档预览大小](文档预览大小/journal.md) | 扩大文档文本预览上限，不扩大普通文件读取和 paired RPC 预算 | testing | [文档预览大小](文档预览大小/requirements/文档预览大小.md) | - | [预览大小边界](文档预览大小/tests/cases/预览大小边界.md) | 2026-09-15 |
| [Goal 目标模式](Goal目标模式/journal.md) | 持久目标、既有会话续跑、独立验收与目标管理 UI | designing | [Goal目标模式](Goal目标模式/requirements/Goal目标模式.md) | [Goal守卫监工与唤醒兜底修订方案](Goal目标模式/solutions/Goal守卫监工与唤醒兜底修订方案.md)、[Goal守卫监工与唤醒兜底修订方案.review](Goal目标模式/solutions/Goal守卫监工与唤醒兜底修订方案.review.md)、[Goal目标模式技术说明](Goal目标模式/solutions/Goal目标模式技术说明.md)、[Goal目标管理与交互闭环方案](Goal目标模式/solutions/Goal目标管理与交互闭环方案.md) | [Goal功能测试](Goal目标模式/tests/cases/Goal功能测试.md) | 2026-09-23 |
| [Issues 看板与会话](Issues看板与会话/journal.md) | 组织跨工作区会话，复用公共会话名称与原生恢复 | implementing | [Issues看板与会话](Issues看板与会话/requirements/Issues看板与会话.md) | [Issues看板与会话技术说明](Issues看板与会话/solutions/Issues看板与会话技术说明.md) | [Issues功能测试](Issues看板与会话/tests/cases/Issues功能测试.md) | 2026-09-12 |
| [会话命名与身份保护](会话命名与身份保护/journal.md) | 同一会话在各入口使用一致名称，后台调用不顶替主身份 | implementing | [会话命名与身份保护](会话命名与身份保护/requirements/会话命名与身份保护.md) | [Claude在位会话活跃窗口保护方案](会话命名与身份保护/solutions/Claude在位会话活跃窗口保护方案.md)、[Provider优先的会话命名统一方案](会话命名与身份保护/solutions/Provider优先的会话命名统一方案.md)、[会话命名统一方案](会话命名与身份保护/solutions/会话命名统一方案.md) | [Claude活跃窗口保护测试](会话命名与身份保护/tests/cases/Claude活跃窗口保护测试.md)、[Codex嵌套调用保护测试](会话命名与身份保护/tests/cases/Codex嵌套调用保护测试.md)、[Provider优先命名验收](会话命名与身份保护/tests/cases/Provider优先命名验收.md)、[顶部名称投影测试](会话命名与身份保护/tests/cases/顶部名称投影测试.md) | 2026-09-14 |
| [自托管产物后端](自托管产物后端/journal.md) | 文件在哪台电脑就由那台电脑的 Orca 在局域网提供链接，本机文件与 SSH 主机上的文件走同一套规则 | testing | [自托管产物后端](自托管产物后端/requirements/自托管产物后端.md) | [局域网Artifact分享服务重构方案](自托管产物后端/solutions/局域网Artifact分享服务重构方案.md)、[自托管产物后端技术说明](自托管产物后端/solutions/自托管产物后端技术说明.md) | [自托管产物后端功能测试](自托管产物后端/tests/cases/自托管产物后端功能测试.md) | 2026-09-17 |
| ['远程工作区绝对路径打开'](远程工作区绝对路径打开/journal.md) | 弹窗输入绝对路径时本地开本地、SSH 开远端；不按路径位置拦截，归属未解析才不可用 | implementing | [远程工作区绝对路径打开](远程工作区绝对路径打开/requirements/远程工作区绝对路径打开.md) | [标签栏新建Tab弹窗远程工作区打开绝对路径方案](远程工作区绝对路径打开/solutions/标签栏新建Tab弹窗远程工作区打开绝对路径方案.md) | [远程工作区绝对路径打开功能测试](远程工作区绝对路径打开/tests/cases/远程工作区绝对路径打开功能测试.md) | 2026-09-15 |
| ["HTML预览在当前面板打开"](HTML预览在当前面板打开/journal.md) | 预览 tab 建在发起操作的 pane 内并切过去，本地与远程工作区落位一致 | testing | [HTML预览在当前面板打开](HTML预览在当前面板打开/requirements/HTML预览在当前面板打开.md) | - | [HTML预览在当前面板打开功能测试](HTML预览在当前面板打开/tests/cases/HTML预览在当前面板打开功能测试.md) | 2026-09-15 |
| ["远程大文件编辑器读取"](远程大文件编辑器读取/journal.md) | files.read 报 truncated 时用已有的 files.readChunk 读全文，不新增 wire 面 | testing | [远程大文件编辑器读取](远程大文件编辑器读取/requirements/远程大文件编辑器读取.md) | - | [远程大文件编辑器读取功能测试](远程大文件编辑器读取/tests/cases/远程大文件编辑器读取功能测试.md) | 2026-09-15 |
| ["远程主机绝对路径打开"](远程主机绝对路径打开/journal.md) | 主机为任意绝对路径发放 grant，客户端按 grant 读写，不新增 wire 方法之外的协议面 | testing | [远程主机绝对路径打开](远程主机绝对路径打开/requirements/远程主机绝对路径打开.md) | - | [远程主机绝对路径打开功能测试](远程主机绝对路径打开/tests/cases/远程主机绝对路径打开功能测试.md) | 2026-09-16 |
| ["移动端在新会话中继续"](移动端在新会话中继续/journal.md) | 移动端从当前 claude / codex 会话新建续接会话，复用主机既有 RPC，不改 wire | testing | [移动端在新会话中继续](移动端在新会话中继续/requirements/移动端在新会话中继续.md) | [移动端续接会话终端通道方案](移动端在新会话中继续/solutions/移动端续接会话终端通道方案.md) | [移动端续接会话](移动端在新会话中继续/tests/cases/移动端续接会话.md) | 2026-09-13 |
| ["富文本Markdown强制打开"](富文本Markdown强制打开/journal.md) | 把「只能在代码模式下编辑」从硬拦截改为可由用户显式承担的选择，并在强制期间持续提示改写风险 | done | [富文本Markdown强制打开](富文本Markdown强制打开/requirements/富文本Markdown强制打开.md) | - | [富文本Markdown强制打开功能测试](富文本Markdown强制打开/tests/cases/富文本Markdown强制打开功能测试.md) | 2026-09-16 |
| ["远程Tab发布血缘修复"](远程Tab发布血缘修复/journal.md) | headless 内容修改不再伪造发布者换代，远程 Tab 同步与终端连接不被误退役打断 | testing | [requirement](远程Tab发布血缘修复/requirements/requirement.md) | [overview](远程Tab发布血缘修复/solutions/overview.md) | [远程Tab发布血缘修复测试](远程Tab发布血缘修复/tests/cases/远程Tab发布血缘修复测试.md) | 2026-09-23 |

状态是需求整体状态（clarifying / designing / implementing / testing / done / blocked）；各文档自己的状态以 Journal 的关键文档链接表为准。文档 ready、代码存在、单测通过和真实产品验收是不同状态；各自 Test Run 只证明记录的执行范围。

此处仅整理本地需求，不收拢上游 docs/site、通用架构等文档。跨需求的迁移、恢复及文档校验证据放在 [维护记录](../maintenance/本地需求文档整理/2026-09-05-文档归并记录.md)，不另立为产品需求。
