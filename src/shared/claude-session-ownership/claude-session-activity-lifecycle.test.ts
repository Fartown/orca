import { describe, expect, it } from 'vitest'
import {
  clearAllListenerCaches,
  clearPaneCacheState,
  clearPaneTurnCacheState,
  createHookListenerState,
  movePaneCacheState,
  paneHasStateClaims
} from '../agent-hook-listener/listener-state'
import { shouldRejectClaudeSessionReplacement } from './claude-session-activity'

describe('Claude activity follows existing listener lifecycle', () => {
  function populated() {
    const state = createHookListenerState()
    state.claudeSessionActivityByPaneKey.set('pane-a', {
      sessionId: 'a',
      observedAt: performance.now()
    })
    state.lastStatusByPaneKey.set('pane-a', {
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
    state.lastStatusByPaneKey.clear()
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
