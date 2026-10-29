import { useEffect, useState } from 'react'
import type { ExecutionHostId } from '../../../src/shared/execution-host'
import { taskRuntimeStatusRead } from '../tasks/mobile-task-runtime-operations'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { useWorkspaceServer } from '../transport/workspace-server'
import { useReachableServerClients } from '../worktree/use-reachable-server-clients'
import { localTaskEndpointFor, type LocalTaskEndpoint } from './local-task-endpoint'
import {
  hostAdvertisesLocalTasks,
  resolveLocalTasksAccess,
  type LocalTasksAccess
} from './local-tasks-access'

type Gates = {
  hostCapabilities: readonly string[]
  statusPending: boolean
  statusReadable: boolean
}

/** A library the page can switch to, as the user knows its host. */
export type LocalTaskEndpointChoice = { endpoint: LocalTaskEndpoint; label: string }

/** The library the page shows: how it is reached now and whether it can be opened. */
export type LocalTaskEndpointReach = {
  endpoint: LocalTaskEndpoint
  /** The library's Orca, as the user knows it. */
  label: string
  client: RpcClient | null
  connState: ConnectionState
  capabilities: readonly string[]
  access: LocalTasksAccess
  /** Whose state `access` describes: the paired host's while it is not ready, else the library's. */
  accessLabel: string
}

const NO_CAPABILITIES: readonly string[] = []

/**
 * Which of the paired host's servers advertise `local-tasks.v1`, asked once per server each time
 * the set the paired host can relay to changes. A server out of contact is never asked.
 */
function useServersWithLocalTasks(
  serverClients: ReadonlyMap<ExecutionHostId, RpcClient>
): ReadonlySet<string> {
  const [advertising, setAdvertising] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    let current = true
    for (const [hostId, serverClient] of serverClients) {
      taskRuntimeStatusRead.requestSingleFlight(serverClient, hostId).then(
        (reply) => {
          const advertises = hostAdvertisesLocalTasks(
            taskRuntimeStatusRead.interpret(reply).capabilities
          )
          if (current) {
            setAdvertising((previous) => {
              if (previous.has(hostId) === advertises) {
                return previous
              }
              const next = new Set(previous)
              if (advertises) {
                next.add(hostId)
              } else {
                next.delete(hostId)
              }
              return next
            })
          }
        },
        () => {}
      )
    }
    return () => {
      current = false
    }
  }, [serverClients])
  return advertising
}

/**
 * The task libraries one paired host's page reaches (D-008): the host's own, and each server it
 * relays to that advertises `local-tasks.v1`. The active one is read through the same server route
 * a workspace screen uses, so its reach and capabilities are the server's own answer.
 */
export function useLocalTaskEndpoints(args: {
  client: RpcClient | null
  connState: ConnectionState
  gates: Gates | null
  machineName: string
  active: LocalTaskEndpoint
}): { choices: LocalTaskEndpointChoice[]; active: LocalTaskEndpointReach } {
  const desktopCapabilities = args.gates?.hostCapabilities ?? NO_CAPABILITIES
  const desktopHasTasks = hostAdvertisesLocalTasks(desktopCapabilities)
  const { servers, serverClients } = useReachableServerClients(
    args.client,
    desktopCapabilities,
    desktopHasTasks
  )
  const advertising = useServersWithLocalTasks(serverClients)
  const { server } = useWorkspaceServer({
    client: args.client,
    connState: args.connState,
    desktopCapabilities,
    executionHost: args.active.executionHost
  })
  const serverChoices = (servers ?? []).flatMap((host) =>
    serverClients.has(host.hostId) && advertising.has(host.hostId)
      ? [{ endpoint: localTaskEndpointFor(host.hostId), label: host.label }]
      : []
  )
  const choices: LocalTaskEndpointChoice[] = desktopHasTasks
    ? [{ endpoint: localTaskEndpointFor(undefined), label: args.machineName }, ...serverChoices]
    : []
  const desktopAccess = resolveLocalTasksAccess({
    connState: args.connState,
    statusPending: args.gates?.statusPending ?? true,
    statusReadable: args.gates?.statusReadable ?? false,
    capabilities: desktopCapabilities
  })
  if (!args.active.executionHost || !server) {
    return {
      choices,
      active: {
        endpoint: args.active,
        label: args.machineName,
        client: args.client,
        connState: args.connState,
        capabilities: desktopCapabilities,
        access: desktopAccess,
        accessLabel: args.machineName
      }
    }
  }
  const label = servers?.find((host) => host.hostId === args.active.executionHost)?.label ?? ''
  // Why the desktop first: only a desktop with local tasks relays a phone's task calls to a server.
  const access: LocalTasksAccess =
    desktopAccess !== 'ready'
      ? desktopAccess
      : server.client === null
        ? 'offline'
        : resolveLocalTasksAccess({
            connState: server.state,
            statusPending: server.gates.statusPending,
            statusReadable: server.gates.statusReadable,
            capabilities: server.gates.hostCapabilities
          })
  return {
    choices,
    active: {
      endpoint: args.active,
      label,
      client: server.client,
      connState: server.client === null ? 'disconnected' : server.state,
      capabilities: server.gates.hostCapabilities,
      access,
      accessLabel: desktopAccess === 'ready' ? label : args.machineName
    }
  }
}
