import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  durableChatProviderSession,
  type DurableChatSessionRuntime
} from './durable-chat-transcript-boundary'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { ExactWorkerProviderSession } from '../../shared/orchestration-worker-output'

function fixture() {
  const row: AgentStatusIpcPayload = {
    paneKey: 'pane',
    agentType: 'codex',
    state: 'done',
    prompt: '',
    connectionId: null,
    receivedAt: 10,
    stateStartedAt: 10,
    providerSession: { key: 'session_id', id: 'session' }
  }
  const exact: ExactWorkerProviderSession = {
    paneKey: 'pane',
    agent: 'codex',
    processIncarnation: 'pty:inc',
    providerSession: { key: 'session_id', id: 'session' },
    observedAt: 10
  }
  const runtime: DurableChatSessionRuntime = {
    getOrchestrationDispatchAuthority: () => null,
    getExactWorkerProviderSession: () => exact,
    getAgentProviderSessionRows: () => [row],
    getAgentStatusTerminalHandleForPaneKey: () => 'canonical',
    getAgentStatusOrchestrationContextForPaneKey: () => undefined,
    getTerminalProcessIncarnation: () => 'pty:inc',
    readObservedAgentStatusPaneIdentityFn: () => ({
      kind: 'observed',
      terminalHandle: 'canonical',
      processIncarnation: 'pty:inc',
      dispatchId: null
    })
  }
  return { runtime, exact, row }
}

describe('durable Chat provider ownership', () => {
  it('uses the host selector and observed process identity, including a retained handle alias', () => {
    const f = fixture()
    expect(durableChatProviderSession(f.runtime, 'retained-alias', 'session')).toEqual(
      f.exact.providerSession
    )
  })

  it.each(['restoredUnconfirmed', 'providerSessionOnly'] as const)(
    'refuses an identity-only or restored row: %s',
    (flag) => {
      const f = fixture()
      f.row[flag] = true
      expect(() => durableChatProviderSession(f.runtime, 'canonical', 'session')).toThrow(
        'terminal_handle_stale'
      )
    }
  )

  it('does not attribute an old session row to a replacement process or an unobserved pane', () => {
    const f = fixture()
    vi.spyOn(f.runtime, 'readObservedAgentStatusPaneIdentityFn').mockReturnValue({
      kind: 'observed',
      terminalHandle: 'canonical',
      processIncarnation: 'pty:old-inc',
      dispatchId: null
    })
    expect(() => durableChatProviderSession(f.runtime, 'canonical', 'session')).toThrow(
      'terminal_handle_stale'
    )
    vi.mocked(f.runtime.readObservedAgentStatusPaneIdentityFn).mockReturnValue({
      kind: 'unobserved'
    })
    expect(() => durableChatProviderSession(f.runtime, 'canonical', 'session')).toThrow(
      'terminal_handle_stale'
    )
  })

  it('proves an early hook from the current launch secret without retroactively claiming an old row', () => {
    const f = fixture()
    f.row.launchToken = 'current-launch'
    vi.spyOn(f.runtime, 'readObservedAgentStatusPaneIdentityFn').mockReturnValue({
      kind: 'unobserved'
    })
    vi.spyOn(f.runtime, 'getOrchestrationDispatchAuthority').mockReturnValue({
      runtimeId: 'runtime',
      terminalHandle: 'canonical',
      ptyId: 'pty',
      worktreeId: 'work',
      paneKey: 'pane',
      processIncarnation: 'pty:inc',
      hostScope: { kind: 'local', hostId: 'local' },
      launchTokenHash: createHash('sha256').update('current-launch').digest('hex')
    })
    expect(durableChatProviderSession(f.runtime, 'canonical', 'session')).toEqual(
      f.exact.providerSession
    )
    f.row.launchToken = 'old-launch'
    expect(() => durableChatProviderSession(f.runtime, 'canonical', 'session')).toThrow(
      'terminal_handle_stale'
    )
  })

  it('refuses a changed provider session or a host/launch-token mismatch from the existing selector', () => {
    const f = fixture()
    expect(() => durableChatProviderSession(f.runtime, 'canonical', 'old-session')).toThrow(
      'terminal_handle_stale'
    )
    vi.spyOn(f.runtime, 'getExactWorkerProviderSession').mockReturnValue(null)
    expect(() => durableChatProviderSession(f.runtime, 'canonical', 'session')).toThrow(
      'terminal_handle_stale'
    )
  })
})
