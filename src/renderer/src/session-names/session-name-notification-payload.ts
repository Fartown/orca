import {
  pickHostTurnEnd,
  type AgentStatusIpcPayload,
  type AgentStatusPayload
} from '../../../shared/agent-status-types'

/** Completion timing and conversation identity must describe the same host event. */
export function sessionNameNotificationPayload<Payload extends AgentStatusPayload>(
  payload: Payload,
  event: AgentStatusIpcPayload
) {
  return {
    ...payload,
    stateStartedAt: event.stateStartedAt,
    ...pickHostTurnEnd(event),
    ...(event.providerSession ? { providerSession: event.providerSession } : {})
  }
}
