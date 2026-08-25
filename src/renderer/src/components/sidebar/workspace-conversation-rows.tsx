import { useMemo } from 'react'
import { AgentStateDot, type AgentDotState } from '@/components/AgentStateDot'
import { AgentIcon } from '@/lib/agent-catalog'
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
  const { unmappedAgents } = splitWorkspaceConversationOverlay(conversations, agents)
  if (conversations.length === 0) {
    return (
      <WorktreeCardAgents worktreeId={worktreeId} agents={unmappedAgents} className={className} />
    )
  }
  return (
    <div className={className} data-workspace-conversation-rows="">
      <div className="space-y-0.5">
        {conversations.map((conversation) => {
          const live = agents.find((agent) => agent.paneKey === conversation.navigation?.paneKey)
          return (
            <button
              key={conversation.id}
              type="button"
              data-conversation-id={conversation.id}
              data-attachment-state={conversation.attachment.kind}
              data-execution-state={conversation.executionState}
              className="flex h-7 w-full items-center gap-1.5 rounded-sm px-1.5 text-left text-xs text-muted-foreground worktree-agent-row-hover"
              onClick={() => openPersistentConversation(worktreeId, route, conversation, live)}
            >
              <AgentStateDot state={conversationDotState(conversation.executionState, live)} />
              <AgentIcon agent={conversation.agent} size={12} />
              <span className="min-w-0 flex-1 truncate text-worktree-sidebar-foreground">
                {conversation.title ?? conversation.agent}
              </span>
              {conversation.attachment.kind === 'detached' ? (
                <span className="text-[10px]">detached</span>
              ) : null}
              {conversation.unresolvedRoundCount > 0 ? (
                <span className="tabular-nums text-foreground">
                  {conversation.unresolvedRoundCount}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {unmappedAgents.length > 0 ? (
        <WorktreeCardAgents worktreeId={worktreeId} agents={unmappedAgents} />
      ) : null}
    </div>
  )
}

export function splitWorkspaceConversationOverlay<TAgent extends { paneKey: string }>(
  conversations: readonly ConversationSummary[],
  agents: readonly TAgent[]
): { unmappedAgents: TAgent[] } {
  const mappedPaneKeys = new Set(
    conversations.map((conversation) => conversation.navigation?.paneKey).filter(Boolean)
  )
  return { unmappedAgents: agents.filter((agent) => !mappedPaneKeys.has(agent.paneKey)) }
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

function conversationDotState(
  state: 'launching' | 'running' | 'waiting' | 'stopped' | 'failed',
  live: DashboardAgentRowData | undefined
): AgentDotState {
  if (live?.state === 'working') {
    return 'working'
  }
  if (live?.state === 'waiting' || live?.state === 'blocked') {
    return live.state
  }
  if (live?.state === 'done') {
    return 'done'
  }
  if (state === 'launching' || state === 'running') {
    return 'working'
  }
  if (state === 'waiting') {
    return 'waiting'
  }
  if (state === 'failed') {
    return 'failed'
  }
  return 'idle'
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
