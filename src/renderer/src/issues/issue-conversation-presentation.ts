import type { AgentDotState } from '@/components/AgentStateDot'
import { isResumableTuiAgent } from '../../../shared/agent-session-resume'
import { AI_VAULT_AGENTS } from '../../../shared/ai-vault-types'
import {
  isCodexThreadTitleGenerationOutput,
  isCodexThreadTitleGenerationPrompt
} from '../../../shared/codex-thread-title-generation'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { ConversationSummary } from '../../../shared/issues/types'

export type IssueConversationStatusPresentation = {
  dotState: AgentDotState
  label: 'Starting' | 'Live' | 'Waiting for input' | 'Failed' | null
}

export function conversationSessionTitleKey(
  conversation: ConversationSummary,
  executionHostScope: ExecutionHostId = conversation.executionHostId
): string | null {
  const providerSession = conversation.navigation?.providerSession
  if (!providerSession?.id) {
    return null
  }
  return [executionHostScope, conversation.agent, providerSession.id].join('\0')
}

export function issueConversationStatus(
  conversation: ConversationSummary
): IssueConversationStatusPresentation {
  if (conversation.livenessVerdict === 'unverifiable') {
    return { dotState: 'idle', label: null }
  }
  if (
    conversation.executionState === 'failed' ||
    (conversation.launchFailure && conversation.attachment.kind === 'detached')
  ) {
    return { dotState: 'failed', label: 'Failed' }
  }
  switch (conversation.executionState) {
    case 'launching':
      return { dotState: 'working', label: 'Starting' }
    case 'running':
      return { dotState: 'working', label: 'Live' }
    case 'waiting':
      return { dotState: 'waiting', label: 'Waiting for input' }
    case 'stopped':
      // An attachment proves a live pane; losing it never proves the host process exited.
      return conversation.attachment.kind === 'attached'
        ? { dotState: 'done', label: 'Live' }
        : { dotState: 'idle', label: null }
  }
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
  sessionTitles?: ReadonlyMap<string, string>,
  executionHostScope?: ExecutionHostId
): boolean {
  if (isCodexThreadTitleGenerationConversation(conversation)) {
    return false
  }
  if (
    conversation.issueId !== null ||
    conversation.title?.trim() ||
    conversation.latestRound ||
    conversation.unresolvedRoundCount > 0 ||
    conversation.launchFailure ||
    conversation.attachment.kind === 'attached' ||
    conversation.executionState !== 'stopped'
  ) {
    return true
  }
  const sessionKey = conversationSessionTitleKey(conversation, executionHostScope)
  return Boolean(sessionKey && sessionTitles?.get(sessionKey)?.trim())
}

export function sortIssueConversations(
  conversations: readonly ConversationSummary[]
): ConversationSummary[] {
  return [...conversations].sort((left, right) => {
    const rank = conversationRank(left) - conversationRank(right)
    return rank || right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)
  })
}

export function canResumeIssueConversation(conversation: ConversationSummary): boolean {
  return (
    conversation.attachment.kind === 'detached' &&
    hasIssueConversationResumeTarget(conversation) &&
    (conversation.executionState === 'stopped' || conversation.executionState === 'failed')
  )
}

export function shouldShowIssueConversationResume(
  conversation: ConversationSummary,
  hasOriginalPane: boolean
): boolean {
  return !hasOriginalPane && canResumeIssueConversation(conversation)
}

export function hasIssueConversationResumeTarget(conversation: ConversationSummary): boolean {
  return (
    conversation.workspaceAvailability === 'available' &&
    conversation.resumability === 'resumable' &&
    conversation.livenessVerdict !== 'unverifiable' &&
    Boolean(conversation.navigation?.providerSession) &&
    isResumableTuiAgent(conversation.agent) &&
    AI_VAULT_AGENTS.some((agent) => agent === conversation.agent)
  )
}

export function canRetryIssueConversation(conversation: ConversationSummary): boolean {
  return (
    conversation.attachment.kind === 'detached' &&
    conversation.workspaceAvailability === 'available' &&
    conversation.resumability === 'unavailable' &&
    conversation.livenessVerdict !== 'unverifiable' &&
    !conversation.navigation?.providerSession &&
    conversation.latestRound === null &&
    conversation.unresolvedRoundCount === 0 &&
    (conversation.executionState === 'stopped' || conversation.executionState === 'failed')
  )
}

function conversationRank(conversation: ConversationSummary): number {
  if (
    conversation.attachment.kind === 'attached' ||
    conversation.executionState === 'launching' ||
    conversation.executionState === 'running' ||
    conversation.executionState === 'waiting'
  ) {
    return 0
  }
  return conversation.unresolvedRoundCount > 0 ? 1 : 2
}

function isCodexThreadTitleGenerationConversation(conversation: ConversationSummary): boolean {
  const providerSession = conversation.navigation?.providerSession
  return (
    conversation.agent === 'codex' &&
    conversation.issueId === null &&
    !conversation.title?.trim() &&
    conversation.attachment.kind === 'detached' &&
    Boolean(providerSession && !providerSession.transcriptPath) &&
    !conversation.navigation?.resumeLocator &&
    isCodexThreadTitleGenerationPrompt(conversation.latestRound?.userInput.text) &&
    isCodexThreadTitleGenerationOutput(conversation.latestRound?.agentOutput.text)
  )
}
