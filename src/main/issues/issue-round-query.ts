import type { z } from 'zod'
import type { IssuesListRoundsParams } from '../../shared/issues/query-rpc-schemas'
import type { RoundRecordPage } from '../../shared/issues/types'
import type { IssueAuthorityRoute } from './issue-authority-route'
import { issueAuthorityDescriptor } from './issue-authority-route'
import { getIssueHostRevisions } from './issue-host-state'
import {
  decodeIssueQueryCursor,
  issueQueryScopeHash,
  type IssueQueryCursor
} from './issue-query-cursor'
import { sliceIssueSnapshotPage } from './issue-list-snapshot'
import { toRoundPreview } from './issue-query-projections'
import type { IssueRepository } from './issue-repository'

type RoundListParams = z.infer<typeof IssuesListRoundsParams>

export function listIssueRoundPage(params: {
  repository: IssueRepository
  route: IssueAuthorityRoute
  query: RoundListParams
  profileLabel?: string
}): RoundRecordPage {
  const revisions = routeRevisions(params.repository, params.route)
  const authority = issueAuthorityDescriptor(
    params.repository.database,
    params.route,
    params.profileLabel
  )
  if (
    params.query.mode === 'start' &&
    params.query.sinceFactsRevision !== undefined &&
    params.query.sinceFactsRevision === revisions.factsRevision
  ) {
    return { status: 'not-modified', authority, factsRevision: revisions.factsRevision }
  }
  if (
    params.query.mode === 'continue' &&
    params.query.snapshotFactsRevision !== revisions.factsRevision
  ) {
    return { status: 'stale', authority, factsRevision: revisions.factsRevision }
  }
  const cursorBase = {
    kind: 'rounds' as const,
    scopeHash: issueQueryScopeHash([params.route.hostPartitionKey, params.query.scope]),
    factsRevision: revisions.factsRevision
  }
  const offset =
    params.query.mode === 'continue'
      ? decodeIssueQueryCursor(params.query.cursor, cursorBase).offset
      : 0
  const scope = params.query.scope
  const conversationIds =
    scope.kind === 'conversation'
      ? new Set([scope.conversationId])
      : new Set(
          params.repository.conversations
            .list()
            .filter((conversation) => conversation.issueId === scope.issueId)
            .map((conversation) => conversation.id)
        )
  const records = [...conversationIds]
    .flatMap((conversationId) => params.repository.rounds.list(conversationId))
    .sort((left, right) => left.occurredAt - right.occurredAt || left.id.localeCompare(right.id))
    .map(toRoundPreview)
  const page = sliceIssueSnapshotPage({
    records,
    offset,
    limit: params.query.limit,
    cursor: cursorBase as Omit<IssueQueryCursor, 'offset'>
  })
  return {
    status: 'snapshot-page',
    authority,
    snapshotFactsRevision: revisions.factsRevision,
    rounds: page.records,
    nextCursor: page.nextCursor
  }
}

function routeRevisions(repository: IssueRepository, route: IssueAuthorityRoute) {
  const existing = repository.database
    .prepare('SELECT 1 FROM issue_host_state WHERE host_partition_key = ?')
    .get(route.hostPartitionKey)
  return existing
    ? getIssueHostRevisions(repository.database, route.hostPartitionKey)
    : { factsRevision: 0, treeRevision: 0 }
}
