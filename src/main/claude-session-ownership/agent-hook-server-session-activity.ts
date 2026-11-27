import { AgentHookServerStatusRowMutation } from '../agent-hooks/server/server-status-row-mutation'
import type {
  EnrichedAgentHookEventPayload,
  IncomingAgentHookEvent
} from '../agent-hooks/server/server-types'
import { recordClaudeSessionActivity } from '../../shared/claude-session-ownership/claude-session-activity'

/** Seats the Claude session-ownership activity record in the hook server's accepted-row commit. */
export abstract class AgentHookServerSessionActivity extends AgentHookServerStatusRowMutation {
  protected commitAcceptedStatusRow(
    before: EnrichedAgentHookEventPayload | undefined,
    accepted: EnrichedAgentHookEventPayload,
    incoming: IncomingAgentHookEvent,
    fromAgentHook: boolean
  ): void {
    this.commitAppliedStatusRow(before, accepted, fromAgentHook)
    // Independent of the row-store bookkeeping above; the sender's own process proves ownership.
    recordClaudeSessionActivity(this.state, accepted, accepted.isReplay, incoming)
  }
}
