import type { ConversationRecord } from '../../shared/issues/types'
import type { ConversationRecordRepository } from './conversation-record-repository'
import { sameConversationWorkspace } from './conversation-launch-preparation-transactions'
import { IssueRepositoryError } from './issue-repository-error'

type ConversationRuntimeEvidence = Pick<
  ConversationRecord,
  'executionHostId' | 'workspaceRef' | 'agent'
>

export function assertConversationRuntimeEvidenceMatches(
  conversation: ConversationRecord,
  evidence: ConversationRuntimeEvidence
): void {
  if (
    conversation.executionHostId !== evidence.executionHostId ||
    conversation.agent !== evidence.agent ||
    !sameConversationWorkspace(conversation.workspaceRef, evidence.workspaceRef)
  ) {
    throw new IssueRepositoryError(
      'conversation_identity_conflict',
      'Provider identity evidence does not match the managed Conversation.'
    )
  }
}

export function clearConversationLaunchFailureFromRuntimeEvidence(
  conversations: Pick<ConversationRecordRepository, 'clearLaunchFailureWithinTransaction'>,
  conversation: ConversationRecord,
  observedAt = Date.now()
): ConversationRecord {
  if (!conversation.launchFailure || observedAt < conversation.launchFailure.failedAt) {
    return conversation
  }
  return conversations.clearLaunchFailureWithinTransaction({
    id: conversation.id,
    expectedRecordRevision: conversation.recordRevision,
    now: observedAt
  })
}
