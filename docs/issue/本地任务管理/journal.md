---
title: 本地任务管理
slug: 本地任务管理
status: implementing
created: 2026-10-26
updated: 2026-10-30
---

# 本地任务管理 开发 Journal

## 1. 关键文档链接

| 类型     | 文档                                                                             | 状态      | 说明                                                                     |
| -------- | -------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| 需求     | [requirements/本地任务管理.md](requirements/本地任务管理.md)                     | ready     | REQ-001～REQ-018，2026-10-26 用户确认                                    |
| 交互     | -                                                                                | approved  | 设计稿在本机 `.docs/本地任务管理调研/2026-10-24/prototype-v4/`，不进仓库 |
| 调研     | -                                                                                | completed | 产品与代码调研在本机 `.docs/本地任务管理调研/`，不进仓库；结论已并入方案 |
| 方案     | [solutions/本地任务管理技术方案.md](solutions/本地任务管理技术方案.md)           | approved  | 数据层、RPC、推送、桌面与手机接入、需要你、35 处接缝、开工前验证         |
| 测试用例 | [tests/cases/本地任务管理功能测试.md](tests/cases/本地任务管理功能测试.md)       | ready     | 切片 1：TC-001～TC-039；切片 2：TC-101～TC-113                           |
| 测试记录 | [tests/runs/2026-10-26-开工前验证.md](tests/runs/2026-10-26-开工前验证.md)       | completed | 开工前 4 项：1、2 成立，3 仅代码确认，4 部分成立                         |
| 测试记录 | [tests/runs/2026-10-26-切片1真机验证.md](tests/runs/2026-10-26-切片1真机验证.md) | completed | 切片 1：13 条通过、3 条部分覆盖，4 个修复复测通过                        |

## 2. 决策点记录

### D-008 任务库改为每台 Orca 的资源，项目可挂多仓、层级不限

- 日期：2026-10-28
- 背景：用户指出三处不合理：项目和仓库一一对应（没有仓库的项目、跨仓项目建不了）；任务只有两层；任务只存桌面、远程看不到。并要求远程照 Orca 现有项目和会话的基建做，不要另起「任务宿主」。调研确认：项目目录是每个端点自己的资源，客户端按端点读写并换算主机标识；`orca serve` 和 orcad 能跑任务服务；会话状态在拥有会话的主机上；上游给会话发消息是一次发送、失败退回文字、从不排队；同一项目在多台主机上各存一份、写入只发给指定主机。
- 最终决定：采用第二项。任务库和项目一样是每台 Orca 的资源（桌面、`orca serve`、SSH 主机上的 orcad），客户端走现有端点路由读写；会话认领和需要你判定挪到拥有会话的主机；「看过」存在任务库，任意一端看过就算；回复照上游一次发送、失败退回，删除暂存回复与「连接后发送」；同一项目在多台主机上的任务各存各的，照 Automations 展示。项目关联 0 到多个仓库；层级不限、禁止成环；每个任务最多一个工作区，跨仓拆子任务。
- 原因：用户确认「服务器上项目的任务存在服务器上」「远程可以读写」「先只挂一个工作区」「任意一端看过就算看过」；其余照上游现有做法，不自行发明。
- 影响范围：REQ-001、REQ-002、REQ-004、REQ-009～REQ-011、REQ-013～REQ-015、REQ-017、REQ-018；方案 §17（取代 §2、§3.1、§4.1、§6、§7.2、§9.1、§9.3、§9.4、§11.2、§11.3 的相应内容）。

#### 备选项

- 保持任务库只在桌面，另做一套远程查看（任务宿主切换）
- 任务库照项目做成每台 Orca 的资源，走现有远程基建

#### 关联文档与需求点

- 无

### D-007 切片 2 按上游实际机制调整做法，回复只给「做完一轮」

- 日期：2026-10-26
- 背景：切片 2 开工前逐条核对方案引用的上游代码，6 处语义不符：开会话拿不到终端 tabId、建工作区完成通知的 tab 不是智能体所在的 tab、「工作区已删除」的依据在 SSH 断线时会记错主机、PR 刷新上报不随 fork 关联变化重算、`resolveAgentLaunchExecutionContext` 不是联系判定、`restoredUnconfirmed` 被上游衰减为空闲。另外终端里的提问几乎都是菜单或对话框，上游此时拒绝写入。
- 最终决定：采用第二项。开会话先定路线并自己处理主机拒绝开聊天；完成通知带启动终端信息并导出上游的智能体 tab 定位规则；「已删除」只看权威扫描；关联变化时触发 PR 刷新上报；联系判定由功能自己用上游原语实现；重启恢复的状态沿用上游衰减。只有「做完一轮，你还没看」可以回复；桌面与手机的回复统一先存进桌面任务库，由桌面投递器在主机在联系时发出。桌面渲染层发布进展快照，手机只读。已关联工作区的顶层任务不能改成子任务；子任务换父任务保留已有会话关联。
- 原因：照方案原文实现会在 SSH、配对服务器和结构化聊天上拿不到会话标识或误判；终端「等你回答」的回复大多会被拒；主进程没有转给渲染层执行的通道，统一队列一条路径同时满足「连接后发送」和手机回复。
- 影响范围：REQ-011、REQ-012、REQ-014、REQ-015、REQ-017；方案 §7.1、§7.2、§8.3、§8.4、§8.5、§8.8、§9.2～§9.4、§10、§11.3 及「切片 2 实现调整」。

#### 备选项

- 按方案原文实现，接受部分路径拿不到会话标识
- 按上游实际机制调整，回复收窄到「做完一轮」，回复统一走桌面暂存队列

#### 关联文档与需求点

- 无

### D-006 幂等回执绑定方法与参数并限时清理

- 日期：2026-10-26
- 背景：D-005 永久保留回执会随写入无界增长；手机操作号只活于页面会话，桌面每次写入生成新号；评审发现跨方法误回放与损坏回执重复执行。
- 最终决定：采用第二项；D-006 取代 D-005 关于永久回执保留和损坏回执重做的部分。手机失联/检查仅遮盖禁写，双端后续重读失败保留页面与草稿，events 只独立重读。
- 原因：用户在本轮明确确认 D-A、D-B、D-C；限时保留覆盖手机同会话重试，避免无界存储；保留组件才能保留操作号和草稿。
- 影响范围：REQ-001～REQ-008、REQ-017、REQ-018；方案 §5、§8.1；TC-025～TC-038。

#### 备选项

- 永久保留完整结果并在解析失败时重做
- 方法和稳定参数指纹绑定，解析失败明确拒绝，按 24 小时清理

