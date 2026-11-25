import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { inspectRuntimeTerminalProcess } from '@/runtime/hosted-terminals/inspection/runtime-terminal-process-inspection'
import { clearRuntimeCompatibilityCache } from '@/runtime/rpc/compatibility/runtime-compatibility-cache'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/rpc/testing/runtime-compatibility-test-fixture'

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/testing/app-store-test-fixture')
  return { useAppStore: createTestStore() }
})

const status = createCompatibleRuntimeStatusResponse()
const inspection = {
  foregroundProcess: null,
  hasChildProcesses: false,
  foregroundObservation: {
    verdict: 'observed',
    source: 'pty-master',
    foregroundKind: 'shell',
    processName: null,
    ptyId: 'term',
    ptyIncarnationId: 'inc',
    authorityGeneration: 'authority',
    observationEpoch: 1,
    capturedAgeMs: 0
  }
}
const runtime = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCache()
  runtime.mockReset()
  runtime.mockImplementation(async (args) =>
    args.method === 'status.get' ? status : { ok: true, result: { process: inspection } }
  )
  vi.stubGlobal('window', { api: { runtimeEnvironments: { call: runtime } } })
  useAppStore.setState({
    sshConnectionStates: new Map(),
    runtimeStatusByEnvironmentId: new Map([['env', { status: status.result, checkedAt: 1 }]])
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('explicit host foreground inspection', () => {
  it('preserves host shell proof without legacy process evidence and forwards the request fence', async () => {
    await expect(
      inspectRuntimeTerminalProcess('remote:env@@term', {
        expectedIncarnationId: 'inc',
        foregroundOnly: true
      })
    ).resolves.toEqual(inspection)
    expect(runtime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'terminal.inspectProcess',
        params: { terminal: 'term', expectedIncarnationId: 'inc', foregroundOnly: true }
      })
    )
  })
})
