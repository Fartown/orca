import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import { buildPaneActivityEvents } from '../components/activity/events/activity-pane-events'
import { activityThreadStatusId } from '../components/activity/threads/activity-thread-presentation'
import type { AgentPaneThread } from '../components/activity/threads/activity-thread-types'
import { makeTab, makeWorktree } from './activity-restored-test-fixtures'

const paneKey = 'tab-1:11111111-1111-4111-8111-111111111111'

describe('restored terminal attention', () => {
  it.each(['waiting', 'blocked'] as const)(
    'keeps earlier events but does not present restored %s as a current request',
    (state) => {
      const entry: AgentStatusEntry = {
        paneKey,
        agentType: 'claude',
        state,
        prompt: 'Unconfirmed request',
        updatedAt: 2_000,
        stateStartedAt: 2_000,
        restoredUnconfirmed: true,
        stateHistory: [{ state: 'done', prompt: 'Earlier turn', startedAt: 1_000 }]
      }
      const tab = makeTab()
      const worktree = makeWorktree()
      const events = buildPaneActivityEvents({
        entry,
        tab,
        worktree,
        repo: null,
        agentType: 'claude',
        agentAlive: false,
        acknowledgedAt: 0,
        clearedAt: 0,
        liveState: null
      })
      expect(events.map((event) => [event.state, event.timestamp])).toEqual([['done', 1_000]])
      const thread: AgentPaneThread = {
        paneKey,
        paneTitle: 'Earlier turn',
        tab,
        worktree,
        repo: null,
        agentType: 'claude',
        currentAgentState: null,
        currentAgentEntry: null,
        paneEntry: entry,
        responsePreview: '',
        latestTimestamp: 1_000,
        latestEvent: events[0],
        events,
        unread: true
      }
      expect(activityThreadStatusId(thread)).toBe('done')
    }
  )
})
