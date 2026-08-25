import { ChevronRight, Circle, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parsePaneKey } from '../../../../../shared/stable-pane-id'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import { issueDomainStore } from '@/issues/issues-domain-store'
import type { IssueRouteExecutionHostId } from '../../../../../shared/issues/types'
import type { IssueSidebarRow } from './build-issue-rows'

export function IssueVirtualRow({
  row,
  route
}: {
  row: IssueSidebarRow
  route: IssueRouteExecutionHostId
}): React.JSX.Element {
  if (row.kind === 'unassigned') {
    return (
      <button
        type="button"
        className="flex h-7 w-full items-center gap-1.5 px-3 text-left text-xs text-muted-foreground hover:bg-worktree-sidebar-accent"
        onClick={() => issueDomainStore.getState().toggleCollapsedIssue(row.key)}
      >
        <ChevronRight className={cn('size-3 transition-transform', row.expanded && 'rotate-90')} />
        <span className="min-w-0 flex-1 truncate">Unassigned</span>
        <span className="tabular-nums">{row.count}</span>
        {row.unresolvedCount > 0 ? <Circle className="size-2 fill-current" /> : null}
      </button>
    )
  }
  if (row.kind === 'conversation') {
    return (
      <button
        type="button"
        data-conversation-id={row.conversation.id}
        data-attachment-state={row.conversation.attachment.kind}
        data-execution-state={row.conversation.executionState}
        className="flex h-7 w-full items-center gap-1.5 pr-2 text-left text-xs text-muted-foreground hover:bg-worktree-sidebar-accent hover:text-worktree-sidebar-accent-foreground"
        style={{ paddingLeft: `${12 + row.depth * 14}px` }}
        onClick={() => openConversation(row.conversation, route)}
      >
        <MessageSquare className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {row.conversation.title ?? row.conversation.agent}
        </span>
        <span className="max-w-20 truncate text-[10px]">{row.workspaceLabel}</span>
        {row.conversation.unresolvedRoundCount > 0 ? (
          <span className="tabular-nums text-foreground">
            {row.conversation.unresolvedRoundCount}
          </span>
        ) : null}
      </button>
    )
  }
  const title =
    row.issue.source.kind === 'local' ? row.issue.localTitle : row.issue.source.titleSnapshot
  return (
    <div
      data-issue-id={row.issue.id}
      className={cn(
        'group flex h-7 w-full items-center pr-2 text-xs hover:bg-worktree-sidebar-accent',
        row.contextOnly && 'opacity-60',
        row.issue.state === 'archived' && 'opacity-55'
      )}
      style={{ paddingLeft: `${8 + row.depth * 14}px` }}
    >
      <button
        type="button"
        className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={!row.hasChildren && row.issue.directConversationCount === 0}
        aria-label={row.expanded ? 'Collapse Issue' : 'Expand Issue'}
        onClick={() => issueDomainStore.getState().toggleCollapsedIssue(row.issue.id)}
      >
        <ChevronRight className={cn('size-3 transition-transform', row.expanded && 'rotate-90')} />
      </button>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        onClick={() =>
          issueDomainStore.getState().setActiveIssueRoute({
            routeExecutionHostId: route,
            issueId: row.issue.id
          })
        }
      >
        <span className="min-w-0 flex-1 truncate text-worktree-sidebar-foreground">{title}</span>
        {row.issue.ownUnresolvedCount > 0 ? (
          <span className="tabular-nums text-foreground">{row.issue.ownUnresolvedCount}</span>
        ) : row.issue.descendantAttentionCount > 0 ? (
          <span className="tabular-nums text-muted-foreground">
            +{row.issue.descendantAttentionCount}
          </span>
        ) : null}
      </button>
    </div>
  )
}

function openConversation(
  conversation: Extract<IssueSidebarRow, { kind: 'conversation' }>['conversation'],
  route: IssueRouteExecutionHostId
): void {
  const paneKey = conversation.navigation?.paneKey
  const parsed = paneKey ? parsePaneKey(paneKey) : null
  if (!paneKey || !parsed) {
    if (conversation.issueId) {
      issueDomainStore.getState().setActiveIssueRoute({
        routeExecutionHostId: route,
        issueId: conversation.issueId
      })
    }
    return
  }
  if (conversation.workspaceRef.type === 'worktree') {
    activateAndRevealWorktree(conversation.workspaceRef.worktreeId)
  } else {
    activateAndRevealFolderWorkspace(conversation.workspaceRef.folderWorkspaceId, {
      executionHostId: route
    })
  }
  activateTabAndFocusPane(parsed.tabId, parsed.leafId, {
    ackPaneKeyOnSuccess: paneKey,
    flashFocusedPane: true,
    scrollToBottomIfOutputSinceLastView: true
  })
}
