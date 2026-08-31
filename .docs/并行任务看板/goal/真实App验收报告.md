# 并行任务看板核心首版 · 真实 App 验收报告

## 结论

**PASS**。`tests/e2e/issues-journey.spec.ts` 在 `build:unpack` 生成的真实 Electron App
上完成 §12.2 的 16 步旅程；最终 canonical 运行 `1 passed (2.8m)`，没有 skip、重试或失败用例。

## 构建与运行环境

- 构建命令：`pnpm run build:unpack`
- 构建结果：成功；packaged daemon entry 与 bundled plugin resource 校验通过。
- 构建产物：`/Users/bytedance/dev/orca/dist/mac-arm64/Orca.app`
- 构建产物时间：`2026-08-25 12:15:44`（Asia/Hong_Kong）。
- Git 合并基线：`f3535c59`，包含 `origin/main=b6a24eca`，落后 0 个提交。
- 可执行文件：`/Users/bytedance/dev/orca/dist/mac-arm64/Orca.app/Contents/MacOS/Orca`
- 最终验收命令：
  `pnpm run ensure:electron-runtime && pnpm exec playwright test tests/e2e/issues-journey.spec.ts --config tests/playwright.config.ts --project electron-headless --workers=1`
- 最终结果：`1 passed (2.8m)`；测试本体约 2.6 分钟，退出码 0。
- Playwright 结果：`test-results/.last-run.json` 为 `status: passed`、`failedTests: []`。
- App 真实性：步骤 1 通过 Electron 主进程 CDP 读回 `app.isPackaged === true`。
- 隔离：每轮使用独立 `userDataDir`、HOME 和 profile；读回 Electron HOME 后校验未逃逸到开发者 HOME。
- 平台：macOS arm64，Electron 43.1.0，viewport 1440 × 960。
- 驱动方式：Electron `_electron.launch` + Playwright CDP；没有使用 computer-use 验证 Orca UI。
- 截图根目录：`/Users/bytedance/dev/orca/.docs/并行任务看板/goal/screenshots/`。

## §12.2 逐步验收

