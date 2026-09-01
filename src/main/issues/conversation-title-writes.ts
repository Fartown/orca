import { mintAgentSessionFallbackTitle } from '../../shared/agent-session-fallback-title'
import type { ConversationRecord, ConversationTitleSource } from '../../shared/issues/types'
import { ISSUE_TITLE_MAX_BYTES } from '../../shared/issues/constants'
import {
  applyConversationTitleAuthority,
  type ConversationTitleDecision
} from './conversation-title-authority'
import type { IssueDatabase } from './issue-database'
import { bumpIssueHostRevisions } from './issue-host-state'
import { IssueRepositoryError } from './issue-repository-error'
import type { UpdateConversationTitleInput } from './issue-repository-types'

export type ConversationTitleWriteOutcome = 'written' | 'unchanged' | 'rejected'

/** The repository primitives every gated title write runs against. */
export type ConversationTitleWriteAccess = {
  database: IssueDatabase
  require(id: string): ConversationRecord
  assertRevision(conversation: ConversationRecord, expected: number): void
}

/**
 * Mint the canonical fallback name inside the identity-attach transaction.
 * Idempotent: the authority gate rejects a second mint and freezes nothing.
 * Not a mutation-receipt command — machine writes carry no mutation identity.
 */
export function mintConversationTitle(
  access: ConversationTitleWriteAccess,
  input: { id: string; sessionId: string }
): { conversation: ConversationRecord; outcome: ConversationTitleWriteOutcome } {
  const current = access.require(input.id)
  const decision = applyConversationTitleAuthority(
    { title: current.title, titleSource: current.titleSource ?? null },
    {
      title: mintAgentSessionFallbackTitle(current.agent, input.sessionId),
      titleSource: 'minted'
    }
  )
  return applyTitleDecision(access, current, decision)
}

/** Apply a provider (follow-mode) title through the authority gate. */
export function applyProviderConversationTitle(
  access: ConversationTitleWriteAccess,
  input: { id: string; expectedRecordRevision: number; title: string }
): { conversation: ConversationRecord; outcome: ConversationTitleWriteOutcome } {
  const current = access.require(input.id)
  access.assertRevision(current, input.expectedRecordRevision)
  const decision = applyConversationTitleAuthority(
    { title: current.title, titleSource: current.titleSource ?? null },
    { title: normalizedConversationTitle(input.title), titleSource: 'provider' }
  )
  return applyTitleDecision(access, current, decision)
}

// Why: the public update RPC always carries user semantics — renaming
// freezes automatic sources, clearing resets to the unnamed follow state.
export function applyUserConversationTitle(
  access: ConversationTitleWriteAccess,
  input: UpdateConversationTitleInput
): { conversation: ConversationRecord; outcome: ConversationTitleWriteOutcome } {
  const current = access.require(input.id)
  access.assertRevision(current, input.expectedRecordRevision)
  const decision = applyConversationTitleAuthority(
    { title: current.title, titleSource: current.titleSource ?? null },
    { title: normalizedConversationTitle(input.title), titleSource: 'user' }
  )
  return applyTitleDecision(access, current, decision)
}

function applyTitleDecision(
  access: ConversationTitleWriteAccess,
  current: ConversationRecord,
  decision: ConversationTitleDecision
): { conversation: ConversationRecord; outcome: ConversationTitleWriteOutcome } {
  if (decision.kind === 'rejected') {
    return { conversation: current, outcome: 'rejected' }
  }
  if (decision.kind === 'unchanged') {
    return { conversation: current, outcome: 'unchanged' }
  }
  writeTitleColumns(access, current, decision.title, decision.titleSource, Date.now())
  return { conversation: access.require(current.id), outcome: 'written' }
}

function writeTitleColumns(
  access: ConversationTitleWriteAccess,
  current: ConversationRecord,
  title: string | null,
  titleSource: ConversationTitleSource | null,
  now: number
): void {
  const update = access.database
    .prepare(
      `UPDATE conversations
       SET title = ?, title_source = ?, record_revision = record_revision + 1, updated_at = ?
       WHERE id = ? AND record_revision = ?`
    )
    .run(title, titleSource, now, current.id, current.recordRevision)
  if (update.changes !== 1) {
    throw staleConversationRevision(access.require(current.id))
  }
  bumpIssueHostRevisions(access.database, current.hostPartitionKey, { tree: false }, now)
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