#### 关联文档与需求点

- 无

### D-005 按独立审查修复任务库并保留历史身份

- 日期：2026-10-26
- 背景：用户授权修复独立审查问题，并要求先提交旧实现；旧实现已提交为6971551474b3。审查确认评论串任务、读取失败被掩盖、批量部分保存、手机项目删除与旧编号/幂等组合问题。
- 最终决定：采用存活别名前缀保护和任务库生命周期去重；只修切片1，切片2已有会话子任务换父任务仍待产品语义明确。
- 原因：只改解析顺序会让新编号反向错跳；直接淘汰操作ID无法判断延迟重投是否已执行。用户已授权修复，本轮不新增执行主机协议或服务。
- 影响范围：REQ-001、REQ-002、REQ-004、REQ-005、REQ-006、REQ-017、REQ-018；技术方案写入规则/双端恢复；TC-017～TC-024。

#### 备选项

- 仅调整旧编号解析优先级并继续淘汰回执
- 保护存活别名前缀并随任务库保留回执，修复双端失败恢复与功能对齐

#### 关联文档与需求点

- 无

### D-1 只做任务管理和挂接，不做研发流程

- 日期：2026-10-25
- 背景：v3 方案包含评审、落地、占用锁、排队、执行者预设、多仓库任务等流程，用户认为太复杂。
- 最终决定：只做两件事：任务管理本身，以及把 Orca 现有的工作区和会话挂到任务上。研发流程（SDLC）不做。
- 原因：用户原话「sdlc 你做一半 不如不做」；diff、提交、PR、Checks 都直接用 Orca 现有功能。
- 影响范围：需求 §3 Out of Scope；REQ-009～REQ-013。

#### 备选项

- 只做任务管理与挂接（采纳）
- v3：任务管理加完整研发流程

### D-2 一个项目对应一个仓库，前后端各一个会话

- 日期：2026-10-25
- 背景：一个需求常常同时涉及前端和后端。
- 最终决定：前后端在同一个仓库里，由用户在工程上约束；一个顶层任务对应一个工作区，前端、后端各是一个子任务，各自在这个工作区里开一个会话，可以同时运行。任务功能不加锁，不做多仓库任务。
- 原因：用户明确「我会保证前后端在一个repo里的 但是需要两个会话」。
- 影响范围：需求 §4；REQ-001、REQ-009、REQ-010。

#### 备选项

- 一个仓库一个工作区，多会话（采纳）
- 多仓库任务：文件夹工作区加多个工作树

### D-3 加回「需要你」，只用 Orca 现有的智能体状态判定

- 日期：2026-10-26
- 背景：v4 初稿删掉了收件箱；用户认为「需要你」应该有，但要说清楚怎么判断。
- 最终决定：只看挂在任务上的会话，按 4 条规则判定（等你批准、等你回答、被卡住、做完一轮你还没看），完全用 Orca 现有的智能体状态和「未读」标记，不自己猜测；没有集成的智能体不进「需要你」。
- 原因：判定依据可以解释，且和智能体仪表盘、系统通知用同一套状态，两边不重复。
- 影响范围：REQ-014、REQ-015、REQ-017。

#### 备选项

- 4 条规则，只看任务上的会话（采纳）
- 不做「需要你」
- 覆盖所有会话，替代智能体仪表盘的「需要你」列

### D-4 需求默认做法与方案定稿，先做切片 1 并并行验证

- 日期：2026-10-26
- 背景：需求 §8 列了 5 个问题的默认做法；代码调研让需求改了 4 处（弹窗不显示「已链接的工作」、「等你批准」只能打开会话、结构化聊天会话归入「等你回答」、接缝 35 处）。
- 最终决定：用户回复「做吧」，按需求 §8 的默认做法和技术方案定稿；先做切片 1（任务库），同时在本机、SSH、配对服务器上跑开工前 4 项验证，有结论后再做切片 2。
- 原因：切片 1 不依赖那 4 项验证；先验证可以避免切片 2 写到一半才发现会话标识对不上状态。
- 影响范围：REQ-001、REQ-004、REQ-009、REQ-014、REQ-015、REQ-017；方案 §13、§15。

#### 备选项

- 先做切片 1，并行验证（采纳）
- 验证完再一起做两个切片

## 3. 开发记录

### 2026-10-30 修复本地任务对已有功能的影响

- 本轮目标：PR #71 合入后，系统评审（`.docs/local-tasks-ui-validation/2026-10-29/deep-review/`）发现一批不用任务功能的用户也会碰到的问题，这一轮把它们全部修掉。只影响任务用户的缺陷留到下一轮。
- 完成内容：
  - 统一原则「没有项目就不打扰」：`localTasks.status` 新增可选的 `projectCount`；旧主机不报这个字段，按「有项目」处理。库里没有项目时，不显示附加入口、不开变更流、不跑判定。只保留四个发现入口：任务页来源栏、设置分区、Cmd+J（排在上游动作之后）、手机主机页按钮。
  - 主进程：
    - 新库先设 `auto_vacuum` 再切 WAL，第二次启动不再执行 VACUUM；旧库仍做一次转换。
    - 没有会话关联时，判定器不订阅主机状态、不查库。
    - 回执清理每次只释放 1 页的问题已修。
    - 判定缓存只保留仍有关联的 pane。
  - 桌面：
    - Cmd+J 输入 `create` 时，第一条恢复为 Create Worktree；偏好恢复为「本地」后，点 GitHub 可以切回。
    - 右键菜单的「关联到任务…」只在库有项目时出现；设置分区移到工作流分组末尾。
    - 能力探测失败不再触发共享层的退避重订，改为沿用上游的 `hostContactEpoch`，等「主机回来了」再重订。
    - 没有项目的配对库只读 status，不开流；打开任务页或任务设置时才开流。
    - 订阅回调统一隔离异常，两个后台组件就近加错误边界。
    - Cmd+J 的空结果改为稳定引用；没有关联时不再收集输入。
  - 手机：
    - 会话页任务条只在有关联时出现；断线时保留内容并标「无法确认」，页头高度不变；横屏不占行。同一库的会话页共用一份订阅；没有项目时零请求。
    - 首页不再把重连、配对失效说成「Orca 未打开」，卡片只在有项目时显示，并去掉了重复读取。
    - 长按菜单的新项放到最后，且只在所属库有项目时出现。
    - 主机页按钮的明暗与相邻按钮一致，加载时不再挤动其他图标。
  - 撤回了一项：曾把上游任务列表改成切到「本地」时隐藏而不卸载，结果 GitHub Project 工具栏的全局 Cmd+F 监听会抢走本地任务页的 Cmd+F，所以恢复为卸载。上游在两个来源之间切换时本来也会卸载。
  - 设置页搜 `local`、`tasks` 时，「本地任务」排第一，这一点接受：分区标题本身含这两个词；而且在加入本地任务之前，搜 `tasks` 排第一的也不是上游的 Tasks 分区。
