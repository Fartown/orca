import { projectIssueTree } from '../../../../../shared/issues/hierarchy'
import type {
  ConversationSummary,
  IssueListFilter,
  IssueRouteExecutionHostId,
  IssueSummary
} from '../../../../../shared/issues/types'
import {
  issueConversationDisplayName,
  shouldShowIssueConversation,
  sortIssueConversations
} from '@/issues/issue-conversation-presentation'

export type IssueSidebarRow =
  | {
      kind: 'issue'
      key: string
      depth: 0 | 1 | 2
      issue: IssueSummary
      expanded: boolean
      contextOnly: boolean
      hasChildren: boolean
    }
  | {
      kind: 'conversation'
      key: string
      depth: 1 | 2 | 3
      conversation: ConversationSummary
      workspaceLabel: string
      unassigned: boolean
    }
  | {
      kind: 'unassigned'
      key: string
      count: number
      unresolvedCount: number
      expanded: boolean
    }

export function buildIssueRows(params: {
  issueIds: readonly string[]
  issuesById: Readonly<Record<string, IssueSummary>>
  conversationsById: Readonly<Record<string, ConversationSummary>>
  collapsedIssueIds: ReadonlySet<string>
  expandedUnassignedKeys: ReadonlySet<string>
  conversationTitles?: ReadonlyMap<string, string>
  conversationTitleExecutionHostScope?: IssueRouteExecutionHostId
  filter: IssueListFilter
  searchQuery: string
  unassignedKey: string
}): IssueSidebarRow[] {
  const query = params.searchQuery.trim().toLocaleLowerCase()
  const issues = params.issueIds
    .map((id) => params.issuesById[id])
    .filter((issue): issue is IssueSummary => Boolean(issue))
  const conversations = Object.values(params.conversationsById).filter(
    (conversation) =>
      conversation.issueId !== null ||
      shouldShowIssueConversation(
        conversation,
        params.conversationTitles,
        params.conversationTitleExecutionHostScope
      )
  )
  const matchingIssueIds = new Set(
    issues
      .filter((issue) =>
        issueMatches(
          issue,
          conversations,
          query,
          params.conversationTitles,
          params.conversationTitleExecutionHostScope
        )
      )
      .map((issue) => issue.id)
  )
  const rows: IssueSidebarRow[] = []
  for (const projected of projectIssueTree(issues)) {
    if (
      query &&
      !matchesIssueOrDescendant(projected.issue.id, projected, issues, matchingIssueIds)
    ) {
      continue
    }
    const expanded = !params.collapsedIssueIds.has(projected.issue.id)
    rows.push({
      kind: 'issue',
      key: `issue:${projected.issue.id}`,
      depth: projected.depth,
      issue: projected.issue,
      expanded,
      contextOnly: params.filter === 'needs-me' && projected.issue.ownUnresolvedCount === 0,
      hasChildren: projected.childIssueIds.length > 0
    })
    if (expanded) {
      const directConversations = sortIssueConversations(
        conversations.filter(
          (candidate) =>
            candidate.issueId === projected.issue.id &&
            conversationMatches(
              candidate,
              query,
              params.conversationTitles,
              params.conversationTitleExecutionHostScope
            )
        )
      )
      for (const conversation of directConversations) {
        rows.push({
          kind: 'conversation',
          key: `conversation:${conversation.id}`,
          depth: Math.min(projected.depth + 1, 3) as 1 | 2 | 3,
          conversation,
          workspaceLabel: conversation.workspaceSnapshot.name,
          unassigned: false
        })
      }
    }
  }

  const unassigned = conversations.filter(
    (conversation) =>
      conversation.issueId === null &&
      conversationMatches(
        conversation,
        query,
        params.conversationTitles,
        params.conversationTitleExecutionHostScope
      )
  )
  if (unassigned.length > 0) {
    const expanded = Boolean(query) || params.expandedUnassignedKeys.has(params.unassignedKey)
    rows.push({
      kind: 'unassigned',
      key: params.unassignedKey,
      count: unassigned.length,
      unresolvedCount: unassigned.reduce(
        (count, conversation) => count + conversation.unresolvedRoundCount,
        0
      ),
      expanded
    })
    if (expanded) {
      for (const conversation of sortIssueConversations(unassigned)) {
        rows.push({
          kind: 'conversation',
          key: `conversation:${conversation.id}`,
          depth: 1,
          conversation,
          workspaceLabel: conversation.workspaceSnapshot.name,
          unassigned: true
        })
      }
    }
  }
  return rows
}

function issueMatches(
  issue: IssueSummary,
  conversations: readonly ConversationSummary[],
  query: string,
  conversationTitles?: ReadonlyMap<string, string>,
  executionHostScope?: IssueRouteExecutionHostId
): boolean {
  if (!query) {
    return true
  }
  const title =
    issue.source.kind === 'local' ? (issue.localTitle ?? '') : issue.source.titleSnapshot
  const identifier = issue.source.kind === 'external' ? issue.source.identifier : ''
  return (
    title.toLocaleLowerCase().includes(query) ||
    identifier.toLocaleLowerCase().includes(query) ||
    conversations.some(
      (conversation) =>
        conversation.issueId === issue.id &&
        conversationMatches(conversation, query, conversationTitles, executionHostScope)
    )
  )
}

function conversationMatches(
  conversation: ConversationSummary,
  query: string,
  conversationTitles?: ReadonlyMap<string, string>,
  executionHostScope?: IssueRouteExecutionHostId
): boolean {
  return (
    !query ||
    issueConversationDisplayName(conversation, conversationTitles, null, executionHostScope)
      .toLocaleLowerCase()
      .includes(query)
  )
}

function matchesIssueOrDescendant(
  issueId: string,
  projected: ReturnType<typeof projectIssueTree<IssueSummary>>[number],
  issues: readonly IssueSummary[],
  matchingIds: ReadonlySet<string>
): boolean {
  if (matchingIds.has(issueId)) {
    return true
  }
  const descendants = new Set(projected.childIssueIds)
  let changed = true
  while (changed) {
    changed = false
    for (const issue of issues) {
      if (issue.parentId && descendants.has(issue.parentId) && !descendants.has(issue.id)) {
        descendants.add(issue.id)
        changed = true
      }
    }
  }
  return [...descendants].some((id) => matchingIds.has(id))
}
