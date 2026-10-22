import { useAppStore } from '@/store'
import { createWebRuntimeSessionTerminalResult as createTerminal } from '../runtime/web-runtime-terminal-create-operation'
import {
  currentTerminalLaunchOrigin,
  recordTerminalLaunchOrigin,
  type TerminalLaunchOrigin
} from './launch-origin'

export function createWebRuntimeSessionTerminalResult(
  args: Parameters<typeof createTerminal>[0],
  origin: TerminalLaunchOrigin = currentTerminalLaunchOrigin() ?? 'paired-terminal-create'
): ReturnType<typeof createTerminal> {
  recordTerminalLaunchOrigin(origin, args, useAppStore.getState())
  const pending = createTerminal(args)
  void pending.then(
    (result) => {
      try {
        recordTerminalLaunchOrigin(
          origin,
          {
            ...args,
            tabId: result.hostTabId,
            eventPhase: result.hostTabId ? 'created' : 'requested'
          },
          useAppStore.getState()
        )
      } catch {
        // Observing completion must not create an unhandled rejection.
      }
    },
    () => {}
  )
  return pending
}
