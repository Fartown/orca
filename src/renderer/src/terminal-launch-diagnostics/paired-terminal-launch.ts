import { useAppStore } from '@/store'
import type {
  CreatedWebRuntimeSessionTerminal,
  CreateWebRuntimeSessionTerminalArgs
} from '../runtime/web-runtime-session-types'
import {
  currentTerminalLaunchOrigin,
  recordTerminalLaunchOrigin,
  type TerminalLaunchOrigin
} from './launch-origin'

export function observePairedTerminalLaunch(
  args: CreateWebRuntimeSessionTerminalArgs,
  invoke: (args: CreateWebRuntimeSessionTerminalArgs) => Promise<CreatedWebRuntimeSessionTerminal>,
  origin: TerminalLaunchOrigin = currentTerminalLaunchOrigin() ?? 'paired-terminal-create'
): Promise<CreatedWebRuntimeSessionTerminal> {
  recordTerminalLaunchOrigin(origin, args, useAppStore.getState())
  const pending = invoke(args)
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
