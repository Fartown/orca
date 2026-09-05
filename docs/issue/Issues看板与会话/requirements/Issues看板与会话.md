---
title: Issues 看板与会话
document_type: requirement
status: ready
created: 2026-09-05
updated: 2026-09-05
issue: Issues看板与会话
---

# Issues 看板与会话

本文合并本地并行任务看板、会话展示与恢复、原 pane 识别和会话标题稳定化的需求口径。依据为 2026-09-05 当前工作树，包含已暂存的标题改动。状态 `ready` 只表示文档已按源码整理；没有重新运行产品测试或完成真实 App 验收。

技术事实见[技术说明](../solutions/Issues看板与会话技术说明.md)，测试标准见[测试规格](../tests/cases/Issues功能测试.md)。旧稿里的版本号、某次测试结果和实施步骤均不作为本需求的当前完成证明。

## 1. 用户目标

用户需要把跨 Workspace、跨日期的一件事组织到同一个 Issue 下，知道哪些会话需要自己处理，并在关闭 pane 后继续原会话。Issue 是可选的工作组织维度；Workspace 是执行环境；Conversation 是已纳管会话的持久身份；Round 记录等待或完成的义务。

正在运行的会话应复用 Workspace 原行。关闭 pane 后，Issue 保留历史与绑定，用户从 Issue 点击一次 Resume，复用 AI Vault 现有查找、定位与恢复能力。标题有人工名时尊重人工名，否则优先显示 Provider 的有意义标题；身份兜底只作最低优先级候选。

## 2. 范围与不变量

纳入本需求：

- 本地 Issue 和 GitHub、GitLab、Linear、Jira、other 手工外部引用；三级层级、顺序、归档、重开、受控删除。
- Conversation 可信纳管、Issue 内显式启动、绑定、改绑、解绑、改名、显式忘记与恢复。
- Round 预览、attention、已读与已解决、去重和已有 transcript 对账。
- profile 数据库、authority/host 隔离、revision、receipt、分页、混合版本和降级。
- Issues Sidebar/详情、原 Workspace 行复用、AI Vault 恢复快捷入口、launch-config 身份查找、四处标题来源一致性。

继续延后：

- Activity/Dashboard 的 Issue 投影、Issue 通知、移动端 Issues。
- 整理稿、产物聚合、全文搜索、正文读取服务、自动任务调度、provider 自动同步/反向写入。
- 远端离线 cache/写队列、Profile Issue 数据迁移、Forge 迁移、push invalidation、execution-chain supersession。
- 无 identity 预分配孤儿记录的自动回收。

必须保持：

1. Conversation 恰好属于一个 worktree 或 folder Workspace，可绑定零个或一个同 authority/host 的 Issue。
2. provider identity、运行 attachment 与人工展示名职责不同；标题、prompt、cwd、时间邻近不能证明身份归属。
3. pane 关闭只移除运行附件，不删除 Conversation、Issue 归属、Round 或 Provider transcript。
4. 普通 Workspace 启动不前置依赖 Issues 成功；有可信 Hook/identity 后才物化持久会话。
5. Workspaces 使用原生运行行；持久 Conversation 不向 Workspaces 叠加一套行。
6. 失联不能证明进程退出。涉及执行的判断归执行主机；标题与 `detached` 都不能作为进程死亡证据。
7. 本地 Issue 不是新的 TaskProvider，也不向通用 Workspace linked item 填入虚构 `provider='orca'`。

## 3. 按需求目标分级

“已实现”表示当前源码存在对应主链；“局部实现”表示已知边界未闭合；“后续目标”表示本次不作为完成项。各级别均需对应 Test Run 才能宣称验收通过。

### REQ-001 持久会话身份

优先级：P0。当前状态：已实现；不再要求两侧都有 detached 持久行。

目标与验收边界：Workspace 强归属，Issue 可选；关闭后在 Issues 保留同 ID，运行行由原 Workspace 组件呈现。

### REQ-002 Issue 与外部引用

优先级：P0。当前状态：已实现。

目标与验收边界：本地创建/编辑；外部记录 provider、编号、URL、标题快照，不自动读写外部平台。

### REQ-003 层级与独立生命周期

优先级：P0。当前状态：已实现主链；同级排序等 UI 完整性仍需验收。