- 代码或文档变更：
  - `src/main/local-tasks/**`（新增 `local-task-pane-memory.ts`）、`src/shared/local-tasks/` 的状态类型与 schema；
  - `src/renderer/src/local-tasks/**`（新增 `local-task-app-store-subscription.ts`、`local-task-library-viewers.ts`）、`src/renderer/src/components/local-tasks/**`；
  - 接缝 `quick-actions.ts`、`settings-navigation-workflow-sections.ts`、`settings-page-renderer.tsx`；
  - `mobile/src/local-tasks/**`（新增 `local-task-session-library.ts`、`local-task-library-presence.ts`），接缝 `host-screen-overlays.tsx`。
- 验证证据：
  - 每条修复都有回归测试，多数已在修复前的代码上实测失败。
  - CI 静态分析各项都在本 worktree 目录下跑过。
  - 门禁结果在 `.docs/local-tasks-ui-validation/2026-10-30/existing-feature-fixes/gates/`。
- 未解决问题：
  - 旧版原生 App 搭配 fork 桌面时，有项目的用户每弹出一个页面，会残留一条订阅，直到连接断开；新版 App 正常退订。
  - 已关联的会话页首次打开时，终端仍可能多 refit 一次。
  - 别处建出第一个项目后，这台桌面要等重新联系或打开任务页时才会察觉。
  - 「任务功能自身」一类的问题（WSL 或 orcad 迁移后关联断开、大库超过 4 MiB 等）留到下一轮。
- 下一步：提 PR，跑完整 CI；全部通过后合入。

### 2026-10-29 修 PR #71 卡住 CI 的两条 ratchet

- 本轮目标：PR #71 的「static analysis and typecheck」停在「Enforce ratchets」：焦点读取 ratchet 和工作区记录读取 ratchet 各有超出。按上游「按拥有者路由」的规则改代码，不改基线、不加白名单；并在本机把 `pr.yml` 里 ratchet 之后的各步骤跑一遍。不提交、不推送。
- 完成内容：
  - 撤回上游接缝：`worktree-creation-agent-seeds.ts` 恢复原样（`resolveLaunchAgentTabId` 不再导出）。它的旧版兜底会读焦点服务器，导出后同文件的调用也被计数。
  - 「开始做」定位智能体 tab 改用 fork 的 `local-task-launch-agent-tab.ts`：顺序与上游相同，是否转成 `web-terminal-` 只看新工作区自己的执行主机。配对服务器加前缀；本机和本机直连的 SSH 主机不加。
  - 从 Orca 项目批量建任务项目：主机列表改按该项目的仓库行和已就绪 setup 列出，名字用 `selectExecutionHostDisplayLabel`，不再用会读焦点的 `useSidebarHostScopeOptions`。库默认放在本机（项目在本机或本机直连的 SSH 主机上时），否则放在目录顺序里第一台在联系、可写的配对服务器。
  - 关联维护和工作区判定的三处记录字段读取改走 `workspace-record-selectors.ts`，行为不变。
- 代码或文档变更：
  - 本功能：`local-task-launch-agent-tab.ts`（新）及测试、`local-task-start-work.ts` 及测试、`LocalTaskProjectCreator.tsx` 及测试、`LocalTaskLinkMaintenance.tsx`、`local-task-workspace-resolution.ts`、`local-task-project-recommendations.ts`（注释）、`local-task-background-services.test.tsx`（选择器 mock）；
  - 登记：`fork-features.jsonc` 删去该接缝及 `dependsOn` 里的这一项，补登两份测试；`architecture-policies.jsonc` 从 `fork-integration-scope`、`local-tasks-worktree-scope` 两份允许清单和依赖边界的例外里删去该文件；
  - 方案 §8.3、§17.2 与「切片 2 实现调整」同步。
- 验证证据：`.docs/local-tasks-ui-validation/2026-10-29/ci-ratchets/README.md`。
- 未解决问题：`local-tasks-worktree-scope` 只比较未提交的改动，撤回接缝在提交前会被它报为越界；提交后这处差异消失。本机按 `Fartown/main` 跑的是基准比较的规则，没有其他违规。
- 下一步：用户确认后提交并推送到 PR #71，看 CI 的静态检查和后续任务。

### 2026-10-29 修 PR #71 的 CI 检查并核对是否影响现有功能

- 本轮目标：PR #71 的 CI 在静态检查就失败，全量单元测试、打包、e2e 都没跑；修掉本功能引起的失败，并核对有没有改坏现有功能。
- 完成内容：
  - anti-slop 的 6 条：测试里的 `Reflect.get` 和宽泛的 `object` 参数、schema 里以 shape 命名的符号。
  - React Doctor 的 5 个错误：
    - 两处渲染期间写 ref，改为在 effect 里写；
    - 取数组末尾改用 `at(-1)`；
    - 两处被误判为「状态更新函数有副作用」：表单写入改由一个小 hook 提供，经 `write.` 调用。
  - 手机网页包：路由清单补上 `/local-tasks`，按规定逐前缀重测脚本数并更新表格。
  - 本机全量单元测试，失败逐个归因：除路由清单两项外，没有本功能引起的失败。
- 代码或文档变更：
  - 本功能 6 个文件；
  - `config/scripts/verify-mobile-web-app-bundle.mjs`（表格）、`config/scripts/mobile-web-app-session-dictation-capture.test.mjs`（清单），登记为接缝；
  - `mobile-session-continuation` 接缝里的表格末行同步为实测值。
- 验证证据：
  - 全量单元测试归因：`.docs/local-tasks-ui-validation/2026-10-29/full-unit/README.md`；
  - 网页包重测：`.docs/local-tasks-ui-validation/2026-10-29/mobile-bundle-sweep/`。
- 未解决问题：新路由让会话、评审、源代码管理、任务四个页面多切出 8 个脚本块，单条路由最大增量从 12 变为 15；按上游的资源上限公式，可容纳的路由数从 25 降到 23。用户选择接受重测值，上游打包测试的这两个固定值已改为 15 和「23 条 = 242、24 条超限」，并登记为接缝。
- 下一步：推送后等 CI 完整跑完；全绿才合入，先出包给用户测试。

### 2026-10-29 修复 PR #71 修复复核的三项发现

