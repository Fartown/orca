import {
  pickHostTurnEnd,
  type AgentStatusPayload
} from '../../../shared/agent-status/contracts/agent-status-types'
import type { AgentStatusIpcPayload } from '../../../shared/agent-status/contracts/agent-status-ipc-payload'

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
