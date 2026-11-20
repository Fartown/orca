import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTerminalTitleTracker } from '../../../../src/shared/terminal/output/terminal-output-side-effects'
import { createAgentCompletionCoordinator } from '../../../../src/renderer/src/components/terminal-pane/agent-completion/agent-completion-coordinator'
import { resetAgentCompletionCoordinatorIdentitiesForTest } from '../../../../src/renderer/src/components/terminal-pane/agent-completion/agent-completion-identity-store'
import type { AgentCompletionDispatchMeta } from '../../../../src/renderer/src/components/terminal-pane/agent-completion/agent-completion-coordinator-types'
import { inspectRuntimeTerminalProcess } from '../../../../src/renderer/src/runtime/hosted-terminals/inspection/runtime-terminal-process-inspection'
import { clearRuntimeCompatibilityCache as clearRuntimeCompatibilityCacheForTests } from '../../../../src/renderer/src/runtime/rpc/compatibility/runtime-compatibility-cache'
import {
  createCompatibleRuntimeStatusResponse,
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../../../src/renderer/src/runtime/rpc/testing/runtime-compatibility-test-fixture'
import { useAppStore } from '../../../../src/renderer/src/store'

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
    setRuntimeContact(true)
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

  it('preserves distinct stopped, exited, and successful completion evidence', async () => {
    const outcomes: (
      | { kind: 'hook'; interrupted: boolean }
      | { kind: 'process-exit'; exitCode: number | null }
    )[] = []
    const createHookCoordinator = (paneKey: string) =>
      createAgentCompletionCoordinator({
        paneKey,
        getPtyId: () => REMOTE_PTY_ID,
        isRemotePtyId: () => true,
        getExpectedIncarnationId: () => 'inc-remote',
        inspectProcess: inspectRuntimeTerminalProcess,
        dispatchCompletion: (_title: string, meta?: AgentCompletionDispatchMeta) => {
          outcomes.push({
            kind: 'hook',
            interrupted: meta?.agentStatus?.interrupted === true
          })
        },
        isLive: () => true
      })

    const stopped = createHookCoordinator('tab-remote:leaf-stopped')
    stopped.observeHookStatus({ state: 'working', prompt: 'stop me', agentType: 'codex' })
    stopped.observeHookStatus({
      state: 'done',
      prompt: 'stop me',
      agentType: 'codex',
      interrupted: true
    })
    await vi.advanceTimersByTimeAsync(1_500)

    const tracker = createTerminalTitleTracker({
      onCommandFinished: (exitCode) => outcomes.push({ kind: 'process-exit', exitCode })
    })
    tracker.handleChunk('\u001b]133;D;130\u0007')

    const succeeded = createHookCoordinator('tab-remote:leaf-succeeded')
    succeeded.observeHookStatus({ state: 'working', prompt: 'finish me', agentType: 'codex' })
    succeeded.observeHookStatus({ state: 'done', prompt: 'finish me', agentType: 'codex' })
    await vi.advanceTimersByTimeAsync(1_500)

    expect(outcomes).toEqual([
      { kind: 'hook', interrupted: true },
      { kind: 'process-exit', exitCode: 130 },
      { kind: 'hook', interrupted: false }
    ])

    stopped.dispose()
    succeeded.dispose()
    tracker.dispose()
  })
})