- 本轮目标：修 Codex 复核（`.docs/local-tasks-ui-validation/2026-10-29/codex-pr-review-verify/README.md`，28 项中 25 通过、2 未修好、1 未能验证）里的 N01～N03。不提交、不推送。
- 完成内容：
  - N01：库升到 v5，打开时把已有工作区关联、会话关联的主机标识统一成规范写法并重算身份键。统一后撞同一身份的关联只留最早一条，连带删掉它的会话和标记。项目「上次运行主机」的规范化也挪进这一步。
  - N03：手机网页的主机栈用的自定义 Navigator 没有包 `NavigationContent`，所以 `useIsFocused()` 在网页上永远是 false，会话页从来不算可见，一次确认都不会发；上一轮「被盖住不确认」是假通过。改用 `useFocusEffect` 维护可见。
  - N02：可见时间按当前会话分段，同一屏切换会话 tab 也算一次新的可见。
- 代码或文档变更：
  - `src/main/local-tasks/local-tasks-owned-host-migration.ts`（新）、`local-tasks-schema.ts`、`local-tasks-schema.test.ts`；
  - `mobile/src/local-tasks/use-local-task-session-acknowledge.ts` 及其测试；
  - 方案 §17.4 补上开发库去重策略。
- 验证证据：
  - N01：Codex 的落盘探针按 v5 改写后通过（`.docs/local-tasks-ui-validation/2026-10-29/backend-v5-fix/`）。
  - N03：在 Codex 的同一条真实手机网页路径上做了三次对照：修复前返回后 0 次确认；修复后被盖住期间 0 次、返回后 1 次，主机条目随之消失（`.docs/local-tasks-ui-validation/2026-10-29/mobile-ack-fix/`）。
  - 门禁结果在 `.docs/local-tasks-ui-validation/2026-10-29/fix-round2-gates/`。
- 未解决问题：
  - 原生手机没有实机验证。
  - 「服务器自己的 SSH 仓库」这种拓扑在现有 serve/orcad 上没能构造出来，只有测试覆盖。
  - 网页版 `useIsFocused()` 恒为 false 是上游主机栈的问题，可能也影响上游其他用到它的页面；本功能已绕开，没有改上游。
- 下一步：交原 Codex 对话复测 N01～N03；用户确认后提交并推送到 PR #71。

### 2026-10-29 修复 PR #71 三路评审的发现

- 本轮目标：修复 PR #71 三路评审（后端、桌面渲染层、手机；原文在 `.docs/local-tasks-ui-validation/2026-10-28/pr-review/`）确认的 4 个 P1 缺陷和全部行为类 P2，去掉重复实现和死代码；同步上游才会出现的问题写进方案 §17.6，本轮不改。不提交、不推送。
- 完成内容：
  - 后端：
    - `projects.update` 先校验完再写；写入层用 SAVEPOINT，业务结果失败时回滚，只保留回执。
    - 「做完一轮」的已看标记不再 30 天后被清掉。
    - 项目的上次运行主机必须是拥有者形式；主机标识统一写法后入库。
    - 同一 tab 有多个候选 pane 时不认领。
    - 删除 `tasks.get`、`tasks.search` 和其他死代码。
  - 桌面：
    - 三个弹窗按 Esc 只关自己。
    - 本机库和配对主机读失败时可以手动重试；配对主机不可用、只读、读失败各有提示，远端错误不再算到本机库头上。
    - 新建弹窗里的备注接在任务提示词后面；「继续创建」只有第一个工作区挂任务；新工作区不再先闪进「未关联任务」组；开工时的聊天会话结算后立即记录。
    - 「需要你」的按钮只对可写条目可用。
    - 分组切换复用上游组件。
    - 列表悬停不再滚动，折叠后光标落到可见行，时间显示不再让整张列表每分钟重渲染。
    - 写入冲突只刷新出错的端点。
    - 卡片的 PR 判定抽成上游纯函数，和规则 2 共用。
    - 同一条目只发一次「看过」；会话 chip 按 instanceId 加主机匹配工作区；迟到的更新回包不再把已删除任务加回来。
  - 手机：
    - 会话页被盖住或在后台时不确认「需要你」，只确认会话变为可见前已出现的条目。
    - 服务器自己的 SSH 仓库不再算进桌面库；服务器库上开工时，按仓库所在主机检测智能体。
    - 长按服务器工作区、任务条后备候选时，主机由服务器自己的工作区列表确定，查不到就不让关联，不再猜成 `local`。
    - 状态读取失败时显示读取失败。
    - 树形展开、层级工具、仓库补丁改用共享层。
    - 主机页接缝收成一行。
    - 撤掉导出上游首页卡片样式的接缝。
    - 删除死代码和没用到的文案。
    - 修好一个被任务条拖累、在导入阶段就失败的上游测试。
- 代码或文档变更：
  - 代码：`src/main/local-tasks/**`、`src/shared/local-tasks/**`（层级工具从 renderer 搬入，新增 `local-task-repos-patch.ts`）、`src/renderer/src/local-tasks/**`、`src/renderer/src/components/local-tasks/**`、`mobile/src/local-tasks/**`、RPC 参数目录、手机中转白名单。
  - 新增上游接缝：`SidebarGroupByToggle.tsx`、`use-worktree-card-review-details.ts`、`mobile/src/layout/host-sidebar-reveal.test.tsx`。
  - 撤掉的上游接缝：`mobile/src/home/MobileHomeTasksCard.tsx`。
  - 文档：方案 §17.5（补删除方法）和 §17.6（同步上游待办）。
- 验证证据：
  - 每条修复都有回归测试；后端的新测试确认过去掉修复会失败。
  - 12 项门禁 exit 0（`check:fork-docs` 在重新生成需求索引后重跑通过），功能检查 main/shared 89、renderer 908、mobile 103；结果在 `.docs/local-tasks-ui-validation/2026-10-28/pr-review-fix/gates/`。
  - 三路修复说明与后端证据在 `.docs/local-tasks-ui-validation/2026-10-28/pr-review-fix/`。
  - 本轮未启动应用。
- 未解决问题：
  - 列表虚拟化没做：侧栏的虚拟列表和它自己的行模型绑定，无法直接套用。
  - 会话自己的 pane 还没上报、分屏出来的 pane 先上报时，仍会认领到后者。
  - 规则 2 关闭期间合并的 PR 不记录，重新打开后会补算。
  - 暂缓的时间由客户端算、主机判，两边时钟偏差大时会被拒。
  - 方案 §17.6 列出的同步待办。
- 下一步：交原 Codex 对话复核；用户确认后提交并推送到 PR #71。

### 2026-10-28 修复 D-008 验证复核的发现

