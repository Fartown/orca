import type { RemoteForegroundEvidence } from '../../../shared/foreground-process-evidence'
import type { RuntimeEnvironmentStatus } from '../../../shared/runtime-host-status'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'

export function codexRestartRuntimeContact(connected: boolean): RuntimeEnvironmentStatus {
  const status = createCompatibleRuntimeStatusResponse().result
  return {
    status,
    checkedAt: 1,
    snapshot: {
      environmentId: 'env-1',
      pairingRevision: 1,
      sequence: 1,
      checkedAt: 1,
      status,
      verification: connected ? 'verified' : 'unavailable',
      transport: connected ? 'ready' : 'disconnected'
    }
  }
}

export function liveRemoteEvidence(ptyId: string, processName = 'codex'): RemoteForegroundEvidence {
  return {
    authorityGeneration: 'runtime-authority',
    observationEpoch: 1,
    capturedAgeMs: 0,
    ptyId,
    ptyIncarnationId: 'incarnation-1',
    verdict: 'live',
    processName,
    fence: {
      platform: 'posix',
      shellPid: 1,
      shellStartTime: '1',
      tty: '/dev/pts/1',
      foregroundPgid: 1
    }
  }
}
