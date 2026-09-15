import type { AgentHookSource } from '../agent-hook-relay'
import type { AgentProviderSessionMetadata } from '../agent-session-resume'
import type { AgentStatusPayload } from '../agent-status-types'
import type { HookListenerState } from '../agent-hook-listener/listener-state'
import { shouldRejectClaudeSessionReplacement } from '../claude-session-ownership/claude-session-activity'
import { isCodexThreadTitleGenerationPrompt } from '../codex-thread-title-generation'
import {
  shouldRejectCodexTitleTask,
  shouldRejectUnbackedCodexSessionEvent
} from './codex-title-task-admission'

export type RelaySessionAdmission = {
  state: HookListenerState
  paneKey: string
  source: AgentHookSource | undefined
  providerSession: AgentProviderSessionMetadata | undefined
  explicitPrompt: boolean
}

/** Relay events reach the same session-ownership rules the local ingest path applies. */
export function shouldRejectRelaySessionEvent(event: RelaySessionAdmission): boolean {
  const { state, paneKey, source, providerSession } = event
  if (source === 'codex') {
    return shouldRejectUnbackedCodexSessionEvent(state, paneKey, providerSession)
  }
  if (source === 'claude') {
    return shouldRejectClaudeSessionReplacement(state, paneKey, providerSession?.id)
  }
  return false
}

export function shouldRejectRelayCodexTitleTask(
  event: RelaySessionAdmission,
  payload: AgentStatusPayload
): boolean {
  return (
    event.source === 'codex' &&
    shouldRejectCodexTitleTask(
      event.state,
      event.paneKey,
      event.providerSession?.id,
      event.explicitPrompt ? payload.prompt : undefined
    )
  )
}

/** Old relays can echo the utility prompt on the real parent's later Stop. */
export function restoreRelayEchoedPrompt<Payload extends AgentStatusPayload>(
  event: RelaySessionAdmission,
  payload: Payload
): Payload {
  const previous = event.state.lastStatusByPaneKey.get(event.paneKey)
  if (
    event.source !== 'codex' ||
    event.explicitPrompt ||
    previous?.source !== 'codex' ||
    !event.providerSession?.id ||
    previous.providerSession?.id !== event.providerSession.id ||
    !isCodexThreadTitleGenerationPrompt(payload.prompt)
  ) {
    return payload
  }
  return { ...payload, prompt: previous.payload.prompt }
}
