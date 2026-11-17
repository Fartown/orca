import { bindPtyConnectionTestMocks } from './pty-connection-mocks.spec'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { flushAsyncTicks } from './pty-connection-test-async'
import {
  LEAF_1,
  createMockTransport,
  createPane,
  createManager,
  type ConnectCallbacks,
  type MockTransport
} from './pty-connection-test-pane-fixtures'
import type { StoreState } from './pty-connection-test-store-state'
import { buildPaneConnectionDeps } from './pty-connection-test-deps'
import { createInitialStoreState } from './pty-connection-test-store-fixtures'
import {
  installTerminalTestGlobals,
  restoreTerminalTestGlobals
} from './pty-connection-test-environment'

export function registerPtyConnectionUnansweredCommandFinishTests(): void {
  let mockStoreState: StoreState
  let transportFactoryQueue: MockTransport[] = []
  let createdTransportOptions: Record<string, unknown>[] = []
  let storeSubscribers: ((state: StoreState) => void)[] = []

  function createDeps(overrides: Record<string, unknown> = {}) {
    return buildPaneConnectionDeps(() => mockStoreState, overrides)
  }

  describe('command-finished cleanup when the shell check cannot answer', () => {
    beforeEach(async () => {
      vi.resetModules()
      vi.clearAllMocks()
      transportFactoryQueue = []
      createdTransportOptions = []
      storeSubscribers = []
      mockStoreState = createInitialStoreState(() => mockStoreState)
      bindPtyConnectionTestMocks({
        getState: () => mockStoreState,
        getTransportQueue: () => transportFactoryQueue,
        getTransportOptions: () => createdTransportOptions,
        getStoreSubscribers: () => storeSubscribers,
        setStoreSubscribers: (subscribers) => {
          storeSubscribers = subscribers
        }
      })
      await installTerminalTestGlobals()
    })

    afterEach(async () => {
      await restoreTerminalTestGlobals()
    })

    it.each([false, true])(
      'retains an out-of-contact SSH row regardless of local verifiability %s, then accepts source shell proof',
      async (verifiable) => {
        vi.useFakeTimers()
        const { connectPanePty } = await import('./pty-connection')
        vi.mocked(window.api.pty.confirmForegroundProcess).mockResolvedValue(null)
        const hasVerifiableAgentProcess = vi.fn(async () => verifiable)
        Object.assign(window.api.agentStatus, { hasVerifiableAgentProcess })
        const dataCallbackRef: { current: ((data: string) => void) | null } = { current: null }
        const ptyId = 'ssh:conn@@pty-codex-exit'
        const tabId = 'tab-ssh-codex-exit'
        const paneKey = makePaneKey(tabId, LEAF_1)
        const transport = createMockTransport(ptyId)
        transport.connect.mockImplementation(
          async ({ callbacks }: { callbacks: ConnectCallbacks }) => {
            dataCallbackRef.current = callbacks.onData ?? null
            return { id: ptyId, incarnationId: 'source-incarnation' }
          }
        )
        transportFactoryQueue.push(transport)
        mockStoreState = {
          ...mockStoreState,
          agentStatusByPaneKey: {
            [paneKey]: {
              paneKey,
              state: 'done',
              prompt: 'remote task',
              updatedAt: 1_000,
              stateStartedAt: 900,
              agentType: 'codex',
              terminalTitle: 'Codex',
              stateHistory: []
            }
          }
        }

        connectPanePty(
          createPane(1) as never,
          createManager(1) as never,
          createDeps({ tabId, isVisibleRef: { current: false } }) as never
        )
        await vi.advanceTimersByTimeAsync(20)
        await flushAsyncTicks()
        mockStoreState.agentLaunchConfigByPaneKey[paneKey] = {
          launchConfig: { agentArgs: '', agentEnv: {} },
          identity: { agentType: 'codex' }
        }

        dataCallbackRef.current?.('\x1b]133;D;0\x07')
        await vi.advanceTimersByTimeAsync(350 + 1200 + 6000)
        await flushAsyncTicks()

        expect(hasVerifiableAgentProcess).not.toHaveBeenCalled()
        expect(window.api.pty.inspectProcess).not.toHaveBeenCalled()
        expect(mockStoreState.dropAgentStatus).not.toHaveBeenCalled()

        vi.mocked(window.api.pty.inspectProcess).mockResolvedValue({
          foregroundProcess: 'bash',
          hasChildProcesses: false,
          foregroundProcessEvidence: {
            verdict: 'live',
            processName: 'bash',
            ptyId: 'pty-codex-exit',
            ptyIncarnationId: 'source-incarnation',
            authorityGeneration: 'source-authority',
            observationEpoch: 1,
            capturedAgeMs: 0,
            fence: {
              platform: 'posix',
              shellPid: 1,
              shellStartTime: '1',
              tty: '/dev/pts/1',
              foregroundPgid: 1
            }
          }
        })
        mockStoreState = {
          ...mockStoreState,
          sshConnectionStates: new Map([['conn', { status: 'connected' }]])
        }
        for (const notify of storeSubscribers) {
          notify(mockStoreState)
        }
        await vi.advanceTimersByTimeAsync(1)
        await flushAsyncTicks()
        expect(window.api.pty.inspectProcess).toHaveBeenCalledWith(ptyId, {
          expectedIncarnationId: 'source-incarnation'
        })
        expect(mockStoreState.dropAgentStatus).toHaveBeenCalledWith(paneKey)
        expect(hasVerifiableAgentProcess).not.toHaveBeenCalled()
      }
    )
  })
}
