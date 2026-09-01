import {
  isCodexThreadTitleGenerationOutput,
  isCodexThreadTitleGenerationPrompt
} from '../../../shared/codex-thread-title-generation'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { ConversationSummary } from '../../../shared/issues/types'

export function conversationSessionTitleKey(
  conversation: ConversationSummary,
  executionHostScope: ExecutionHostId = conversation.executionHostId
): string | null {
  const providerSession = conversation.navigation?.providerSession
  if (!providerSession?.id) {
    return null
  }
  return [executionHostScope, conversation.agent, providerSession.key, providerSession.id].join(
    '\0'
  )
}

export function issueConversationDisplayName(
  conversation: ConversationSummary,
  sessionTitles?: ReadonlyMap<string, string>,
  liveTitle?: string | null,
  executionHostScope: ExecutionHostId = conversation.executionHostId
): string {
  const explicitTitle = conversation.title?.trim()
  if (explicitTitle) {
    return explicitTitle
  }
  const liveName = liveTitle?.trim()
  if (liveName) {
    return liveName
  }
  const sessionKey = conversationSessionTitleKey(conversation, executionHostScope)
  return (sessionKey ? sessionTitles?.get(sessionKey)?.trim() : undefined) || ''
}

export function shouldShowIssueConversation(
  conversation: ConversationSummary,
  _sessionTitles?: ReadonlyMap<string, string>,
  _executionHostScope?: ExecutionHostId
): boolean {
  if (!hasIssueConversationProviderIdentity(conversation)) {
    return false
  }
  if (isCodexThreadTitleGenerationConversation(conversation)) {
    return false
  }
  return true
}

export function hasIssueConversationProviderIdentity(conversation: ConversationSummary): boolean {
  return Boolean(conversation.navigation?.providerSession?.id)
}

export function sortIssueConversations(
  conversations: readonly ConversationSummary[]
): ConversationSummary[] {
  return [...conversations].sort((left, right) => {
    const rank = conversationRank(left) - conversationRank(right)
    return rank || right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)
  })
}

function conversationRank(conversation: ConversationSummary): number {
  if (conversation.attachment.kind === 'attached') {
    return 0
  }
  return conversation.unresolvedRoundCount > 0 ? 1 : 2
}

// A user-set name always rescues a row from ghost filtering; automatic names
// (minted fallback, provider follow) do not. Absent titleSource means a legacy
// payload, which falls back to the historical title-emptiness check.
function isManuallyNamedConversation(conversation: ConversationSummary): boolean {
  return conversation.titleSource === undefined
    ? Boolean(conversation.title?.trim())
    : conversation.titleSource === 'user'
}

function isCodexThreadTitleGenerationConversation(conversation: ConversationSummary): boolean {
  const providerSession = conversation.navigation?.providerSession
  return (
    conversation.agent === 'codex' &&
    conversation.issueId === null &&
    !isManuallyNamedConversation(conversation) &&
    conversation.attachment.kind === 'detached' &&
    Boolean(providerSession && !providerSession.transcriptPath) &&
    !conversation.navigation?.resumeLocator &&
    isCodexThreadTitleGenerationPrompt(conversation.latestRound?.userInput.text) &&
    isCodexThreadTitleGenerationOutput(conversation.latestRound?.agentOutput.text)
  )
}
