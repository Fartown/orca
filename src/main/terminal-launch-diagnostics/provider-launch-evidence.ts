import { recordTerminalLaunchStage } from './launch-trace'

export function recordTerminalProviderDispatch(
  input: object,
  ptyId?: string,
  candidatePtyId?: string
): void {
  recordTerminalLaunchStage('provider-dispatch', { ...input, ptyId, candidatePtyId })
}

export function recordTerminalProviderResult(
  input: object,
  result: { id: string; incarnationId?: string; isReattach?: boolean }
): void {
  recordTerminalLaunchStage('provider-returned', {
    ...input,
    ptyId: result.id,
    incarnationId: result.incarnationId,
    isReattach: result.isReattach
  })
}
