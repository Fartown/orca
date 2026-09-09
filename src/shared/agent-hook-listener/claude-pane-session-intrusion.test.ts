import { describe, expect, it } from 'vitest'
import {
  isIntrudingClaudePaneSession,
  releaseClaudePaneSessionSuppression
} from './claude-pane-session-intrusion'
import type { AgentHookEventPayload } from './listener-event'

function occupant(sessionId: string, state: 'working' | 'waiting' | 'done'): AgentHookEventPayload {
  return {
    paneKey: 'tab-1:leaf-1',
    connectionId: null,
    providerSession: { key: 'session_id', id: sessionId },
    payload: { state, prompt: '', agentType: 'claude' }
  } as unknown as AgentHookEventPayload
}

const PANE = 'tab-1:leaf-1'

describe('isIntrudingClaudePaneSession', () => {
  it('rejects a different session that arrives while the occupant is mid-turn', () => {
    const suppressed = new Map<string, string>()
    expect(
      isIntrudingClaudePaneSession({
        paneKey: PANE,
        previousStatus: occupant('real-session', 'working'),
        providerSession: { key: 'session_id', id: 'side-call' },
        suppressedSessionIdsByPaneKey: suppressed
      })
    ).toBe(true)
    expect(suppressed.get(PANE)).toBe('side-call')
  })

  it('keeps rejecting that session on its later events, not just the first', () => {
    const suppressed = new Map<string, string>([[PANE, 'side-call']])
    // The occupant row is already gone/idle by now; the id itself stays suppressed.
    expect(
      isIntrudingClaudePaneSession({
        paneKey: PANE,
        previousStatus: occupant('real-session', 'done'),
        providerSession: { key: 'session_id', id: 'side-call' },
        suppressedSessionIdsByPaneKey: suppressed
      })
    ).toBe(true)
  })

  it('admits a new session on an idle pane, which is how a user starts one', () => {
    const suppressed = new Map<string, string>()
    expect(
      isIntrudingClaudePaneSession({
        paneKey: PANE,
        previousStatus: occupant('previous-session', 'done'),
        providerSession: { key: 'session_id', id: 'user-started' },
        suppressedSessionIdsByPaneKey: suppressed
      })
    ).toBe(false)
    expect(suppressed.size).toBe(0)
  })

  it('admits the first session on a pane that has none', () => {
    expect(
      isIntrudingClaudePaneSession({
        paneKey: PANE,
        previousStatus: undefined,
        providerSession: { key: 'session_id', id: 'fresh-tab' },
        suppressedSessionIdsByPaneKey: new Map()
      })
    ).toBe(false)
  })

  it('admits the occupant its own busy events', () => {
    expect(
      isIntrudingClaudePaneSession({
        paneKey: PANE,
        previousStatus: occupant('real-session', 'working'),
        providerSession: { key: 'session_id', id: 'real-session' },
        suppressedSessionIdsByPaneKey: new Map()
      })
    ).toBe(false)
  })

  it('ignores events that carry no session at all', () => {
    expect(
      isIntrudingClaudePaneSession({
        paneKey: PANE,
        previousStatus: occupant('real-session', 'working'),
        providerSession: null,
        suppressedSessionIdsByPaneKey: new Map()
      })
    ).toBe(false)
  })

  it('scopes suppression to the pane it was seen on', () => {
    const suppressed = new Map<string, string>([[PANE, 'side-call']])
    expect(
      isIntrudingClaudePaneSession({
        paneKey: 'tab-2:leaf-1',
        previousStatus: undefined,
        providerSession: { key: 'session_id', id: 'side-call' },
        suppressedSessionIdsByPaneKey: suppressed
      })
    ).toBe(false)
  })
})

describe('releaseClaudePaneSessionSuppression', () => {
  it('clears the pane once a different session legitimately takes it', () => {
    const suppressed = new Map<string, string>([[PANE, 'side-call']])
    releaseClaudePaneSessionSuppression(suppressed, PANE, 'compacted-session')
    expect(suppressed.has(PANE)).toBe(false)
  })

  it('keeps the entry while the suppressed session is still the one reporting', () => {
    const suppressed = new Map<string, string>([[PANE, 'side-call']])
    releaseClaudePaneSessionSuppression(suppressed, PANE, 'side-call')
    expect(suppressed.get(PANE)).toBe('side-call')
  })
})
