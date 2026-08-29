import { toast } from 'sonner'
import type { AgentProviderSessionMetadata } from '../../../../shared/agent-session-resume'
import {
  isAiVaultSessionResumableContent,
  type AiVaultSession
} from '../../../../shared/ai-vault-types'
import { translate } from '@/i18n/i18n'
import { blockingAiVaultScanIssue } from './ai-vault-scan-issue-state'
import { findAiVaultSessionByProviderIdentity } from './ai-vault-session-identity'

export async function resolveAiVaultSessionByProviderIdentity(args: {
  executionHostId: AiVaultSession['executionHostId']
  agent: string
  providerSession: AgentProviderSessionMetadata
  workspacePaths: readonly string[]
}): Promise<AiVaultSession | null> {
  let result: Awaited<ReturnType<typeof window.api.aiVault.listSessions>>
  try {
    result = await window.api.aiVault.listSessions({
      unlimited: true,
      scopePaths: [...new Set(args.workspacePaths.map((path) => path.trim()).filter(Boolean))],
      executionHostScope: args.executionHostId
    })
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : translate(
            'auto.components.right.sidebar.AiVaultPanel.loadSessionHistoryFailed',
            'Could not load Agent Session History.'
          )
    )
    return null
  }

  if (result.cancelled) {
    toast.error(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.sessionHistoryRefreshInProgress',
        'Agent Session History is refreshing. Try again.'
      )
    )
    return null
  }

  const session = findAiVaultSessionByProviderIdentity(result.sessions, {
    executionHostId: args.executionHostId,
    agent: args.agent,
    providerSession: args.providerSession
  })
  if (!session) {
    const blockingIssue = blockingAiVaultScanIssue(result)
    toast.error(
      blockingIssue?.message ??
        translate(
          'auto.components.right.sidebar.AiVaultPanel.conversationSessionNotFound',
          'This Conversation could not be found in Agent Session History.'
        )
    )
    return null
  }
  if (!isAiVaultSessionResumableContent(session)) {
    toast.error(
      translate(
        'auto.components.right.sidebar.AiVaultPanel.sessionHasNoSavedConversation',
        'This session has no saved conversation and cannot be resumed.'
      )
    )
    return null
  }
  return session
}
