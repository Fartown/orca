import type { AiVaultOriginalPaneSessionReference } from '@/components/right-sidebar/ai-vault-original-pane'
import type { ConversationSummary, IssueRouteExecutionHostId } from '../../../shared/issues/types'

export function toIssueConversationAiVaultSessionReference(
  conversation: ConversationSummary,
  executionHostId: IssueRouteExecutionHostId
): AiVaultOriginalPaneSessionReference | null {
  const providerSession = conversation.navigation?.providerSession
  if (!providerSession) {
    return null
  }
  return {
    agent: conversation.agent,
    sessionId: providerSession.id,
    providerSessionKey: providerSession.key,
    executionHostId
  }
}
