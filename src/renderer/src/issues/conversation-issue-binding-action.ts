import type {
  ConversationSummary,
  IssueListFilter,
  IssueRouteExecutionHostId
} from '../../../shared/issues/types'
import { refreshConversationPages, refreshIssuePages } from './IssueDomainSyncGate'
import { issueDomainStore } from './issues-domain-store'
import { IssueRuntimeClient } from './issue-runtime-client'

export async function loadActiveIssueBindingOptions(
  route: IssueRouteExecutionHostId
): Promise<void> {
  const sequenceRef = { current: 1 }
  await refreshIssuePages(
    IssueRuntimeClient.forRoute(route),
    route,
    'all',
    sequenceRef.current,
    sequenceRef
  )
}

export async function updateConversationIssueBinding(args: {
  route: IssueRouteExecutionHostId
  conversation: ConversationSummary
  issueId: string | null
}): Promise<void> {
  const client = IssueRuntimeClient.forRoute(args.route)
  await client.mutate('conversations.bindIssue', {
    mutationId: crypto.randomUUID(),
    conversationId: args.conversation.id,
    issueId: args.issueId,
    expectedRecordRevision: args.conversation.recordRevision
  })
  await refreshBindingProjection(client, args.route).catch((error) => {
    console.warn('[issues] binding saved but projection refresh failed', error)
  })
}

async function refreshBindingProjection(
  client: Pick<IssueRuntimeClient, 'listIssues' | 'listConversations'>,
  route: IssueRouteExecutionHostId
): Promise<void> {
  const filter = issueDomainStore.getState().filter
  const filters = uniqueFilters(['all', filter])
  await Promise.all([
    refreshConversationPages(client, route, 1, { current: 1 }),
    ...filters.map((candidate) => refreshIssuePages(client, route, candidate, 1, { current: 1 }))
  ])
}

function uniqueFilters(filters: readonly IssueListFilter[]): IssueListFilter[] {
  return [...new Set(filters)]
}