- 本轮目标：修复 Codex D-008 验证（`.docs/local-tasks-ui-validation/2026-10-28/codex-d008-verify/README.md`，36 条中 32 通过、1 不通过、3 未覆盖）的 V01～V03，并查清 TC-225。
- 完成内容：V01 已看与暂缓写入前用主机当前判定核对条目属于该会话，错配返回新失败码 `attention_item_mismatch`，会话已进入下一轮的旧条目成功但不写；V02 回复草稿区分「主机列着 / 无法确认 / 已确认不再等你」，失联时保留草稿、输入可用并显示上游离线提示，只有主机重新判定后条目确实消失才提示会话已继续；V03 需求概述与 REQ-001、006、011 的「只存桌面」旧说法改为按主机；TC-225 查明是上游网页版启动水合用主机保存的视图覆盖早点击（上游「自动化」入口同样复现），不是本功能问题，页面稳定后点击可正常进入本地任务。
- 代码或文档变更：`src/main/local-tasks/local-task-attention-monitor.ts`、`local-task-attention-store.ts`、`local-task-execution-service.ts`、`src/shared/local-tasks/local-task-attention-rules.ts`、共享失败码与两端文案；`src/renderer/src/local-tasks/local-task-needs-you-rows.ts`、`local-task-needs-you-actions.ts`、`components/local-tasks/LocalTaskReplyBox.tsx`、`LocalTaskNeedsYouItem.tsx`；需求文档。
- 验证证据：V01 错配、过期两条与 V02 三条回归修前失败、修后通过；11 项门禁 exit 0，功能检查 main/shared 79、renderer 890、mobile 99；架构门禁只剩 integration-builds 工作区范围规则（Codex 已在隔离副本证实还原该文件后通过）。结果在 `.docs/local-tasks-ui-validation/2026-10-28/verify-fix/`，TC-225 证据在 `.docs/local-tasks-ui-validation/2026-10-28/tc225-web-entry/`。
- 未解决问题：原生手机页面、orcad 正常退出后同库重启仍未实测；上游网页版早点击被启动水合覆盖的问题属于上游。
- 下一步：Codex 复测 V01、V02、TC-225、TC-228；之后按功能分提交。

### 2026-10-28 按 D-008 把任务库改成每台 Orca 的资源

- 本轮目标：按 D-008 改造：任务库和项目一样是每台 Orca 的资源，客户端走现有端点路由；需要你、会话认领在拥有会话的主机上；回复照上游一次发送；项目关联多仓库、层级不限、任意一层可挂工作区。不提交、不推送。
- 完成内容：后端让桌面、`orca serve`、SSH 主机上的 orcad 都启动任务服务；数据库升到 v4（项目与仓库多对多、层级不限与成环检查、子树移动与删除、任意层工作区）；主机侧认领与四类判定（「看过」存在库里）；删除快照发布、暂存回复与发送权；桌面经现有中转把手机的任务请求转给服务器。桌面渲染层按端点分区读写、客户端 id 带端点、主机标识换算、回复直接发送并复用上游离线提示；项目仓库设置、新建空项目并选主机、树形列表与折叠、看板路径、任意层开始做与「沿用上级工作区」、按任务所属端点判断可写、上游「已读」转发为看过；侧栏按任务分组归到最顶层任务；网页版不再特殊排除。手机按主机读写（含经桌面中转的服务器库）、回复照上游手机输入框、多仓库与树形层级、任意层开始做。
- 代码或文档变更：`src/main/local-tasks/**`、`src/shared/local-tasks/**`、`src/renderer/src/local-tasks/**`、`src/renderer/src/components/local-tasks/**`、`mobile/src/local-tasks/**`；新上游接缝 `src/main/runtime/runtime-rpc/runtime-rpc-websocket-dispatch.ts`（中转）；集成出包功能的 `src/main/integration-builds/orcad-fork-services.ts` 加 1 行登记 orcad 任务库（需单独提交，见下）；需求、方案 §17、D-008。
- 验证证据：11 项门禁 exit 0（`pnpm tc`、功能检查 main/shared 76、renderer 886、mobile 99、fork 两项、本地化三项、changed 代码质量、RPC 参数目录、runtime electron ratchet、手机 tsc）；架构门禁只剩 integration-builds 工作区范围规则（因 `orcad-fork-services.ts` 与本功能同在工作区未提交），按功能分提交后消除。结果与日志在 `.docs/local-tasks-ui-validation/2026-10-28/slice3/`。本轮未启动应用。
- 未解决问题：未做真机验证（本机、SSH orcad、配对服务器、手机经桌面中转）；开发库升 v4 会删除关联到 `runtime:` 主机的工作区与会话；主机重启后未再报告的会话显示「状态未知」而非「找不到」；手机任务页一次显示一个库（标题栏切换），桌面合并显示；手机树形展开与共享层重复，待切换；已删除文件 `mobile/src/local-tasks/local-task-host-memory.ts` 的删除已暂存到索引。
- 下一步：交 Codex 按 D-008 验证复核；提交时把 `orcad-fork-services.ts` 的登记拆成 `integration-builds` 范围的单独提交。

### 2026-10-27 修复复测发现的回复投递状态竞态（N01）

- 本轮目标：修复 Codex 复测（`.docs/local-tasks-ui-validation/2026-10-27/codex-slice2-reverify/README.md`）确认 9 项已修复后新发现的 N01（P1），并写明 N02 的适用范围。
- 完成内容：回复的发送所有权改由主进程判定：`replies.settle` 进入 sending 时记下认领的渲染层连接；只有认领者能写结果；认领者的文档被回收（重载、崩溃、关窗）时主进程把它名下仍在 sending 的回复标为 unconfirmed；打开任务库时遗留的 sending 一律标为 unconfirmed。删除渲染层「首次看到 sending 即标孤儿」的猜测。方案写明 schema v3 迁移有损，只适用于未发布的开发库。
- 代码或文档变更：`src/main/local-tasks/local-task-reply-store.ts`、新增 `local-task-reply-senders.ts`、`local-task-execution-service.ts`、`local-tasks-host-lifecycle.ts`、`src/main/runtime/rpc/methods/local-task-link-methods.ts`、`src/renderer/src/local-tasks/local-task-reply-delivery.ts`；方案「切片 2 实现调整」。
- 验证证据：5 条回归测试修前全部失败、修后通过；跨层复现（生产投递器 + 生产 RPC 处理 + 磁盘 SQLite + 真实连接回收）5 个场景通过，在 `.docs/local-tasks-ui-validation/2026-10-27/n01-fix/`；12 项门禁全部 exit 0，功能检查 main/shared 75、renderer 884、mobile 96。
- 未解决问题：旧式 `ssh:` relay 拓扑当前代码已不再建立，F04 在该拓扑无真机证据；复测未覆盖的阻塞类事件、真实结构化聊天 chip 与回退、原生手机页面（云机未能加载当前 JS）仍待补。
- 下一步：Codex 复测 N01；之后由用户决定提交。

