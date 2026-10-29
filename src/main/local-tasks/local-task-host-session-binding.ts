import { parseExecutionHostId } from '../../shared/execution-host'
import type { RuntimeClientEvent } from '../../shared/runtime-client-events'
import { agentHookServer, type AgentHookServer } from '../agent-hooks/server'
import { getRegisteredSshState } from '../ssh/targets/ssh-target-registry'
import type { LocalTaskHostSessionSource } from './local-task-host-session-source'

type HookStatusStore = Pick<
  AgentHookServer,
  | 'getStatusSnapshotForPane'
  | 'getStatusChangeSnapshot'
  | 'subscribeStatusChanges'
  | 'subscribeEnrichedStatus'
  | 'subscribePaneStatusClear'
>

/** The runtime pieces the binding reads; desktop, `orca serve` and orcad all provide them. */
export type LocalTaskHostRuntime = {
  hasLiveTerminalForPaneKey(paneKey: string): boolean
  onClientEvent(
    listener: (event: RuntimeClientEvent) => void,
    options: { consumesTerminalSideEffects: false }
  ): () => void
}

/**
 * This process's agent status store and terminals. The store is the one every runtime host
 * (desktop, `orca serve`, orcad) feeds from hooks, OSC and structured chats, so the library
 * judges with the same evidence its own sidebar shows.
 */
export function bindLocalTaskHostSessions(
  runtime: LocalTaskHostRuntime,
  hooks: HookStatusStore = agentHookServer,
  sshStatus: (targetId: string) => string | undefined = (targetId) =>
    getRegisteredSshState(targetId)?.status
): LocalTaskHostSessionSource {
  return {
    rowsForPane: (paneKey) =>
      hooks.getStatusSnapshotForPane(paneKey).filter((row) => row.providerSessionOnly !== true),
    paneKeys: () => hooks.getStatusChangeSnapshot().map((status) => status.paneKey),
    terminalLive: (paneKey) => runtime.hasLiveTerminalForPaneKey(paneKey),
    inContact: (hostId) => {
      const host = parseExecutionHostId(hostId)
      if (host?.kind === 'local') {
        return true
      }
      return host?.kind === 'ssh' && sshStatus(host.targetId) === 'connected'
    },
    subscribe: (onChange) => {
      const stops = [
        hooks.subscribeStatusChanges(onChange),
        hooks.subscribeEnrichedStatus(onChange),
        hooks.subscribePaneStatusClear(onChange),
        runtime.onClientEvent(
          (event) => {
            if (event.type === 'sshStateChanged') {
              onChange()
            }
          },
          { consumesTerminalSideEffects: false }
        )
      ]
      return () => {
        for (const stop of stops) {
          stop()
        }
      }
    }
  }
}
