import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgentCompletionCoordinator } from '../components/terminal-pane/agent-completion/agent-completion-coordinator'
import { resetAgentCompletionCoordinatorIdentitiesForTest } from '../components/terminal-pane/agent-completion/agent-completion-identity-store'
import { inspectRuntimeTerminalProcess } from '../runtime/hosted-terminals/inspection/runtime-terminal-process-inspection'
import { clearRuntimeCompatibilityCache as clearRuntimeCompatibilityCacheForTests } from '../runtime/rpc/compatibility/runtime-compatibility-cache'
import {
  createCompatibleRuntimeStatusResponse,
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../runtime/rpc/testing/runtime-compatibility-test-fixture'
import { useAppStore } from '../store'

const REMOTE_PTY_ID = 'remote:remote-host@@term_remote_agent'

function setRuntimeContact(connected: boolean): void {
  const status = createCompatibleRuntimeStatusResponse().result
  useAppStore.setState({
    runtimeStatusByEnvironmentId: new Map([
      [
        'remote-host',
        {
          status,
          checkedAt: 1,
          snapshot: {
            environmentId: 'remote-host',
            pairingRevision: 1,
            sequence: 1,
            checkedAt: 1,
            status,
            verification: connected ? 'verified' : 'unavailable',
            transport: connected ? 'ready' : 'disconnected'
          }
        }
      ]
    ])
  })
}

describe('remote agent completion authority', () => {
  const runtimeCall = vi.fn()
  const runtimeTransportCall = vi.fn((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeCall(args)
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    clearRuntimeCompatibilityCacheForTests()
    vi.stubGlobal('window', {
      api: {
        runtimeEnvironments: { call: runtimeTransportCall },
        pty: {
          getForegroundProcess: vi.fn(),
          hasChildProcesses: vi.fn()
        }
      }
    })
  })

  afterEach(() => {
    useAppStore.setState({ runtimeStatusByEnvironmentId: new Map() })
    resetAgentCompletionCoordinatorIdentitiesForTest()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('does not inspect or dispatch remote title completion while canonical contact is unavailable', async () => {
    setRuntimeContact(false)
    const dispatchCompletion = vi.fn()
    const coordinator = createAgentCompletionCoordinator({
      paneKey: 'tab-remote:leaf-offline',
      getPtyId: () => REMOTE_PTY_ID,
      isRemotePtyId: () => true,
      getExpectedIncarnationId: () => 'inc-remote',
      inspectProcess: inspectRuntimeTerminalProcess,
      dispatchCompletion,
      isLive: () => true
    })
    coordinator.startProcessTracking()
    coordinator.observeTitle('Codex working')
    coordinator.observeTitle('/tmp/offline-finish')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(runtimeTransportCall).not.toHaveBeenCalled()
    expect(dispatchCompletion).not.toHaveBeenCalled()
    coordinator.dispose()
  })
})
