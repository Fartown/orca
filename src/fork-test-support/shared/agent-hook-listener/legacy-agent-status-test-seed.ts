import { AGENT_STATUS_2A_CURRENT_PRODUCER_MODE } from '../../../shared/agent-status/transport/agent-status-legacy-adapter'
import type { AgentHookEventPayload } from '../../../shared/agent-hook-listener/listener-event'
import {
  admitLegacyAgentStatus,
  type HookListenerState
} from '../../../shared/agent-hook-listener/listener-state'

/** Test harnesses seed the same compatibility region without exposing a mutable Map. */
export function seedLegacyAgentStatusForTests(
  state: HookListenerState,
  entry: AgentHookEventPayload
): void {
  if (
    !admitLegacyAgentStatus(
      state,
      'main-status-update',
      entry,
      AGENT_STATUS_2A_CURRENT_PRODUCER_MODE
    )
  ) {
    throw new Error('Test legacy agent-status seed was refused')
  }
}