### 2026-10-27 修复切片 2 验证复核的 10 项发现

- 本轮目标：按用户「修呗」修复 Codex 验证复核（`.docs/local-tasks-ui-validation/2026-10-27/codex-slice2-verify/README.md`）的 4 项 P1、6 项 P2；不提交、不推送。
- 完成内容：F01 回复投递加发送权，只有从 waiting/failed 真正进入 sending 的一次可发送；F02 手机关联已有工作区按执行主机读取在联系服务器的工作区目录；F03 任务带可选 `formerRefs`，共享搜索与 Cmd+J 认旧编号；F04 手机按执行主机换算会话 tab 标识，桌面认领兼容原始标识；F05 发送后结果写入失败时补写不重发，遗留 sending 标为未确认；F06 编号先规范化再匹配；F07 手机关闭后迟到的 ready 立即释放订阅；F08 按任务分组时隐藏不适用的「项目排序」；F09 schema 升到 3，旧开发库按实际结构补齐；F10 REQ-017 验收与概述改为回复「做完一轮」。
- 代码或文档变更：`src/main/local-tasks/**`、`src/shared/local-tasks/**`（新增 `local-task-session-tab-ids.ts`）、`src/renderer/src/local-tasks/**`、`cmd-j/local-task-quick-actions.ts`、`mobile/src/local-tasks/**`；上游接缝 `workspace-options-menu-items.tsx` 多 1 行并登记；需求 REQ-017、方案「切片 2 实现调整」补投递发送权、旧编号、会话标识、手机候选工作区四条。
- 验证证据：每条修复都有回归测试，且在修前代码上失败；12 项门禁全部 exit 0，功能检查 main/shared 72、renderer 885、mobile 96 个测试通过；结果与日志在 `.docs/local-tasks-ui-validation/2026-10-27/claude-slice2-fix/`。本轮未启动应用。
- 未解决问题：手机在 SSH relay（`ssh:`）主机上开会话的标识保持原样只有代码推断；验证复核中 20 条未覆盖完整的用例仍待补；开工前验证记录的同终端第二次 OSC 上报丢失已复现、原因未查。
- 下一步：Codex 复测本轮修复对应的 8 条不通过用例和手机 SSH 开会话链路。

### 2026-10-27 补齐切片 2 实现并收尾登记

- 本轮目标：按用户「你把代码写完」补齐切片 2（REQ-009～REQ-017 的切片 2 部分），整合后交给 Codex 验证复核；不提交、不推送。
- 完成内容：按 D-007 定下共享契约（关联、进展快照、暂存回复的类型与 RPC 参数、客户端容错读取）和桌面数据底座（调用、store、按 links/attention/replies 重读、主机联系判定）；后端关联、规则 1/2、进展快照、暂存回复与 `desktop_only` 判定；桌面开始做、开会话、认领与补全、进展显示、工作区卡片 chip、右键关联、终端与结构化聊天会话 chip、规则开关；需要你判定、快照发布、回复投递、需要你视图、侧栏数字与筛选；侧栏按任务分组（上游接缝 9 行）；手机切片 2。收尾修复：主机失联时「连接后发送」被拒（快照记住失联会话最后一条可回复条目）；`workspace_already_linked` 两义拆出 `task_has_workspace`；补登记 4 个接缝。
- 代码或文档变更：`src/shared/local-tasks/**`、`src/main/local-tasks/**`、`src/main/runtime/rpc/methods/local-task-link-methods.ts`、`src/renderer/src/local-tasks/**`、`src/renderer/src/components/local-tasks/**`、`mobile/src/local-tasks/**`；上游接缝见 `config/fork-features.jsonc`（新增卡片头、右键菜单、终端头、结构化聊天 4 处）；需求 REQ-011/012/015、方案 §7～§11 与「切片 2 实现调整」、D-007。
- 验证证据：12 项门禁全部 exit 0（`pnpm tc`、`verify:fork-features -- --feature local-tasks` 的 main/shared 70、renderer 877、mobile 88 个测试、fork 三项、架构、本地化三项、changed 代码质量、RPC 参数目录、runtime electron ratchet、手机 tsc），结果与日志在 `.docs/local-tasks-ui-validation/2026-10-26/slice2/evidence/`。本轮未启动应用，真机验证交给 Codex。
- 未解决问题：手机在本机/SSH 工作区直接写主机给的 paneKey 需实测；手机「关联已有工作区」不含配对服务器上的工作区；两个桌面窗口同时投递可能重复发送；按任务分组时菜单「项目排序」无效；有关联时列表行随 AppStore 更新重算，需看大量工作区的性能；开工前验证记录的两个上游问题未查。
- 下一步：Codex 按 `.docs/local-tasks-ui-validation/2026-10-27/claude-slice2/VERIFY-BRIEF.md` 验证复核，按结论修复后再决定提交。

### 2026-10-27 二次修复收尾与云真机回归

- 本轮目标：按用户「继续」完成当前工作区门禁收尾，并按用户明确要求使用云真机验证手机页面；保留所有已有实现，不提交、不推送、不合并。
- 完成内容：补齐当前模块依赖、接缝和架构登记；修复普通工作区创建因可选回调未传而跳过执行的回归；扩展已加载数据错误提示覆盖 links/attention/replies；补齐新增枚举、英文文案和组件规范。
- 代码或文档变更：功能自有 renderer/mobile 文件、既有工作区创建接缝、双语目录、config 登记；新增 TC-039。
- 验证证据：指定 12 项自动化均取得 exit 0，完整功能检查最新 945/945（main/shared 63、renderer 807、mobile 75）；指定自动化的首轮、并发失败轮与修后复测分别留档。最后重新构建的桌面 CDP、真实手机作用域 WS、实际 SSH 回归通过。Dora Realme Android 15 云真机原生 App 配对并加载桌面下发页，TC-026 断线保留/禁写/恢复、TC-027 移动后保存重试、TC-035 普通读取错误手动重试均通过；设备退出重入正常。证据统一在 .docs/local-tasks-ui-validation/2026-10-27/codex-fix2-closeout/README.md；源码、被测 APK 和手机包散列均留档。
- 未解决问题：旧版 native 的释放兼容以受控 direct/relay 测试覆盖；云机未能在保持 WS 连接时单独注入 stream end，由组件测试覆盖。不宣称切片 2 全部产品行为、Windows/Linux 实机或共享树跨轮原子快照验收完成。额外 task-leader 校验仍报告两份历史 Test Run 的结果表格式问题，未改写旧结论。
- 下一步：保持改动未提交供复审；设备测试 App 已卸载、云机已释放，专用桥/Metro/探针/ADB 连接、隐藏宿主 userData 和 SSH 强制命令夹具已清理，私密配对/OAuth 临时文件已删除。SSH 真实 HOME 13 路核对 12 路一致，仅持续运行的会话所写 ~/.claude.json 变化；用户主 Orca 未操作。后续补旧 native 和 stream end 的设备单项验证，上游同步及切片 2 另行处理。