| 步骤 | 预期 | 实际 | CDP / DOM / 状态证据 | 截图 | 失败归因 |
| --- | --- | --- | --- | --- | --- |
| 1 | 启动隔离 profile 的真实打包 App。 | production `Orca.app` 启动，隔离 HOME/userData，测试 Git Project 与主 worktree 就绪。 | 主进程读回 `app.isPackaged=true`；renderer `workspaceSessionReady=true`；DOM 出现目标 `[data-worktree-id]`。 | [01-isolated-packaged-profile.png](./screenshots/01-isolated-packaged-profile.png) | 最终轮无失败。无签名本地包首次会等待 macOS Keychain UI，harness 以 Chromium 标准 `--use-mock-keychain` 解决，不改变 App 行为。 |
| 2 | 创建本地 Issue 与带 URL 的外部引用。 | 创建 `Journey root Issue` 和 GitHub `#4242` 外部引用；详情链接指向指定 URL；并经真实编辑 UI 验证 stale revision 提示与刷新后保存。 | `[data-issue-id]` 两行均存在；external link `href=https://example.test/issues/4242`；并发 RPC 先推进 record revision，旧详情 Save 显示 `changed before this mutation`，刷新后保存成功并读回 `recordRevision=2`。 | [02-local-and-external-issues.png](./screenshots/02-local-and-external-issues.png) | 最终轮无失败。 |
| 3 | 创建三级 Issue；第四级、自环、跨主机 parent 均被阻止。 | root → child → grandchild 成功；grandchild 的 Child 按钮禁用；自环和跨 authority parent RPC 拒绝，双方 `parentId` 回读未变。 | DOM `Child[disabled]` 且 title 为三级限制；自环返回 cycle/itself；跨 authority 返回不泄露存在性的 `issue_not_found`；local/SSH RPC 分别回读 `parentId=null`。 | [03-three-level-hierarchy.png](./screenshots/03-three-level-hierarchy.png) | 最终轮无失败；跨 authority 使用 non-leaking not-found，而非泄露另一棵树的 host mismatch。 |
| 4 | Issue 内从 worktree 启动并在可信 hook 后附着；launcher 失败同 ID retry；attached forget 拒绝，detach 后 forget 且 transcript 保留。 | 首个 Conversation 在 hook 后 attached 并生成 `runtime-preview` Round；通过真实设置产生不可解析的 Codex 启动参数，使现有 launcher 返回失败，产品经 `conversations.recordLaunchFailure` 落库后显示 Retry；恢复设置后 retry 复用原 `conversationId`。attached forget 被拒；detach 后 forget 删除 Orca facts且保留 transcript。 | RPC 读回 `launchFailure` 与已结算 claim，retry 前后 ID 相等；toast `Cannot forget: attached`；关闭 tab 后 `attachment.kind=detached`；delete 后 RPC 列表及 Issues/Workspaces 两侧 `[data-conversation-id]` 均为 0，磁盘 transcript 仍存在。 | [04-retry-and-forget.png](./screenshots/04-retry-and-forget.png) | 最终轮无失败；截图中已无被 forget 的失败 Conversation 幽灵行。 |
| 5 | folder Workspace 普通启动只在首个可信 hook 后物化未归属 Conversation；无 hook terminal 不增加持久行。 | folder Workspace 的 Golden Stub hook 物化一条未归属 Conversation；随后创建普通 terminal，只新增 tab、不新增 Conversation。 | hook `worktreeId=folder:<id>`；RPC 读回 `workspaceRef.type=folder`、`issueId=null`；普通 terminal 前后 Conversation count 相等，tab DOM count +1。 | [05-folder-hook-materialization.png](./screenshots/05-folder-hook-materialization.png) | 真实测试发现并修复普通宿主 launch token 查无 Issue claim 时被错误忽略的问题；已消费/退休 token 仍严格拒绝。 |
| 6 | Workspaces 与 Issues 两侧展示同一 Conversation ID、标题、状态和计数。 | 在真实 Rename Conversation 对话框保存 `Journey shared title`；两侧 normalized row 使用同一 ID、同一新标题与相同 execution state，无 pane/status 重复行。 | `conversations.update` 后 RPC 读回新标题；Issues `[data-conversation-id=<id>]` 与 Workspaces `[data-workspace-conversation-rows] [data-conversation-id=<id>]` 同时包含 `Journey shared title`，两侧 `data-execution-state` 相同。 | [06-shared-conversation-row.png](./screenshots/06-shared-conversation-row.png) | 最终轮无失败。 |
| 7 | bind、rebind、unbind 不改变 Workspace；跨主机和 stale revision 失败后原 `issueId` 不变。 | 未归属 Conversation 绑定 root、改绑 external、再解绑；Workspace ref 始终不变。旧 revision 与 SSH Issue ID 均被拒绝，失败后仍保持 external `issueId`。 | DOM Bind/Unbind 动作真实点击；RPC 逐次读回 `issueId`；stale 返回 `changed before this mutation`；跨 authority 返回 `issue_not_found`；最终 `issueId=null`、`workspaceRef` 与初值相等。 | [07-bind-rebind-unbind.png](./screenshots/07-bind-rebind-unbind.png) | 最终轮无失败。 |
| 8 | 关闭 pane 后 Conversation 仍存在且 detached。 | 真实 tab X 与 Stop Agent 确认完成；Conversation 未删除，Issues 和 Workspaces 两侧均显示 detached。 | tab DOM 消失；RPC 同 ID `attachment.kind=detached`；独立 runtime revision 使 DB facts revision 未变化时仍刷新 overlay，两侧行均有 `data-attachment-state=detached`。 | [08-detached-persists.png](./screenshots/08-detached-persists.png) | 前一轮真实 App 暴露 facts-only not-modified 留住 attached DOM；加入 runtime revision 后最终轮通过。 |
| 9 | 在原 folder Workspace Resume，复用原 `conversationId` 与 provider identity。 | Session History 选择原 UUID session 并点击 Resume；同一 Conversation 重新 attached，没有新增 ID；最新 DB provider identity 仍等于所选历史 session。 | `[data-ai-vault-session-id=<uuid>]` 与 `ai-vault-session-resume` 真点击；前后 Conversation ID 集合相同；RPC/DB 读回同 ID、同 provider session；未出现 fresh-session banner。 | [09-resume-same-conversation.png](./screenshots/09-resume-same-conversation.png) | 最终轮无失败。测试数据改用真实 Codex UUID session，安全 provenance guard 因而能验证 transcript 来源。 |
| 10 | 在另一 worktree Workspace Continue，产生新 provider session 与新 `conversationId`。 | 切换主 worktree，在同一历史 session 上点击 Continue，确认对话框并 Start New Session；生成新的未归属 Conversation。 | `Continue in New Session` dialog 与 `Start New Session` 真点击；RPC 读回 workspace 为目标 worktree；新 Conversation ID 与旧 ID 不同，DB provider session ID 也不同。 | [10-continue-new-conversation.png](./screenshots/10-continue-new-conversation.png) | 最终轮无失败。 |
| 11 | 重启 App 后 Issue、Conversation、Round、read/resolve 持久。 | 先 Mark read，验证 `resolvedAt` 仍为 null；再 Mark handled。关闭并重新 launch 同一 production App/profile 后，全部实体与时间戳保持，同一 Conversation 的 Runtime Attachment 也从可信 hook evidence 恢复为 attached。 | DOM 真点击 Mark read/handled；中间 RPC 证明 read/resolve 独立；重启前后均以同一 `conversationId` 严格等待 `attachment.kind=attached`；重启后 `issues.list`、`conversations.list`、`issues.listRounds` 读回原 ID，`readAt/resolvedAt` 与重启前完全相同。 | [11-restart-persistence.png](./screenshots/11-restart-persistence.png) | 最终轮无失败。 |
| 12 | 切换 profile 后互不可见；Project copy 不复制 Issue facts。 | 创建 B/C profile；A→B copy 成功。切到 B 并重启 App 后，Project 存在但 Issue 列表为空，A 的标题不在 DOM。 | `orcaProfiles.transferProject(mode=copy)` 返回 `transferred`；B profile `repos.length>0`；B 的 `issues.list=[]`，DOM 不含 A Issue。 | [12-profile-isolation.png](./screenshots/12-profile-isolation.png) | 最终轮无失败。 |
| 13 | 区分 runtime unsupported、hook degraded、DB unavailable、route offline，且动作不同。 | degraded RPC 明确为 storage ready/hook disabled，Issue CRUD 仍可用；损坏 DB profile 仍能读 status、Create 禁用；模拟 runtime transport 经真实兼容性探测、capability probe、IssueRuntimeClient 与 SyncGate 分别产生 unsupported 与 offline。 | degraded Create enabled、unavailable Create disabled；Legacy transport 的 `status.get` 不含 `orca-issues.v1`，DOM 显示 `This Orca host version does not support Issues.`；Offline transport 先声明 capability、再由 `issues.status` 返回失败，DOM 显示 `Offline runtime is unreachable`。 | [13a-hook-degraded.png](./screenshots/13a-hook-degraded.png) · [13b-unavailable-unsupported-offline.png](./screenshots/13b-unavailable-unsupported-offline.png) | 最终轮无失败；没有直接写 Issue normalized store。 |
| 14 | copy 不复制；有 Conversation 时 move 阻断；forget 后 guard 解除并可 move。 | 在 B 调 A→C move，先返回 `issue_project_move_blocked`；切回 A 后对重启恢复出的 attached Conversation 真实关闭 tab、点击 Stop Agent 并等待 detached，再逐条 prepare/delete；最后从 B 执行 A→C move 成功。 | profile IPC/CDP 返回值依次为 rejection 与 `transferred`；关闭后 RPC 读回同 ID `attachment.kind=detached`；每个 forget 均先读回 blockers 为空、preflight token 与 record revision，再 commit；最终 A `conversations.list=[]`。 | [14-project-move-guard.png](./screenshots/14-project-move-guard.png) | 最终轮无失败。 |
| 15 | 全部主机视图展示 local/SSH/runtime 独立树、profile label；authority 改变清旧 cache。 | B profile 同时显示 Local Mac、Journey SSH、Journey Runtime 三棵树及各自 profile label；模拟 runtime transport 从 authority A 切换到 B，真实 SyncGate 下一轮只显示 generation B。 | 三个独立 `role=region`；local/SSH 通过真实 RPC 创建；runtime 的 `issues.status/list` 依次返回两代 authority，IssueRuntimeClient 校验 route，normalized reducer 清空旧 generation；DOM 断言 B 可见、A 不可见。 | [15-all-host-authority-trees.png](./screenshots/15-all-host-authority-trees.png) | 最终轮无失败；未使用离线 cache、写队列或直接 store 注入。 |
| 16 | Activity、Dashboard、通知和移动端没有新增 Issue 行为。 | 打开既有 Activity 与 Agent Dashboard，两个表面均没有 Issue/Conversation projection；桌面 DOM 没有 Issue notification 或 Mobile Issues 入口。 | Activity `Filter...` 与 Dashboard `dialog[name=Agents]` 均真实可见；其内部 `[data-issue-id],[data-conversation-id]` count 为 0；`Issue notification|Mobile Issues` count 为 0。 | [16a-activity-without-issues.png](./screenshots/16a-activity-without-issues.png) · [16b-dashboard-without-issues.png](./screenshots/16b-dashboard-without-issues.png) | 最终轮无失败；只验证未新增行为，没有替换 Activity/Dashboard 数据源。 |