目标与验收边界：最多三级，禁止自环、循环、跨 authority；reparent 原子；父子归档独立，删除明确处理依赖。

### REQ-004 Attention 与查询

优先级：P0。当前状态：已实现主链；全局 attention 徽标仍须独立核验。

目标与验收边界：All/Needs me/Archived，保留必要祖先；own 与 descendant 不重复计数；标题/编号在已加载数据内搜索。

### REQ-005 Issue 内启动

优先级：P0。当前状态：已实现；无 identity 的记录不展示启动状态。

目标与验收边界：先校验并预分配 Conversation/claim，再调用原 launcher 并聚焦 Workspace；失败不制造假运行证据。

### REQ-006 普通启动可信纳管

优先级：P0。当前状态：已实现。

目标与验收边界：普通 worktree/folder/no-Git 启动原样工作；可信上下文与 provider identity 到达才创建未归属 Conversation。

### REQ-007 Claim 与身份边界

优先级：P0。当前状态：已实现；expired/not-found 降级见 REQ-024。

目标与验收边界：令牌只存 SHA-256 fingerprint；15 分钟 TTL；失效令牌不能继续取得原 Issue 绑定权。

### REQ-008 原子绑定与改名

优先级：P0。当前状态：已实现主链；标题细则见 REQ-025/026。

目标与验收边界：同 host bind/rebind/unbind 单次更新 issueId；stale 零写入；人工 Rename/Clear 不改变身份与 Workspace。

### REQ-009 Retry 与 Forget

优先级：P1。当前状态：局部实现；Retry 无普通 UI 入口，删除 receipt 重放需验证。

目标与验收边界：后端保留同 ID retry 与 blocker；Forget 二阶段预检，只删除 Orca facts，保留 transcript。

### REQ-010 Runtime Attachment

优先级：P0。当前状态：已实现；`detached` 不等于远端 exited。

目标与验收边界：有界内存运行附件；pane/connection clear 只 detach；重启仅对已有 identity 用可信证据重建。

### REQ-011 历史发现与继续

优先级：P0。当前状态：已实现既有 AI Vault 主链；未实现 Issue 专属跨 Workspace Resume 前置拒绝/继承规则。

目标与验收边界：History 扫描不纳管；原 Workspace Resume 保留原身份；Continue 新建 provider session 与 Conversation。

### REQ-012 Round 义务

优先级：P0。当前状态：已实现；纯 runtime waiting 的归档 guard 接线仍属限制。

目标与验收边界：completion/waiting 与原因、8 KiB 预览；read 不等于 resolve；关闭/失联不清等待。

### REQ-013 去重与自动重开

优先级：P0。当前状态：已实现主链；远端 transcript 对账范围受限。

目标与验收边界：同 provider turn 合并；可信新事实按规则重开归档 Issue；后续输入可解决历史 completion。

### REQ-014 SQLite 与迁移

优先级：P0。当前状态：已实现；v1 固定版本表述已废弃。

目标与验收边界：每 profile 独立数据库，WAL/NORMAL/FK、事务迁移、权限；当前 schema v4 保留九张核心表。

### REQ-015 Authority 与 host

优先级：P0。当前状态：局部实现；client 路由/分区合同已存在，生产 bootstrap 调用只核实到 Electron main/serve，未发现 Node-only orcad 装配调用；不能宣称 paired runtime 的完整服务已可用。

目标与验收边界：local/direct SSH 分区与 paired runtime 远端 local 分区分开；runtime route 不落库；禁止 paired 二跳 SSH。

### REQ-016 Receipt 与 revision

优先级：P0。当前状态：已实现主链；Forget grant 消耗后的 replay 不得先行宣称通过。

目标与验收边界：caller+mutationId 幂等，method/payload 冲突拒绝；记录、树、事实 revision 分工；失败事务回滚。

### REQ-017 分页与状态隔离

优先级：P1。当前状态：局部实现；当前先全量读后分页、全局刷新序列，见技术限制。

目标与验收边界：固定快照、stale 整 scope 重拉、normalized entities、authority generation 与晚到响应隔离。

### REQ-018 支持、健康和连接

优先级：P0。当前状态：局部实现；一般请求异常目前也被归为 offline，独立 error/retry 与 Node-only orcad 完整装配为后续目标。

目标与验收边界：capability 与 readiness 分开；unsupported/unavailable/offline 禁止错误写入，degraded 可 CRUD。

