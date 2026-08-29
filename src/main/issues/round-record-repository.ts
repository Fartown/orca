import { randomUUID } from 'node:crypto'
import type { IssueMutationIdentity, RoundRecord, RoundRecordRef } from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { bumpIssueHostRevisions } from './issue-host-state'
import { executeIssueMutation } from './issue-mutation-receipt'
import { IssueRepositoryError } from './issue-repository-error'
import type {
  CreateRoundRecordInput,
  MarkRoundReadInput,
  ResolveRoundInput
} from './issue-repository-types'
import {
  roundRecordFromRow,
  type ConversationRoundOwnerRow,
  type RoundRecordRow
} from './round-record-codec'
import { normalizeRoundRecordInput } from './round-record-text'
import { assertRoundRecordMergeable, mergeRoundRecord } from './round-record-merge'

export class RoundRecordRepository {
  constructor(private readonly database: IssueDatabase) {}

  get(id: string): RoundRecord | undefined {
    const row = this.database.prepare('SELECT * FROM round_records WHERE id = ?').get(id) as
      | RoundRecordRow
      | undefined
    return row ? roundRecordFromRow(row) : undefined
  }

  list(conversationId: string): RoundRecord[] {
    return (
      this.database
        .prepare(
          `SELECT * FROM round_records WHERE conversation_id = ?
           ORDER BY occurred_at, id`
        )
        .all(conversationId) as RoundRecordRow[]
    ).map(roundRecordFromRow)
  }

