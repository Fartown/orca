import { useMemo } from 'react'
import DashboardAgentRow from '@/components/dashboard/DashboardAgentRow'
import { useNow } from '@/components/dashboard/useNow'
import { buildPersistedConversationRow } from '@/issues/persisted-conversation-agent-row'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import { issueDomainStore } from '@/issues/issues-domain-store'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type {
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'
import WorktreeCardAgents from './WorktreeCardAgents'
import { useWorktreeAgentRows } from './useWorktreeAgentRows'

export function WorkspaceConversationRowsHost({
  worktreeId,
  route,
  agents: precomputedAgents,
  className
}: {
  worktreeId: string
  route: IssueRouteExecutionHostId
  agents?: DashboardAgentRowData[]
  className?: string
}): React.JSX.Element | null {
  const selectedAgents = useWorktreeAgentRows(worktreeId, precomputedAgents === undefined)
  const now = useNow(30_000) // 与 WorktreeCardAgents:192 同一档,避免两片行的相对时间各走各的
  const agents = precomputedAgents ?? selectedAgents
  const partition = useIssueDomainStore((state) => state.partitionsByRouteExecutionHostId[route])
  const conversations = useMemo(() => {
    if (!partition || (partition.status !== 'ready' && partition.status !== 'degraded')) {
      return []
    }
    return Object.values(partition.conversationsById).filter((conversation) =>
      conversationMatchesWorkspace(conversation.workspaceRef, worktreeId)
    )
  }, [partition, worktreeId])

  if (!partition || !['ready', 'degraded'].includes(partition.status)) {
    return <WorktreeCardAgents worktreeId={worktreeId} agents={agents} className={className} />
  }
  // 活着的 agent 行一律原样交给 WorktreeCardAgents —— 它带着 getAgentRowPrimaryText、
  // 状态点、模型、发送目标、lineage 那一整套。持久化 Conversation 只补 Orca 原来没有的那部分:
  // 没有活 pane 的会话。之前是「只要有 Conversation 就整段接管」,把活行也一起替掉了。
  const detached = selectDetachedConversations(conversations, agents)
  if (detached.length === 0) {
    return <WorktreeCardAgents worktreeId={worktreeId} agents={agents} className={className} />
  }
  return (
    <div className={className} data-workspace-conversation-rows="">
      <WorktreeCardAgents worktreeId={worktreeId} agents={agents} />
      <div className="space-y-0.5">
        {detached.map((conversation) => (
          <div key={conversation.id} data-conversation-id={conversation.id}>
            <DashboardAgentRow
              agent={buildPersistedConversationRow({
                conversation,
                worktreeId,
                fallbackTitle: detachedConversationLabel(conversation)
              })}
              now={now}
              onActivate={() =>
                openPersistentConversation(worktreeId, route, conversation, undefined)
              }
              onDismiss={() => undefined}
              // Why: 会话已经不在了,发送框不该假装可用 —— 给出禁用原因而不是静默失效
              sendTargetStatus="disabled"
              sendTargetDisabledReason="This Conversation has no running agent"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/** 没有活着的 agent 行与之对应的 Conversation —— 只有这些才需要补一行。 */
export function selectDetachedConversations<TAgent extends { paneKey: string }>(
  conversations: readonly ConversationSummary[],
  agents: readonly TAgent[]
): ConversationSummary[] {
  // 用 attachment 而不是 navigation:后者是可选的导航提示,快照里可能压根没有,
  // 于是活着的会话也会被判成 detached 而被补行接管 —— 回归测试就是这么抓到的。
  const livePaneKeys = new Set(agents.map((agent) => agent.paneKey))
  return conversations.filter((conversation) => {
    const paneKey =
      conversation.attachment.kind === 'attached' ? conversation.attachment.paneKey : null
    return !paneKey || !livePaneKeys.has(paneKey)
  })
}

/**
 * detached 之后 agent status 已经没了,getAgentRowPrimaryText 无从取值 ——
 * 这时只剩持久化的轮次预览能认出这是哪一件事,否则整列都是 agent 名。
 */
export function detachedConversationLabel(conversation: ConversationSummary): string {
  const named = conversation.title?.trim()
  if (named) {
    return named
  }
  const preview = conversation.latestRound?.userInput.text?.trim().replace(/\s+/g, ' ')
  return preview || conversation.agent
}

export function conversationMatchesWorkspace(
  workspaceRef:
    | { type: 'worktree'; worktreeId: string }
    | { type: 'folder'; folderWorkspaceId: string },
  worktreeId: string
): boolean {
  const visibleScope = parseWorkspaceKey(worktreeId)
  if (workspaceRef.type === 'worktree') {
    return (
      workspaceRef.worktreeId ===
      (visibleScope?.type === 'worktree' ? visibleScope.worktreeId : worktreeId)
    )
  }
  return (
    visibleScope?.type === 'folder' &&
    visibleScope.folderWorkspaceId === workspaceRef.folderWorkspaceId
  )
}

function openPersistentConversation(
  worktreeId: string,
  route: IssueRouteExecutionHostId,
  conversation: ConversationSummary,
  live: DashboardAgentRowData | undefined
): void {
  const paneKey = live?.paneKey ?? conversation.navigation?.paneKey
  const parsed = paneKey ? parsePaneKey(paneKey) : null
  if (paneKey && parsed) {
    activateAndRevealWorktree(worktreeId)
    activateTabAndFocusPane(parsed.tabId, parsed.leafId, {
      ackPaneKeyOnSuccess: paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
    return
  }
  if (conversation.issueId) {
    issueDomainStore.getState().setActiveIssueRoute({
      routeExecutionHostId: route,
      issueId: conversation.issueId
    })
  }
}
