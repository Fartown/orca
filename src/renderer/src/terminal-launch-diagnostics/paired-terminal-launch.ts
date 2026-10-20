import { useAppStore } from '@/store'
import { createWebRuntimeSessionTerminalResult as createTerminal } from '../runtime/web-runtime-terminal-create-operation'
import { recordTerminalLaunchOrigin } from './launch-origin'

export function createWebRuntimeSessionTerminalResult(
  args: Parameters<typeof createTerminal>[0]
): ReturnType<typeof createTerminal> {
  recordTerminalLaunchOrigin('paired-terminal-create', args, useAppStore.getState())
  return createTerminal(args)
}
