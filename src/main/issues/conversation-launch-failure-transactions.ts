import type { ConversationRecord, IssueMutationIdentity } from '../../shared/issues/types'
import type { ConversationRecordRepository } from './conversation-record-repository'
import type { ConversationLaunchClaimRepository } from './conversation-launch-claim-repository'
import type { IssueDatabase } from './issue-database'
import { executeIssueMutationWithReceipt } from './issue-mutation-receipt'
import { IssueRepositoryError } from './issue-repository-error'
import type { RecordConversationLaunchFailureInput } from './issue-repository-types'

export class ConversationLaunchFailureTransactions {
  constructor(
    private readonly database: IssueDatabase,
    private readonly conversations: ConversationRecordRepository,
    private readonly claims: ConversationLaunchClaimRepository,
    private readonly hasConversationRuntimeEvidence: (conversationId: string) => boolean
  ) {}

  record(params: {
    identity: IssueMutationIdentity
    input: RecordConversationLaunchFailureInput
  }): ConversationRecord {
    const { input } = params
    return executeIssueMutationWithReceipt({
      database: this.database,
      identity: params.identity,
      method: 'conversations.recordLaunchFailure',
      payload: {
        conversationId: input.conversationId,
        claimId: input.claimId,
        expectedRecordRevision: input.expectedRecordRevision,
        failure: input.failure
      },
      operation: () => {
        const claim = this.claims.failPendingWithinTransaction(
          input.claimId,
          input.occurredAt ?? Date.now()
        )
        if (claim.conversationId !== input.conversationId) {
          throw new IssueRepositoryError(
            'conversation_launch_claim_invalid',
            'Launch failure claim belongs to another Conversation.'
          )
        }
        if (this.hasConversationRuntimeEvidence(input.conversationId)) {
          throw new IssueRepositoryError(
            'conversation_resume_runtime_present',
            'Conversation has live or unverifiable runtime evidence and cannot be marked failed.'
          )
        }
        // Why: the claim owns the launch outcome; rename/rebind revisions must not hide failure.
        return this.conversations.recordLaunchFailureWithinTransaction(
          input.conversationId,
          this.requireConversation(input.conversationId).recordRevision,
          input.failure,
          input.occurredAt
        )
      }
    }).result
  }

  private requireConversation(id: string): ConversationRecord {
    const conversation = this.conversations.get(id)
    if (!conversation) {
      throw new IssueRepositoryError('conversation_not_found', `Conversation ${id} was not found.`)
    }
    return conversation
  }
}
