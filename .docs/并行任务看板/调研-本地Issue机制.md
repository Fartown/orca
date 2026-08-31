# 方向一调研：本地 issue 机制

2026-08-22 · 全部结论来自读源码，逐条给证据

## 一句话结论

**做本地 issue，最小可行路径不是"做成第五个 TaskProvider"，而是"给 `WorkspaceLinkedItem` 加一个 provider"。** 前者要动一个 13,572 行的组件和整条外部数据源链路；后者的核心改动只有**两处**：一个联合类型 + 一个归一化函数。

## 现有抽象：三层，全部现成

| 层 | 类型 | 回答什么 |
| --- | --- | --- |
| **绑定的是哪个工作项** | `WorkspaceLinkedItem`（`src/shared/worktree/types.ts:9`） | `{ provider: 'github'\|'gitlab'\|'linear'\|'jira', type: 'issue'\|'pr'\|'mr', number, title, url, linearIdentifier?, jiraIdentifier?, repoId? }` |
| **它来自哪个数据源** | `TaskSourceContext`（`src/shared/task-source-context.ts:29`） | `{ kind:'task-source', provider: TaskProvider, projectId, hostId: ExecutionHostId, projectHostSetupId?, repoId?, providerIdentity?, accountLabel? }` |
| **Tasks 页能接哪些源** | `TaskProvider`（`src/shared/task-providers.ts:1`） | `'github' \| 'gitlab' \| 'linear' \| 'jira'` |

Worktree 上同时挂着 `linkedWorkItem?: WorkspaceLinkedItem \| null` 与 `linkedTaskSourceContext?: TaskSourceContext \| null`（`worktree/types.ts:96-97`），都可空。

**注意 `TaskSourceContext` 自带 `hostId: ExecutionHostId`**——它和方向二、和主机归属用的是同一套坐标系，不是另一套。

### 关键：provider 枚举只有一处定义

`FolderWorkspaceLinkedTask = WorkspaceLinkedItem`（`folder-workspace-types.ts:47`）**是个别名**。往上追，`LinkedWorkItemSummary`（`new-workspace.ts:35`）、`WorkspaceSourceProvider`（`workspace-source.ts:12`）、`WorkspaceSourceLinkedItem` **全部派生自同一个 `WorkspaceLinkedItem`**。

所以看起来到处都是的 provider 枚举，**源头只有一个**。

## 唯一的必经收口点

`normalizeWorkspaceLinkedItem`（`src/shared/workspace-linked-item.ts:25`）：

```
provider 不在 github/gitlab/linear/jira 四者中  → 返回 null
type 不是 issue/pr/mr                          → 返回 null
number 非有限数 / title 空 / url 空             → 返回 null
```

`WorkspaceLinkedItemSchema`（`workspace-linked-item-schema.ts`）直接包它。

**含义**：落盘的 `provider: 'orca'` 会被**静默丢弃**——这既是必须改的地方，也是好消息：**只有这一处**。

## 两条路的代价

| | A · 做成第五个 TaskProvider | B · 只加一个 linked-item provider |
| --- | --- | --- |
| **核心改动** | `TaskProvider` 枚举 + **`TaskPage.tsx`（13,572 行，内含 20 处 provider 分支）** + main 进程的 provider 模块（`src/main/{github,gitlab,jira,linear}`）+ 设置页 `TaskSourceProviderCard` / `TasksPane` / `TaskSourceShowInTasksStep` | `WorkspaceLinkedItem.provider` 联合类型 **1 处** + `normalizeWorkspaceLinkedItem` **1 处** |
| **还要面对** | `canBrowseTasks = repos.some(isGitRepoKind)`——**无 Git 仓库时 Tasks 入口直接禁用**，与"folder workspace 零配置可用"冲突；`TaskSourceContext` 要 `projectId` / `providerIdentity` / `accountLabel`，本地 issue 全都没有 | 本地 issue **不进任何外部拉取路径** |
| **能得到** | 本地 issue 出现在 Tasks 页、与 GitHub/Jira 并列 | 能把 worktree / folder workspace / 会话绑到本地 issue，能显示、能改、能搜 |

### 为什么 B 可行：那 202 处 provider 硬编码根本不该被本地 issue 命中

全仓 `provider === '<四者之一>'` 共 **202 处**，分布：

| 文件 | 处数 | 是什么 |
| --- | --- | --- |
| `right-sidebar/ChecksPanel.tsx` | 30 | PR 检查 |
| `TaskPage.tsx` | 20 | 任务列表 |
| `store/slices/github.ts` | 15 | GitHub 数据拉取 |
| `lib/worktree-palette-task-url-match.ts` | 7 | URL 匹配 |
| 其余 | 各 ≤5 | 分散 |

**绝大多数是"从那个 provider 拉数据 / 渲染那个 provider 特有的东西"**。本地 issue 不匹配这些分支**正是想要的行为**，不是缺陷。

## 字段能不能凑齐：能，而且不别扭

| 字段 | 本地 issue 怎么给 |
| --- | --- |
| `provider` | 新增 `'orca'` |
| `type` | `'issue'` 直接可用 |
| `number` | 本地单调编号（#1、#2…）——**正好是"参考 GitHub"的心智**，用户原话要的就是这个 |
| `title` | 天然 |
| `url` | `orca://issue/<id>`——**`orca://` scheme 已经存在并在用**（`orca://pair?code=...`，见 `web-pairing.ts:26`、`AddRemoteHostFields.tsx:208`），不是硬凑 |

## 绑定入口：不必新造，已有三条不经 TaskPage 的路径

| 入口 | 位置 |
| --- | --- |
| 跳转面板里选工作项 | `WorktreeJumpPalette.tsx`（三处 `linkedWorkItem` 构造，含 Linear 预览） |
| 建 folder workspace 时带上 | `sidebar/folder-workspace-composer-submit.ts` / `-helpers.ts` |
| 侧边栏改元数据（粘 URL 绑定） | `sidebar/worktree-meta-updates.ts`，含 `parseExplicitGitHubIssueUrl` |

所以"绑一个 issue"的交互有现成形态可仿。

## 建议

**走 B**：本地 issue 作为 `WorkspaceLinkedItem` 的一个 provider，不进 Tasks 页的 provider 体系。

理由不只是省事：**Tasks 页的语义是"从外部系统拉任务过来"**，它的每个 provider 都要账号、项目、身份、网络。本地 issue 一样都没有，硬塞进去会让 `TaskSourceContext` 的必填字段全部变成假值。而 `WorkspaceLinkedItem` 的语义是"这个工作区/会话对应哪件事"——**本地 issue 天然就是这个**。

若以后确实想让本地 issue 也出现在 Tasks 页，那是一次独立的、增量的决定，不必现在承担。

## 仍未回答（要和方向二一起定）

1. **本地 issue 存在哪**——依赖主机模型的结论
2. **绑定的挂点**——现状是 worktree → item 且 **1:1**，而用户要 issue → **多个对话**。这是方向二的核心问题，也是 B 方案唯一没解决的
3. **本地 issue 的增删改查界面放哪**——Activity 换底后的那个页面？还是独立入口？
4. 与方向三的衔接——Activity 换底后，"事情"这一层正好由本地 issue 承载
