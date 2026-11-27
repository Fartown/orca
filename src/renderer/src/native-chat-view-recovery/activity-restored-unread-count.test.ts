import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import { countActivityUnread } from '../components/activity/events/useActivityUnreadCount'
import { acceptedAgentStatuses } from '../store/slices/agent-status/status-ownership/accepted-agent-statuses'
import { createTestStore } from '../store/testing/app-store-test-fixture'
import { makeTab } from './activity-restored-test-fixtures'

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

// Upstream #45835 counts only panes that own a workspace row, so the pane needs its tab in a real store.
function makeSource(entry: AgentStatusEntry, ackAt = 0) {
  const store = createTestStore()
  store.setState({
    tabsByWorktree: { 'wt-1': [makeTab()] },
    agentStatusByPaneKey: acceptedAgentStatuses([[PANE, entry]])
  })
  return {
    acknowledgedAgentsByPaneKey: { [PANE]: ackAt },
    agentStatusByPaneKey: store.getState().agentStatusByPaneKey,
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