### 2026-10-26 完成切片 1 三路评审复核与二次修复

- 本轮目标：保留上轮未提交改动，逐项核实和修复 P1/P2，落实 D-A/B/C，不提交推送、不进入切片 2。
- 完成内容：7 个 P1 均有独立旧实现 FAIL 与当前 PASS；修复后端写入/回执/枚举/订阅、桌面草稿/历史/键盘/折叠/读失败恢复、手机页面保留/释放/多主机记忆，并统一 shared 纯逻辑。

- 代码或文档变更：功能自有 main/shared/renderer/mobile local-tasks 路径；首页 Tasks 样式导出最小 seam 及登记；需求、方案、TC-025～TC-038、D-006。

- 验证证据：切片 1 完整功能回归最后一轮 920/920 通过；手机末次 D-C 恢复入口补充测试 17 文件/71 条通过；指定 12 项门禁分别有通过记录，文档字段已修复。Playwright CDP P1-4～P1-7 与 D-C、真实手机配对 WS D-A、实际 SSH 数据归属/断开无重连通过。23:40 后检测到本轮外并发切片 2 修改，23:43 完整工作树检查已有类型、RPC 与依赖登记失败，不将此前证据等同于当前树全绿；停止修改并保留并发工作。完整结果见 .docs/local-tasks-ui-validation/2026-10-26/codex-fix2/README.md。

- 未解决问题：手机原生页面未验收（simctl 不可用）；列表摘要拆分/桌面回执省略和精简暂未做；启动偏好闪上游需 Frame 门控；上游 hooks 预取、Esc 顺序、CmdJ 动作及隐藏来源设置按方案留档。切片 2 前需决定 WSL host 标识重写，并按新枚举提高 user_version。上游删除/路由移动及相邻行冲突只记录，本轮不处理同步。

- 下一步：本轮修复留工作区供复审；获得设备后补手机原生验收；切片 2 仍待单独授权。

### 2026-10-26 独立复核后修复切片 1 的失败恢复与数据边界

- 本轮目标：先提交已完成实现，再修复独立 review 确认的 R-01～R-07 与 D-01；不扩展切片 2。
- 完成内容：原实现已提交 6971551474b3a79d35e6efe7122e367121db7166（未推送）；本轮修复评论草稿串任务、旧编号前缀复用、多路读取错误丢失、手机多行子任务字段与部分保存恢复、项目批建部分成功、手机删除项目，并保留库生命周期的幂等回执。修复改动留在工作区，未提交。
- 代码或文档变更：`src/main/local-tasks/**`；桌面 local-tasks store/sync、任务页、评论和项目创建器；`mobile/src/local-tasks/**`；中英文本；登记新增回归测试；需求、方案及 TC-017～TC-024。补充 Enter/Space 对普通控件的例外，保持现有键盘行为。
- 验证证据：完整功能检查共 111 文件 / 886 测试通过（main/shared 35、renderer 799、mobile 52）；pnpm tc、mobile 应用 tsc、fork 与架构、本地化检查通过；新增测试类型断言已移除并复跑移动端 37 测试。全部最终门禁与日志索引见 .docs/local-tasks-ui-validation/2026-10-26/codex-fix/README.md；重新构建 packages 与 e2e；后台隐藏的本地隔离实例验证批建部分成功、中英读失败与手动恢复；真实 SSH 实例验证评论隔离、旧编号、1001 次后续写入及重启幂等、手机 WebSocket 删除和属性持久化、断线后无自主重连及远端无任务 DB。证据分别在 codex-fix/evidence/local、evidence/ssh；隔离进程、userData、SSH 强制命令夹具和临时 authorized_keys 行已清理。SSH 前后真实 HOME 13 路核对 12 路一致；~/.claude.json 哈希变化未能归因，未回滚，详见 evidence/ssh/real-home-after-audit.json。
- 未解决问题：手机原生页面未运行（本机仅 CLT，无 iOS Simulator/现成 Android 设备），已覆盖实际 WebSocket 与受控 React 测试；Windows/Linux 原生键盘与窗口行为未实测；REQ-009～REQ-016 切片 2 未实现；有会话的子任务换父任务时的工作区/会话归属仍需在该切片设计时明确；回执按库生命周期保留会线性增加占用；补充 mobile 测试全量 tsc 的 119 个既有失败文件无新增，本功能诊断为 0。task-leader 补充校验仍报两份历史 Test Run 缺少其要求的七列执行结果表，本轮未改写历史结论。
- 下一步：保持修复供评审；如继续切片 2，先闭合父子任务会话归属规则并处理开工前验证已记录的上游问题。

### 2026-10-26 登记功能并整理需求初稿

- 本轮目标：按 fork 流程登记 `local-tasks`，把产品方案 v4（含「需要你」）整理成需求文档初稿。
- 完成内容：从 `fork/integration` 切 `feat/local-tasks` 独立工作区；新建本目录的 journal 与需求文档（REQ-001～REQ-018，每条写明本机与 SSH 场景）；登记功能与工作区范围策略；放行文档目录；重新生成需求索引。
- 代码或文档变更：`docs/issue/本地任务管理/**`；`config/fork-features.jsonc`、`config/architecture-policies.jsonc`、`.gitignore`、`docs/issue/README.md`。
- 验证证据：`pnpm check:fork-docs`、`pnpm check:fork-features` 通过；`pnpm run check:architecture-policies -- --base Fartown/main` 通过（22 个策略集）。
- 未解决问题：需求 §8 的 5 个待确认问题。
- 下一步：写技术方案。

### 2026-10-26 写技术方案并按代码调研修订需求

