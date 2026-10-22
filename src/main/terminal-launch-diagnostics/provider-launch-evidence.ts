import type { RuntimePtySpawnArgs } from '../ipc/pty/runtime/spawn-state'
import type { PtySpawnResult } from '../providers/pty-provider-contract'
import { recordTerminalLaunchStage } from './launch-trace'

export function recordTerminalProviderDispatch(
  input: RuntimePtySpawnArgs,
  ptyId?: string,
  candidatePtyId?: string
): void {
  recordTerminalLaunchStage('provider-dispatch', { ...input, ptyId, candidatePtyId })
}

export function recordTerminalProviderResult(
  input: RuntimePtySpawnArgs,
  result: PtySpawnResult
): void {
  recordTerminalLaunchStage('provider-returned', {
    ...input,
    ptyId: result.id,
    incarnationId: result.incarnationId,
    isReattach: result.isReattach
  })
}
