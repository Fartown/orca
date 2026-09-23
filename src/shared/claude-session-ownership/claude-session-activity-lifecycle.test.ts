import { describe, expect, it } from 'vitest'
import {
  clearAllListenerCaches,
  clearLegacyAgentStatuses,
  clearPaneCacheState,
  clearPaneTurnCacheState,
  createHookListenerState,
  movePaneCacheState,
  paneHasStateClaims,
  seedLegacyAgentStatusForTests
} from '../agent-hook-listener/listener-state'
import { normalizeHookPayload } from '../agent-hook-listener'
import { makePaneKey } from '../stable-pane-id'
import { shouldRejectClaudeSessionReplacement } from './claude-session-activity'

describe('Claude activity follows existing listener lifecycle', () => {
  function populated() {
    const state = createHookListenerState()
    state.claudeSessionActivityByPaneKey.set('pane-a', {
      sessionId: 'a',
      observedAt: performance.now()
    })
    seedLegacyAgentStatusForTests(state, {
      paneKey: 'pane-a',
      connectionId: null,
      source: 'claude',
      providerSession: { key: 'session_id', id: 'a' },
      payload: { state: 'working', agentType: 'claude', prompt: 'task' }
    })
    return state
  }

  it('moves activity with the pane alias, retaining its observation time', () => {
    const state = populated()
    const activity = state.claudeSessionActivityByPaneKey.get('pane-a')
    movePaneCacheState(state, 'pane-a', 'pane-b')
    expect(state.claudeSessionActivityByPaneKey.has('pane-a')).toBe(false)
    expect(state.claudeSessionActivityByPaneKey.get('pane-b')).toBe(activity)
    expect(shouldRejectClaudeSessionReplacement(state, 'pane-b', 'b')).toBe(true)
  })

  it('does not expire at a turn boundary, but clears at pane teardown', () => {
    const state = populated()
    clearPaneTurnCacheState(state, 'pane-a')
    expect(shouldRejectClaudeSessionReplacement(state, 'pane-a', 'b')).toBe(true)
    clearPaneCacheState(state, 'pane-a')
    expect(state.claudeSessionActivityByPaneKey.size).toBe(0)
    expect(shouldRejectClaudeSessionReplacement(state, 'pane-a', 'b')).toBe(false)
  })

  it('clears on listener reset and never counts activity alone as liveness', () => {
    const state = populated()
    clearLegacyAgentStatuses(state)
    expect(paneHasStateClaims(state, 'pane-a')).toBe(false)
    expect(shouldRejectClaudeSessionReplacement(state, 'pane-a', 'b')).toBe(false)
    clearAllListenerCaches(state)
    expect(state.claudeSessionActivityByPaneKey.size).toBe(0)
  })

  it('does not lend a timestamp to another identity, pane, or listener', () => {
    const state = populated()
    state.claudeSessionActivityByPaneKey.set('pane-a', {
      sessionId: 'stale',
      observedAt: performance.now()
    })
    expect(shouldRejectClaudeSessionReplacement(state, 'pane-a', 'b')).toBe(false)
    expect(shouldRejectClaudeSessionReplacement(state, 'pane-b', 'b')).toBe(false)
    expect(shouldRejectClaudeSessionReplacement(createHookListenerState(), 'pane-a', 'b')).toBe(
      false
    )
  })
})

const REPLACEMENT_PANE = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

describe('a rejected session replacement leaves the incumbent state alone', () => {
  it('keeps the pending restored-unconfirmed mark', () => {
    const state = populatedForReplacement()
    state.claudeUnconfirmedRestoredStatusPaneKeys.add(REPLACEMENT_PANE)
    // Guard must actually fire, or this proves nothing.
    expect(shouldRejectClaudeSessionReplacement(state, REPLACEMENT_PANE, 'b')).toBe(true)
    // Why this ordering is load-bearing: upstream clears the mark before any guard runs. This
    // fork rejects an event that belongs to a different session, and spending the incumbent's
    // mark on it would publish its next restored status as confirmed.
    const rejected = normalizeHookPayload(
      state,
      'claude',
      {
        paneKey: REPLACEMENT_PANE,
        payload: { hook_event_name: 'Stop', session_id: 'b', agentType: 'claude' }
      },
      'production'
    )
    expect(rejected).toBeNull()
    expect(state.claudeUnconfirmedRestoredStatusPaneKeys.has(REPLACEMENT_PANE)).toBe(true)
  })
})

function populatedForReplacement() {
  const state = createHookListenerState()
  state.claudeSessionActivityByPaneKey.set(REPLACEMENT_PANE, {
    sessionId: 'a',
    observedAt: performance.now()
  })
  seedLegacyAgentStatusForTests(state, {
    paneKey: REPLACEMENT_PANE,
    connectionId: null,
    source: 'claude',
    providerSession: { key: 'session_id', id: 'a' },
    payload: { state: 'working', agentType: 'claude', prompt: 'task' }
  })
  return state
}
