import { beforeEach, expect, it, vi } from 'vitest'
import { createRemoteRuntimeTransportMocks } from '../components/terminal-pane/pty-transport/remote/remote-runtime-pty-transport-test-harness'
import type { MultiplexSubscriptionCallbacks } from '../components/terminal-pane/pty-transport/remote/remote-runtime-pty-transport-stream-fixtures'

const state = vi.hoisted(() => ({ runtimeStatusByEnvironmentId: new Map() }))
vi.mock('@/store/index', () => ({ useAppStore: { getState: () => state } }))
let callbacks: MultiplexSubscriptionCallbacks = null
let resolvedHandle = ''
const fixture = createRemoteRuntimeTransportMocks({
  getCallbacks: () => callbacks,
  setCallbacks: (value) => {
    callbacks = value
  },
  getResolvedPaneHandle: () => resolvedHandle,
  setResolvedPaneHandle: (value) => {
    resolvedHandle = value
  }
})
beforeEach(() => {
  fixture.resetRemoteRuntimeTransport()
  state.runtimeStatusByEnvironmentId.clear()
})
it.each([
  'match',
  'different-leaf',
  'different-workspace',
  'no-incarnation',
  'no-contact',
  'exited'
] as const)(
  'reconciles a stale first activation only with fresh ownership evidence: %s',
  async (scenario) => {
    if (scenario !== 'no-contact') {
      state.runtimeStatusByEnvironmentId.set('env-1', { remoteControl: { state: 'ready' } })
    }
    let reads = 0
    const runtimeCall = fixture.runtimeCall.getMockImplementation()!
    fixture.runtimeCall.mockImplementation(async (request) => {
      if (request.method === 'session.tabs.activate') {
        return {
          ok: false,
          error: { code: 'terminal_handle_stale', message: 'terminal_handle_stale' }
        }
      }
      if (request.method !== 'terminal.resolvePane') {
        return runtimeCall(request)
      }
      reads++
      return {
        ok: true,
        result: {
          terminal: {
            tabId: 'host-tab-1',
            leafId: scenario === 'different-leaf' ? 'sibling' : 'pane:1',
            worktreeId: scenario === 'different-workspace' ? 'wt-2' : 'wt-1',
            connected: scenario !== 'exited',
            ptyId: 'pty',
            incarnationId: scenario === 'no-incarnation' ? null : 'current',
            handle: reads === 1 ? 'pre-activation' : 'current-handle'
          }
        }
      }
    })
    const { createRemoteRuntimePtyTransport } =
      await import('../components/terminal-pane/pty-transport/remote-runtime/remote-runtime-pty-transport')
    const transport = createRemoteRuntimePtyTransport('env-1', {
      worktreeId: 'wt-1',
      tabId: 'web-terminal-host-tab-1',
      leafId: 'pane:1'
    })
    try {
      const onError = vi.fn()
      const result = await transport.connect({
        url: '',
        cols: 80,
        rows: 24,
        sessionId: 'remote:env-1@@previous-handle',
        callbacks: { onError }
      })
      expect(reads).toBe(scenario === 'no-contact' ? 1 : 2)
      expect(
        fixture.runtimeCall.mock.calls.filter(([r]) => r.method === 'session.tabs.activate')
      ).toHaveLength(1)
      if (scenario === 'match') {
        expect(result).toMatchObject({ id: 'remote:env-1@@current-handle' })
        fixture.emitSnapshot(fixture.latestSubscribePayload().streamId, 'after resume')
        expect(transport.isConnected()).toBe(true)
        expect(onError).not.toHaveBeenCalled()
      } else {
        expect(onError).toHaveBeenCalledWith('terminal_handle_stale')
        expect(fixture.runtimeSubscribe).not.toHaveBeenCalled()
      }
    } finally {
      transport.destroy?.()
    }
  }
)
