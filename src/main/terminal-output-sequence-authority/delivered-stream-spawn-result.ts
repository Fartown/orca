import type { PtySpawnResult } from '../providers/pty/spawn-result'

export function withDeliveredStreamPosition(
  result: PtySpawnResult,
  streamPosition: number | undefined
): PtySpawnResult {
  return result.providerSequence?.generation === 'continued' && streamPosition !== undefined
    ? {
        ...result,
        providerSequence: { ...result.providerSequence, streamPosition }
      }
    : result
}