### REQ-019 Sidebar 与详情

优先级：P1。当前状态：已实现；多 host 用行内标签，空 host 隐去，未归属平铺附 Workspace 标签。

目标与验收边界：Workspaces/Issues 根模式、虚拟列表、direct children/conversations、Round timeline；host 数据独立。

### REQ-020 Project transfer 边界

优先级：P1。当前状态：已实现当前取舍；有 Conversation 时强制阻止 move 的旧目标撤回。

目标与验收边界：沿用原 Project copy/move；不迁移 Issue facts，不插入专属 move guard。

### REQ-021 发布与回归边界

优先级：P0。当前状态：后续目标；本轮仅文档核对，不继承历史验收状态。

目标与验收边界：源码/定向测试/类型检查/构建/真实 App 分层验收；真实 local、folder、SSH、runtime 单独记证据。

### REQ-022 原 Workspace 行复用

优先级：P0。当前状态：已实现；retained 降级为恢复入口，attachment 不是硬门槛。

目标与验收边界：host+workspace+agent+provider identity 精确命中可激活原行；状态、标题、model、preview、lineage、send/ack/dismiss 和点击行为复用。

### REQ-023 从 Issue 一键恢复

优先级：P0。当前状态：已实现；局部 pending 不承诺原生 tab 的全程幂等。

目标与验收边界：精确选择 AI Vault session，先原 finder/Jump，missing 才原 Resume；一次按钮调用，无手工二次搜索。

### REQ-024 首次可见性与过期降级

优先级：P0。当前状态：已实现；invalid/ambiguous 仍不得回退纳管。

目标与验收边界：identity 前无 Starting/Retry、无 direct/running 计数；过期可信 Hook 未归属纳管，旧预分配隐藏。

### REQ-025 标题来源一致性

优先级：P0。当前状态：已实现于当前暂存代码；标题不是全局统一字符串，也不参与匹配。

目标与验收边界：人工名→当前 Provider→Provider 快照→generated/live→identity fallback；四处采用自身粒度候选。

### REQ-026 标题写入与 v4 迁移

优先级：P0。当前状态：已实现于当前暂存代码；真实 UI/离线/重启仍待验收。

目标与验收边界：user override 与 Provider 快照分槽；Clear 保快照；minted 不落库；identity/bind/round/startup 触发现有刷新器。

### REQ-027 首条 Hook 前原 pane 定位

优先级：P1。当前状态：已实现本地 renderer 接线；pendingStartup 秒级窗口和远端旧 wire 仍是边界。

目标与验收边界：finder/index 从现有 launch-config provider identity 查找仍存在的 tab/leaf；不伪造 live 状态。

### REQ-028 Codex 内部辅助会话过滤

优先级：P1。当前状态：已实现过滤；2026-08-27 daemon 隔离 CLI 注入方案未发现落地。

目标与验收边界：标题生成 utility 与 pathless SessionStart 不形成普通用户轮次；手工命名真实会话不误隐藏。

### REQ-029 容量与完整降级

优先级：P2。当前状态：后续目标；不把旧改造方案当已实施。

目标与验收边界：SQL 侧受限查询、route 独立不重叠刷新、完整错误分类、可靠 workspace 可用性、孤儿/receipt 清理。

## 4. 关键用户动线

### 创建与组织

用户可先创建 Issue，再从 Issue 选择同主机 worktree/folder 启动 agent；也可先在 Workspace 工作，可信会话出现后再通过 Bind existing 归类。改绑是一次原子 mutation，不能先解绑后绑定制造中间空归属。

新建成功首先进入真实 Workspace tab。没有 provider identity 时，Issues 列表和 direct/running 计数保持不变。15 分钟以后首条可信 Hook 到达，不再使用过期 claim 绑定原 Issue；真实会话进入未归属区，用户可再次绑定。

### 运行、关闭与恢复

有可激活原生行时，Issues 复用整个 Workspace 行组件；其主体点击按原组件激活，次级动作不被截断。retained 行是原生完成证据，不作为活行激活。

关闭 pane/tab 后，原 Issue 中保留 Conversation、Provider 映射和标题。点击 Resume 后按当前 route、agent、session ID 精确选择历史。Pi/Prime 还按现有 transcript path 规则匹配。找不到、歧义、内容不可恢复、Workspace 不可用时返回失败，保留原记录。

