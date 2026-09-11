import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentHookServer } from '../agent-hooks/server'
import { normalizeHookPayload } from '../../shared/agent-hook-listener'
import { makePaneKey } from '../../shared/stable-pane-id'

const PANE = makePaneKey('owner-window', '11111111-1111-4111-8111-111111111111')
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('Claude incumbent activity window', () => {
  let server: AgentHookServer
  let now: number

  beforeEach(() => {
    server = new AgentHookServer()
    now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })

  afterEach(() => {
    server.stop()
    vi.restoreAllMocks()
  })

  function accept(id: string, name = 'UserPromptSubmit', extra: Record<string, unknown> = {}) {
    const event = normalizeHookPayload(
      server._getStateForTests(),
      'claude',
      {
        paneKey: PANE,
        payload: { hook_event_name: name, session_id: id, prompt: 'incumbent task', ...extra }
      },
      'production'
    )
    if (event) {
      server.ingestRemote(event, 'test-ssh-host')
    }
    return event
  }

  it('rejects a competing SessionStart before owner, prompt, or status changes', () => {
    accept(A)
    const state = server._getStateForTests()
    const previous = state.lastStatusByPaneKey.get(PANE)
    expect(accept(B, 'SessionStart', { source: 'startup' })).toBeNull()
    expect(state.lastStatusByPaneKey.get(PANE)).toBe(previous)
    expect(state.claudeSessionOwnerByPaneKey.get(PANE)).toBe(A)
    expect(state.lastPromptByPaneKey.get(PANE)).toBe('incumbent task')
  })

  it.each([29_999, 30_000, 30_001])('uses the exact window boundary at %i ms', (age) => {
    accept(A)
    now += age
    const event = accept(B, 'SessionStart', { source: 'startup' })
    expect(event !== null).toBe(age >= 30_000)
  })

  it('does not let prompt, tool, and Stop traffic bypass a rejected startup', () => {
    accept(A)
    accept(B, 'SessionStart', { source: 'startup' })
    for (const name of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) {
      expect(accept(B, name, { prompt: 'side call', tool_name: 'Bash' })).toBeNull()
      expect(server._getStateForTests().lastStatusByPaneKey.get(PANE)?.providerSession?.id).toBe(A)
    }
  })

  it('refreshes from incumbent events, but never from a rejected competitor', () => {
    accept(A)
    now += 29_000
    accept(A, 'PreToolUse', { tool_name: 'Bash' })
    now += 29_999
    expect(accept(B, 'SessionStart', { source: 'startup' })).toBeNull()
    now += 1
    expect(accept(B, 'SessionStart', { source: 'startup' })?.providerSession?.id).toBe(B)
  })

  it('accepts a first session and same-id startup, resume, and clear', () => {
    for (const source of ['startup', 'resume', 'clear']) {
      expect(accept(A, 'SessionStart', { source })?.providerSession?.id).toBe(A)
    }
  })

  it.each(['compact', 'unknown', undefined])('preserves existing rejected source %s', (source) => {
    accept(A)
    now += 30_000
    const activity = server._getStateForTests().claudeSessionActivityByPaneKey.get(PANE)
    expect(accept(B, 'SessionStart', { source })).toBeNull()
    expect(server._getStateForTests().claudeSessionActivityByPaneKey.get(PANE)).toBe(activity)
  })

  it('keeps same-parent subagents visible without granting child SessionStart', () => {
    accept(A)
    expect(accept(A, 'SessionStart', { source: 'startup', agent_id: 'child' })).toBeNull()
    const child = accept(A, 'SubagentStart', { agent_id: 'child', agent_type: 'Explore' })
    expect(child?.providerSession?.id).toBe(A)
    expect(child?.payload.subagents).toEqual([
      expect.objectContaining({ id: 'child', state: 'working' })
    ])
    accept(A, 'SubagentStop', { agent_id: 'child' })
    expect(server._getStateForTests().lastStatusByPaneKey.get(PANE)?.providerSession?.id).toBe(A)
  })

  it('guards old-relay normalized traffic without relying on relay enforcement', () => {
    const incumbent = accept(A)!
    server.ingestRemote(
      { ...incumbent, providerSession: { key: 'session_id', id: B } },
      'test-ssh-host'
    )
    expect(server._getStateForTests().lastStatusByPaneKey.get(PANE)?.providerSession?.id).toBe(A)
  })

  it('does not refresh activity from replay or rejected status application', () => {
    const incumbent = accept(A)!
    now += 29_000
    server.ingestRemote({ ...incumbent, isReplay: true }, 'test-ssh-host')
    server.ingestRemote({ ...incumbent, tabId: 'mismatched-tab' }, 'test-ssh-host')
    now += 1_000
    expect(accept(B, 'SessionStart', { source: 'startup' })?.providerSession?.id).toBe(B)
  })

  it('falls back to existing admission on a cold restored identity with no activity', () => {
    accept(A)
    server._getStateForTests().claudeSessionActivityByPaneKey.clear()
    expect(accept(B, 'SessionStart', { source: 'startup' })?.providerSession?.id).toBe(B)
  })

  it('does not refresh the hook clock from OSC or normalization without acceptance', () => {
    accept(A)
    now += 29_000
    normalizeHookPayload(
      server._getStateForTests(),
      'claude',
      {
        paneKey: PANE,
        payload: { hook_event_name: 'UserPromptSubmit', session_id: A, prompt: 'not accepted' }
      },
      'production'
    )
    server.ingestTerminalStatus({
      paneKey: PANE,
      connectionId: 'test-ssh-host',
      payload: { agentType: 'claude', state: 'working', prompt: 'OSC repaint' }
    })
    now += 1_000
    expect(accept(B, 'SessionStart', { source: 'startup' })?.providerSession?.id).toBe(B)
  })

  it('uses monotonic observation time despite a wall-clock change', () => {
    accept(A)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86_400_000)
    expect(accept(B, 'SessionStart', { source: 'startup' })).toBeNull()
    now += 30_000
    expect(accept(B, 'SessionStart', { source: 'startup' })).not.toBeNull()
  })

  it('preserves Codex child suppression and events without a Claude identity', () => {
    accept(A)
    const state = server._getStateForTests()
    const codex = normalizeHookPayload(
      state,
      'codex',
      {
        paneKey: PANE,
        payload: { hook_event_name: 'SessionStart', session_id: B }
      },
      'production'
    )
    expect(codex?.providerSession?.id).toBe(B)
    const child = normalizeHookPayload(
      state,
      'codex',
      {
        paneKey: PANE,
        payload: { hook_event_name: 'SubagentStart', session_id: B, agent_id: 'child' }
      },
      'production'
    )
    expect(child?.providerSession).toBeUndefined()
    expect(accept(A, 'UserPromptSubmit', { session_id: undefined })).not.toBeNull()
  })
})
