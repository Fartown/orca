import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import { countActivityUnread } from '../components/activity/events/useActivityUnreadCount'
import { AcceptedAgentStatuses } from '../store/slices/agent-status/status-ownership/accepted-agent-statuses'

const PANE = 'tab-1:11111111-1111-4111-8111-111111111111'

function makeEntry(overrides: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'done',
    prompt: '',
    updatedAt: 2_000,
    stateStartedAt: 2_000,
    paneKey: PANE,
    agentType: 'claude',
    stateHistory: [],
    ...overrides
  }
}

function makeSource(entry: AgentStatusEntry, ackAt = 0) {
  return {
    acknowledgedAgentsByPaneKey: { [PANE]: ackAt },
    agentStatusByPaneKey: new AcceptedAgentStatuses(new Map([[PANE, entry]])),
    migrationUnsupportedByPtyId: {}
  }
}

// Ported from the upstream useActivityUnreadCount suite that upstream retired as low-value (#42670).
describe('restored nonterminal attention', () => {
  it.each(['waiting', 'blocked'] as const)(
    'does not count an unconfirmed %s as a new current reminder while retaining earlier history',
    (state) => {
      const entry = makeEntry({
        state,
        restoredUnconfirmed: true,
        stateStartedAt: 2_000,
        stateHistory: [{ state: 'waiting', prompt: 'Earlier request', startedAt: 1_000 }]
      })
      expect(countActivityUnread(makeSource(entry), 2_000)).toBe(1)
      expect(countActivityUnread(makeSource(entry, 1_500), 2_000)).toBe(0)
    }
  )
})
