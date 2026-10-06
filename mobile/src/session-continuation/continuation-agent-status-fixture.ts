import type { AgentStatusEntry } from '../../../src/shared/agent-status-types'

/** A complete status row for tests that read only the members continuation looks at. */
export function continuationAgentStatus(
  overrides: Partial<AgentStatusEntry> = {}
): AgentStatusEntry {
  return {
    state: 'done',
    prompt: '',
    updatedAt: 0,
    stateStartedAt: 0,
    paneKey: 'tab-1:1',
    stateHistory: [],
    ...overrides
  }
}
