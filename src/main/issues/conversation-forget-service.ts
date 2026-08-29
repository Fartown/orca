import { randomBytes } from 'node:crypto'
import type {
  ConversationDeletePreparation,
  ConversationLivenessVerdict,
  ConversationRecord,
  IssueMutationIdentity
} from '../../shared/issues/types'
import type { ConversationLaunchClaimRepository } from './conversation-launch-claim-repository'
import type { ConversationRecordRepository } from './conversation-record-repository'
import type { IssueDatabase } from './issue-database'
import { executeIssueMutationWithReceipt } from './issue-mutation-receipt'
import { IssueRepositoryError } from './issue-repository-error'

const PREFLIGHT_TTL_MS = 60_000

export type ConversationRuntimeDeleteState = {
  attachmentGeneration: number
  attached: boolean
  executionState: 'launching' | 'running' | 'waiting' | 'stopped' | 'failed'
  livenessVerdict?: ConversationLivenessVerdict
}

export type ConversationRuntimeDeleteProbe = {
  getDeleteState(conversationId: string): ConversationRuntimeDeleteState
}

type PreflightGrant = {
  conversationId: string
  recordRevision: number
  attachmentGeneration: number
  expiresAt: number
}

export class ConversationForgetService {
  private readonly grants = new Map<string, PreflightGrant>()

  constructor(
    private readonly database: IssueDatabase,
    private readonly conversations: ConversationRecordRepository,
    private readonly claims: ConversationLaunchClaimRepository,
    private readonly runtime: ConversationRuntimeDeleteProbe,
    private readonly now: () => number = Date.now
  ) {}

  prepare(conversationId: string): ConversationDeletePreparation {
    const conversation = this.requireConversation(conversationId)
    const runtime = this.runtime.getDeleteState(conversationId)
    const counts = this.readCounts(conversationId)
    const pendingClaim = this.claims.hasPending(conversationId, this.now())
    const blockers: ConversationDeletePreparation['blockers'] = []
    if (runtime.attached) {
      blockers.push('attached')
    }
    if (runtime.executionState === 'launching' || runtime.executionState === 'running') {
      blockers.push('running')
    }
    if (runtime.executionState === 'waiting' || counts.unresolvedWaitingCount > 0) {
      blockers.push('waiting')
    }
    if (pendingClaim) {
      blockers.push('pending-claim')
    }

    // Keep the old wire blocker vocabulary; mixed-version clients still receive a safe deny.
    const canDelete = blockers.length === 0 && runtime.livenessVerdict !== 'unverifiable'
    const preflightToken = canDelete ? randomBytes(32).toString('base64url') : null
    if (preflightToken) {
      this.grants.set(preflightToken, {
        conversationId,
        recordRevision: conversation.recordRevision,
        attachmentGeneration: runtime.attachmentGeneration,
        expiresAt: this.now() + PREFLIGHT_TTL_MS
      })
    }
    return {
      conversation,
      issueId: conversation.issueId,
      identityCount: counts.identityCount,
      roundCount: counts.roundCount,
      unresolvedRoundCount: counts.unresolvedRoundCount,
      hasTranscriptLocator: counts.hasTranscriptLocator,
      attachmentState: runtime.attached ? 'attached' : 'detached',
      canDelete,
      blockers,
      preflightToken
    }
  }

  forget(params: {
    identity: IssueMutationIdentity
    conversationId: string
    expectedRecordRevision: number
    preflightToken: string
  }): { deletedConversationId: string } {
    const grant = this.grants.get(params.preflightToken)
    if (
      !grant ||
      grant.expiresAt <= this.now() ||
      grant.conversationId !== params.conversationId ||
      grant.recordRevision !== params.expectedRecordRevision
    ) {
      throw invalidPreflight()
    }
    const result = executeIssueMutationWithReceipt({
      database: this.database,
      identity: params.identity,
      method: 'conversations.delete',
      payload: {
        conversationId: params.conversationId,
        expectedRecordRevision: params.expectedRecordRevision,
        preflightToken: params.preflightToken
      },
      operation: () => {
        const runtime = this.runtime.getDeleteState(params.conversationId)
        if (
          runtime.attachmentGeneration !== grant.attachmentGeneration ||
          runtime.attached ||
          runtime.executionState === 'launching' ||
          runtime.executionState === 'running' ||
          runtime.executionState === 'waiting' ||
          runtime.livenessVerdict === 'unverifiable' ||
          this.claims.hasPending(params.conversationId, this.now()) ||
          this.readCounts(params.conversationId).unresolvedWaitingCount > 0
        ) {
          throw new IssueRepositoryError(
            'conversation_delete_blocked',
            'Conversation runtime state changed after delete preflight.'
          )
        }
        this.conversations.deleteWithinTransaction(
          params.conversationId,
          params.expectedRecordRevision
        )
        return { deletedConversationId: params.conversationId }
      }
    }).result
    this.grants.delete(params.preflightToken)
    return result
  }

  private requireConversation(id: string): ConversationRecord {
    const conversation = this.conversations.get(id)
    if (!conversation) {
      throw new IssueRepositoryError('conversation_not_found', `Conversation ${id} was not found.`)
    }
    return conversation
  }

  private readCounts(conversationId: string): {
    identityCount: number
    roundCount: number
    unresolvedRoundCount: number
    unresolvedWaitingCount: number
    hasTranscriptLocator: boolean
  } {
    const identity = this.database
      .prepare(
        `SELECT COUNT(*) AS identityCount,
                MAX(CASE WHEN transcript_path IS NOT NULL OR resume_locator IS NOT NULL THEN 1 ELSE 0 END)
                  AS hasTranscriptLocator
         FROM conversation_provider_identities WHERE conversation_id = ?`
      )
      .get(conversationId) as { identityCount: number; hasTranscriptLocator: number | null }
    const rounds = this.database
      .prepare(
        `SELECT COUNT(*) AS roundCount,
                SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS unresolvedRoundCount,
                SUM(CASE WHEN kind = 'waiting' AND resolved_at IS NULL THEN 1 ELSE 0 END)
                  AS unresolvedWaitingCount
         FROM round_records WHERE conversation_id = ?`
      )
      .get(conversationId) as {
      roundCount: number
      unresolvedRoundCount: number | null
      unresolvedWaitingCount: number | null
    }
    return {
      identityCount: identity.identityCount,
      roundCount: rounds.roundCount,
      unresolvedRoundCount: rounds.unresolvedRoundCount ?? 0,
      unresolvedWaitingCount: rounds.unresolvedWaitingCount ?? 0,
      hasTranscriptLocator: identity.hasTranscriptLocator === 1
    }
  }
}

function invalidPreflight(): IssueRepositoryError {
  return new IssueRepositoryError(
    'conversation_delete_preflight_invalid',
    'Conversation delete preflight is missing, expired, or stale.'
  )
}
