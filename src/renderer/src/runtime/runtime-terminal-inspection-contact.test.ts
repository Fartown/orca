import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  inspectRuntimeTerminalProcess,
  type RuntimeTerminalProcessInspection
} from './runtime-terminal-inspection'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'
import { createCompatibleRuntimeStatusResponse } from './runtime-compatibility-test-fixture'
import { runtimeTerminalProcessContactKey } from './runtime-terminal-inspection-contact'

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})

const status = createCompatibleRuntimeStatusResponse()
const inspection: RuntimeTerminalProcessInspection = {
  foregroundProcess: 'claude',
  hasChildProcesses: true,
  foregroundProcessEvidence: {
    verdict: 'live',
    processName: 'claude',
    ptyId: 'term',
    ptyIncarnationId: 'inc',
    authorityGeneration: 'authority',
    observationEpoch: 1,
    capturedAgeMs: 0,
    fence: {
      platform: 'posix',
      shellPid: 1,
      shellStartTime: '1',
      tty: '/dev/pts/1',
      foregroundPgid: 2
    }
  }
}
const remote = 'remote:env@@term'
const runtime = vi.fn()
const local = vi.fn()

function contact(connected: boolean): void {
  useAppStore.setState({
    runtimeStatusByEnvironmentId: new Map([
      ['env', { status: connected ? status.result : null, checkedAt: 1 }]
    ])
  })
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  vi.clearAllMocks()
  runtime.mockImplementation(async (args) =>
    args.method === 'status.get' ? status : { ok: true, result: { process: inspection } }
  )
  local.mockResolvedValue(inspection)
  vi.stubGlobal('window', {
    api: { runtimeEnvironments: { call: runtime }, pty: { inspectProcess: local } }
  })
  useAppStore.setState({ sshConnectionStates: new Map() })
  contact(true)
})

describe('terminal process inspection follows shared contact', () => {
  it('reads valid source-host evidence while shared contact permits the request', async () => {
    await expect(inspectRuntimeTerminalProcess(remote)).resolves.toEqual(inspection)
    expect(runtime.mock.calls.map(([args]) => args.method)).toEqual([
      'status.get',
      'terminal.inspectProcess'
    ])
  })
  it.each([remote, 'remote:ownerless', 'remote:%broken@@term', 'ssh:missing@@pty', 'ssh:broken'])(
    'never sends an out-of-contact or unknown-owner %s inspection to either host',
    async (pty) => {
      contact(false)
      await expect(inspectRuntimeTerminalProcess(pty)).resolves.toMatchObject({
        verdict: 'unverifiable',
        reason: 'transport_loss'
      })
      expect(runtime).not.toHaveBeenCalled()
      expect(local).not.toHaveBeenCalled()
    }
  )

  it('fences the actual inspection request when contact is lost during compatibility lookup', async () => {
    const compatible = Promise.withResolvers<typeof status>()
    runtime.mockImplementation((args) => (args.method === 'status.get' ? compatible.promise : null))
    const reading = inspectRuntimeTerminalProcess(remote)
    expect(runtime).toHaveBeenCalledTimes(1)
    contact(false)
    compatible.resolve(status)
    await expect(reading).resolves.toMatchObject({
      verdict: 'unverifiable',
      reason: 'transport_loss'
    })
    expect(runtime.mock.calls.map(([args]) => args.method)).toEqual(['status.get'])
  })

  it('rejects a reply from before disconnect even after the same contact key returns', async () => {
    const response = Promise.withResolvers<{ ok: true; result: { process: typeof inspection } }>()
    const started = Promise.withResolvers<void>()
    runtime.mockImplementation((args) => {
      if (args.method === 'status.get') {
        return status
      }
      started.resolve()
      return response.promise
    })
    const reading = inspectRuntimeTerminalProcess(remote)
    await started.promise
    contact(false)
    contact(true)
    response.resolve({ ok: true, result: { process: inspection } })
    await expect(reading).resolves.toMatchObject({
      verdict: 'unverifiable',
      reason: 'transport_loss'
    })
  })

  it('uses the direct SSH connection verdict and discards a late provider result', async () => {
    const pty = 'ssh:host@@pty'
    useAppStore.setState({
      sshConnectionStates: new Map([
        [
          'host',
          {
            targetId: 'host',
            status: 'connected',
            error: null,
            reconnectAttempt: 0,
            connectionGeneration: 1
          }
        ]
      ])
    })
    expect(runtimeTerminalProcessContactKey(pty)).not.toBeNull()
    const response = Promise.withResolvers<typeof inspection>()
    local.mockReturnValue(response.promise)
    const reading = inspectRuntimeTerminalProcess(pty)
    useAppStore.setState({ sshConnectionStates: new Map() })
    response.resolve(inspection)
    await expect(reading).resolves.toMatchObject({
      verdict: 'unverifiable',
      reason: 'transport_loss'
    })
    expect(local).toHaveBeenCalledExactlyOnceWith(pty)
    expect(runtime).not.toHaveBeenCalled()
  })

  it('retains native local inspection without a runtime host entry', async () => {
    contact(false)
    await expect(inspectRuntimeTerminalProcess('local-pty')).resolves.toEqual(inspection)
    expect(local).toHaveBeenCalledExactlyOnceWith('local-pty')
  })
})
