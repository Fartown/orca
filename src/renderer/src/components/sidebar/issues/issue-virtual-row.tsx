import { ChevronRight } from 'lucide-react'
import { useStore } from 'zustand'
import { IssueConversationRowContent } from '@/components/issues/IssueConversationRowContent'
import { ConversationIssueBindingPopover } from '@/components/issues/ConversationIssueBindingPopover'
import { activateMissingWorkspaceIssueConversation } from '@/issues/issue-conversation-navigation'
import { cn } from '@/lib/utils'
import { issueDomainStore } from '@/issues/issues-domain-store'
import type { IssueRouteExecutionHostId } from '../../../../../shared/issues/types'
import { SidebarCountBadge } from '../sidebar-count-badge'
import { SidebarHostBadge } from '../sidebar-host-badge'
import {
  SIDEBAR_NESTED_ROW_HOVER_CLASS,
  SIDEBAR_ROW_HOVER_CLASS,
  SIDEBAR_ROW_SURFACE_CLASS,
  sidebarRowSurfaceAttributes
} from '../sidebar-row-surface'
import {
  getWorktreeCardContentIndent,
  WORKTREE_SECTION_HEADER_PADDING_LEFT
} from '../worktree-list/rows/indentation'
import type { IssueSidebarRow } from './build-issue-rows'

export function getIssueRowContentIndent(depth: number): number {
  return (
    WORKTREE_SECTION_HEADER_PADDING_LEFT +
    getWorktreeCardContentIndent({ isGrouped: false, groupDepth: 0, lineageDepth: depth })
  )
}

export function IssueVirtualRow({
  row,
  route,
  hostLabel,
  sessionTitles
}: {
  row: IssueSidebarRow
  route: IssueRouteExecutionHostId
  /** 多主机同时有内容时才给,且只挂顶层行 —— 子行继承,挂满每一行是刷屏。 */
  hostLabel?: string
  /** 由侧栏统一解析后传下来:单行组件拿不到会话全集,逐行请求会打爆解析接口。 */
  sessionTitles?: ReadonlyMap<string, string>
}): React.JSX.Element {
  const activeIssueId = useStore(issueDomainStore, (state) => state.activeIssueRoute?.issueId)

  if (row.kind === 'unassigned') {
    return (
      <div className={cn(SIDEBAR_ROW_SURFACE_CLASS, SIDEBAR_ROW_HOVER_CLASS)}>
        <button
          type="button"
          className="flex h-7 w-full items-center gap-1.5 pr-2 text-left text-xs text-muted-foreground"
          style={{ paddingLeft: `${getIssueRowContentIndent(0)}px` }}
          aria-expanded={row.expanded}
          onClick={() => issueDomainStore.getState().toggleUnassigned(row.key)}
        >
          <ChevronRight
            className={cn('size-3 transition-transform', row.expanded && 'rotate-90')}
          />
          <span className="min-w-0 flex-1 truncate">Unassigned</span>
          {row.count > 0 ? (
            <SidebarCountBadge count={row.count} label={`${row.count} unassigned Conversations`} />
          ) : null}
          {row.unresolvedCount > 0 ? (
            <SidebarCountBadge
              count={row.unresolvedCount}
              label={`${row.unresolvedCount} needing attention`}
              tone="foreground"
            />
          ) : null}
          {hostLabel ? <SidebarHostBadge label={hostLabel} /> : null}
        </button>
      </div>
    )
  }

  if (row.kind === 'conversation') {
    return (
      <div
        data-conversation-id={row.conversation.id}
        data-attachment-state={row.conversation.attachment.kind}
        data-execution-state={row.conversation.executionState}
        className="group/issue-conversation ml-1 flex min-h-7 w-[calc(100%-0.25rem)] items-start rounded-lg pr-1"
        style={{ paddingLeft: `${getIssueRowContentIndent(row.depth)}px` }}
      >
        <IssueConversationRowContent
          conversation={row.conversation}
          route={route}
          sessionTitles={sessionTitles}
          onMissingWorkspaceRowActivate={() =>
            activateMissingWorkspaceIssueConversation(row.conversation, route)
          }
          fallbackClassName={cn('h-7 rounded-lg', SIDEBAR_NESTED_ROW_HOVER_CLASS)}
        />
        <ConversationIssueBindingPopover route={route} conversation={row.conversation} compact />
      </div>
    )
  }

  const title =
    row.issue.source.kind === 'local' ? row.issue.localTitle : row.issue.source.titleSnapshot
  const externalIdentifier = row.issue.source.kind === 'external' ? row.issue.source.identifier : ''
  const running = row.issue.runningConversationCount
  return (
    <div
      data-issue-id={row.issue.id}
      {...sidebarRowSurfaceAttributes(activeIssueId === row.issue.id)}
      className={cn(
        SIDEBAR_ROW_SURFACE_CLASS,
        activeIssueId === row.issue.id ? undefined : SIDEBAR_ROW_HOVER_CLASS,
        'flex h-7 w-[calc(100%-0.25rem)] items-center pr-2 text-xs',
        row.contextOnly && 'opacity-60',
        row.issue.state === 'archived' && 'opacity-55'
      )}
      style={{ paddingLeft: `${getIssueRowContentIndent(row.depth)}px` }}
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
        {externalIdentifier ? (
          <span className="shrink-0 truncate text-[10px] text-muted-foreground/80">
            {externalIdentifier}
          </span>
        ) : null}
        {running > 0 ? (
          <span className="shrink-0 text-[10px] text-muted-foreground/80">{running} live</span>
        ) : null}
        {/* 自身与后代是两个独立事实,不能二选一显示 —— 父行必须同时看得到 */}
        {row.issue.ownUnresolvedCount > 0 ? (
          <SidebarCountBadge
            count={row.issue.ownUnresolvedCount}
            label={`${row.issue.ownUnresolvedCount} needing attention here`}
            tone="foreground"
          />
        ) : null}
        {row.issue.descendantAttentionCount > 0 ? (
          <SidebarCountBadge
            count={row.issue.descendantAttentionCount}
            label={`${row.issue.descendantAttentionCount} needing attention in descendants`}
          />
        ) : null}
        {hostLabel && row.depth === 0 ? <SidebarHostBadge label={hostLabel} /> : null}
      </button>
    </div>
  )
}
