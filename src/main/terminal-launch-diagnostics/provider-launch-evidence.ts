import type { PtySpawnOperationState } from '../ipc/pty/spawn/spawn-operation-state'
import type { PtySpawnResult } from '../providers/pty/spawn-result'
import { recordTerminalLaunchStage } from './launch-trace'

// Spawn arguments are only read through launchEvidence's allowlist, so secrets never leave here.
type ProviderSpawnArgs = PtySpawnOperationState['args']

export function recordTerminalProviderDispatch(
  input: ProviderSpawnArgs,
  ptyId?: string,
  candidatePtyId?: string
): void {
  recordTerminalLaunchStage('provider-dispatch', { ...input, ptyId, candidatePtyId })
}

export function recordTerminalProviderResult(
  input: ProviderSpawnArgs,
  result: PtySpawnResult
): void {
  recordTerminalLaunchStage('provider-returned', {
    ...input,
    ptyId: result.id,
    incarnationId: result.incarnationId,
    isReattach: result.isReattach
  })
}
