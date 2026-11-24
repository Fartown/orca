import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  durableChatProviderSession,
  durableChatSubmissionSession,
  type DurableChatSessionRuntime
} from './durable-chat-transcript-boundary'
import type { AgentStatusIpcPayload } from '../../shared/agent-status/contracts/agent-status-ipc-payload'
import type { ExactWorkerProviderSession } from '../../shared/orchestration/workers/orchestration-worker-output'
import { OrcaRuntimeService } from '../runtime/orca-runtime'

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
  it('requires an exact original process and a new provider turn, retaining proof through Stop but not OSC or replay', () => {
    const f = fixture()
    const runtime = new OrcaRuntimeService(null)
    vi.spyOn(runtime, 'getTerminalPromptRequestBinding').mockReturnValue({
      ptyId: 'pty',
      processIncarnation: 'inc',
      generation: 0
    })
    vi.spyOn(runtime, 'getExactWorkerProviderSession').mockImplementation(
      f.runtime.getExactWorkerProviderSession
    )
    vi.spyOn(runtime, 'getAgentProviderSessionRows').mockImplementation(
      f.runtime.getAgentProviderSessionRows
    )
    vi.spyOn(runtime, 'readObservedAgentStatusPaneIdentityFn').mockImplementation(
      f.runtime.readObservedAgentStatusPaneIdentityFn
    )
    vi.spyOn(runtime, 'getAgentStatusTerminalHandleForPaneKey').mockImplementation(
      f.runtime.getAgentStatusTerminalHandleForPaneKey
    )
    vi.spyOn(runtime, 'getAgentStatusOrchestrationContextForPaneKey').mockImplementation(
      f.runtime.getAgentStatusOrchestrationContextForPaneKey
    )
    vi.spyOn(runtime, 'getTerminalProcessIncarnation').mockImplementation(
      f.runtime.getTerminalProcessIncarnation
    )
    f.row.turnStartedAt = 110
    f.row.observation = {
      origin: 'hook',
      kind: 'transition',
      authorityId: 'host',
      incarnation: 1,
      revision: 1,
      observedAt: 120
    }
    const verify = () =>
      runtime.verifyRestoredChatProviderSession('canonical', 'pty', 'inc', 'session', 100)
    expect(verify()).toBe(true)
    expect(
      runtime.verifyRestoredChatProviderSession('canonical', 'pty', 'old-inc', 'session', 100)
    ).toBe(false)
    f.row.observation.origin = 'osc'
    expect(verify()).toBe(false)
    f.row.observation.origin = 'hook'
    f.row.observation.kind = 'snapshot'
    expect(verify()).toBe(false)
    f.row.observation.kind = 'transition'
    f.row.turnStartedAt = 90
    expect(verify()).toBe(false)
    f.row.turnStartedAt = 110
    f.row.restoredUnconfirmed = true
    expect(verify()).toBe(false)
  })
  it('allows an explicitly restored physical terminal to take input without claiming its cached session is live', () => {
    const f = fixture()
    f.row.restoredUnconfirmed = true
    vi.spyOn(f.runtime, 'getExactWorkerProviderSession').mockReturnValue(null)
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
      launchTokenHash: null
    })
    expect(() => durableChatSubmissionSession(f.runtime, 'canonical', 'session', false)).toThrow(
      'terminal_handle_stale'
    )
    expect(durableChatSubmissionSession(f.runtime, 'canonical', 'session', true)).toEqual({
      session: f.row.providerSession,
      sessionUnverifiedAtSubmit: true
    })
    f.row.providerSession = { key: 'session_id', id: 'different-session' }
    expect(() => durableChatSubmissionSession(f.runtime, 'canonical', 'session', true)).toThrow(
      'terminal_handle_stale'
    )
    f.row.providerSession = { key: 'session_id', id: 'session' }
    vi.mocked(f.runtime.readObservedAgentStatusPaneIdentityFn).mockReturnValue({
      kind: 'observed',
      terminalHandle: 'canonical',
      processIncarnation: 'pty:old-inc',
      dispatchId: null
    })
    expect(() => durableChatSubmissionSession(f.runtime, 'canonical', 'session', true)).toThrow(
      'terminal_handle_stale'
    )
  })
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
