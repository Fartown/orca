import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../runtime/orca-runtime'

describe('foreground-only inspection keeps host and caller identities', () => {
  it.each(['host-pty', 'ssh:target@@relay-pty'])(
    'maps %s observation to the retained runtime handle',
    async (ptyId) => {
      const runtime = new OrcaRuntimeService(null)
      const worktreeId = 'repo::/workspace'
      const tabId = 'tab'
      const leafId = '11111111-1111-4111-8111-111111111111'
      const handle = runtime.preAllocateHandleForPty(ptyId)
      runtime.registerPty(ptyId, worktreeId, null, { tabId, leafId, incarnationId: 'inc' })
      runtime.attachWindow(1)
      runtime.syncWindowGraph(1, {
        tabs: [{ tabId, worktreeId, title: 'Terminal', activeLeafId: leafId, layout: null }],
        leaves: [{ tabId, worktreeId, leafId, paneRuntimeId: 1, ptyId }]
      })
      const hostId = ptyId.startsWith('ssh:') ? 'relay-pty' : ptyId
      const foregroundObservation = {
        verdict: 'observed' as const,
        source: 'pty-master' as const,
        foregroundKind: 'shell' as const,
        processName: null,
        ptyId: hostId,
        ptyIncarnationId: 'inc',
        authorityGeneration: 'host',
        observationEpoch: 1,
        capturedAgeMs: 0
      }
      const inspectProcess = vi.fn().mockResolvedValue({
        foregroundProcess: null,
        hasChildProcesses: true,
        foregroundObservation
      })
      runtime.setPtyController({
        write: vi.fn(() => true),
        kill: () => true,
        getForegroundProcess: async () => null,
        inspectProcess
      })
      const result = await runtime.inspectTerminalProcess(handle, {
        expectedIncarnationId: 'inc',
        foregroundOnly: true
      })
      expect(inspectProcess).toHaveBeenCalledExactlyOnceWith(ptyId, {
        expectedIncarnationId: 'inc',
        foregroundOnly: true
      })
      expect(result.foregroundObservation).toEqual({ ...foregroundObservation, ptyId: handle })
    }
  )
})
