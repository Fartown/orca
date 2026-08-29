import { useCallback, useMemo } from 'react'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { ConversationIssueBindingPopover } from '@/components/issues/ConversationIssueBindingPopover'
import { useIssueDomainStore } from '@/issues/use-issue-domain-store'
import type {
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import WorktreeCardAgents from './WorktreeCardAgents'

export function WorkspaceConversationBindingRows({
  worktreeId,
  route,
  agents,
  className
}: {
  worktreeId: string
  route: IssueRouteExecutionHostId
  agents?: DashboardAgentRowData[]
  className?: string
}): React.JSX.Element | null {
  const partition = useIssueDomainStore((state) => state.partitionsByRouteExecutionHostId[route])
  const conversationsByPaneKey = useMemo(() => {
    const mapped = new Map<string, ConversationSummary>()
    if (!partition || (partition.status !== 'ready' && partition.status !== 'degraded')) {
      return mapped
    }
    for (const conversation of Object.values(partition.conversationsById)) {
      if (
        conversation.attachment.kind !== 'attached' ||
        !conversationMatchesWorkspace(conversation, worktreeId)
      ) {
        continue
      }
      const previous = mapped.get(conversation.attachment.paneKey)
      if (!previous || previous.updatedAt < conversation.updatedAt) {
        mapped.set(conversation.attachment.paneKey, conversation)
      }
    }
    return mapped
  }, [partition, worktreeId])
  const renderTrailingAction = useCallback(
    (agent: DashboardAgentRowData) => {
      const conversation = conversationsByPaneKey.get(agent.paneKey)
      return conversation ? (
        <ConversationIssueBindingPopover route={route} conversation={conversation} compact />
      ) : null
    },
    [conversationsByPaneKey, route]
  )

  return (
    <WorktreeCardAgents
      worktreeId={worktreeId}
      executionHostId={route}
      agents={agents}
      renderTrailingAction={renderTrailingAction}
      className={className}
    />
  )
}

export function conversationMatchesWorkspace(
  conversation: Pick<ConversationSummary, 'workspaceRef'>,
  worktreeId: string
): boolean {
  const visibleScope = parseWorkspaceKey(worktreeId)
  if (conversation.workspaceRef.type === 'worktree') {
    return (
      conversation.workspaceRef.worktreeId ===
      (visibleScope?.type === 'worktree' ? visibleScope.worktreeId : worktreeId)
    )
  }
  return (
    visibleScope?.type === 'folder' &&
    visibleScope.folderWorkspaceId === conversation.workspaceRef.folderWorkspaceId
  )
}
