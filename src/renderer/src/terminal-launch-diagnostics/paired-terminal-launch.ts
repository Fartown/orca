import { useAppStore } from '@/store'
import type { CreatedWebRuntimeSessionTerminal } from '../runtime/hosted-terminals/creation/terminal-create-contracts'
import {
  currentTerminalLaunchOrigin,
  recordTerminalLaunchOrigin,
  type TerminalLaunchOrigin
} from './launch-origin'

// Generic so host-bound and selected-host create args both pass through unchanged.
export function observePairedTerminalLaunch<Args extends object>(
  args: Args,
  invoke: (args: Args) => Promise<CreatedWebRuntimeSessionTerminal>,
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