- 本轮目标：按桌面接入点、数据与 RPC、远程与手机三路代码调研写技术方案初稿，并把调研发现的约束同步到需求。
- 完成内容：技术方案初稿覆盖机器归属、独立 SQLite 任务库、`localTasks.*` RPC 与变化推送、动态能力 `local-tasks.v1`、工作区与会话标识、桌面 11 个接入点、需要你的判定与回复、自动规则、手机端、35 处上游接缝和开工前 4 项验证。需求修订：REQ-009 弹窗不显示「已链接的工作」、分支名按用户前缀生成、文件夹项目只关联已有工作区；REQ-015 只有终端会话的「等你回答」和「做完一轮」能回复，「等你批准」只能打开会话；REQ-014 结构化聊天会话归入「等你回答」；REQ-004 删除时子任务一起删、已关联工作区的任务不能移项目；§8 写入 5 个问题的默认做法。
- 代码或文档变更：`docs/issue/本地任务管理/solutions/本地任务管理技术方案.md`（新增）；`docs/issue/本地任务管理/requirements/本地任务管理.md`；本 journal；`docs/issue/README.md`。
- 验证证据：三项 fork 门禁重跑通过；需求和方案里的 3 张 Mermaid 图用仓库自带的 mermaid 解析通过；本目录文档用 oxfmt 格式化。
- 未解决问题：需求 §8 的默认做法待用户确认；接缝 35 处比产品方案估的 11 处多，待用户认可；开工前 4 项验证未做。
- 下一步：用户收尾需求与方案；定稿后写测试用例，再开始切片 1 与验证探针。

### 2026-10-26 实现切片 1（任务库）并完成开工前验证

- 本轮目标：按方案实现切片 1：桌面任务库、`localTasks.*` 接口与推送、桌面任务页和设置、手机任务页；同时跑开工前 4 项验证。
- 完成内容：主进程独立 SQLite 任务库（编号、前缀与别名、状态类别、两层任务、评论与动态、回执去重、`expectedRevision` 冲突、新版本库只读打开、打不开时不影响启动）；`localTasks.*` 方法与 `subscribeChanges` 推送，只在桌面动态通告 `local-tasks.v1`；桌面任务页「本地」来源、列表与看板（分组、排序、筛选、批量、拖拽改状态）、详情、新建、键盘、Cmd+J、设置分区；手机 web 路由任务页、筛选、表单、设置、首页卡片与主机页入口。开工前验证：会话标识与重启找回成立，GitLab、OSC、Codex 三处结论已改进方案。真机验证发现 4 个界面问题（相对时间、草稿被覆盖、只读与不可用提示、搜旧编号排序），桌面和手机都已修复。
- 代码或文档变更：`src/main/local-tasks/**`、`src/shared/local-tasks/**`、`src/main/runtime/rpc/methods/local-tasks*.ts`、`src/main/startup/main-process-local-tasks.ts`、`src/renderer/src/local-tasks/**`、`src/renderer/src/components/local-tasks/**`、`src/renderer/src/components/cmd-j/local-task-quick-actions.ts`、`mobile/app/h/[hostId]/local-tasks*.tsx`、`mobile/src/local-tasks/**`；上游接缝 24 个文件、28 条登记（见 `config/fork-features.jsonc`）；本目录的方案、测试用例和两份测试记录。
- 验证证据：`pnpm tc`、三项本地化门禁、`verify:rpc-params-catalog`、`check:runtime-electron-ratchet`、`check:code-quality:changed -- fork/integration`、三项 fork 门禁全部通过；`pnpm verify:fork-features -- --feature local-tasks` 三组共 106 个测试文件通过；真机验证见[切片 1 真机验证](tests/runs/2026-10-26-切片1真机验证.md)（TC-001～TC-016：13 条通过，3 条部分覆盖，无不通过；4 个修复复测通过）与[开工前验证](tests/runs/2026-10-26-开工前验证.md)。
- 未解决问题：手机页面本身未在真机或模拟器上验证；Windows、Linux 的 Cmd+J 未覆盖；配对服务器重启后状态自行翻转、同一终端第二次 OSC 上报丢失是上游问题，切片 2 前先查原因。
- 下一步：用户决定是否提交；手机页面上真机验证；之后做切片 2。

### 2026-10-27 完整工作树深审问题修复与回归

- 本轮目标：修复完整需求 MR 深审确认的 F-01～F-07 和其遮蔽的创建结果、维护重试、会话归属问题；保留当前共享工作树中已有的切片 2 实现，重新取得当前代码证据。
- 完成内容：复核并保留已存在的后台挂载、回复转换、级联 scope、instance 归属与手机历史导航修复；补齐真实任务详情和对话框装配、列表进展、失败原文恢复、结构化启动真实结果与精确会话关联、维护写失败释放标记、resolveSession 的 tab 冲突检查、手机无智能体创建与联系门控。补齐仅有 ready SSH setup 的仓库目标适配，增加任务专用可选 composer 输入，并约束主机切换及同 ID 仓库的排序；早期真实 UI 禁用是夹具项目 ID 双前缀错误，不计为产品缺陷，修正脚本后最终构建的真实 SSH 创建通过。
- 代码或文档变更：`src/main/local-tasks/**`、`src/renderer/src/local-tasks/**`、`src/renderer/src/components/local-tasks/**`、`mobile/src/local-tasks/**` 与原生创建/启动 composer 的窄接缝；同步 fork 依赖、接缝、测试和架构白名单。需求 REQ-009～REQ-016 按实际代码与证据标记部分实现；方案记录最终实现边界；补 TC-110～TC-113，并修正 TC-101/TC-107 与 D-007 一致。
- 验证证据：本机隐藏 Electron 自然创建、自动关联/开始规则、删除后重新认领；真实手机配对 WebSocket 的失败重试与换父历史导航；真实 SSH 的离线边界与创建回归。后端实际 SQLite 定向 3 文件39项、手机19文件67项、新增 Mermaid 4图通过。原始日志、截图、逐项修复与最终完整门禁结果均归档在本机 `.docs/local-tasks-ui-validation/2026-10-27/codex-remediation/README.md` 和该目录 `evidence/`，不以旧快照通过代替当前树验收。
- 未解决问题：本轮未启动真实智能体，实际回复投递、真实 PR 合并、实际跨主机搬迁与 Windows/Linux 尚未验收；本机没有可用 simctl 或 adb 设备，原生手机页面未验收。桌面侧栏关联入口、工作区卡片和会话头部 chip 仍待实现；完整需求继续 implementing。真实 HOME 核对时 `.claude.json` 出现来源未确认的变化，保留证据且未回滚，不声明 HOME 全部零变化。
- 下一步：按修复报告复核当前工作树；继续补齐剩余入口和真实智能体/手机验收。未新增提交或推送，保留已有基线提交6971551474。