已有 pane 就 Jump；finder 返回 missing 才在原 Workspace 调用现有 Resume。启动请求完成不等于 attached；可信 Hook 到达才恢复运行投影。后续再次点击的行为取决于原生 finder，局部 pending 只阻止同一次 Promise 未完成时重复提交。

### 查看与处理

Needs me 从 unresolved Round 派生。Mark read 只记阅读时间；Mark handled 才解决义务。等待期间关闭 pane 或断开 SSH 不解决等待。归档可批量解决 direct completion，有 unresolved waiting 时拒绝；子 Issue 生命周期独立。

### Rename 与 Clear

人工名保存到 `title`；自动 Provider 名保存到 `provider_title`。Rename 不阻止后台刷新快照；Clear 清人工覆盖并恢复自动候选。Tab 自己的 customTitle、quickCommandLabel、OpenCode 语义标题仍遵循既有优先级；split pane 行按各自 identity 解析，不能借用 sibling 的槽。

## 5. 最新取舍替代的旧描述

| 旧描述 | 当前归并口径 |
| --- | --- |
| Workspaces/Issues 全部由持久 Conversation 双投影驱动 | Workspaces 原生运行行；Issues 复用匹配原行并独立保留关闭历史 |
| 关闭后先打开右侧，让用户手动搜索再 Resume | Issue 精确查找并直接复用 finder→Jump/Resume |
| Issue 专属 Starting/Retry 和异步 launcher failure UI | identity 前隐藏；后端诊断/retry 合同仍在，未连接普通 UI |
| 过期 claim Hook 一律丢弃 | 失去原绑定权，但可信 identity 可未归属纳管 |
| Project move 必须被 Issue guard 阻止 | guard 撤回，沿用主工程 transfer |
| minted/provider/user 共用 title，并作为 app-wide canonical | user override 与 Provider 快照分槽；fallback 纯派生 |
| schema 固定 v1，旧稿 v3 是最终版本 | 当前 v4；保留 migration、回滚和混合版本边界 |
| 增加长轮询/补偿保证所有标题及时生成 | 复用现有 resolver 与事件触发；无明确事件时不承诺即时收敛 |
| 所有原生恢复失败都由 Issue 修复 | 复用原生合同，单独纳入 launch-config finder 缺口，不扩展为第二恢复系统 |
| Codex 一律注入 `-c features.hooks=true` 已落地 | 这是历史候选方案；当前源码未发现该注入与诊断开关，不作为现行规范 |
| 历史 16 步验收等于当前代码完成 | 历史报告仅说明对应包/日期；当前源码、暂存标题与真实远端另行验证 |

## 6. 验收与完成条件

[测试规格](../tests/cases/Issues功能测试.md)保留 TC-001～TC-190 的有效独有细节，更新撤回目标，并扩展 TC-191 起的行复用、精确恢复、标题和迁移用例。历史编号不等于历史预期仍有效；已替换项均有映射说明。

本需求不以测试总数衡量功能数量。P0 是用户主链和数据不变量，P1 是恢复/并发/跨主机完整性，P2 是容量和低频边界。完成结论至少记录源码 revision、是否包含 staged 变更、测试环境、实际执行集、未覆盖项；单测不能替代 Electron CDP 或真实远端验收。

## 文档归属与核对基线

本需求已按用户确认拆为独立 issue；需求目标与 P0/P1/P2、技术说明、测试规格和执行证据均在本 issue 内维护。原 REQ/TC 编号不变，入口见 [Journal](../journal.md)。

核对日期：2026-09-05；分支：`feat/self-hosted-artifact-backend`；本地 main：`51ed7d4f678de68b38eef14c79b473b84a6e55bc`；HEAD：`0b1e92fa9a783a978f3f43ac8f4eea1c5c55a3f9`。源码基线包含整理前已有的暂存标题实现，不能只用 HEAD 复现。原产品稿与已确认结论提供目标，当前工作树提供实现事实，历史执行只证明其记录的版本和环境。

2026-09-05 变更：由共用总 issue 改为三项需求分别管理；仅调整文档归属、入口和证据分类，不扩大功能范围、不改变验收断言。来源映射和原稿恢复见 [文档归并记录](../../../maintenance/本地需求文档整理/2026-09-05-文档归并记录.md)。
