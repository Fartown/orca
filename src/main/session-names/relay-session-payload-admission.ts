import { normalizeAgentStatusPayload } from '../../shared/agent-status-types'
import type { HookListenerState } from '../../shared/agent-hook-listener/listener-state'
import { readAgentProcessPresence } from '../../shared/agent-process-presence'
import {
  restoreRelayEchoedPrompt,
  shouldRejectRelayCodexTitleTask,
  shouldRejectRelaySessionEvent
} from '../../shared/session-names/relay-session-admission'
import { normalizeRemoteEnvelopeFields } from '../agent-hooks/server/server-remote-envelope-normalization'

type RelayStatusEnvelope = Parameters<typeof normalizeRemoteEnvelopeFields>[0] & {
  hasExplicitPrompt?: boolean
  agentPresence?: unknown
  payload: unknown
}

/**
 * The relay payload normalized for main, or null when it belongs to another session on the pane
 * or is a Codex title task. Every step only drops or rewrites the prompt, so running it ahead of
 * the remaining remote-ingest fences admits exactly what running it between them did.
 */
export function admitRelaySessionPayload(
  state: HookListenerState,
  paneKey: string,
  envelope: RelayStatusEnvelope
): ReturnType<typeof normalizeAgentStatusPayload> {
  const payload = normalizeAgentStatusPayload(envelope.payload)
  if (!payload) {
    return null
  }
  const { source, providerSession, hookEventName } = normalizeRemoteEnvelopeFields(envelope)
  const admission = {
    state,
    paneKey,
    source,
    providerSession,
    explicitPrompt: envelope.hasExplicitPrompt === true || hookEventName === 'UserPromptSubmit',
    senderProcess: readAgentProcessPresence(envelope.agentPresence)?.process
  }
  if (
    shouldRejectRelaySessionEvent(admission) ||
    shouldRejectRelayCodexTitleTask(admission, payload)
  ) {
    return null
  }
  return restoreRelayEchoedPrompt(admission, payload)
}
