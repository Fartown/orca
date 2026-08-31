import { useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import WorktreeCardAgents from '@/components/sidebar/WorktreeCardAgents'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { Badge } from '@/components/ui/badge'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { issueDomainStore } from '@/issues/issues-domain-store'
import {
  NATIVE_AGENT_ROW_CLASS,
  NATIVE_AGENT_ROW_SEND_TARGET_ATTRIBUTE
} from '@/issues/native-agent-row-selectors'
import { issueConversationDisplayName } from '@/issues/issue-conversation-presentation'
import { useAppStore } from '@/store'
import {
  agentProviderSessionsEqual,
  type AgentProviderSessionMetadata
} from '../../../../shared/agent-session-resume'
import type { AgentType } from '../../../../shared/agent-status-types'
import type {
  ConversationSummary,
  IssueRouteExecutionHostId
} from '../../../../shared/issues/types'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

export function IssueConversationRowContent({
  conversation,
  route,
  sessionTitles,
  onMissingWorkspaceRowActivate,
  className,
  fallbackClassName
}: {
  conversation: ConversationSummary
  route: IssueRouteExecutionHostId
  sessionTitles?: ReadonlyMap<string, string>
  onMissingWorkspaceRowActivate: () => Promise<unknown>
  className?: string
  fallbackClassName?: string
}): React.JSX.Element {
  const workspaceKey =
    conversation.workspaceRef.type === 'worktree'
      ? conversation.workspaceRef.worktreeId
      : folderWorkspaceKey(conversation.workspaceRef.folderWorkspaceId)
  const providerSession = conversation.navigation?.providerSession ?? null
  const attachedPaneKey =
    conversation.attachment.kind === 'attached' ? conversation.attachment.paneKey : null
  const workspaceExecutionHostId = useAppStore((state) =>
    getExecutionHostIdForWorktree(state, workspaceKey)
  )
  const canMatchWorkspaceRow = providerSession !== null && workspaceExecutionHostId === route
  const workspaceRows = useWorktreeAgentRows(workspaceKey, canMatchWorkspaceRow)
  const attachedRows = useMemo(
    () =>
      providerSession
        ? selectIssueConversationWorkspaceRows(
            workspaceRows,
            conversation.agent,
            providerSession,
            attachedPaneKey
          )
        : [],
    [attachedPaneKey, conversation.agent, providerSession, workspaceRows]
  )
  const [pending, setPending] = useState(false)

  if (attachedRows.length > 0) {
    return (
      <div
        className="min-w-0 flex-1"
        data-testid="issue-conversation-workspace-row"
        onClickCapture={handleNativeWorkspaceRowClickCapture}
      >
        <WorktreeCardAgents
          worktreeId={workspaceKey}
          agents={attachedRows}
          className={cn('!mt-0 min-w-0 flex-1', className)}
        />
      </div>
    )
  }

  const displayName = issueConversationDisplayName(conversation, sessionTitles, null, route)
  const primary = displayName || getAgentLabel(conversation.agent)
  const accessibleLabel = [
    primary,
    getAgentLabel(conversation.agent),
    conversation.workspaceSnapshot.name
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ')
  const resumeLabel = translate(
    'auto.components.issues.IssueConversationRowContent.resume',
    'Resume'
  )

  const activate = async (): Promise<void> => {
    if (pending) {
      return
    }
    setPending(true)
    try {
      await onMissingWorkspaceRowActivate()
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      className={cn('flex min-w-0 flex-1 items-center text-left', fallbackClassName)}
      title={resumeLabel}
      aria-label={`${resumeLabel} · ${accessibleLabel}`}
      disabled={pending}
      aria-busy={pending}
      onClick={() => void activate()}
      data-testid="issue-conversation-primary-action"
    >
      <span className={cn('flex min-w-0 flex-1 items-center gap-1.5 text-xs', className)}>
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
          <AgentIcon agent={conversation.agent} size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate text-foreground">{primary}</span>
        <span className="max-w-24 shrink truncate text-muted-foreground">
          {conversation.workspaceSnapshot.name}
        </span>
        {conversation.unresolvedRoundCount > 0 ? (
          <Badge
            variant="outline"
            className="h-4 min-w-4 px-1 text-[9px] leading-none"
            aria-label={`${conversation.unresolvedRoundCount} unresolved rounds`}
          >
            {conversation.unresolvedRoundCount}
          </Badge>
        ) : null}
        <Play className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      </span>
    </button>
  )
}

export function selectIssueConversationWorkspaceRows(
  rows: readonly DashboardAgentRow[],
  agent: AgentType,
  providerSession: AgentProviderSessionMetadata,
  paneKey: string | null
): DashboardAgentRow[] {
  const matchingRows = rows.filter(
    (row) =>
      row.rowSource !== 'retained' &&
      row.agentType === agent &&
      agentProviderSessionsEqual(agent, row.entry.providerSession, providerSession)
  )
  const root =
    (paneKey ? matchingRows.find((row) => row.paneKey === paneKey) : undefined) ?? matchingRows[0]
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

function handleNativeWorkspaceRowClickCapture(event: React.MouseEvent<HTMLDivElement>): void {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }
  const row = target.closest<HTMLElement>(`.${NATIVE_AGENT_ROW_CLASS}`)
  if (
    !row ||
    row.hasAttribute(NATIVE_AGENT_ROW_SEND_TARGET_ATTRIBUTE) ||
    target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')
  ) {
    return
  }
  // Why: defer past the native row's bubble handler so routing away cannot unmount it before tab activation.
  setTimeout(() => issueDomainStore.getState().setActiveIssueRoute(null), 0)
}
