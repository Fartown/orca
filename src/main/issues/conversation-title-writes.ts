import { ISSUE_TITLE_MAX_BYTES } from '../../shared/issues/constants'
import type { ConversationRecord } from '../../shared/issues/types'
import {
  applyConversationTitleAuthority,
  type ConversationTitleDecision
} from './conversation-title-authority'
import type { IssueDatabase } from './issue-database'
import { bumpIssueHostRevisions } from './issue-host-state'
import { IssueRepositoryError } from './issue-repository-error'
import type { UpdateConversationTitleInput } from './issue-repository-types'

export type ConversationTitleWriteOutcome = 'written' | 'unchanged'

export type ConversationTitleWriteAccess = {
  database: IssueDatabase
  require(id: string): ConversationRecord
  assertRevision(conversation: ConversationRecord, expected: number): void
}

/** Refresh the last-known Provider title without touching a user override. */
export function applyProviderConversationTitle(
  access: ConversationTitleWriteAccess,
  input: { id: string; expectedRecordRevision: number; title: string }
): { conversation: ConversationRecord; outcome: ConversationTitleWriteOutcome } {
  const current = access.require(input.id)
  access.assertRevision(current, input.expectedRecordRevision)
  const title = normalizedConversationTitle(input.title)
  if (title === null) {
    throw new Error('Provider conversation title is empty.')
  }
  const decision = applyConversationTitleAuthority(
    { userTitle: current.title, providerTitle: current.providerTitle ?? null },
    { kind: 'provider', title }
  )
  return applyTitleDecision(access, current, decision)
}

/** Rename freezes the display override; clearing preserves the Provider snapshot. */
export function applyUserConversationTitle(
  access: ConversationTitleWriteAccess,
  input: UpdateConversationTitleInput
): { conversation: ConversationRecord; outcome: ConversationTitleWriteOutcome } {
  const current = access.require(input.id)
  access.assertRevision(current, input.expectedRecordRevision)
  const decision = applyConversationTitleAuthority(
    { userTitle: current.title, providerTitle: current.providerTitle ?? null },
    { kind: 'user', title: normalizedConversationTitle(input.title) }
  )
  return applyTitleDecision(access, current, decision)
}

function applyTitleDecision(
  access: ConversationTitleWriteAccess,
  current: ConversationRecord,
  decision: ConversationTitleDecision
): { conversation: ConversationRecord; outcome: ConversationTitleWriteOutcome } {
  if (decision.kind === 'unchanged') {
    return { conversation: current, outcome: 'unchanged' }
  }
  const now = Date.now()
  const update =
    decision.kind === 'write-user'
      ? access.database
          .prepare(
            `UPDATE conversations
             SET title = ?, title_source = ?, record_revision = record_revision + 1, updated_at = ?
             WHERE id = ? AND record_revision = ?`
          )
          .run(
            decision.title,
            decision.title === null ? null : 'user',
            now,
            current.id,
            current.recordRevision
          )
      : access.database
          .prepare(
            `UPDATE conversations
             SET provider_title = ?, record_revision = record_revision + 1, updated_at = ?
             WHERE id = ? AND record_revision = ?`
          )
          .run(decision.title, now, current.id, current.recordRevision)
  if (update.changes !== 1) {
    throw staleConversationRevision(access.require(current.id))
  }
  bumpIssueHostRevisions(access.database, current.hostPartitionKey, { tree: false }, now)
  return { conversation: access.require(current.id), outcome: 'written' }
}

export function normalizedConversationTitle(value: string | null): string | null {
  if (value === null) {
    return null
  }
  const title = value.trim()
  if (!title || Buffer.byteLength(title, 'utf8') > ISSUE_TITLE_MAX_BYTES) {
    throw new Error('Conversation title is invalid.')
  }
  return title
}

export function staleConversationRevision(current: ConversationRecord): IssueRepositoryError {
  return new IssueRepositoryError(
    'conversation_record_revision_stale',
    `Conversation ${current.id} changed before this mutation.`,
    { current }
  )
}
