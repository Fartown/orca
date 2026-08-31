# 方向二调研：对话挂在 issue 下 · 左侧按 Workspace / Issue 切换

2026-08-22 · 全部结论来自读源码，逐条给证据

## 一句话结论

**"对话"的持久身份不需要新造——Orca 已经有了，而且已经把「活的」和「可恢复的」两种对话接起来了。** 绑定这一半很便宜；**左侧切到 issue 模式很贵**，因为 `buildRows` 有 24 个位置参数且彻底以 worktree 为中心。两半应该分开做。

## 一、"对话"有两种，Orca 已经把它们接起来了

| 形态 | 是什么 | 身份 |
| --- | --- | --- |
| **挂在 terminal 的**（活的） | 一个 pane | `providerSession: { key: 'session_id'\|'conversation_id', id, transcriptPath? }`（`agent-session-resume.ts:24`） |
| **关掉了、右侧能恢复的** | `AiVaultSession` | `id = ${executionHostId}:${agent}:${sessionId}:${filePath}`（`session-list-results.ts:51`） |

**桥已经存在**：`src/renderer/src/components/right-sidebar/ai-vault-original-pane.ts`

- `findAiVaultSessionLiveState(state, session)` —— 给一个可恢复会话，返回它此刻的活状态，或 null
- `findOriginalAiVaultSessionPane(state, session)` —— 找到它的原始面板
- 匹配顺序（源码注释：*"Matches by provider session id first; falls back to a prompt match only when it is unambiguous"*）：
  1. `entry.providerSession?.id === session.sessionId`
  2. **仅当 `providerSession === undefined` 时**才用 prompt 匹配，且**只在唯一命中时采信**（`promptMatchedStates.length === 1`）

**含义**：用 `(executionHostId, agent, providerSessionId)` 作绑定键，**活面板与可恢复会话会自动指向同一条绑定**。

## 二、AiVaultSession 的规格

| | |
| --- | --- |
| 字段 | `id` · `executionHostId` · `agent` · `sessionId` · `title` · `cwd` · `branch` · `model` · `filePath` · `createdAt` / `updatedAt` / `modifiedAt` · `messageCount` · `totalTokens` · `previewMessages` · `firstUserPrompt` · `lastUserPrompt` |
| **覆盖 17 个 agent** | claude · codex · hermes · pi · omp · prime-agent · cursor · gemini · antigravity · rovo · copilot · opencode · grok · openclaw · devin · droid · kimi —— **远超 native-chat 的 5 个** |
| 已有视图维度 | `AiVaultScope = 'workspace' \| 'project' \| 'all'`；`AiVaultSort = 'updated' \| 'created'`；`AiVaultGroup = 'project' \| 'folder' \| 'agent'` |
| **没有用户元数据** | 纯扫描派生，无 pin / tag / label / note 字段 |

## 三、绑定：便宜

- **绑定键用 `(executionHostId, agent, providerSessionId)`**，**不要**用含 `filePath` 的复合 id——文件搬动 id 就变
- 需要一张 side table：`(host, agent, providerSessionId) → issueId`。因为 AiVaultSession 是扫描派生的，挂不上用户元数据，只能旁挂
- 结合方向一：issue 侧用 `WorkspaceLinkedItem` + `provider: 'orca'`

**这把技术方案 §3 的 `orcaSessionId` 大幅简化**：不必新造身份、不必设计四级续接判定，复用 `providerSessionId` + 已有的桥即可。

### 三个必须写明的边界

1. **一轮早期 `providerSession` 可能还没到** —— 那一刻解析不出身份，只能等（`providerSessionOnly` 事件正是来后补它的）
2. **scrape-only、无 provider session 的 agent 绑不上持久身份** —— prompt 匹配只是兜底，且要求唯一命中，不能当主路径
3. **AI Vault 是扫描派生**（`AI_VAULT_CACHE_TTL_MS = 60_000` 内存缓存），不是活注册表 —— 列表有延迟

## 四、左侧切到 issue 模式：贵

- 行类型 `Row = GroupHeaderRow | WorktreeRow | ImportedWorktreesCardRow | NewExternalWorktreesInboxRow | PendingCreationRow | FolderWorkspaceRow`（`worktree-list-groups.ts:146`）——**没有会话行**
- `buildRows`（`:998`）**24 个位置参数**：worktrees / repoMap / prCache / collapsedGroups / repoOrder / workspaceStatuses / projectOrderBy / lineageById / worktreeMap / nestLineage / settings / projectGroups / placeholderRepoIds / importedWorktreesByRepo / newExternalWorktreesInboxByRepo / pendingCreations / projectGrouping / folderWorkspaces / hostLabelById / defaultHostId / pinnedDisplayPolicy……**全部围绕 worktree / repo / project / folderWorkspace**

**所以 issue 模式不是给 `WorktreeGroupBy` 加第五个值**，而是一个**并行的行构建器**，产出不同的 `Row` 联合（Issue 行 + 会话行）。

**好消息**：渲染分派很薄——`render-row-item-rows.ts` 13 行、`renderable-rows.ts` 40 行，行组件与虚拟列表可复用。

## 五、右侧按 issue 分组：便宜

`AiVaultGroup` 加 `'issue'`：全仓 22 处消费点，含一个持久化校验器 `isAiVaultGroup`（`ai-vault-view-options-persistence.ts:52`）。这正好兑现方向二里"右侧侧边栏能按 issue 过滤和分类"。

## 建议：分两步，代价差一个数量级

| 步 | 内容 | 代价 | 立刻兑现什么 |
| --- | --- | --- | --- |
| **1** | 绑定（side table，键用 `host + agent + providerSessionId`）+ **右侧 Session History 加 issue 维度** | 小：一张表 + `AiVaultGroup` 加一个值 | 建完 issue 当天就能在干活的地方把这件事的对话收拢——这正是"归属的价值提前到事前"所需 |
| **2** | 左侧 issue 模式 | 大：并行行构建器 + 新 Row 类型 | 完整的"按事情组织" |

第 2 步不阻塞第 1 步。

## 与另外两个方向的合流

- **方向三**（Activity 换底）：Activity 的事件按 `paneKey` 索引，换成按 `providerSessionId` 索引后，**同一条对话的历史就能跨面板、跨恢复连起来**——这正是它 B1 问题的解药，而且不需要新造身份
- **方向一**（本地 issue）：issue 侧用 `WorkspaceLinkedItem + provider:'orca'`，对话侧用 side table 指过去，两边都不动既有类型的语义
