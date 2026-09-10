import { expect, it } from 'vitest'
import { buildAgentStatusLiveEntry } from '../store/slices/agent-status-live-entry-builder'
import { createTestStore } from '../store/slices/store-test-helpers'
import { buildPaneActivityEvents } from '../components/activity/activity-pane-events'
import { agentStatusEntryEqual } from '../runtime/web-session-tabs-sync/state-equality-core'
import { buildRuntimeMobileAgentStatusProjectionForTests } from '../runtime/sync-runtime-graph/agent-status-projection'
import { getActivitySessionName } from './activity-session-name'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import {
  makeRepo,
  makeTab,
  makeWorktree,
  PANE_KEY
} from '../components/activity/ActivityPrototypePage-test-fixtures'

const previous: AgentStatusEntry = {
  paneKey: PANE_KEY,
  agentType: 'claude',
  providerSession: { key: 'session_id', id: 'A', transcriptPath: '/provider/A.jsonl' },
  connectionId: null,
  terminalTitle: 'A实时名',
  state: 'done',
  prompt: 'A原始任务',
  updatedAt: 10,
  stateStartedAt: 10,
  stateHistory: []
}

it.each([
  { state: 'working', hostStart: undefined, expectedStart: 20 },
  { state: 'done', hostStart: undefined, expectedStart: 20 },
  { state: 'done', hostStart: 10, expectedStart: 20 },
  { state: 'done', hostStart: 19, expectedStart: 19 }
] as const)(
  'the real entry producer keeps A history when B is $state with host start $hostStart',
  ({ state, hostStart, expectedStart }) => {
    const store = createTestStore()
    store.setState({ agentStatusByPaneKey: { [PANE_KEY]: previous } })
    const result = buildAgentStatusLiveEntry({
      state: store.getState(),
      paneKey: PANE_KEY,
      payload: { agentType: 'codex', state, prompt: 'B原始任务' },
      metadata: { providerSession: { key: 'session_id', id: 'B' } },
      timing: { updatedAt: 20, stateStartedAt: hostStart },
      updatedAt: 20
    })
    expect(result.entry).not.toBeNull()
    const entry = result.entry!
    const events = buildPaneActivityEvents({
      entry,
      worktree: makeWorktree(),
      repo: makeRepo(),
      tab: makeTab(),
      agentType: 'codex',
      agentAlive: true,
      liveState: state === 'working' ? 'working' : null,
      acknowledgedAt: 0,
      clearedAt: 0
    })
    const old = events.find((event) => event.timestamp === 10)!
    expect(old.entry.providerSession).toEqual(previous.providerSession)
    expect(old.agentType).toBe('claude')
    expect(old.entry.prompt).toBe('A原始任务')
    expect(old.entry.terminalTitle).toBe('A实时名')
    expect(entry.providerSession?.id).toBe('B')
    expect(entry.terminalTitle).toBeUndefined()
    expect(entry.stateStartedAt).toBe(expectedStart)
    if (state === 'done') {
      expect(events.map((event) => event.entry.providerSession?.id)).toEqual(['A', 'B'])
      expect(events.at(-1)?.timestamp).toBe(expectedStart)
      store.setState({ agentStatusByPaneKey: { [PANE_KEY]: entry } })
      const repeated = buildAgentStatusLiveEntry({
        state: store.getState(),
        paneKey: PANE_KEY,
        payload: { agentType: 'codex', state, prompt: 'B后续消息' },
        metadata: { providerSession: { key: 'session_id', id: 'B' } },
        timing: { updatedAt: 30, stateStartedAt: hostStart },
        updatedAt: 30
      })
      expect(repeated.entry?.stateStartedAt).toBe(expectedStart)
      expect(repeated.entry?.stateHistory).toHaveLength(1)
    }
    expect(
      getActivitySessionName(
        old.entry,
        {
          ...makeTab(),
          aiVaultTitle: {
            agent: 'codex',
            sessionId: 'B',
            title: 'B原生名',
            providerName: { kind: 'named', title: 'B原生名', field: 'session_index.thread_name' }
          }
        },
        true
      )
    ).toBe('A原始任务')
  }
)

it('paired entry equality and publication notice an optional history identity-only correction', () => {
  const a = {
    ...previous,
    stateHistory: [{ state: 'done' as const, prompt: '任务', startedAt: 1 }]
  }
  const b = {
    ...a,
    stateHistory: [
      {
        ...a.stateHistory[0],
        sessionName: {
          agentType: 'claude',
          providerSession: { key: 'session_id' as const, id: 'historic' }
        }
      }
    ]
  }
  expect(agentStatusEntryEqual(a, b)).toBe(false)
  expect(buildRuntimeMobileAgentStatusProjectionForTests({ [PANE_KEY]: a })).not.toBe(
    buildRuntimeMobileAgentStatusProjectionForTests({ [PANE_KEY]: b })
  )
  expect(agentStatusEntryEqual(b, JSON.parse(JSON.stringify(b)))).toBe(true)
})
