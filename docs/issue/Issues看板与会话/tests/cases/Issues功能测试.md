---
title: 'Issues 功能测试'
document_type: test-case-list
status: needs-update
created: 2026-08-26
updated: 2026-09-08
issue: Issues看板与会话
---

# Issues 功能测试

> 2026-09-08评审后：命名/过滤映射待同步（needs-update），非命名与历史基线保持。TC-060、TC-201～211、TC-214～223不能按旧排序/存储约束新实现；[原命名验收](Provider优先命名验收.md)也已标记needs-update，公共人工名工程撤出，身份/过滤前置，当前边界见[方案§6.2](../../solutions/Provider优先的会话命名统一方案.md#62-验收矩阵)。TC-200人工名保护及TC-212/213历史v4迁移仍需回归。本轮只标记影响，不改下表断言或执行测试。

> 本文是可重复执行的测试规格。2026-09-05 按当前源码及暂存标题改动重整；保留原 TC-001～TC-190 编号并增加专项用例，不包含任何本轮执行结果。status=ready 只表示规格整理完成。

> 当前代码与目标存在差异的用例仍保留：TC-014/165 的独立 error 流程、TC-026 的纯 runtime waiting、TC-086 的成功 Forget 重放，以及新增后续容量目标，不得因为源码缺少实现而记作已验证或删掉有效断言。

> paired runtime 的路由合同与远端服务可用性分开：当前生产 bootstrap 调用只核实到 Electron main/serve，未发现 Node-only orcad 装配。TC-166/182/222 中真实 Node 宿主部分为待实现/待验证目标；模拟 transport 或直接创建 bootstrap 夹具只能证明合同。

## 1. 范围与关联需求

- 功能范围：Issue、Conversation、Round、Runtime Attachment、Session History、authority、Profile、RPC、UI 与发布边界。
- 关联需求：[REQ-001～REQ-029](../../requirements/Issues看板与会话.md)。技术合同见[技术说明](../../solutions/Issues看板与会话技术说明.md)。
- 不在本文件覆盖的范围：延后能力的功能正确性；仅验证它们没有入口、注册、表、RPC 或后台任务。
- 断言原则：成功用例检查最终状态；失败用例同时检查错误码和零副作用；DB 用例读取真实 PRAGMA、表、revision、receipt 与 `user_version`。

## 2. 参数化测试数据

### 2.1 Authority 与 Workspace

| 数据 ID          | Route           | Authority selector / partition | Workspace                      | 用途                 |
| ---------------- | --------------- | ------------------------------ | ------------------------------ | -------------------- |
| H-LOCAL-WT       | `local`         | `local`                        | 本地 Git worktree `WT-A`       | 本地主流程           |
| H-LOCAL-FOLDER   | `local`         | `local`                        | 本地 folder workspace `F-A`    | Folder/no-Git        |
| H-SSH-WT         | `ssh:ssh-a`     | `ssh:ssh-a`                    | direct SSH worktree `WT-S`     | SSH authority        |
| H-SSH-FOLDER     | `ssh:ssh-a`     | `ssh:ssh-a`                    | SSH folder workspace `F-S`     | SSH Folder           |
| H-RUNTIME-WT     | `runtime:env-a` | 远端 `local`                   | paired runtime worktree `WT-R` | route/authority 映射 |
| H-RUNTIME-FOLDER | `runtime:env-a` | 远端 `local`                   | paired runtime folder `F-R`    | 远端 Folder          |
| H-NOGIT          | `local`         | `local`                        | 无 Git 仓库的 folder `F-NG`    | 不依赖 repoId        |

### 2.2 Provider

| 数据 ID  | Provider          | 强身份                             | 特殊边界                                                                  |
| -------- | ----------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| P-CODEX  | Codex             | UUID session + provider turn       | `turn_id/turnId`、transcript reconciliation                               |
| P-CLAUDE | Claude            | session ID + transcript            | prompt/approval/waiting                                                   |
| P-PI     | Pi                | session ID +规范化 transcript path | 路径 owner/SSH 规范化                                                     |
| P-PRIME  | Prime Agent       | session ID +规范化 transcript path | 同 Pi 的文件身份约束                                                      |
| P-SCRAPE | scrape-only agent | 无可靠 resume identity             | terminal 原样可用；不伪造可见持久 Conversation；legacy 无身份记录单独验证 |

### 2.3 Readiness 与连接状态

| 数据 ID                 | Capability | Storage          | Hook evidence | Transport            | 预期页面状态                                             |
| ----------------------- | ---------- | ---------------- | ------------- | -------------------- | -------------------------------------------------------- |
| S-READY                 | 有         | ready            | ready         | online               | ready                                                    |
| S-DEGRADED-DISABLED     | 有         | ready            | disabled      | online               | degraded                                                 |
| S-DEGRADED-FAILED       | 有         | ready            | failed        | online               | degraded                                                 |
| S-UNAVAILABLE-OPEN      | 有         | failed/open      | 任意          | online               | unavailable                                              |
| S-UNAVAILABLE-MIGRATION | 有         | failed/migration | 任意          | online               | unavailable                                              |
| S-UNSUPPORTED           | 无         | 未查询           | 未查询        | online               | unsupported                                              |
| S-OFFLINE               | 有或未知   | 未知             | 未知          | offline              | offline                                                  |
| S-ERROR                 | 有         | 未知             | 未知          | online request error | 目标为 error；当前 SyncGate 统一归 offline，属于待实现项 |

### 2.4 并发与边界

| 数据 ID          | 内容                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| C-REPLAY         | 同 caller、mutationId、method 与 payload 重放两次                                                  |
| C-CONFLICT       | 同 mutationId 改 method 或 payload                                                                 |
| C-STALE-RECORD   | 客户端持有旧 `recordRevision`                                                                      |
| C-STALE-TREE     | 客户端持有旧 `treeRevision`                                                                        |
| C-STALE-SNAPSHOT | 客户端持有旧 facts/tree/runtime snapshot                                                           |
| B-TEXT           | 标题 UTF-8 1/512/513 bytes、type 128/129 字符、note UTF-8 32768/32769 bytes、中文/emoji 多字节预览 |

## 3. P0 / P1 / P2 分级

### 3.1 分级标准

| 等级 | 判定标准                                                                | 失败影响                                       | 默认执行时机                                            |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| P0   | 核心用户主链路、数据安全/隔离、不可变约束、零副作用、秘密保护或发布半态 | 阻断合并或发布；必须修复后重跑                 | 相关 PR 必跑受影响 P0；合并 main、打包和发布前跑全部 P0 |
| P1   | 核心功能完整回归、并发/幂等、失败恢复、分页、SSH/runtime 与宿主生命周期 | 阻断受影响功能交付；发布前应全部通过           | 修改对应模块时必跑；发布候选跑 P0+P1                    |
| P2   | 低频 provider、细粒度长度/展示边界、观察性和补充兼容性                  | 记录并评估影响；不影响无关核心链路时可后续修复 | 夜间、专项、兼容性或相关模块变更时运行                  |

分级只表示执行优先级，不改变需求是否属于核心首版；P2 仍然是有效回归用例，不等于延后功能。

### 3.2 分级数量与索引

当前共 230 条规格，P0=76，P1=117，P2=37。原 TC-001～TC-190 保留原优先级分布 59/101/30；新增 TC-191～TC-230 覆盖行复用、恢复、标题、迁移与后续目标。

后续目标测试的优先级不代表当前实现已完成。执行时同时记录是否属于“当前有效实现回归”或“待实现目标验收”。

### 3.3 推荐执行集

| 执行集   | 范围                                                                                                                                                         | 使用场景                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 核心冒烟 | TC-001、015、029、043、045、049、055、062、068、079、084、087、097、117、119、123、130、137、158、166、191、193、195～197、201～204、212、215～216、221、230 | 日常主链；真实App只选其中用户旅程                    |
| 全量P0   | 76 条                                                                                                                                                        | 主链与隔离/兼容门禁                                  |
| P0+P1    | 193 条                                                                                                                                                       | 核心回归、schema/host/标题改动                       |
| 全量规格 | 230 条                                                                                                                                                       | 大改动覆盖；后续目标项单列，不用自动跳过冒充全量完成 |

## 4. 测试功能清单

| 功能 ID | 关联需求                    | 功能点                                       | 分级分布               | 预期表现                                          | Test Case      |
| ------- | --------------------------- | -------------------------------------------- | ---------------------- | ------------------------------------------------- | -------------- |
| F-01    | REQ-001、004、019           | Sidebar、筛选、搜索、详情与多树              | P0: 4 / P1: 8 / P2: 2  | 单一事实、状态清晰、无重复                        | TC-001～TC-014 |
| F-02    | REQ-002、003、004、016      | Issue CRUD、层级、生命周期与删除             | P0: 9 / P1: 14 / P2: 5 | 原子校验、无级联误删                              | TC-015～TC-042 |
| F-03    | REQ-001、005、006、008、019 | Conversation 启动、物化、绑定与原行复用      | P0: 9 / P1: 12 / P2: 1 | 稳定 ID、可信证据、同一实体                       | TC-043～TC-064 |
| F-04    | REQ-007、009、016           | Claim、秘密、Retry 与 Forget                 | P0: 6 / P1: 15 / P2: 1 | 同 ID 重试、二阶段删除、零泄漏                    | TC-065～TC-086 |
| F-05    | REQ-010、011、015           | Attachment、Session History、Resume/Continue | P0: 4 / P1: 8 / P2: 5  | detach 不删、原 Workspace 复用、跨 Workspace 新建 | TC-087～TC-103 |
| F-06    | REQ-004、012、013           | Round、attention、dedupe 与自动重开          | P0: 8 / P1: 11 / P2: 7 | read/resolve 分离、同 fact 合并                   | TC-104～TC-129 |
| F-07    | REQ-014、016、017           | SQLite、迁移、receipt、revision 与分页       | P0: 8 / P1: 10 / P2: 3 | 事务、隔离、固定快照                              | TC-130～TC-150 |
| F-08    | REQ-015、017、018、019      | Authority、SSH、readiness、混合版本          | P0: 6 / P1: 14 / P2: 4 | 单跳路由、独立树、明确降级                        | TC-151～TC-174 |
| F-09    | REQ-020、021                | Project transfer、隐私、延后项与真实 App     | P0: 5 / P1: 9 / P2: 2  | 原 transfer 不受侵入、无半态、分层验收            | TC-175～TC-190 |
| F-10    | REQ-022～029                | 原行复用、精确恢复、标题来源、v4与后续边界   | 逐用例标注             | 事实/显示/运行身份分离                            | TC-191～TC-230 |

## 5. Test Cases

### 5.1 Sidebar、筛选、搜索与详情

| TC                            | 关联需求                  | 优先级 / 类型 | 前置条件与测试数据                                                             | 操作步骤                                         | 预期结果                                                                                                                               |
| ----------------------------- | ------------------------- | ------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| TC-001 根模式常驻             | REQ-019                   | P0 / 功能     | S-READY；存在 Workspace 与 Issue                                               | 启动 App；观察 Sidebar 顶部                      | `Workspaces / Issues` 常驻；Issues 不是 Workspace 分组枚举；无重复入口                                                                 |
| TC-002 根模式切换不抢主内容   | REQ-019                   | P1 / 回归     | 中心区域打开 terminal；Sidebar 在 Workspaces                                   | 切到 Issues，再切回 Workspaces                   | 中心 terminal 保持 mounted/当前内容不变；只改变 Sidebar 组织                                                                           |
| TC-003 `＋` 随模式变化        | REQ-002、REQ-019          | P1 / 功能     | S-READY                                                                        | 在 Workspaces 点 `＋`；取消；切 Issues 再点 `＋` | 前者进入 Workspace 创建；后者进入本地/外部 Issue 创建；不串用弹窗                                                                      |
| TC-004 模式空间记忆           | REQ-019                   | P2 / 状态     | 两种模式均有可滚动列表和折叠节点                                               | 分别设置滚动、折叠、选中；往返切换两次           | 两种模式分别恢复自己的滚动、折叠、选中，不复制 server facts                                                                            |
| TC-005 全部筛选               | REQ-004                   | P0 / 功能     | 活动根/子 Issue；已归档父、活动子                                              | 选择“全部”                                       | 所有活动 Issue 可见；活动子保留 dimmed 已归档祖先；同级顺序不变                                                                        |
| TC-006 需要我筛选             | REQ-004、REQ-012          | P0 / 功能     | 子 Issue 有 own attention；父只有 descendant attention                         | 选择“需要我”                                     | 子 Issue 命中；父仅作为 context-only 祖先；同一义务不重复计数                                                                          |
| TC-007 已归档筛选             | REQ-003、REQ-004          | P1 / 功能     | 已归档父、活动子和独立已归档 Issue                                             | 选择“已归档”                                     | 已归档项可见并保留层级上下文；活动子仅作关系提示，不混为归档结果                                                                       |
| TC-008 搜索 Issue 标题        | REQ-004                   | P1 / 功能     | 当前页含大小写不同、相似标题                                                   | 输入完整词、部分词、空格与清空                   | 只筛当前已加载标题；清空恢复原顺序；不创建第二份实体                                                                                   |
| TC-009 搜索外部编号           | REQ-002、REQ-004          | P1 / 功能     | 外部 Issue 编号 `#4242`                                                        | 搜索 `4242` 与 `#4242`                           | 对应 Issue 命中；URL/Provider 不被改写                                                                                                 |
| TC-010 搜索 Conversation 标题 | REQ-001、REQ-004          | P1 / 功能     | Issue 下 direct Conversation 标题唯一                                          | 搜索 Conversation 标题                           | 展示包含该 direct Conversation 的必要 Issue 路径；Conversation ID 不变                                                                 |
| TC-011 搜索不越界             | REQ-004、REQ-021          | P2 / 负向     | Round 正文、Workspace 路径、transcript 含唯一关键词                            | 搜索唯一关键词                                   | 不命中；无全文/FTS/跨 authority 请求；无 Round 正文读取入口                                                                            |
| TC-012 未归属虚拟区           | REQ-001、REQ-004、REQ-019 | P1 / 功能     | 两个有 identity 的未归属 Conversation，分属 WT-A/F-A                           | 展开未归属                                       | 平铺按现有会话排序，行带 Workspace 名；虚拟区无 issueId、不可归档/reparent、不计入 Issue 数；不新增 Workspace 分组层                   |
| TC-013 多主机数据与行标签     | REQ-015、REQ-019          | P1 / 兼容性   | local/SSH/runtime 均有数据，并另设空 host                                      | 选择全部主机，再筛单 host                        | route/authority 数据独立；多个有内容主机以行内 host 标签区分，空 host 不占列表段落；不要求旧版 header/region；无跨 host parent/binding |
| TC-014 页面状态区分           | REQ-018、REQ-019          | P0 / 状态     | 依次注入 loading、empty、S-UNSUPPORTED、S-UNAVAILABLE-OPEN、S-OFFLINE、S-ERROR | 打开对应 route 并观察操作                        | loading/unknown 不显示 0；empty 仅 ready 后显示；各错误文案与可用按钮不同；禁止状态下无 mutation                                       |

### 5.2 Issue CRUD、层级、生命周期与删除

| TC                                          | 关联需求         | 优先级 / 类型 | 前置条件与测试数据                                                     | 操作步骤                                                       | 预期结果                                                                                        |
| ------------------------------------------- | ---------------- | ------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| TC-015 创建本地 Issue                       | REQ-002          | P0 / 功能     | H-LOCAL-WT；无同名限制                                                 | 输入标题、可选 type/note，提交                                 | 创建一条 local Issue；分配稳定 ID/本地编号；state=active、revision=0                            |
| TC-016 空标题拒绝                           | REQ-002          | P1 / 边界     | 创建弹窗                                                               | 提交空串、纯空格、换行                                         | UI 禁止或 RPC typed validation 拒绝；Issue/receipt/revision 均不变                              |
| TC-017 标题长度边界                         | REQ-002          | P2 / 边界     | B-TEXT；ASCII、中文、emoji                                             | 创建/编辑 UTF-8 1、512、513 bytes 标题，并单独测 wire 字符边界 | 合法字节范围原样读回；超出 repository 512-byte 上限拒绝且零写入；不能把 512 个中文字符视为合法  |
| TC-018 类型长度边界                         | REQ-002          | P2 / 边界     | B-TEXT                                                                 | 写入 null、空值、128、129 字符 typeLabel                       | 合法值按 schema 保存；129 拒绝；不影响标题/note/revision                                        |
| TC-019 备注长度边界                         | REQ-002          | P2 / 边界     | B-TEXT；ASCII/多字节 note                                              | 写 null、32768、32769 UTF-8 bytes，并测 wire 长度边界          | null/合法字节边界读回；超界拒绝；失败不覆盖旧备注；字符和字节限制分开断言                       |
| TC-020 创建外部引用                         | REQ-002          | P0 / 参数化   | provider=github/gitlab/linear/jira/other                               | 输入 provider、编号、HTTPS URL、标题快照并提交                 | 每种 provider 创建 Orca IssueRecord；外链可点击；字段原样读回                                   |
| TC-021 外部字段缺失                         | REQ-002          | P1 / 异常     | 外部创建入口                                                           | 分别缺 provider/identifier/URL/title，或给非法 URL             | 提交拒绝；无半条 external record、receipt 或编号消耗                                            |
| TC-022 外部引用不自动同步                   | REQ-002、REQ-021 | P2 / 回归     | 创建外部 Issue 后修改模拟 provider 数据                                | 触发刷新/重启/轮询                                             | 标题快照、状态、父子不自动变化；无 provider client 调用或反向写                                 |
| TC-023 编辑成功与 revision                  | REQ-002、REQ-016 | P1 / 功能     | Issue revision=N                                                       | 修改标题/type/note，携带 N                                     | 更新成功；revision=N+1；factsRevision 仅推进一次；其他 Issue revision 不变                      |
| TC-024 stale Issue 编辑                     | REQ-016          | P0 / 并发     | 两客户端持有同一 revision=N                                            | A 保存；B 用 N 保存不同内容                                    | B 返回 `issue_record_revision_stale` 与当前 record；A 内容保留；B receipt 不落 completed 副作用 |
| TC-025 正常归档                             | REQ-003、REQ-012 | P1 / 功能     | active Issue 无 unresolved waiting                                     | 点击归档并确认                                                 | state=archived、archivedAt 写入、revision+1；Conversation/Workspace/Round 保留                  |
| TC-026 waiting 阻止归档                     | REQ-003、REQ-012 | P0 / 异常     | direct Conversation 有 unresolved waiting 或当前 waiting/blocked       | 点击归档                                                       | 明确阻止并给处理入口；Issue/Round/revision 不变                                                 |
| TC-027 running 不阻止归档                   | REQ-003          | P2 / 功能     | direct Conversation running 且无 unresolved waiting                    | 归档 Issue                                                     | 归档成功；agent 不被停止；Attachment 保留；后续新 Round 按重开规则处理                          |
| TC-028 显式重开                             | REQ-003          | P1 / 功能     | 已归档 Issue                                                           | 点击重开                                                       | state=active、archivedAt 清除、revision+1；子 Issue 状态不变                                    |
| TC-029 创建三级层级                         | REQ-003          | P0 / 功能     | 同 authority/partition/host                                            | 创建 root→child→grandchild                                     | 三层成功；parentId/顺序正确；treeRevision 按 mutation 推进                                      |
| TC-030 第四级拒绝                           | REQ-003          | P0 / 边界     | 已有 grandchild                                                        | 在 grandchild 下创建/移动子节点                                | UI 禁用并解释三级限制；RPC 拒绝；树、receipt、revisions 不变                                    |
| TC-031 self parent 拒绝                     | REQ-003          | P1 / 异常     | 任意 Issue                                                             | 将自己设为 parent                                              | 返回明确 self/cycle 错误；parentId/顺序/treeRevision 不变                                       |
| TC-032 cycle 拒绝                           | REQ-003          | P0 / 异常     | root→child→grandchild                                                  | 将 root 移到 child/grandchild 下                               | 整个 mutation 原子拒绝；没有临时环或局部重排                                                    |
| TC-033 子树超深拒绝                         | REQ-003          | P1 / 边界     | 待移动节点自身有子树                                                   | 移到使最深后代成为第四级的目标                                 | 按整棵子树校验拒绝；所有 parent/order/revision 不变                                             |
| TC-034 同级重排                             | REQ-003、REQ-016 | P1 / 功能     | 同 parent 下 A/B/C                                                     | 将 C 移到 index 0                                              | 最终顺序 C/A/B；受影响节点 revision 各+1且仅一次；facts/tree 各推进一次                         |
| TC-035 stale treeRevision                   | REQ-003、REQ-016 | P1 / 并发     | 客户端持有 C-STALE-TREE                                                | 另一客户端先 reparent；旧客户端再提交                          | 返回 `issue_tree_revision_stale`；无节点移动、receipt 或 revision 漂移                          |
| TC-036 跨主机 parent 拒绝                   | REQ-003、REQ-015 | P0 / 安全     | local Issue 与 SSH/runtime Issue                                       | local 子尝试挂到另一 authority/partition/host                  | UI 不提供目标；伪造 RPC 仍拒绝且不泄漏跨树细节；两边树不变                                      |
| TC-037 父子归档独立                         | REQ-003、REQ-004 | P1 / 功能     | parent/child 均 active                                                 | 仅归档 parent，再仅归档 child                                  | 第一次 child 仍在“全部”且父 dimmed；第二次各自进入归档；无级联                                  |
| TC-038 删除无依赖叶子                       | REQ-003          | P1 / 功能     | leaf 无 children/direct Conversations                                  | prepare-delete 后提交                                          | 只删除该 Issue；同级顺序归一；其他 Issue/Conversation/Round 保留                                |
| TC-039 删除父并 promote children            | REQ-003          | P1 / 功能     | parent 有 children，无 direct Conversations                            | prepare 选择提升到上一层；提交                                 | children 进入上一层并保持相对顺序；父删除；无级联                                               |
| TC-040 删除父并 reparent/detach children    | REQ-003          | P1 / 参数化   | parent 有多个 children；存在合法新 parent                              | 分别选择改挂新 parent、解除为 root                             | 每种计划按一次事务完成；目标深度/host 校验生效；失败无部分移动                                  |
| TC-041 删除含 direct Conversations 的 Issue | REQ-003、REQ-008 | P0 / 功能     | Issue 有未运行 direct Conversations                                    | prepare 分别选择解绑、移到同主机 Issue                         | 计划明确列出 Conversations；提交后 ID/Workspace/history 不变，仅 issueId 按计划变化             |
| TC-042 stale/incomplete 删除计划            | REQ-003、REQ-016 | P1 / 并发     | 已生成 closure plan；随后新增 child、改绑 Conversation 或推进 snapshot | 用旧 snapshot 提交删除                                         | 返回 stale/invalid plan；Issue、children、Conversations、顺序、receipt 与 revisions 全不变      |

### 5.3 Conversation 启动、物化、绑定与原生行复用

| TC                                          | 关联需求                  | 优先级 / 类型 | 前置条件与测试数据                                                                           | 操作步骤                                       | 预期结果                                                                                                                                                                      |
| ------------------------------------------- | ------------------------- | ------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-043 Issue 内 worktree 启动               | REQ-005                   | P0 / 功能     | S-READY；active Issue 与 H-LOCAL-WT 同 authority                                             | 在 Issue 详情选择 WT-A 和 agent 启动           | 先创建稳定 Conversation/hashed claim，再调用现有 launcher；可信 hook 后创建 identity/Attachment；自动绑定当前 Issue                                                           |
| TC-044 Issue 内 folder 启动                 | REQ-005、REQ-015          | P1 / 参数化   | S-READY；H-LOCAL-FOLDER/H-NOGIT                                                              | 从 Issue 选择 folder 启动                      | 无 repoId 依赖；workspaceRef.type=folder；其余预分配/附着语义同 worktree                                                                                                      |
| TC-045 prepare 校验失败零副作用             | REQ-005、REQ-015          | P0 / 异常     | Issue 与 Workspace authority/partition/host 不匹配                                           | 发起 Issue 启动                                | 返回 typed host/route 错误；Conversation/claim/receipt/factsRevision 不变；launcher 调用为 0；不降级为未归属启动                                                              |
| TC-046 prepare mutation replay              | REQ-005、REQ-016          | P1 / 幂等     | C-REPLAY；同 token/mutation/payload                                                          | 连续调用两次 prepareLaunch                     | 返回同一 Conversation/claim/result；只存在一条 Conversation、claim、completed receipt；revision 只推进一次                                                                    |
| TC-047 launcher 失败不展示假启动记录        | REQ-005、REQ-009、REQ-024 | P0 / 异常     | prepare 成功，原 launcher 同步返回失败；无 identity                                          | 启动并观察错误、DB 和 Issues DOM               | 错误可见；预分配保留且无 identity/Round/Attachment；普通 UI 不调用 recordLaunchFailure/prepareRetry，不显示 Starting/Retry，不计 direct/running；后端失败结算另由 TC-071 验证 |
| TC-048 无 hook 的预分配隐藏                 | REQ-005、REQ-024          | P1 / 降级     | prepare 成功但 hook 永不到，claim 超时                                                       | 刷新列表和计数、读取事实                       | DB 预分配仍在，Issues Sidebar/详情与 direct/running 计数排除；无伪造 identity/Round/closed，不要求自动清理                                                                    |
| TC-049 普通 worktree 可信物化               | REQ-006、REQ-022          | P0 / 功能     | S-READY；H-LOCAL-WT                                                                          | 普通入口启动 Codex，分别观察首个可信 hook 前后 | hook 前无新持久事实；hook 后有 issueId=null Conversation/identity/Attachment；Workspace 是原生运行行，Issues 是相同 identity 原行复用，不要求相同 DOM data-conversation-id    |
| TC-050 普通 folder/no-Git 可信物化          | REQ-006、REQ-015、REQ-019 | P1 / 参数化   | H-LOCAL-FOLDER/H-NOGIT                                                                       | folder 启动并发可信 hook                       | folder workspaceRef 正确，零 repo/Git 假设；未归属行保留正确 Workspace 标签，不要求 Workspace 分组层                                                                          |
| TC-051 普通启动无可信 hook                  | REQ-006                   | P0 / 负向     | S-READY 或 degraded；创建普通 terminal/agent 但不发可信 evidence                             | 比较启动前后 DB 和两侧 DOM                     | terminal 可用、tab 增加；Conversation/identity/Round/Sidebar 持久行均不增加                                                                                                   |
| TC-052 shell 手工启动可信纳管               | REQ-006、REQ-007          | P2 / 功能     | 普通 shell 内手工启动 provider；可解析 Workspace/authority/强 identity                       | 产生首个 live hook                             | 首次创建未归属 Conversation；若缺强 identity/session boundary 则仅诊断、不物化                                                                                                |
| TC-053 hook replay 幂等                     | REQ-006、REQ-007          | P1 / 幂等     | 同一 live hook 重放，或 provider identity 更新重复到达                                       | 连续 ingest 同 observation/dedupe              | Conversation/identity/Attachment 各一份；factsRevision 不因无变化 replay 重复推进                                                                                             |
| TC-054 未找到或过期 claim 的可信降级        | REQ-006、REQ-007、REQ-024 | P1 / 边界     | 当前 authority/Workspace/强 identity 完整，token 分别 not-found、expired、invalid、ambiguous | ingest                                         | not-found/expired 按普通可信启动创建或复用未归属；过期 token 不附着旧 Issue；invalid/ambiguous 仍忽略，不使用普通降级                                                         |
| TC-055 未归属绑定 Issue                     | REQ-008                   | P0 / 功能     | C-UNASSIGNED 与同主机 active Issue；revision=N                                               | 执行 bindIssue                                 | issueId 更新、revision=N+1、factsRevision+1；Conversation ID/Workspace/history/identity 不变；Issues 分组移动                                                                 |
| TC-056 Issue 间改绑                         | REQ-008                   | P1 / 功能     | Conversation 已绑定 Issue A；同主机 Issue B                                                  | 执行 rebind 到 B                               | 单次原子更新；A 不再直接列出、B 列出；Workspaces 行位置和 ID 不变；Round 全部随 Conversation 展示                                                                             |
| TC-057 显式解绑                             | REQ-008                   | P1 / 功能     | Conversation 已绑定 Issue                                                                    | issueId=null mutation                          | 进入未归属虚拟区；Workspace/历史不变；原 Issue attention 重新派生                                                                                                             |
| TC-058 stale bind/rebind                    | REQ-008、REQ-016          | P0 / 并发     | C-STALE-RECORD；原 issueId=A                                                                 | 使用旧 revision 绑定/改绑/解绑                 | 返回 `conversation_record_revision_stale` 与当前 record；原 issueId、receipt、facts/record revision 不变                                                                      |
| TC-059 跨主机 binding                       | REQ-008、REQ-015          | P0 / 安全     | local Conversation 与 SSH/runtime Issue                                                      | UI 与伪造 RPC 分别尝试绑定                     | UI 不展示目标；RPC 拒绝；不泄漏另一 authority 记录；原 issueId 和所有 revisions 不变                                                                                          |
| TC-060 Conversation 人工改名                | REQ-008、REQ-025、REQ-026 | P1 / 功能     | 同一 identity 在 Issues/Workspace/Tab/History 可见，未设置 tab customTitle 等例外            | Rename 后观察四处                              | DB 人工 title/source 更新，provider snapshot 保留；四处按各自候选显示人工名；ID/运行 overlay 不变，等待实际同步完成后断言                                                     |
| TC-061 stale Conversation 改名              | REQ-008、REQ-016          | P1 / 并发     | 两客户端持有 revision=N                                                                      | A 改名；B 用 N 改另一标题                      | B 收到 stale 与当前 record；A 标题保留；两侧不出现分叉标题                                                                                                                    |
| TC-062 原生行与持久历史职责                 | REQ-001、REQ-019、REQ-022 | P0 / 回归     | attached、detached、未归属和无 identity 预分配                                               | 打开 Workspaces、Issues、详情                  | 可匹配运行行复用原组件，主体点击到同一 pane；关闭历史仅 Issues 持久保留；无假 pane/tab、无 Workspaces 持久 overlay；无 identity 记录隐藏                                      |
| TC-063 split pane 独立映射                  | REQ-001、REQ-010          | P1 / 功能     | 一个 tab 内两个 agent pane，identity 不同                                                    | 两个 pane 依次发 hook/stop                     | 创建或命中两个不同 Conversation；各自 Attachment/Round/点击目标独立；关闭一个不影响另一个                                                                                     |
| TC-064 filter/stale 不删除 canonical entity | REQ-001、REQ-017          | P1 / 回归     | Conversation 同时由 authority/issue scope 引用                                               | 切 filter并制造 stale 重拉                     | view 只更新 IDs，共用 conversationsById；仍被有效 scope 引用的事实保留；完整 authority 快照可裁剪已删除记录，不产生历史双投影                                                 |

### 5.4 Claim、秘密、Retry 与 Forget

| TC                                   | 关联需求                  | 优先级 / 类型 | 前置条件与测试数据                                                                           | 操作步骤                                  | 预期结果                                                                                                                                               |
| ------------------------------------ | ------------------------- | ------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-065 claim 只存 fingerprint        | REQ-007                   | P0 / 安全     | 生成 32～256 字符高熵 token                                                                  | prepare 后读真实 claim 表                 | 仅有 SHA-256 fingerprint；DB/receipt result/response 不含明文；hash 可匹配但不可逆                                                                     |
| TC-066 明文 token 泄漏检查           | REQ-007、REQ-021          | P0 / 安全     | prepareLaunch/后端 Retry 使用唯一合法哨兵 token                                              | 检查响应、DB、receipt和日志               | 不持久化或回显明文 token；仅调用请求与 launcher 临时参数可持有；Resume 不再要求新增 Issue prepareResume token                                          |
| TC-067 已消费 token 后续 session     | REQ-007                   | P0 / 异常     | claim 已 attached/消费；同 shell 新 provider session 继承 token                              | ingest 后续 session hook                  | 不附着旧 Conversation；按新 identity 正常新建/命中其他 Conversation，或明确忽略                                                                        |
| TC-068 过期 claim 的身份不丢失       | REQ-007、REQ-009、REQ-024 | P1 / 边界     | 预分配 claim 已过期，无 identity                                                             | 用旧 token 发完整可信 Hook                | 原 claim 失去绑定权；真实 identity 进入新建/复用未归属 Conversation；旧预分配继续隐藏。另在未收到此 Hook 的独立 fixture 验证 backend retry 可复用旧 ID |
| TC-069 authority/pane 退休 token     | REQ-007                   | P1 / 恢复     | claim 所属 pane authority 已退休或 session boundary 已结束                                   | 携带旧 token 发送新 session hook          | 旧 claim 无绑定权；不串会话；记录明确 ignore/retired disposition                                                                                       |
| TC-070 ambiguous claim/identity      | REQ-007、REQ-011          | P1 / 异常     | 构造多个候选或无法唯一规范化 identity                                                        | attach/Resume                             | 返回 ambiguous/identity-invalid；不选择任意 Conversation；Attachment/receipt/revision 不变                                                             |
| TC-071 后端失败结算与同 ID Retry     | REQ-009                   | P0 / 后端     | 直接调 recordLaunchFailure 形成 C-FAILED，无 blocker                                         | 调 prepareRetry，再发有效 identity hook   | 原 conversationId、新 claim；failure 清理与 revision 正确；Hook 附着原记录；不以当前普通 UI 存在 Retry 为前提                                          |
| TC-072 claim 超时 Retry 同 ID        | REQ-009                   | P1 / 功能     | C-PREP claim expired，无 identity/Round/Attachment                                           | prepareRetry                              | 原 ID/Workspace/agent/issueId 保留；旧 claim settled，新 pending claim 唯一                                                                            |
| TC-073 identity 阻止 Retry           | REQ-009                   | P1 / 异常     | Conversation 已有 active Provider Identity                                                   | prepareRetry                              | 返回包含 identity blocker 的稳定错误；failure/claim/record/receipt 不变；launcher 不调用                                                               |
| TC-074 Round 阻止 Retry              | REQ-009                   | P1 / 异常     | Conversation 已有 Round，无 Attachment                                                       | prepareRetry                              | 返回 Round blocker；不删除 Round、不创建 claim、不清 failure                                                                                           |
| TC-075 Attachment 阻止 Retry         | REQ-009                   | P1 / 异常     | Conversation 当前 attached                                                                   | prepareRetry                              | 返回 attachment blocker；不启动第二 pane、不推进 revision                                                                                              |
| TC-076 active claim 阻止重复 Retry   | REQ-009                   | P1 / 并发     | 已有未过期 pending claim                                                                     | 重复 prepareRetry                         | 返回 pending-claim blocker；只保留一个 active claim；原 token/claim 生命周期不变                                                                       |
| TC-077 Retry mutation replay         | REQ-009、REQ-016          | P1 / 幂等     | C-REPLAY                                                                                     | 同 mutationId/payload 调两次 prepareRetry | 第二次回放相同结果；无第二 claim、revision 只+1；C-CONFLICT 则拒绝                                                                                     |
| TC-078 Forget 预检摘要               | REQ-009                   | P1 / 功能     | detached stopped Conversation，含 Issue、identity、3 Round、1 unresolved、transcript locator | 调 prepareDelete                          | 返回当前 recordRevision、绑定、各数量、transcript 可定位性、blockers、60 秒 preflight token；DB 不变                                                   |
| TC-079 attached Forget 拒绝          | REQ-009、REQ-010          | P0 / 安全     | C-ATT                                                                                        | prepareDelete/尝试 commit                 | blocker 包含 attached；delete 不可提交；Conversation、identity、Round、transcript、revisions 全保留                                                    |
| TC-080 running/waiting Forget 拒绝   | REQ-009、REQ-012          | P1 / 参数化   | 分别为 detached-running、detached-waiting 或 unresolved waiting                              | prepareDelete                             | 对每种状态给具体 blocker；不得通过“无 pane”误判可删                                                                                                    |
| TC-081 preflight token 过期/重启     | REQ-009                   | P1 / 恢复     | 获取 token 后等待 >60 秒，或重启 bootstrap                                                   | 提交 delete                               | 返回 preflight invalid；零删除；要求重新预检；token 不写 DB、不跨进程恢复                                                                              |
| TC-082 Attachment generation 变化    | REQ-009、REQ-010          | P1 / 并发     | 获取可删 preflight 后新 Attachment 到达/离开                                                 | 用旧 token commit                         | attachmentGeneration 校验失败；零删除；新状态可见；旧 token 作废                                                                                       |
| TC-083 stale recordRevision Forget   | REQ-009、REQ-016          | P1 / 并发     | preflight 后改名/改绑使 revision+1                                                           | 用旧 revision/token delete                | 返回 stale/preflight invalid；Conversation/全部 facts/receipt 保留                                                                                     |
| TC-084 Forget 成功且 transcript 保留 | REQ-009                   | P0 / 功能     | 所有 blocker 解除；provider transcript 文件存在                                              | 预检、确认、delete                        | Orca Conversation/claims/identities/Rounds/Issue binding 全删除；transcript/Workspace/Project 文件存在；两侧行消失                                     |
| TC-085 Forget 后 Resume 新纳管       | REQ-009、REQ-011          | P2 / 功能     | TC-084 后 Session History 仍找到原 provider session                                          | 显式 Resume                               | 创建新的 conversationId/identity；不复活已删除 ID；transcript 内容仍可继续                                                                             |
| TC-086 并发/重复 Forget              | REQ-009、REQ-016          | P1 / 并发     | 两客户端持有同一 preflight                                                                   | 同时提交，或同 mutationId 重放            | 只有一次删除副作用；同 mutation replay 返回保存结果；另一个 stale/not-found 不产生幽灵 receipt                                                         |

### 5.5 Runtime Attachment、Session History、Resume 与 Continue

| TC                                       | 关联需求                           | 优先级 / 类型 | 前置条件与测试数据                                                         | 操作步骤                                      | 预期结果                                                                                                                                           |
| ---------------------------------------- | ---------------------------------- | ------------- | -------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-087 关闭 pane 只 detach               | REQ-001、REQ-010、REQ-023          | P0 / 功能     | C-ATT 与原生 Workspace 行                                                  | 关闭 pane/tab并确认 Stop Agent                | tab 消失，Conversation/Issue/identity/Round 留存；attachment detached；Issues 留同 ID 可恢复历史；Workspaces 只沿用原生 live/retained 语义         |
| TC-088 split pane 局部 clear             | REQ-010                            | P2 / 功能     | 同 tab 两个 pane 分属两个 Conversation                                     | 清除 pane A                                   | 只删除 A Attachment；B 保持 attached；两条持久记录均保留                                                                                           |
| TC-089 transient connection clear        | REQ-010、REQ-015                   | P1 / SSH      | 同 pane key 在旧/新 SSH connection 各有 evidence                           | 对旧 connection 发 transient clear            | 只清旧 connection Attachment；新连接行和 Conversation 不受影响                                                                                     |
| TC-090 authority evidence 集合裁剪       | REQ-010                            | P2 / 恢复     | registry 有多个 pane；新可信 snapshot 缺少其中一个                         | 发布 status/provider/current-authority 变化   | 缺失 pane 被 detach；仍有任一可信 evidence 的 pane 不被误清；持久事实不变                                                                          |
| TC-091 重启恢复已有 Attachment           | REQ-010                            | P1 / 恢复     | DB 已有 identity；status+provider identity+hydrated/current authority 匹配 | 重启 App/bootstrap                            | 同一 conversationId 恢复 attached/navigation；不创建新 Conversation/identity/Round                                                                 |
| TC-092 hydrated replay 不物化空 Profile  | REQ-010、REQ-014                   | P1 / 安全     | 新 Profile 无 DB identity，但有旧 hydrated status/commitment               | 启动 bootstrap                                | Conversation 列表仍空；只保留诊断；profile 隔离不被 replay 穿透                                                                                    |
| TC-093 provider-session live 更新恢复    | REQ-010                            | P2 / 恢复     | DB 已有 identity，启动时 detached；随后 provider session evidence 到达     | 触发 provider subscription并 drain            | 同一 ID 变 attached；runtime revision 更新；持久 factsRevision 不因 overlay 变化推进                                                               |
| TC-094 Session History 扫描无副作用      | REQ-011                            | P1 / 负向     | 多个已纳管/未纳管 transcript                                               | 打开、刷新、搜索 Session History              | Conversation/identity/Round/revision/attention 数量不变；仅显示发现结果                                                                            |
| TC-095 未纳管历史首次 Resume             | REQ-006、REQ-011                   | P1 / 功能     | AI Vault 历史尚无 Conversation，原生目标合法                               | 原入口 Resume，分别观察可信 Hook 前后         | 扫描和启动前不预建 Issue 事实；首个有效 Hook 创建/复用 Conversation；只有可信证据才 attached，不新增 Issues 前置门禁                               |
| TC-096 原 identity 多次恢复              | REQ-011、REQ-023                   | P1 / 功能     | 已纳管会话原 Workspace 可用                                                | 关闭后经 Issue 恢复，再在有原 pane时点击      | providerSession 和 conversationId 稳定，已有 pane 路径 Jump 不新增持久行；不要求每次 Resume 新建 Issue claim，不扩大为跨 Promise 原生 tab 幂等承诺 |
| TC-097 原 Workspace Resume               | REQ-011、REQ-023                   | P0 / 功能     | detached Conversation 原属 WT-A                                            | Issue 一次 Resume并完成真实 Hook              | 使用原生 session resolver/finder/Resume，target 为 WT-A；原 ID/issueId/provider identity 保留；无 conversations.prepareResume 前置请求             |
| TC-098 Issue 恢复目标不可漂移            | REQ-011、REQ-023                   | P0 / 安全     | Issue Conversation 原属 WT-A；当前 UI 激活 WT-B/F-A/其他 host              | 逐一从 Issue点击 Resume                       | 仍指定 Conversation 原 Workspace/route，不用当前激活 Workspace 冒充；不可用则原链失败并保留记录；不再断言不存在的 resume_workspace_mismatch RPC    |
| TC-099 Continue in New Session           | REQ-011                            | P0 / 功能     | 既有 AI Vault session，选择另一合法 Workspace                              | 原生 Continue确认并启动                       | 新 provider session，新 Conversation 在可信 Hook 后物化；原记录保留；普通 Continue 不隐式继承 issueId                                              |
| TC-100 原 Workspace 删除或不可达         | REQ-010、REQ-011、REQ-023          | P1 / 恢复     | 保留 snapshot，真实目标删除/offline                                        | 从 Issue 打开/恢复                            | 原 snapshot/记录保留，原生 finder/target校验反馈失败；不切当前 Workspace 冒充成功；不因 query 默认 workspaceAvailability=available 宣称已探测      |
| TC-101 identity 歧义或 transcript 不可读 | REQ-007、REQ-011                   | P1 / 异常     | 多个 active identity 或 transcript 权限拒绝                                | Resume/attach                                 | 明确 ambiguous/unreadable；不按 prompt、标题或相似路径猜测合并；零写入                                                                             |
| TC-102 Pi/Prime Agent 路径规范化         | REQ-007、REQ-011、REQ-015          | P2 / 参数化   | P-PI/P-PRIME；local、SSH、runtime path 表达                                | 以同/不同规范化 transcript path attach/Resume | 同执行 owner 的规范路径唯一命中；路径不匹配或 remote 无 path access 时拒绝                                                                         |
| TC-103 缺强身份不伪造可恢复行            | REQ-001、REQ-006、REQ-011、REQ-024 | P2 / 兼容性   | scrape-only普通启动无可靠 provider identity；另设 legacy 无 identity 记录  | 启动、关闭、打开 Issues/History               | terminal 原样可用；无可信 identity 不纳管可见持久会话；legacy 无 identity 预分配隐藏，不展示假 Resume；History 仍遵循原生 provider 能力            |

### 5.6 Round、Attention、Dedupe 与自动重开

| TC                                           | 关联需求         | 优先级 / 类型 | 前置条件与测试数据                                               | 操作步骤                                            | 预期结果                                                                                                                                              |
| -------------------------------------------- | ---------------- | ------------- | ---------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-104 Completion hook 记录                  | REQ-012          | P0 / 功能     | attached Conversation；provider Stop 带输出                      | ingest Stop                                         | 新建 kind=completion Round；occurredAt/source 正确；输出为有界 `runtime-preview`；attention 增加                                                      |
| TC-105 Question waiting                      | REQ-012          | P1 / 功能     | provider 发 AskUserQuestion/interactive prompt                   | ingest waiting hook                                 | kind=waiting、waitingReason=question；pendingQuestion 为 runtime-preview；resolvedAt=null                                                             |
| TC-106 Approval waiting                      | REQ-012          | P1 / 功能     | provider 发 permission/approval 等待                             | ingest hook                                         | waitingReason=approval；Issue 进入需要我；readAt 与 resolvedAt 初始均 null                                                                            |
| TC-107 Blocked/other waiting                 | REQ-012          | P2 / 参数化   | 分别发 blocked 与无法细分的 waiting                              | ingest                                              | 映射为 blocked/other；不发明第二套状态；UI 文案可解释                                                                                                 |
| TC-108 UTF-8 预览边界                        | REQ-012          | P2 / 边界     | 超长中英文、emoji、多字节文本                                    | ingest 并读 DB/UI                                   | 按共享字节/字符上限安全截断，不破坏 UTF-8；completeness 仍为 runtime-preview                                                                          |
| TC-109 无文本预览                            | REQ-012          | P2 / 异常     | 稳定 Stop 无 prompt/output/question 文本                         | ingest                                              | Round 仍保存 kind/time/state；三个文本字段为 null + not-captured；义务不丢                                                                            |
| TC-110 reconciled-preview 补强               | REQ-012、REQ-013 | P1 / 功能     | 已有 runtime-preview；transcript 提供同 fact 更稳定片段          | reconciliation                                      | 更新同一 Round 为 reconciled-preview/更强内容；不保存全文、不创建第二条义务                                                                           |
| TC-111 hook + reconciliation 同 turn         | REQ-013          | P0 / 幂等     | P-CODEX 同 providerTurnId 先 hook 后 transcript completion       | 两路依次或并发到达                                  | 最终只有一条 Round；kind/ref/dedupe 一致；factsRevision 按一次有效事实变化推进                                                                        |
| TC-112 重复 hook delivery                    | REQ-013、REQ-016 | P1 / 幂等     | 同 pane/stateStartedAt/turn/preview 重放                         | ingest 多次                                         | Round 数不变；preview/refs/attention 不重复；receipt/revision 无无效推进                                                                              |
| TC-113 不同 turn 不按完成时间 supersede      | REQ-013、REQ-021 | P0 / 负向     | 连续两个 providerTurnId completion，未提供后续用户输入证据       | ingest 两个 turn                                    | 保留两条事实，不仅因第二次 completion 时间较晚就解决第一条；无 superseded 字段。另有可信后续 user input 时可按历史对账 new-input 解决，不与此用例冲突 |
| TC-114 显式 turn 的交错 transcript           | REQ-013          | P2 / 边界     | user/assistant 消息按 turn A/B 交错                              | 执行 transcript fact 提取                           | 按显式 turnId 各成一条稳定 fact；不按物理行邻接串错内容                                                                                               |
| TC-115 无 turnId 的弱事实                    | REQ-013          | P2 / 兼容性   | transcript 只有 user→assistant 边界                              | 提取并重复执行                                      | 生成稳定弱 dedupe fact；重复执行同结果；不伪造 providerTurnId                                                                                         |
| TC-116 无 assistant 输出的 transcript        | REQ-013          | P2 / 异常     | transcript 只有 user 消息或未完成 turn                           | reconciliation                                      | 不生成 completion Round；已有 waiting/attention 不被误解决                                                                                            |
| TC-117 Mark read                             | REQ-012          | P0 / 功能     | unresolved waiting/completion，readAt=null                       | 点击 Mark read                                      | authority 生成 readAt；resolvedAt/resolution 保持 null；需要我状态不因已读消失                                                                        |
| TC-118 Mark read 幂等                        | REQ-012、REQ-016 | P1 / 幂等     | C-REPLAY；authority 时间会变化                                   | 同 mutationId 重放 markRead                         | 返回同一 readAt/result；不产生 receipt conflict；revision/facts 不重复推进                                                                            |
| TC-119 显式 Resolve                          | REQ-012          | P0 / 功能     | unresolved Round                                                 | 点击“处理完成”                                      | 写 resolvedAt、resolution=explicit；readAt 保持原值；attention 与筛选立即刷新                                                                         |
| TC-120 已解决 Round 不被覆盖                 | REQ-012、REQ-016 | P1 / 并发     | Round 已 explicit resolved                                       | 再用 archive/resumed/new-input 或不同 mutation 处理 | 原 resolvedAt/resolution 不被静默覆盖；返回幂等或稳定冲突                                                                                             |
| TC-121 authoritative working 解决 waiting    | REQ-012          | P1 / 功能     | 同 provider identity 有较早 unresolved waiting                   | ingest 时间更晚的 authoritative working             | 只解决匹配 identity 的最新较早 waiting；resolution 按可验证语义写入；其他 identity 不变                                                               |
| TC-122 authoritative completion 解决 waiting | REQ-012          | P1 / 功能     | 同 identity waiting 后出现 completion                            | ingest completion                                   | waiting resolved；新 completion 作为独立未处理 Round；attention 从等待转为完成义务而非消失                                                            |
| TC-123 pane clear/断连不解决 waiting         | REQ-010、REQ-012 | P0 / 安全     | attached waiting                                                 | 关闭 pane、connection clear、模拟进程消失           | Attachment detach；waiting resolvedAt 仍 null；Issue 继续需要我                                                                                       |
| TC-124 新用户输入解决 completion             | REQ-012、REQ-013 | P1 / 功能     | 同 identity 多条 completion，其中最新一条可确认 predecessor      | ingest 带明确 user prompt 的 working                | 只解决可确认的最新 completion，resolution=new-input；不同 turn 的更早义务不按时间猜测全部清除                                                         |
| TC-125 Archive 解决 completion               | REQ-003、REQ-012 | P2 / 功能     | Issue 只有 completion 义务，无 waiting                           | 归档 Issue                                          | completion 写 resolution=archive；Issue 归档；waiting 场景仍由 TC-026 阻止                                                                            |
| TC-126 归档后新 Round 自动重开               | REQ-003、REQ-013 | P0 / 功能     | Issue archivedAt=T；新 Round occurredAt>T                        | ingest 新 completion/waiting                        | Round 写入与 Issue reopen 同事务；Issue revision+1；host factsRevision 只+1                                                                           |
| TC-127 延迟普通历史不重开                    | REQ-013          | P1 / 边界     | Issue archivedAt=T；延迟 completion occurredAt≤T                 | reconciliation/ingest                               | Round 可补入；Issue 仍 archived；不产生伪造 lifecycle event                                                                                           |
| TC-128 延迟但当前权威 waiting 重开           | REQ-013          | P0 / 边界     | waiting occurredAt≤T，但 current authority 仍指向同 waiting fact | ingest/reconcile                                    | Issue 必须重开并保持 unresolved waiting；不能因时间早而隐藏义务                                                                                       |
| TC-129 duplicate/reconcile 不重复重开        | REQ-013、REQ-016 | P1 / 幂等     | TC-126/128 已重开；同 fact 再到达                                | 重放 hook 与 reconciliation                         | 不再次推进 Issue/facts revision，不创建第二 Round，不改变 archivedAt 之外字段                                                                         |

### 5.7 SQLite、迁移、Receipt、Revision 与权限

| TC                                        | 关联需求         | 优先级 / 类型 | 前置条件与测试数据                                              | 操作步骤                                                       | 预期结果                                                                                                                              |
| ----------------------------------------- | ---------------- | ------------- | --------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| TC-130 开库四项 PRAGMA                    | REQ-014          | P0 / DB       | 新 profile DB                                                   | 打开 DB 并读回 PRAGMA                                          | journal_mode=WAL、synchronous=NORMAL、busy_timeout=5000、foreign_keys=1                                                               |
| TC-131 每连接 foreign_keys                | REQ-014          | P0 / DB       | 同 DB 建立主连接、查询/guard 等独立连接                         | 每个连接立即读 `PRAGMA foreign_keys`                           | 所有连接均为 1；FK 违规真实失败；不能只在首次连接设置                                                                                 |
| TC-132 POSIX 权限                         | REQ-014          | P1 / 安全     | macOS/Linux；完成写入、WAL 事务、关闭                           | stat profile issues 目录、db/-wal/-shm                         | 目录 0700；文件在打开、提交、关闭后均为 0600；无世界/组可读                                                                           |
| TC-133 v4 精确 schema                     | REQ-014、REQ-026 | P0 / DB       | 全新 user_version=0 DB                                          | migrate并查 sqlite_master/table_info                           | 最终 user_version=4；九张核心表与当前索引/trigger；title_source/provider_title存在；无 events/digest/FTS/execution-chain/supersession |
| TC-134 migration 成功与幂等               | REQ-014、REQ-026 | P1 / DB       | 独立 v0/v1/v2/v3 fixture                                        | 迁移到 v4再重开                                                | 全部步骤成功后 version=4；历史数据按分槽规则保留；重开 no-op；不同旧版本逐项检查，不把 v0 当可随意容纳旧表的数据布局                  |
| TC-135 migration 中途失败回滚             | REQ-014          | P0 / 故障注入 | 在 version bump 前注入异常                                      | 执行迁移并重新打开                                             | 整个事务 ROLLBACK；user_version 不变；旧表/数据可读；无半建表/索引                                                                    |
| TC-136 DB 打开/迁移失败不删库             | REQ-014、REQ-018 | P1 / 恢复     | 权限拒绝、路径为目录、损坏或注入 migration failure              | 启动 bootstrap                                                 | `issues.status=unavailable` 且 reason 准确；其他 Issue RPC typed unavailable；原文件未自动删除/重建                                   |
| TC-137 Profile A/B 隔离                   | REQ-014          | P0 / 安全     | Profile A/B 各自 DB                                             | A 创建 Issue/Conversation/Round；切 B；再切回 A                | B 查询为空且无法按 ID读取 A；A 数据完整；authority/profile label 与 active profile 对应                                               |
| TC-138 authority descriptor 空页          | REQ-014、REQ-015 | P2 / DB/RPC   | 空 profile/partition                                            | 请求 Issues/Conversations 第一页                               | 即使数组为空也返回 authorityId、partition、executionHost/profile label；客户端不靠首条记录猜                                          |
| TC-139 executionHostId 不可变             | REQ-014、REQ-015 | P0 / DB       | 已创建 local/SSH Issue 和 Conversation                          | 通过 repository/直接 SQL 尝试改 host                           | trigger/typed mutation 拒绝；hostPartitionKey、records、revisions 不变                                                                |
| TC-140 `runtime:*` 持久化拒绝             | REQ-015          | P0 / 安全     | 构造 runtime route alias                                        | 通过 Zod、RPC、repository、直接 SQL 分层尝试写 executionHostId | shared schema/RPC/DB 均拒绝；route 只作为客户端 cache/transport key                                                                   |
| TC-141 partition 关联约束                 | REQ-014、REQ-015 | P1 / DB       | Conversation 在 local，identity/claim 伪造 SSH partition        | 插入/更新 identity、claim、parent、binding                     | trigger/FK 拒绝；所属 Conversation/Issue 不变；FK 删除不被静默关闭                                                                    |
| TC-142 核心级联仅限 Orca facts            | REQ-009、REQ-014 | P1 / DB       | Conversation 含 claims/identities/Rounds/refs                   | 执行合法 Forget                                                | 子表按 FK 级联干净；Issue/Workspace/provider transcript 不删除；字节/计数一致                                                         |
| TC-143 mutation receipt replay            | REQ-016          | P0 / DB       | C-REPLAY，覆盖 create/update/reparent/bind/read/resolve/prepare | 每个方法同 key 重放                                            | completed result 原样返回；领域副作用只一次；receipt state/result/completedAt 有效                                                    |
| TC-144 receipt payload/method 冲突        | REQ-016          | P1 / 安全     | C-CONFLICT                                                      | 同 caller+mutationId 改 method 或任一 payload 字段             | 返回 `mutation_receipt_conflict`；原 receipt/result 和领域状态保持；不执行新副作用                                                    |
| TC-145 transaction 失败 receipt 回滚      | REQ-016          | P1 / DB       | 在领域写或结果保存中注入失败                                    | 执行 mutation                                                  | pending receipt 与全部领域写一起回滚；重试同 mutation 可重新正常执行一次                                                              |
| TC-146 recordRevision 局部性              | REQ-016          | P1 / 并发     | Issue A/B、Conversation C/D 与 Round                            | 编辑 A/C、给 D ingest Round                                    | 只对应实体 revision 变化；D Round 只推进 host facts；无关 Round 不让 A/C 编辑 stale                                                   |
| TC-147 tree/facts revision 语义           | REQ-003、REQ-016 | P1 / DB       | 记录初始 revisions                                              | 分别执行纯标题编辑、reparent、新 Round                         | mutation 均推进 facts；仅树变化推进 tree；record revisions 只按实际变更节点推进一次                                                   |
| TC-148 Runtime Attachment revision 独立   | REQ-010、REQ-017 | P1 / DB/查询  | attached Conversation；记录 facts/runtime revision              | detach/reattach，不改 DB                                       | persisted factsRevision 不变；runtimeRevision 变化；查询和 UI 能刷新 overlay                                                          |
| TC-149 authority 时间的 read/resolve 幂等 | REQ-012、REQ-016 | P2 / 并发     | 客户端时钟偏移；C-REPLAY                                        | 调 markRead/resolve 并重放                                     | 时间由 authority 生成且 replay 稳定；payload hash 不包含每次变化的客户端/服务端当前时间                                               |
| TC-150 手工外部快照无 provider 列污染     | REQ-002、REQ-014 | P2 / DB       | 创建 external Issue                                             | 读真实表列与记录                                               | 只保存 source provider/id/url/title snapshot；无 provider refresh cursor、token、remote state 列                                      |

### 5.8 分页、Authority、Readiness、SSH 与混合版本

| TC                                            | 关联需求                  | 优先级 / 类型 | 前置条件与测试数据                                               | 操作步骤                                                  | 预期结果                                                                                                                  |
| --------------------------------------------- | ------------------------- | ------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| TC-151 Issue 固定快照分页                     | REQ-017                   | P1 / 分页     | 同 authority 创建 >limit 的多层 Issue                            | start 获取 revisions/cursor；连续 continue                | 每页不超过 limit；拼接后无重漏、顺序稳定；每页 authority/facts/tree revision 相同                                         |
| TC-152 Issue 翻页期间 stale                   | REQ-017                   | P1 / 并发     | 取得第一页后发生 create/reparent/Round facts mutation            | 用旧 cursor continue                                      | 返回 stale 与当前 revisions，不返回混合 page；客户端丢弃该 filter 全部旧页并从 start 重拉                                 |
| TC-153 Conversation scope 独立分页            | REQ-001、REQ-017          | P1 / 分页     | authority/workspace/issue/unassigned 各有 >limit Conversations   | 分别分页并切换 scope                                      | 每个 scope 独立 cursor/IDs；共用 canonical entity；scope 切换不删除其他 scope 实体                                        |
| TC-154 runtimeRevision 固定与缺失 fail closed | REQ-010、REQ-017          | P1 / 分页     | Conversation 第一页后 detach/reattach                            | 用旧或省略 snapshotRuntimeRevision continue               | 返回 stale/invalid cursor；不把旧 attached 页与新 detached 页混合                                                         |
| TC-155 revision-aware not-modified            | REQ-017                   | P1 / 查询     | 客户端已有最新 facts/tree/runtime revisions                      | start 携带 since revisions                                | 返回 not-modified 且 authority/revisions 正确；normalized facts 与 ready/degraded reason 保留，不闪 loading 空树          |
| TC-156 authorityId 变化清 generation          | REQ-015、REQ-017          | P1 / 安全     | 同 route 先返回 authority A，再切 Profile/authority B            | 下一轮 status/list 返回 B                                 | A 的 entities/views/scopes 立即失效；B snapshot 前不展示/写 A；显示上下文已切换                                           |
| TC-157 晚到响应世代隔离                       | REQ-017                   | P1 / 并发     | authority A 请求慢；route 已切 B并完成新请求                     | A 响应最后到达                                            | reducer 丢弃 A 响应；B tree/entities/revisions 不回退；无跨 Profile 数据闪现                                              |
| TC-158 capability 缺失                        | REQ-018                   | P0 / 兼容性   | S-UNSUPPORTED                                                    | 打开远端 Issues并尝试创建                                 | 显示升级提示；不发送任何 Issue list/write RPC；Workspaces 其他能力继续                                                    |
| TC-159 ready readiness                        | REQ-018                   | P2 / 功能     | S-READY                                                          | 请求 issues.status 和 CRUD/普通启动                       | status 各字段 ready；查询/写入/可信普通物化均可用；capability 保持静态                                                    |
| TC-160 hook disabled degraded                 | REQ-006、REQ-018          | P0 / 降级     | S-DEGRADED-DISABLED                                              | 打开 Issues、CRUD、显式 Issue 启动、普通 Workspace 启动   | CRUD/查询/显式 prepare 可用并显示 hook-disabled；普通启动不物化；持久行仍可查询                                           |
| TC-161 hook start failed degraded             | REQ-006、REQ-018          | P1 / 故障注入 | S-DEGRADED-FAILED                                                | 重复 TC-160                                               | reason=hook-start-failed；无第二 hook server；恢复 hook 后可转 ready且不复制事实                                          |
| TC-162 storage open unavailable               | REQ-014、REQ-018          | P0 / 故障注入 | S-UNAVAILABLE-OPEN                                               | 启动宿主并调用 status、list、create                       | status 仍可读且 authority 可为空；其余方法稳定 `issue_feature_unavailable`；Orca 非 Issue 功能继续                        |
| TC-163 migration unavailable                  | REQ-014、REQ-018          | P1 / 故障注入 | S-UNAVAILABLE-MIGRATION                                          | 启动并重试 status                                         | reason=storage-migration-failed；DB 未删除，user_version/旧数据保持；不误报 unsupported/offline                           |
| TC-164 route offline                          | REQ-017、REQ-018          | P0 / 网络     | S-OFFLINE，内存中有上一轮远端 facts                              | 断开 route，查看树并尝试 mutation                         | 显示 offline；旧对象最多保留 row key但不作为可信内容展示；按钮禁写；不排队、不假装成功                                    |
| TC-165 独立 request error 与重试目标          | REQ-018、REQ-029          | P2 / 后续目标 | transport在线但 status/list 返回非连接错误                       | 观察分类并尝试重试                                        | 目标为 error 与 offline/unavailable 区分且可重试；当前 refreshRoute统一 offline，该用例保留为待实现验收，不能记为现状通过 |
| TC-166 paired runtime 映射远端 local          | REQ-015、REQ-018          | P0 / 兼容性   | H-RUNTIME-WT/FOLDER                                              | 通过 runtime route create/list/bind                       | transport 目标=environment；RPC selector=local；持久 executionHostId/partition=local；renderer 挂回 runtime route         |
| TC-167 authority descriptor 映射不符          | REQ-015、REQ-017          | P1 / 安全     | runtime route 请求，却伪造返回 ssh 或不匹配 descriptor           | client 处理响应                                           | typed client 拒绝整份响应；不缓存/显示；记录稳定错误；不把 alias 写 DB                                                    |
| TC-168 managed direct SSH                     | REQ-015                   | P1 / SSH      | H-SSH-WT/FOLDER，target 已登记且在线                             | create/list/reparent/bind/launch                          | selector/partition/executionHost 均为 `ssh:ssh-a`；folder/no-Git 可用；数据仍位于 owning runtime DB                       |
| TC-169 未管理 SSH selector                    | REQ-015                   | P1 / 安全     | 本地 caller 伪造 `ssh:unknown`                                   | 调 status/list/write                                      | 服务层在 DB 前拒绝；无 partition/state/receipt 创建；错误不泄漏任意路径                                                   |
| TC-170 paired caller 二跳 SSH                 | REQ-015、REQ-018          | P0 / 安全     | RpcContext.clientKind=runtime；selector=ssh:ssh-a                | 调任一 Issue method                                       | 协议层拒绝 second SSH hop；service 不 dispatch；远端/local DB 均不变                                                      |
| TC-171 Host/Workspace 参数矩阵                | REQ-006、REQ-010、REQ-015 | P1 / 参数化   | H-LOCAL-WT/FOLDER、H-SSH-WT/FOLDER、H-RUNTIME-WT/FOLDER、H-NOGIT | 对创建 Issue、普通物化、详情、detach、Resume 运行共同冒烟 | 每个合法组合使用正确 authority/workspaceRef；无 repoId 假设；非法跨 host 组合明确拒绝                                     |
| TC-172 profile label 仅展示                   | REQ-014、REQ-015、REQ-019 | P2 / 安全     | local/SSH/runtime 返回相同或变化的 profileLabel                  | 显示全部主机、切换 label                                  | label 只改变标题；authorityId/cache/binding/identity 不以 label 为键；同名 Profile 不混树                                 |
| TC-173 老客户端连接新主机                     | REQ-018                   | P2 / 混合版本 | host 支持 Issues，client 不认识 capability/UI                    | 建立正常 runtime 连接并产生 Issue facts                   | 旧 client 其他能力正常且忽略 Issue；不发送未知 stream opcode；DB facts 保留供升级后读取                                   |
| TC-174 新客户端连接旧主机                     | REQ-018                   | P1 / 混合版本 | client 有 Issues UI，host 无 capability/method                   | 打开 route                                                | 明确 unsupported，不把 method-not-found 显示成 empty/error；无写请求或旧 cache 展示                                       |

### 5.9 Project Transfer、宿主生命周期、隐私与发布边界

| TC                                        | 关联需求                           | 优先级 / 类型  | 前置条件与测试数据                                                   | 操作步骤                                                        | 预期结果                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------- | -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-175 Project copy 不复制 facts          | REQ-020                            | P1 / 回归      | A Project关联Conversation，B空                                       | A→B copy                                                        | 沿用原transfer；B不因copy得到A的Issue/Conversation/Round；不调用旧Issue guard；A facts保留                                                                            |
| TC-176 无纳管 Conversation 的 move        | REQ-020                            | P2 / 回归      | Project无关联Conversation                                            | A→B move                                                        | 按原transfer结果处理；不引入Issue数据迁移或附加Issue门禁                                                                                                              |
| TC-177 有 Conversation 仍沿用原 move      | REQ-020                            | P0 / 回归      | Project关联持久Conversation，原transfer条件合法                      | A→B move并观测返回                                              | 不返回已撤回的issue_project_move_blocked；执行原transfer；Issue facts不跨Profile搬迁；不把目标Workspace存在性与Issue映射迁移混为一谈                                  |
| TC-178 Issue DB 故障不插入 transfer guard | REQ-020                            | P1 / 故障注入  | 原transfer合法，Issue DB单独不可读                                   | 分别copy/move                                                   | 不因旧Issue只读guard失败而额外拒绝；保留原transfer自身失败检查；不删除/重建Issue DB                                                                                   |
| TC-179 Forget 与 transfer 解耦            | REQ-009、REQ-020                   | P1 / 回归      | Project有可忘记Conversation                                          | 前后分别查看transfer能力并完成合法Forget                        | Forget只删Orca事实且留transcript；不出现需先Forget才解除move guard的新约束                                                                                            |
| TC-180 Desktop 宿主生命周期               | REQ-018、REQ-021                   | P1 / 集成      | 正常 desktop 启动/退出，hook 成功或失败                              | 观察 startup/will-quit 顺序                                     | 复用 singleton hook；hook settled 后 bootstrap；退出先 dispose bootstrap 再既有 hook stop；失败时 degraded 不阻塞 Orca                                                |
| TC-181 Electron `orca serve` 生命周期     | REQ-018、REQ-021                   | P1 / 集成      | serve mode                                                           | 启动到 readiness/RPC，再停止                                    | capability 发布前 bootstrap ready/degraded；Issue RPC 可用；停止顺序与 desktop 契约一致                                                                               |
| TC-182 Node-only orcad 生命周期目标       | REQ-015、REQ-018、REQ-021、REQ-029 | P1 / 后续目标  | 独立 Node-only orcad，当前未见生产 Issues bootstrap 调用             | 完成装配后启动、连接RPC、停止并注入hook故障                     | 目标是复用同一host bootstrap并正确发布readiness/服务、按依赖逆序dispose、无Electron依赖；未装配时不得以模拟service或route单测记通过                                   |
| TC-183 日志允许字段                       | REQ-021                            | P2 / 可观测性  | 执行 CRUD、claim、dedupe、migration、poll                            | 收集诊断日志                                                    | 允许出现短 authority hash、host/partition、IDs、disposition、revisions、latency、error code、migration结果                                                            |
| TC-184 日志敏感信息防泄漏                 | REQ-007、REQ-021                   | P0 / 安全      | 使用唯一 prompt/output/question/token/auth token/私密 URL query 哨兵 | 执行成功与失败链并全文搜索日志                                  | 所有哨兵零命中；错误摘要有界且不包含 transcript 正文或私密 query                                                                                                      |
| TC-185 Activity 边界                      | REQ-021                            | P1 / 回归      | 创建 Issue/Round/attention                                           | 打开 Activity，执行其原 ack                                     | 无 Issue/Round 行、筛选或入口；Activity ack 不写 Round readAt/resolvedAt；原行为不变                                                                                  |
| TC-186 Agent Dashboard 边界               | REQ-021                            | P1 / 回归      | attached/detached Conversations 与 attention                         | 打开 Dashboard并 ack/导航                                       | 仍按 pane/agent 展示；无 Issue chip/跳转；Dashboard ack 不写 Round；detached 不被伪装成 live pane row                                                                 |
| TC-187 通知与移动端边界                   | REQ-021                            | P1 / 回归      | waiting/completion/归档/重开                                         | 观察 desktop notification payload、移动端路由/菜单/RPC          | 无 Issue/Round 通知或移动端 Issues；现有 agent 通知不变；无后台注册/隐藏入口                                                                                          |
| TC-188 延后服务与 schema 缺席             | REQ-014、REQ-021                   | P0 / 静态+运行 | 源码和独立打包产物                                                   | 查manifest/schema/菜单/后台服务                                 | 无Issue FTS/digest/artifact generation、外部Issue自动刷新、离线写队列、Profile/Forge迁移或push invalidation；现有Provider标题刷新明确允许，不作为延后provider同步误报 |
| TC-189 禁止双事实与不必要侵入             | REQ-001、REQ-021、REQ-022          | P0 / 发布      | main与当前源码                                                       | 检查terminal params/runtime composition/Workspace rows          | issueId不穿terminal，runtime core不持有Issue repository；Workspaces无持久Conversation overlay；原生行/标题中性seam允许，不能要求两侧均由持久记录驱动                  |
| TC-190 当前包与分层真实旅程               | REQ-021                            | P0 / E2E/发布  | 独立profile与构建包，Electron+Playwright CDP                         | 执行本文件第6节矩阵与16类旅程，记录源码revision/暂存差异/包hash | 分层记录实际测试、typecheck、构建、packaged状态及DOM/DB/RPC证据；SSH/runtime只有真实连接完成才计覆盖；截图/报告可读取，未执行不冒充通过                               |

### 5.10 原行复用、恢复与首条 Hook 窗口

| TC                              | 关联需求         | 优先级 / 类型 | 前置条件与测试数据                                                                        | 操作步骤                      | 预期结果                                                                                          |
| ------------------------------- | ---------------- | ------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| TC-191 原行精确选择             | REQ-022          | P0 / 参数化   | 相同标题/cwd但不同host、agent、session；attachment缺失或旧paneKey                         | 渲染Issue运行行               | 只选host+workspace+agent+provider identity命中的原生row；attachment不是硬门槛；不同identity不串行 |
| TC-192 retained与lineage        | REQ-022          | P1 / 回归     | 根row分别为live/retained并有子agent                                                       | 展开并点击                    | live复用原lineage分支；retained根不伪装活行，走fallback恢复；不合成假tab/pane                     |
| TC-193 原生activation与次级动作 | REQ-022          | P0 / UI       | 可用send target、ack/dismiss、compact/full                                                | 分别点主体和次级控件          | 主体先完成原生pane激活再关闭Issue页；次级控件保持原行为，不被捕获事件改写或提前卸载               |
| TC-194 单次Promise pending      | REQ-023          | P1 / 并发     | 历史查找或Resume被控制延迟                                                                | 连续点同按钮，完成后再点      | 未结束期间只发一次操作并显示busy；结束后可再试；不宣称跨Promise原生tab幂等                        |
| TC-195 精确历史与失败分支       | REQ-023          | P0 / 参数化   | 0/1/2条身份匹配，cancelled扫描，无saved content，Pi/Prime同id异path                       | Issue Resume                  | 仅唯一且可恢复匹配进入下一步；其余有明确原生错误，不以标题/prompt/cwd选近似会话                   |
| TC-196 已存在pane先Jump         | REQ-023          | P0 / 功能     | provider identity准确，原finder可定位                                                     | Issue一次Resume               | 聚焦原Workspace/tab/pane，无新tab与provider session；Issue route关闭，binding/Conversation保持    |
| TC-197 launch-config身份补窗    | REQ-027          | P0 / 功能     | 恢复pane已建立，launch-config有resumeProviderSession，Hook/status/retained/sleeping无身份 | 调finder与index并从原入口定位 | 两条查询均命中仍存在tab/leaf；原生Jump复用pane；没有Hook时不伪造live状态点                        |
| TC-198 launch-config失效与边界  | REQ-027          | P1 / 参数化   | tab/leaf已删，agent/session不符，pendingStartup无paneKey，旧remote载荷无identity          | 查finder/index                | 失效目标不返回；不以猜测补remote/pending窗口；保留原生missing/错误行为                            |
| TC-199 Codex utility过滤        | REQ-028          | P1 / 功能     | 标题生成prompt/output与pathless SessionStart                                              | ingestor和未归属展示          | utility不生成普通用户Round，非turn状态不误记完成；ghost过滤不依赖自动minted名充当人工名           |
| TC-200 人工名保护真实会话       | REQ-025、REQ-028 | P1 / 兼容性   | user/legacy无source手工title与相似utility文本；另有provider/minted title                  | 过滤与展示                    | 明确人工名/兼容人工名不被当自动辅助会话隐藏；provider/minted不会自动取得人工保护语义              |

### 5.11 标题来源、写入、兼容与迁移

| TC                              | 关联需求                  | 优先级 / 类型 | 前置条件与测试数据                                                          | 操作步骤                              | 预期结果                                                                                                    |
| ------------------------------- | ------------------------- | ------------- | --------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| TC-201 标题候选完整优先级       | REQ-025                   | P0 / 参数化   | user/current-provider/snapshot/generated/live/fallback组合，含空白          | 在四处提供各自候选                    | 统一优先级生效；某显示面无候选不造数据；不强制所有UI共享同一个字符串槽                                      |
| TC-202 身份兜底不得遮盖语义标题 | REQ-025                   | P0 / 边界     | scanner值等于fallback，另有generated/live；人工名也可等于fallback           | 解析标题                              | 自动fallback后移；有意义候选优先；人工选择相同字串仍按user优先                                              |
| TC-203 人工与Provider分槽       | REQ-026                   | P0 / DB       | conversation人工title和旧providerTitle                                      | refresh新Provider title，再用户Rename | refresh仅改provider_title，Rename仅改title/source；互不覆盖，实际变更才推进revision                         |
| TC-204 Clear保留快照            | REQ-025、REQ-026          | P0 / 功能     | 人工名、Provider快照、resolver暂不可读                                      | Clear并刷新展示                       | title/title_source置null，快照保留；立即以可用自动候选展示，不重新mint入库；身份/binding不变                |
| TC-205 首次identity触发标题     | REQ-026                   | P1 / 集成     | 新Conversation，首事件仅working或identity附着                               | attach后等待刷新                      | 使用现有刷新器读取Provider标题；不要求先完成一轮；identity/attach主链不等待失败的标题读取                   |
| TC-206 绑定成功触发标题         | REQ-008、REQ-026          | P1 / 集成     | 已有identity但快照空；目标Issue合法                                         | bind/rebind；另测unbind和stale        | 非空目标成功后schedule现有刷新器；unbind/stale不误改变绑定事务；标题失败不改mutation结果                    |
| TC-207 settled轮次标题触发      | REQ-013、REQ-026          | P1 / 集成     | local和SSH partition均有identity                                            | working、done、waiting/blocked事件    | settled事件走同一刷新器；working不额外重复标题读；远端标题走host resolver，不受本地Round transcript跳过误挡 |
| TC-208 启动历史补齐分批         | REQ-026                   | P1 / 参数化   | 多host、超单批上限、已有快照/无identity/不支持agent混合记录                 | bootstrap backfill                    | 只选缺快照且有active identity的支持agent；按host分批，单批不超resolver上限；不跨owner读文件                 |
| TC-209 空值失败不得降级快照     | REQ-026                   | P0 / 异常     | 有快照，resolver返回空、fallback、conversation-override或一个host失败       | refresh/backfill                      | 不把这些值写provider_title，不清已有值；失败host不抑制其他host成功；无新错误状态机                          |
| TC-210 刷新中再次触发           | REQ-026                   | P1 / 并发     | 首次resolver读尚未完成，新settled事件到达                                   | 控制两个不同标题快照                  | 后到trigger不被吞掉；当前读结束后再读，最终可用新快照收敛；dispose后不回写                                  |
| TC-211 标题revision并发         | REQ-016、REQ-026          | P0 / 并发     | Provider读期间发生Rename/Clear/bind                                         | 依次释放读取和mutation                | revision冲突不覆盖新人工名；同值no-op；Provider写和人工字段独立；不承诺无后续事件时自动无限重试             |
| TC-212 v3到v4四类迁移           | REQ-014、REQ-026          | P0 / DB       | user/provider/minted/null及legacy非空source-null fixture                    | migrate至v4并重开                     | user保留；provider搬到快照；minted清空且fallback可派生；legacy保人工；受影响revision正确，无实体/绑定丢失   |
| TC-213 v0/v1/v2迁移与回滚       | REQ-014、REQ-026          | P0 / DB       | 每个旧版本独立schema/data，version bump前故障                               | 迁移、故障重开、正常重试              | v2历史completion修复、v3/v4分槽按路径执行；失败全回滚，成功v4；旧binary不能直接冒充可回滚版本               |
| TC-214 Provider长中文标题       | REQ-026                   | P2 / UTF-8    | resolver返回超过512 bytes的中文/emoji标题                                   | refresh并读真实DB                     | 按byte安全截断，非破损UTF-8，满足repository约束；不陷入每轮固定超界失败                                     |
| TC-215 optional字段混合版本     | REQ-015、REQ-025、REQ-026 | P0 / wire     | 缺providerTitle/source/titleSource与含新optional字段的producer/consumer组合 | schema解码与投影                      | absent走兼容/原生规则，不把missing当显式清空；不新增stream opcode；旧host无Issues则unsupported              |
| TC-216 split pane不串名         | REQ-025                   | P0 / UI       | 同tab两独立session，焦点切换、各自人工名和Provider名                        | 四处展示并切焦点                      | Workspace每行使用自身identity候选，sibling不读取另pane槽；Tab按自己的active/priority pane语义更新           |
| TC-217 Tab人工槽撤销            | REQ-025、REQ-026          | P1 / 状态     | aiVaultTitle.source分别provider/conversation-override                       | Rename、Clear、Forget后reconcile      | 只撤销失效override槽；Provider值保留或由scanner补齐；不把清空override当清空Provider历史                     |
| TC-218 旧slot重启收敛           | REQ-025、REQ-026          | P1 / 兼容性   | 持久tab slot无source，可能残留旧v9值                                        | 重启并首轮reconcile                   | 依照原生重扫恢复来源；后续source可持久化，Clear状态不复活旧人工名；旧absence可解码                          |
| TC-219 title source参与状态相等 | REQ-025、REQ-026          | P1 / 回归     | 同title字符串但source从override变provider，web-session同步                  | 合并快照/相等性比较                   | source差异不被字符串相等吞掉；Tab和runtime状态触发必要更新                                                  |
| TC-220 History双名称搜索        | REQ-025                   | P1 / UI       | 人工名与session.title不同                                                   | 分别按人工名/原生名搜索               | 两种检索均能命中同一session；人工主显、原生次显；Resume/Continue/Jump与drag identity不变                    |
| TC-221 无人工override原生回退   | REQ-025                   | P0 / 回归     | 无Issue数据或override被移除                                                 | Workspace/Tab/History原流程           | 自动标题由原生链拥有，无title provider注册时仍可用；customTitle/quickCommandLabel/OpenCode例外保留          |
| TC-222 标题Host/Folder矩阵      | REQ-015、REQ-025、REQ-026 | P1 / 参数化   | local/SSH在线及断联重连/paired runtime，worktree/folder                     | Rename/Clear、Provider刷新、关闭恢复  | 不跨host串名；断联不清快照、不证明exited；folder无Git依赖；真实网络与模拟分区证据分别记录                   |
| TC-223 late-title收敛边界       | REQ-025、REQ-026          | P2 / 边界     | identity集合不变，Provider在最后一次refresh后写title，无新事件              | 观察后再触发合法settled/bind或新挂载  | 不编造无事件即时刷新承诺；记录当前resolver结果与snapshot优先级，并在已有合法触发后检查收敛                  |

### 5.12 后续目标与旧候选隔离

| TC                                | 关联需求                  | 优先级 / 类型 | 前置条件与测试数据                                                  | 操作步骤                    | 预期结果                                                                                                                          |
| --------------------------------- | ------------------------- | ------------- | ------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| TC-224 大规模受限查询目标         | REQ-017、REQ-029          | P2 / 后续目标 | 大量Issue/Conversation/Round                                        | 小limit查询并采集实际读取量 | 后续目标是SQL侧受限分页/聚合；当前全量list后切页需明确标注，不用响应页小证明读取受限                                              |
| TC-225 route独立刷新目标          | REQ-017、REQ-029          | P2 / 后续目标 | 一条route慢于轮询周期，另一条稳定                                   | 并发观察多轮刷新            | 后续目标为route独立无重叠推进；当前全局sequence/setInterval限制单独记录，不用旧响应被丢弃等同串行                                 |
| TC-226 Workspace可用性投影目标    | REQ-010、REQ-017、REQ-029 | P2 / 后续目标 | Workspace被移除且仅有snapshot                                       | query后执行恢复             | 当前query默认available不能当探测；原生动作仍应失败保护；真实effectiveProject/availability投影为后续目标                           |
| TC-227 direct SSH Round对账范围   | REQ-013、REQ-015          | P1 / 兼容性   | direct SSH partition及已装配的local authority fixture各有transcript | reconciliation              | direct SSH明确remote-transcript-unavailable，不在桌面读取远端私有路径；local fixture验证本地对账，不能由此证明Node-only远端已装配 |
| TC-228 Codex旧CLI隔离候选不作规范 | REQ-006、REQ-028          | P2 / 静态     | 2026-08-27候选方案与当前启动实现                                    | 查结构化启动/设置/诊断入口  | 未发现落地的-c注入或codexHookDaemonIsolation不当成现成功能；实际Hook身份与可信纳管按现有链验证                                    |
| TC-229 标题日志数据边界           | REQ-021、REQ-026          | P2 / 可观测性 | Provider标题包含测试哨兵，成功/失败刷新                             | 查当前日志输出与文档承诺    | 明确哪些用户文本实际输出；不得把未执行的敏感数据检查记通过；不把title当身份或进程证据                                             |
| TC-230 Profile与authority标题隔离 | REQ-014、REQ-015、REQ-025 | P0 / 安全     | 同sessionId在不同route/profile，人工名不同，晚到旧响应              | 切authority再释放旧响应     | override/cache按route和identity隔离，旧generation不覆盖新title；相同profileLabel不混用                                            |

## 6. 参数组合与执行策略

### 6.1 必跑组合

| 组合                                    | 覆盖用例                                                           | 要求                                 |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| H-LOCAL-WT × P-CODEX × S-READY          | 全部 P0 主流程                                                     | 每次发布必跑                         |
| H-LOCAL-FOLDER/H-NOGIT × P-CODEX        | TC-044、050、171                                                   | 每次发布必跑                         |
| H-SSH-WT/H-SSH-FOLDER × P-CODEX/P-PI    | TC-089、102、168、171                                              | SSH 相关改动必跑；发布前至少一轮     |
| H-RUNTIME-WT/H-RUNTIME-FOLDER × P-CODEX | TC-098、166、167、170、171、174                                    | runtime/RPC 改动必跑；发布前至少一轮 |
| P-CLAUDE/P-PI/P-PRIME/P-SCRAPE          | TC-052、070、101～103、105～107                                    | provider identity/hook 改动必跑      |
| S-READY～S-ERROR 全矩阵                 | TC-014、158～165                                                   | readiness/client/store 改动必跑      |
| C-REPLAY/C-CONFLICT/C-STALE-* 全矩阵    | TC-024、035、042、046、058、061、077、081～086、143～149、152～157 | repository/RPC/分页改动必跑          |

### 6.2 测试层级

| 层级                   | 主要职责                                            | 代表用例                                                                                              |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Shared/schema 单测     | Zod、类型、hierarchy、attention、延后字段缺席       | TC-016～022、029～036、133、140、188                                                                  |
| Repository/SQLite 单测 | PRAGMA、迁移、receipt、trigger、revision、原子性    | TC-023～042、065～086、104～150                                                                       |
| Main/runtime 集成      | bootstrap、hook、RPC、host lifecycle、SSH/readiness | TC-043～054、087～103、151～182                                                                       |
| Renderer 单测          | normalized store、builders、状态机、按钮动作        | TC-001～014、055～064、117～125、155～174                                                             |
| 真实 App E2E           | 用户旅程、重启、Profile、多主机、发布边界           | TC-043、049～062、079、084、087、096～100、117～129、137、158～179、185～190、191～198、216～223、230 |

## 7. 规格覆盖检查

原 TC-001～TC-190 编号全部保留，失效预期在原编号位置订正。以下是规格的覆盖范围，不是执行结果或当前功能完成声明。

- REQ-001～REQ-029 均有 Test Case 映射。
- 覆盖正常、异常、边界、并发、幂等、故障注入、恢复、兼容性、安全和发布路径。
- 覆盖 worktree、folder、no-Git、local、direct SSH、paired runtime 与多 Profile。
- 覆盖 ready、degraded、unavailable、unsupported、offline、loading/empty，以及待实现的独立 error 目标。
- 失败用例包含零副作用断言，成功用例包含最终状态与 revision/receipt 断言。
- 延后项按“能力缺席”验证，没有写成应实现功能。
- 本文档没有混入某一轮执行结果、环境、版本、截图或缺陷。

## 8. 历史编号重基线映射

| 旧TC                         | 原预期为何不能沿用                                          | 当前处理                                                                         |
| ---------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `TC-012/013/050`             | 未归属Workspace分组、多个必备host header已与现UI不符        | 保留隔离/归属，改为平铺Workspace标签与行内host标签                               |
| `TC-017/019`                 | 字符数替代实际UTF-8 bytes限制                               | 分开验证wire字符与repository字节边界                                             |
| `TC-047/048/071`             | 普通UI的Starting/Retry与failure回写已撤回                   | 无identity隐藏；后端失败/retry合同单测保留                                       |
| `TC-049/060/062/064/087/189` | Workspaces持久Conversation双投影已撤回                      | 原生行复用和Issue关闭历史分别验证                                                |
| `TC-054/068`                 | expired一律拒绝纳管已更新                                   | 过期失原绑定权，真实identity可未归属纳管                                         |
| `TC-066/095～100`            | Issue prepareResume、跨Workspace typed拒绝和claim流程已撤回 | 原AI Vault resolver/finder/Jump/Resume；Issue固定原目标；Continue不自动继承Issue |
| `TC-103`                     | 缺强identity仍创建可见持久行与可信纳管矛盾                  | terminal可用，无强identity不伪造行；legacy记录独立测试                           |
| `TC-113`                     | “任何后来turn都不能影响旧义务”与可信后续输入解决混淆        | 不按completion时间supersede，保留new-input历史解决                               |
| `TC-133/134`                 | 固定v1过期                                                  | v4及完整v0/v1/v2/v3演进，新增TC-212/213                                          |
| `TC-175～179`                | Project move guard已撤回                                    | 旧5编号全保留，改为原transfer不受Issue侵入及facts不迁移                          |
| `TC-188`                     | provider refresh概念过宽，可能误禁现有标题resolver          | 延后的是外部Issue状态同步，Provider标题刷新允许                                  |
| `TC-190`                     | 旧技术方案16步与历史包不能作为当前完成                      | 按本文件当前旅程重新执行，分开真实远端证据                                       |

TC-014/026/086/165 的有效质量目标没有因实现缺口被删除。TC-224～226明确属于后续性能/完整性目标，不应把它们作为当前已完成特性描述。

## 9. 真实App的16类旅程

1. 独立profile与构建包启动，读回packaged状态和源码/包身份。
2. 本地Issue及外部手工引用创建、编辑。
3. 三级层级、第四级/循环/跨host拒绝。
4. Issue内启动，identity前隐藏，可信Hook后出现。
5. folder/no-Git普通启动，无Hook不误纳管。
6. 原Workspace行复用、主体激活与次级动作。
7. bind/rebind/unbind，stale零副作用。
8. 关闭pane后Issue持久历史保留。
9. Issue精确恢复与已有pane Jump；原ID/绑定不变。
10. 原生Continue新session。
11. 重启后事实、人工名、快照、read/resolve不漂移。
12. profile/authority隔离与原Project copy/move不迁移facts。
13. degraded/unavailable/unsupported/offline及待实现error边界。
14. 合法Forget只删Orca事实，transcript保留；后端retry另行验证。
15. 真实SSH/paired runtime与folder矩阵；模拟transport不能代替真实远端成功。
16. 标题四处来源、split pane和Clear；Activity/Dashboard/通知/移动端边界回归。

每次Test Run单独记录具体步骤、期望/实际、失败归因、截图和DOM/RPC/DB证据，不往本规格追加某轮结果。旧截图若被后续运行覆盖，必须保留这一可追溯性限制。