## 最终截图核验

- 共 18 个 PNG，全部真实存在、非空、可解码，尺寸均为 1440 × 960。
- 最终 canonical 运行的截图时间为 2026-08-25 12:16:33–12:18:57（Asia/Hong_Kong）。
- 报告中的每个链接均相对本报告目录指向 `./screenshots/` 下的真实文件。

| 步骤 1 · 隔离打包 App | 步骤 2 · 本地与外部 Issue |
| --- | --- |
| ![步骤 1：隔离 profile 的真实打包 App](./screenshots/01-isolated-packaged-profile.png) | ![步骤 2：本地 Issue 与外部引用](./screenshots/02-local-and-external-issues.png) |

| 步骤 3 · 三级层级 | 步骤 4 · Retry 与 Forget |
| --- | --- |
| ![步骤 3：三级 Issue hierarchy](./screenshots/03-three-level-hierarchy.png) | ![步骤 4：失败 Retry 与 Forget](./screenshots/04-retry-and-forget.png) |

| 步骤 5 · Folder hook 物化 | 步骤 6 · 两侧同一 Conversation |
| --- | --- |
| ![步骤 5：Folder Workspace 可信 hook 物化](./screenshots/05-folder-hook-materialization.png) | ![步骤 6：Workspaces 与 Issues 同一 Conversation](./screenshots/06-shared-conversation-row.png) |

