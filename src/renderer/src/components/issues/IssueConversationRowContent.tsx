import { useMemo } from 'react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import WorktreeCardAgents from '@/components/sidebar/WorktreeCardAgents'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { Badge } from '@/components/ui/badge'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import { issueDomainStore } from '@/issues/issues-domain-store'
import {
  canRetryIssueConversation,
  issueConversationDisplayName,
  issueConversationStatus
} from '@/issues/issue-conversation-presentation'
import type {
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import type { AiVaultOriginalPaneTarget } from '@/components/right-sidebar/ai-vault-original-pane'

export function IssueConversationRowContent({
  conversation,
  route,
  sessionTitles,
  originalPaneTarget,
  onMissingWorkspaceRowActivate,
  className,
  fallbackClassName
}: {
  conversation: ConversationSummary
  route: IssueRouteExecutionHostId
  sessionTitles?: ReadonlyMap<string, string>
  originalPaneTarget: AiVaultOriginalPaneTarget | null
  onMissingWorkspaceRowActivate: () => void
  className?: string
  fallbackClassName?: string
}): React.JSX.Element {
  const projectedWorkspaceKey =
    conversation.workspaceRef.type === 'worktree'
      ? conversation.workspaceRef.worktreeId
      : folderWorkspaceKey(conversation.workspaceRef.folderWorkspaceId)
  const workspaceKey = originalPaneTarget?.worktreeId ?? projectedWorkspaceKey
  const attachedPaneKey =
    conversation.attachment.kind === 'attached' ? conversation.attachment.paneKey : null
  const resolvedPaneKey = originalPaneTarget?.paneKey ?? attachedPaneKey
  const canMatchWorkspaceRow = resolvedPaneKey !== null
  const workspaceRows = useWorktreeAgentRows(workspaceKey, canMatchWorkspaceRow)
  const attachedRows = useMemo(
    () => selectIssueConversationWorkspaceRows(workspaceRows, resolvedPaneKey),
    [resolvedPaneKey, workspaceRows]
  )

  if (attachedRows.length > 0) {
    return (
      <WorktreeCardAgents
        worktreeId={workspaceKey}
        executionHostId={route}
        onAgentActivate={() => issueDomainStore.getState().setActiveIssueRoute(null)}
        onRetainedAgentActivate={onMissingWorkspaceRowActivate}
        agents={attachedRows}
        className={cn('!mt-0 min-w-0 flex-1', className)}
      />
    )
  }

  const projectedStatus = issueConversationStatus(conversation)
  const status =
    projectedStatus.label === 'Failed' ||
    (projectedStatus.label === 'Starting' && conversation.attachment.kind === 'detached')
      ? projectedStatus
      : { dotState: 'idle' as const, label: null }
  const displayName = issueConversationDisplayName(conversation, sessionTitles, null, route)
  const primary =
    displayName ||
    (canRetryIssueConversation(conversation)
      ? `${getAgentLabel(conversation.agent)} launch failed`
      : 'Untitled Conversation')
  const accessibleLabel = [
    primary,
    getAgentLabel(conversation.agent),
    conversation.workspaceSnapshot.name,
    status.label
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ')

  return (
    <button
      type="button"
      className={cn('flex min-w-0 flex-1 items-center text-left', fallbackClassName)}
      title={accessibleLabel}
      onClick={onMissingWorkspaceRowActivate}
      data-testid="issue-conversation-primary-action"
    >
      <span className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-xs', className)}>
        {status.label ? <AgentStateDot state={status.dotState} /> : null}
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
          <AgentIcon agent={conversation.agent} size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground">{primary}</span>
        <span className="max-w-24 shrink truncate text-muted-foreground">
          {conversation.workspaceSnapshot.name}
        </span>
        {status.label ? (
          <span className="shrink-0 text-muted-foreground">{status.label}</span>
        ) : null}
        {conversation.unresolvedRoundCount > 0 ? (
          <Badge
            variant="outline"
            className="h-4 min-w-4 px-1 text-[9px] leading-none"
            aria-label={`${conversation.unresolvedRoundCount} unresolved rounds`}
          >
            {conversation.unresolvedRoundCount}
          </Badge>
        ) : null}
      </span>
    </button>
  )
}

export function selectIssueConversationWorkspaceRows(
  rows: readonly DashboardAgentRow[],
  paneKey: string | null
): DashboardAgentRow[] {
  const root = paneKey ? rows.find((row) => row.paneKey === paneKey) : undefined
  if (!root) {
    return []
  }

  const { childrenByParentPaneKey } = buildAgentRowLineageTree(rows)
  const branch: DashboardAgentRow[] = []
  const visited = new Set<string>()
  const appendBranch = (row: DashboardAgentRow): void => {
    if (visited.has(row.paneKey)) {
      return
    }
    visited.add(row.paneKey)
    branch.push(row)
    for (const child of childrenByParentPaneKey.get(row.paneKey) ?? []) {
      appendBranch(child)
    }
  }
  appendBranch(root)
  return branch
}
