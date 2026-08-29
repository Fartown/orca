import type { ConversationLaunchPreparation } from '../../../shared/issues/types'
import type { IssueRuntimeClient } from './issue-runtime-client'

export async function recordPreparedIssueConversationLaunchFailure(
  client: Pick<IssueRuntimeClient, 'mutate'>,
  preparation: ConversationLaunchPreparation,
  failure: string
): Promise<void> {
  await client.mutate('conversations.recordLaunchFailure', {
    mutationId: crypto.randomUUID(),
    conversationId: preparation.conversation.id,
    claimId: preparation.claimId,
    expectedRecordRevision: preparation.conversation.recordRevision,
    failure
  })
}