| 步骤 7 · Bind / Rebind / Unbind | 步骤 8 · Detached 仍持久 |
| --- | --- |
| ![步骤 7：绑定、改绑与解绑](./screenshots/07-bind-rebind-unbind.png) | ![步骤 8：关闭 pane 后持久行仍在](./screenshots/08-detached-persists.png) |

| 步骤 9 · Resume 同一 Conversation | 步骤 10 · Continue 新 Conversation |
| --- | --- |
| ![步骤 9：原 Workspace Resume](./screenshots/09-resume-same-conversation.png) | ![步骤 10：另一 Workspace Continue](./screenshots/10-continue-new-conversation.png) |

| 步骤 11 · 重启持久与 Attachment 恢复 | 步骤 12 · Profile 隔离 |
| --- | --- |
| ![步骤 11：重启后事实持久且 Runtime Attachment 恢复](./screenshots/11-restart-persistence.png) | ![步骤 12：Profile facts 互不可见](./screenshots/12-profile-isolation.png) |

| 步骤 13a · Hook degraded | 步骤 13b · Unavailable / Unsupported / Offline |
| --- | --- |
| ![步骤 13a：Hook degraded 但 CRUD 可用](./screenshots/13a-hook-degraded.png) | ![步骤 13b：Unavailable、Unsupported 与 Offline 可区分](./screenshots/13b-unavailable-unsupported-offline.png) |

| 步骤 14 · Project Move Guard | 步骤 15 · 多 Authority 独立树 |
| --- | --- |
| ![步骤 14：Forget 后 Project move guard 解除](./screenshots/14-project-move-guard.png) | ![步骤 15：Local、SSH、Runtime 独立 authority tree](./screenshots/15-all-host-authority-trees.png) |

