import type { AgentProviderSessionMetadata } from '../../shared/agent-session-resume'
import type { ConversationLaunchPreparation, ConversationRecord } from '../../shared/issues/types'
import type { ConversationRecordRepository } from './conversation-record-repository'
import type { ConversationIdentityRepository } from './conversation-identity-repository'
import type { ConversationLaunchClaimRepository } from './conversation-launch-claim-repository'
import type { IssueDatabase } from './issue-database'
import { IssueRepositoryError } from './issue-repository-error'
import type { CreateConversationInput } from './issue-repository-types'

const DEFAULT_LAUNCH_CLAIM_TTL_MS = 15 * 60 * 1000

export type PrepareConversationLaunchInput = CreateConversationInput & {
  launchToken: string
  paneKey?: string | null
  processIncarnation?: string | null
  connectionId?: string | null
  now?: number
  claimTtlMs?: number
}

export type PrepareConversationResumeInput = Omit<PrepareConversationLaunchInput, 'issueId'> & {
  providerSession: AgentProviderSessionMetadata
  resumeLocator?: string | null
}

export type PrepareConversationRetryInput = {
  conversationId: string
  expectedRecordRevision: number
  launchToken: string
  paneKey?: string | null
  processIncarnation?: string | null
  connectionId?: string | null
  now?: number
  claimTtlMs?: number
}

export class ConversationLaunchPreparationTransactions {
  constructor(
    private readonly database: IssueDatabase,
    private readonly conversations: ConversationRecordRepository,
    private readonly identities: ConversationIdentityRepository,
    private readonly claims: ConversationLaunchClaimRepository,
    private readonly isConversationAttached: (conversationId: string) => boolean
  ) {}

  allocate(
    input: PrepareConversationLaunchInput,
    disposition: ConversationLaunchPreparation['disposition']
  ): ConversationLaunchPreparation {
    const conversation = this.conversations.createWithinTransaction(input)
    const claim = this.claims.createWithinTransaction({
      conversationId: conversation.id,
      launchToken: input.launchToken,
      paneKey: input.paneKey,
      processIncarnation: input.processIncarnation,
      connectionId: input.connectionId,
      createdAt: input.now,
      expiresAt: claimExpiry(input)
    })
    return { conversation, claimId: claim.claimId, disposition }
  }

  resume(input: PrepareConversationResumeInput): ConversationLaunchPreparation {
    const existingIdentity = this.identities.findActiveForExecutionHost({
      executionHostId: input.executionHostId,
      agent: input.agent,
      providerSession: input.providerSession
    })
    if (!existingIdentity) {
      const prepared = this.allocate({ ...input, issueId: null }, 'created')
      this.identities.attachWithinTransaction({
        conversationId: prepared.conversation.id,
        agent: input.agent,
        providerSession: input.providerSession,
        resumeLocator: input.resumeLocator,
        observedAt: input.now
      })
      return prepared
    }
    const conversation = this.requireConversation(existingIdentity.conversationId)
    if (!sameConversationWorkspace(conversation.workspaceRef, input.workspaceRef)) {
      throw new IssueRepositoryError(
        'resume_workspace_mismatch',
        'A managed provider session can only resume in its original Workspace.'
      )
    }
    const claim = this.claims.createWithinTransaction({
      conversationId: conversation.id,
      launchToken: input.launchToken,
      paneKey: input.paneKey,
      processIncarnation: input.processIncarnation,
      connectionId: input.connectionId,
      createdAt: input.now,
      expiresAt: claimExpiry(input)
    })
    return { conversation, claimId: claim.claimId, disposition: 'replayed' }
  }

  retry(input: PrepareConversationRetryInput): ConversationLaunchPreparation {
    const conversation = this.requireConversation(input.conversationId)
    const now = input.now ?? Date.now()
    if (conversation.recordRevision !== input.expectedRecordRevision) {
      throw new IssueRepositoryError(
        'conversation_record_revision_stale',
        `Conversation ${conversation.id} changed before retry.`,
        { current: conversation }
      )
    }
    this.claims.expirePendingWithinTransaction(conversation.id, now)
    const blockers = {
      identity: this.identities
        .listForConversation(conversation.id)
        .some((item) => !item.retiredAt),
      round: Boolean(
        this.database
          .prepare('SELECT 1 FROM round_records WHERE conversation_id = ? LIMIT 1')
          .get(conversation.id)
      ),
      attachment: this.isConversationAttached(conversation.id),
      pendingClaim: this.claims.hasPending(conversation.id, now)
    }
    if (Object.values(blockers).some(Boolean)) {
      throw new IssueRepositoryError(
        'conversation_retry_not_allowed',
        'Conversation has runtime or persisted evidence and cannot retry as an unconfirmed launch.',
        { blockers }
      )
    }
    const retried = this.conversations.prepareRetryWithinTransaction({
      id: conversation.id,
      expectedRecordRevision: input.expectedRecordRevision,
      now
    })
    const claim = this.claims.createWithinTransaction({
      conversationId: retried.id,
      launchToken: input.launchToken,
      paneKey: input.paneKey,
      processIncarnation: input.processIncarnation,
      connectionId: input.connectionId,
      createdAt: now,
      expiresAt: claimExpiry(input)
    })
    return { conversation: retried, claimId: claim.claimId, disposition: 'retried' }
  }

  private requireConversation(id: string): ConversationRecord {
    const conversation = this.conversations.get(id)
    if (!conversation) {
      throw new IssueRepositoryError('conversation_not_found', `Conversation ${id} was not found.`)
    }
    return conversation
  }
}

function claimExpiry(input: { now?: number; claimTtlMs?: number }): number {
  const now = input.now ?? Date.now()
  const ttl = input.claimTtlMs ?? DEFAULT_LAUNCH_CLAIM_TTL_MS
  if (!Number.isSafeInteger(ttl) || ttl <= 0) {
    throw new IssueRepositoryError(
      'conversation_launch_claim_invalid',
      'Conversation launch claim TTL must be a positive integer.'
    )
  }
  return now + ttl
}

export function sameConversationWorkspace(
  left: ConversationRecord['workspaceRef'],
  right: ConversationRecord['workspaceRef']
): boolean {
  if (left.type !== right.type) {
    return false
  }
  return left.type === 'worktree'
    ? left.worktreeId === (right as typeof left).worktreeId
    : left.folderWorkspaceId === (right as typeof left).folderWorkspaceId
}
