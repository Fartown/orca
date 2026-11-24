import { readString } from '../agent-hook-listener/tool-input-preview'
import type { HookListenerState } from '../agent-hook-listener/listener-state'
import type { AgentHookEventPayload } from '../agent-hook-listener/listener-event'
import type { ParsedHookEnvelope } from '../agent-hook-listener/hook-envelope'
import { extractPromptText } from '../agent-hook-listener/prompt-fields'
import { routeJcodeHelperHook } from '../agent-hook-listener/providers/jcode/jcode-helper-permission-wait'
import type { AgentHookSource } from '../agent-hook-listener/transport/agent-hook-relay'
import type { AgentProviderSessionMetadata } from '../agent-session/lifecycle/agent-session-resume'
import { readAgentProcessIdentity } from '../agent-status/process/agent-process-presence'
import { shouldRejectClaudeSessionReplacement } from '../claude-session-ownership/claude-session-activity'
import {
  shouldRejectCodexTitleTask,
  shouldRejectUnbackedCodexSessionEvent
} from './codex-title-task-admission'

export type SessionHookOptions = {
  /** Provider folds may be isolated; process ownership belongs to the execution host. */
  claudeSessionOwnerState?: HookListenerState
  bindingStatusByPaneKey?: ReadonlyMap<string, AgentHookEventPayload>
}

/**
 * Session admission runs before any provider fold: a refused hook normalizes to null, every other
 * hook continues to upstream's jcode helper route, so the guard costs no lines in the normalizer.
 */
export function routeAdmittedHook(
  state: HookListenerState,
  source: AgentHookSource,
  envelope: ParsedHookEnvelope,
  session: AgentProviderSessionMetadata | null,
  options: SessionHookOptions
): AgentHookEventPayload | null | undefined {
  const { paneKey, record, hookPayloadRecord } = envelope
  if (
    !admitSessionHook(state, source, paneKey, session, record, options) ||
    rejectTitleHook(state, source, paneKey, session, extractPromptText(hookPayloadRecord).text)
  ) {
    return null
  }
  return routeJcodeHelperHook(state, source, envelope, options.bindingStatusByPaneKey)
}

export function admitSessionHook(
  state: HookListenerState,
  source: AgentHookSource,
  paneKey: string,
  session: AgentProviderSessionMetadata | null,
  envelope: Record<string, unknown>,
  options: { claudeSessionOwnerState?: HookListenerState }
): boolean {
  if (source === 'codex' && shouldRejectUnbackedCodexSessionEvent(state, paneKey, session)) {
    return false
  }
  if (source === 'claude') {
    if (
      shouldRejectClaudeSessionReplacement(
        options.claudeSessionOwnerState ?? state,
        paneKey,
        session?.id,
        readAgentProcessIdentity(envelope.agentProcess)
      )
    ) {
      return false
    }
    // A refused replacement must not consume the incumbent's restored-state marker.
    state.claudeUnconfirmedRestoredStatusPaneKeys.delete(paneKey)
  }
  return true
}

export function rejectTitleHook(
  state: HookListenerState,
  source: AgentHookSource,
  paneKey: string,
  session: AgentProviderSessionMetadata | null,
  prompt: string | undefined
): boolean {
  return source === 'codex' && shouldRejectCodexTitleTask(state, paneKey, session?.id, prompt)
}

const PROCESS_EXIT_REASONS = new Set([
  'prompt_input_exit',
  'logout',
  'other',
  'bypass_permissions_disabled'
])

/** /clear and /resume keep the process alive; unknown reasons need a presence probe. */
export function isSessionProcessExit(
  eventName: unknown,
  payload: Record<string, unknown>
): boolean {
  const reason = readString(payload, 'reason')
  return (
    eventName === 'SessionEnd' &&
    !readString(payload, 'agent_id') &&
    reason !== undefined &&
    PROCESS_EXIT_REASONS.has(reason)
  )
}