| 步骤 16a · Activity 无 Issue 投影 | 步骤 16b · Dashboard 无 Issue 投影 |
| --- | --- |
| ![步骤 16a：Activity 未接入 Issue](./screenshots/16a-activity-without-issues.png) | ![步骤 16b：Agent Dashboard 未接入 Issue](./screenshots/16b-dashboard-without-issues.png) |

## 迭代失败归因与修复

最终 canonical 运行没有失败。真实 App 测试迭代中发现并关闭了以下问题；均保留或增强状态断言，
没有通过 skip、延长业务等待、删断言或放宽产品语义换绿：

1. **macOS 未签名本地包 Keychain 阻塞**：主线程 sample 定位到 `SecItemAdd` 等待授权；E2E 启动使用
   Chromium 标准 mock keychain。正式普通启动不受影响。
2. **pane teardown 未 detach**：hook server 的 alias 清理先移除 snapshot，后续 pane clear 不再 fan-out。
   Issue bootstrap 现在通过公开 status-change tap，以 status/provider/current-authority 证据集合对账 attachment；
   没有修改 PTY 或 hook server 热点。
3. **folder 普通启动不物化**：普通宿主启动也携带 launch token；ingestor 曾把任意 token 都当 Issue claim。
   现在仅 `claim_not_found` 回落到 ordinary trusted identity；invalid/expired/ambiguous 与已消费/退休 token
   仍拒绝。
4. **degraded 原因丢失**：分页 reducer 保留 degraded status 却清空 reason；现已在 snapshot 与
   not-modified 合并中保留 readiness error。
5. **测试 harness 导航与时序**：Issue detail leaf 不随 Sidebar root mode 自动关闭、Radix selector、
   15 秒 bounded poll、production 包不暴露 pane manager 等均改为真实用户导航、稳定 DOM 属性和
   authoritative RPC 回读；未改变产品断言。
6. **Codex fake session provenance**：非 UUID 测试 ID 被安全 guard 正确拒绝；stub 改用真实 UUID，
   Resume 继续断言最新 identity 等于用户选择的历史 session。
7. **launcher 失败只抛错、不写回**：补齐带 mutation receipt 的 `conversations.recordLaunchFailure`；
   renderer 只在 prepare 成功后调用 launcher，失败时原子结算 claim 并保存有界诊断，Retry 因而成为真实产品路径。
8. **forget 后 normalized entity 未裁剪**：完整 authority snapshot 结束时按 canonical ID 集合裁剪；
   最终步骤 4 同时断言 RPC、Issues DOM 与 Workspaces DOM 均不存在被删 ID。
9. **runtime overlay 被 facts-only not-modified 遮蔽**：Runtime Attachment 使用独立内存 revision；
   start/continue 同时校验 facts 与 runtime revision，pane detach 不再错误保留 attached DOM，也不推进持久 DB revision。
10. **旧编译产物进入发布包**：`build:cli` 在 TypeScript emit 前清理 `out/shared/issues`，避免已从源码
    删除的 digest/mobile/cache/notification 模块被增量输出和 `app.asar.unpacked` 继续携带。
11. **重启后 Runtime Attachment 未由持久证据重建**：bootstrap 现在只在 status、provider identity 与
    hydrated/current authority evidence 同时匹配且 DB 已有该 identity 时恢复 attachment；不会从 replay
    evidence 新建 Conversation。最终轮在步骤 11 重启前后均严格断言同一 ID 为 attached。
12. **关闭确认框标题竞态与清理顺序**：tab 标题可能在点击关闭后变化，harness 改为按确认框中的稳定
    `Stop Agent` 动作定位；步骤 14 对重启恢复出的 attached Conversation 先真实 detach，再执行 forget，
    没有绕过产品 guard。

非阻断环境提示：构建 CLI 时当前账号无权创建 `/usr/local/bin/orca-dev` 软链；CLI build、App 打包和
E2E 均继续成功。本机没有 Developer ID Application，因此 unpacked App 未签名；不影响本地 CDP 验收。