  findByRef(ref: Pick<RoundRecordRef, 'kind' | 'value'>): RoundRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT round.* FROM round_records round
         JOIN round_refs ref ON ref.round_id = round.id
         WHERE ref.ref_kind = ? AND ref.value = ? LIMIT 1`
      )
      .get(ref.kind, ref.value) as RoundRecordRow | undefined
    return row ? roundRecordFromRow(row) : undefined
  }

  create(params: { identity: IssueMutationIdentity; input: CreateRoundRecordInput }): RoundRecord {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'rounds.ingest',
      payload: params.input,
      operation: () => this.upsertWithinTransaction(params.input)
    })
  }

  markRead(params: {
    identity: IssueMutationIdentity
    input: MarkRoundReadInput
    idempotencyPayload?: unknown
  }): RoundRecord {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'issues.markRead',
      payload: params.idempotencyPayload ?? params.input,
      operation: () => this.markReadWithinTransaction(params.input)
    })
  }

  resolve(params: {
    identity: IssueMutationIdentity
    input: ResolveRoundInput
    idempotencyPayload?: unknown
  }): RoundRecord {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'issues.resolveRound',
      payload: params.idempotencyPayload ?? params.input,
      operation: () => this.resolveWithinTransaction(params.input)
    })
  }

  reconcileTranscriptFact(input: CreateRoundRecordInput): RoundRecord {
    return this.database.transaction(() => this.upsertWithinTransaction(input))
  }

  resolveReconciledHistory(input: ResolveRoundInput): RoundRecord {
    return this.database.transaction(() => this.resolveWithinTransaction(input))
  }

  latestUnresolved(
    conversationId: string,
    kind: RoundRecord['kind'],
    beforeOrAt: number
  ): RoundRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM round_records
         WHERE conversation_id = ? AND kind = ? AND resolved_at IS NULL AND occurred_at <= ?
         ORDER BY occurred_at DESC, id DESC LIMIT 1`
      )
      .get(conversationId, kind, beforeOrAt) as RoundRecordRow | undefined
    return row ? roundRecordFromRow(row) : undefined
  }

  private upsertWithinTransaction(input: CreateRoundRecordInput): RoundRecord {
    const owner = this.requireConversationOwner(input.conversationId)
    const incoming = normalizeRoundRecordInput(input)
    const existing = this.findExisting(input)
    if (existing) {
      assertRoundRecordMergeable(existing, input)
      const changed = mergeRoundRecord(this.database, existing, incoming, input)
      const refsChanged = this.insertRefs(existing.id, input.refs)
      if (changed || refsChanged) {
        bumpIssueHostRevisions(this.database, owner.host_partition_key, { tree: false }, Date.now())
      }
      return this.require(existing.id)
    }

    const id = randomUUID()
    const createdAt = Date.now()
    this.database
      .prepare(
        `INSERT INTO round_records (
           id, conversation_id, kind, waiting_reason, state_source, occurred_at, dedupe_key,
           user_input_preview, user_input_completeness,
           agent_output_preview, output_completeness,
           pending_question_preview, question_completeness,
           read_at, resolved_at, resolution, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`
      )
      .run(
        id,
        input.conversationId,
        input.kind,
        input.kind === 'waiting' ? (input.waitingReason ?? 'other') : null,
        input.stateSource,
        input.occurredAt,
        input.dedupeKey,
        incoming.userInput.text,
        incoming.userInput.completeness,
        incoming.agentOutput.text,
        incoming.agentOutput.completeness,
        incoming.pendingQuestion.text,
        incoming.pendingQuestion.completeness,
        createdAt
      )
    this.insertRefs(id, input.refs)
    this.reopenIssueIfNeeded(owner.issue_id, input)
    bumpIssueHostRevisions(this.database, owner.host_partition_key, { tree: false }, createdAt)
    return this.require(id)
  }

  private insertRefs(roundId: string, refs: readonly RoundRecordRef[] | undefined): boolean {
    let changed = false
    for (const ref of refs ?? []) {
      try {
        const result = this.database
          .prepare(
            `INSERT OR IGNORE INTO round_refs (round_id, ref_kind, value, reachable)
             VALUES (?, ?, ?, ?)`
          )
          .run(roundId, ref.kind, ref.value, ref.reachable === null ? null : ref.reachable ? 1 : 0)
        const inserted = Number(result.changes) === 1
        if (!inserted && ref.kind === 'provider-turn') {
          const owner = this.database
            .prepare(
              `SELECT round_id FROM round_refs
               WHERE ref_kind = 'provider-turn' AND value = ? LIMIT 1`
            )
            .get(ref.value) as { round_id: string } | undefined
          if (owner && owner.round_id !== roundId) {
            throw new IssueRepositoryError(
              'round_ref_conflict',
              'Provider turn reference belongs to another Round.'
            )
          }
        }
        changed ||= inserted
      } catch (error) {
        throw new IssueRepositoryError(
          'round_ref_conflict',
          'Round reference is already attached to another fact.',
          { cause: error instanceof Error ? error.message : String(error) }
        )
      }
    }
    return changed
  }

  private findExisting(input: CreateRoundRecordInput): RoundRecord | undefined {
    for (const ref of input.refs ?? []) {
      const existing = this.findByRef(ref)
      if (existing) {
        return existing
      }
    }
    const row = this.database
      .prepare('SELECT * FROM round_records WHERE dedupe_key = ?')
      .get(input.dedupeKey) as RoundRecordRow | undefined
    return row ? roundRecordFromRow(row) : undefined
  }

  private markReadWithinTransaction(input: MarkRoundReadInput): RoundRecord {
    const current = this.require(input.id)
    if (current.readAt === null) {
      this.database
        .prepare('UPDATE round_records SET read_at = ? WHERE id = ?')
        .run(input.readAt, input.id)
      this.bumpForRound(current)
    }
    return this.require(input.id)
  }

  private resolveWithinTransaction(input: ResolveRoundInput): RoundRecord {
    const current = this.require(input.id)
    if (current.resolvedAt === null) {
      this.database
        .prepare('UPDATE round_records SET resolved_at = ?, resolution = ? WHERE id = ?')
        .run(input.resolvedAt, input.resolution, input.id)
      this.bumpForRound(current)
    }
    return this.require(input.id)
  }

  private reopenIssueIfNeeded(issueId: string | null, input: CreateRoundRecordInput): void {
    if (!issueId) {
      return
    }
    const issue = this.database
      .prepare('SELECT state, archived_at FROM issues WHERE id = ?')
      .get(issueId) as { state: 'active' | 'archived'; archived_at: number | null } | undefined
    if (issue?.state !== 'archived' || issue.archived_at === null) {
      return
    }
    const shouldReopen =
      input.occurredAt > issue.archived_at ||
      (input.kind === 'waiting' && input.authoritativeCurrentState === true)
    if (shouldReopen) {
      this.database
        .prepare(
          `UPDATE issues
           SET state = 'active', archived_at = NULL,
               record_revision = record_revision + 1, updated_at = ?
           WHERE id = ?`
        )
        .run(Date.now(), issueId)
    }
  }

  private bumpForRound(round: RoundRecord): void {
    const owner = this.requireConversationOwner(round.conversationId)
    bumpIssueHostRevisions(this.database, owner.host_partition_key, { tree: false }, Date.now())
  }

  private requireConversationOwner(conversationId: string): ConversationRoundOwnerRow {
    const owner = this.database
      .prepare('SELECT host_partition_key, issue_id FROM conversations WHERE id = ?')
      .get(conversationId) as ConversationRoundOwnerRow | undefined
    if (!owner) {
      throw new IssueRepositoryError(
        'conversation_not_found',
        `Conversation ${conversationId} was not found.`
      )
    }
    return owner
  }

  private require(id: string): RoundRecord {
    const round = this.get(id)
    if (!round) {
      throw new IssueRepositoryError('round_not_found', `Round ${id} was not found.`)
    }
    return round
  }
}
