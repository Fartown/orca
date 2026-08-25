import type { IssueMutationIdentity, IssueRecord } from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { bumpIssueHostRevisions, getIssueHostRevisions } from './issue-host-state'
import { executeIssueMutation } from './issue-mutation-receipt'
import { requireIssueRecord } from './issue-record-queries'
import { IssueRepositoryError } from './issue-repository-error'

export type IssueLifecycleMutationResult = {
  issue: IssueRecord
  resolvedCompletionIds: string[]
  factsRevision: number
  treeRevision: number
}

export class IssueLifecycleRepository {
  constructor(
    private readonly database: IssueDatabase,
    private readonly isRuntimeWaiting: (conversationId: string) => boolean = () => false
  ) {}

  archive(params: {
    identity: IssueMutationIdentity
    input: { id: string; expectedRecordRevision: number }
  }): IssueLifecycleMutationResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'issues.archive',
      payload: params.input,
      operation: () => this.archiveWithinTransaction(params.input)
    })
  }

  reopen(params: {
    identity: IssueMutationIdentity
    input: { id: string; expectedRecordRevision: number }
  }): IssueLifecycleMutationResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'issues.reopen',
      payload: params.input,
      operation: () => this.reopenWithinTransaction(params.input)
    })
  }

  private archiveWithinTransaction(input: {
    id: string
    expectedRecordRevision: number
  }): IssueLifecycleMutationResult {
    const issue = requireIssueRecord(this.database, input.id)
    assertRecordRevision(issue, input.expectedRecordRevision)
    const revisions = getIssueHostRevisions(this.database, issue.hostPartitionKey)
    if (issue.state === 'archived') {
      return { issue, resolvedCompletionIds: [], ...revisions }
    }
    const waiting = this.database
      .prepare(
        `SELECT round.id AS roundId, conversation.id AS conversationId
         FROM conversations conversation
         LEFT JOIN round_records round
           ON round.conversation_id = conversation.id
          AND round.kind = 'waiting' AND round.resolved_at IS NULL
         WHERE conversation.issue_id = ?`
      )
      .all(issue.id) as { roundId: string | null; conversationId: string }[]
    const blockers = waiting.filter(
      (row) => row.roundId !== null || this.isRuntimeWaiting(row.conversationId)
    )
    if (blockers.length > 0) {
      throw new IssueRepositoryError(
        'issue_archive_blocked',
        `Issue ${issue.id} still has waiting Conversations.`,
        { blockers }
      )
    }

    const completionIds = (
      this.database
        .prepare(
          `SELECT round.id FROM round_records round
           JOIN conversations conversation ON conversation.id = round.conversation_id
           WHERE conversation.issue_id = ? AND round.kind = 'completion'
             AND round.resolved_at IS NULL
           ORDER BY round.occurred_at, round.id`
        )
        .all(issue.id) as { id: string }[]
    ).map((row) => row.id)
    const now = Date.now()
    const resolve = this.database.prepare(
      `UPDATE round_records SET resolved_at = ?, resolution = 'archive'
       WHERE id = ? AND resolved_at IS NULL`
    )
    for (const id of completionIds) {
      resolve.run(now, id)
    }
    const update = this.database
      .prepare(
        `UPDATE issues SET state = 'archived', archived_at = ?,
           record_revision = record_revision + 1, updated_at = ?
         WHERE id = ? AND record_revision = ?`
      )
      .run(now, now, issue.id, input.expectedRecordRevision)
    if (update.changes !== 1) {
      throw staleIssue(requireIssueRecord(this.database, issue.id))
    }
    const next = bumpIssueHostRevisions(this.database, issue.hostPartitionKey, { tree: false }, now)
    return {
      issue: requireIssueRecord(this.database, issue.id),
      resolvedCompletionIds: completionIds,
      ...next
    }
  }

  private reopenWithinTransaction(input: {
    id: string
    expectedRecordRevision: number
  }): IssueLifecycleMutationResult {
    const issue = requireIssueRecord(this.database, input.id)
    assertRecordRevision(issue, input.expectedRecordRevision)
    const revisions = getIssueHostRevisions(this.database, issue.hostPartitionKey)
    if (issue.state === 'active') {
      return { issue, resolvedCompletionIds: [], ...revisions }
    }
    const now = Date.now()
    const update = this.database
      .prepare(
        `UPDATE issues SET state = 'active', archived_at = NULL,
           record_revision = record_revision + 1, updated_at = ?
         WHERE id = ? AND record_revision = ?`
      )
      .run(now, issue.id, input.expectedRecordRevision)
    if (update.changes !== 1) {
      throw staleIssue(requireIssueRecord(this.database, issue.id))
    }
    const next = bumpIssueHostRevisions(this.database, issue.hostPartitionKey, { tree: false }, now)
    return {
      issue: requireIssueRecord(this.database, issue.id),
      resolvedCompletionIds: [],
      ...next
    }
  }
}

function assertRecordRevision(issue: IssueRecord, expected: number): void {
  if (issue.recordRevision !== expected) {
    throw staleIssue(issue)
  }
}

function staleIssue(issue: IssueRecord): IssueRepositoryError {
  return new IssueRepositoryError(
    'issue_record_revision_stale',
    `Issue ${issue.id} changed before this lifecycle mutation.`,
    { current: issue }
  )
}
