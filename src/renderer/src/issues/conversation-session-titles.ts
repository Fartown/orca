import { useMemo } from 'react'
import { useSessionNameIndex } from '../session-names/session-name-subscriptions'
import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import {
  isAiVaultTitleAgent,
  type AiVaultSessionTitle
} from '../../../shared/ai-vault-session-title'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { ConversationSummary } from '../../../shared/issues/types'
import { conversationSessionTitleKey } from './issue-conversation-presentation'

export type ConversationSessionTitleRequest = {
  conversationKey: string
  executionHostId: ExecutionHostId
  agent: AiVaultSessionTitle['agent']
  providerSession: AgentProviderSessionMetadata
}

export type ConversationSessionTitleSource = {
  conversation: ConversationSummary
  executionHostScope: ExecutionHostId
}

export function collectConversationSessionTitleRequests(
  sources: readonly ConversationSessionTitleSource[]
): ConversationSessionTitleRequest[] {
  const requests = new Map<string, ConversationSessionTitleRequest>()
  for (const { conversation, executionHostScope } of sources) {
    const conversationKey = conversationSessionTitleKey(conversation, executionHostScope)
    const providerSession = conversation.navigation?.providerSession
    if (
      !conversationKey ||
      !providerSession ||
      !isAiVaultTitleAgent(conversation.agent) ||
      requests.has(conversationKey)
    ) {
      continue
    }
    requests.set(conversationKey, {
      conversationKey,
      executionHostId: executionHostScope,
      agent: conversation.agent,
      providerSession
    })
  }
  return [...requests.values()]
}

/** Issues supplies identities only; name requests and subscriptions are shared. */
export function useConversationSessionTitles(
  sources: readonly ConversationSessionTitleSource[]
): ReadonlyMap<string, string> {
  const requests = useMemo(
    () =>
      collectConversationSessionTitleRequests(sources).map((request) => ({
        executionHostId: request.executionHostId,
        agent: request.agent,
        sessionId: request.providerSession.id,
        ...(request.providerSession.transcriptPath
          ? { transcriptPath: request.providerSession.transcriptPath }
          : {})
      })),
    [sources]
  )
  return useSessionNameIndex(requests)
}
