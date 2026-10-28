import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { taskRuntimeStatusRead } from '../tasks/mobile-task-runtime-operations'
import { useRpcClientContext } from '../transport/client-context'
import {
  relaysToServers,
  scopeRpcClientToExecutionHost
} from '../transport/execution-host-scoped-rpc-client'
import { loadHosts } from '../transport/host-store'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, HostProfile } from '../transport/types'
import { relayHostsFeed } from '../worktree/relay-hosts-feed'
import { createLocalTasksApi } from './local-tasks-api'
import { hostAdvertisesLocalTasks, localTaskHostMachineName } from './local-tasks-access'
import { readLocalTaskHomeLibrary, type LocalTaskHomeLibrary } from './local-task-home-attention'

export type LocalTaskHomeHost =
  /** A connected host with local tasks: its own library and each relayed server's that has one. */
  | { kind: 'ready'; host: HostProfile; libraries: LocalTaskHomeLibrary[] }
  /** A host that had local tasks earlier in this session and is out of contact now. */
  | { kind: 'closed'; host: HostProfile }

// Why not "connecting": a host still dialing at app start is not evidence its Orca is closed.
function isOutOfContact(state: ConnectionState | null): boolean {
  return state === 'disconnected' || state === 'reconnecting' || state === 'auth-failed'
}

type HostReading = { advertises: boolean; libraries: LocalTaskHomeLibrary[] }

async function advertisesLocalTasks(client: RpcClient, flightKey: string): Promise<boolean> {
  const reply = await taskRuntimeStatusRead.requestSingleFlight(client, flightKey)
  return hostAdvertisesLocalTasks(taskRuntimeStatusRead.interpret(reply).capabilities)
}

/**
 * The servers the paired host relays to now that have local tasks (D-008), each read through it.
 * Asked once per home read; a server the paired host cannot reach is never asked.
 */
async function readServerLibraries(
  client: RpcClient,
  capabilities: readonly string[]
): Promise<LocalTaskHomeLibrary[]> {
  if (!relaysToServers(client, capabilities)) {
    return []
  }
  const servers = (await relayHostsFeed(client).read()) ?? []
  const libraries = await Promise.all(
    servers
      .filter((server) => server.relay === 'ready')
      .map(async (server) => {
        const serverClient = scopeRpcClientToExecutionHost(client, server.hostId)
        const advertises = await advertisesLocalTasks(serverClient, server.hostId).catch(
          () => false
        )
        return advertises
          ? readLocalTaskHomeLibrary(createLocalTasksApi(serverClient), {
              executionHost: server.hostId,
              label: server.label
            })
          : null
      })
  )
  return libraries.flatMap((library) => (library ? [library] : []))
}

async function readHomeHost(client: RpcClient, host: HostProfile): Promise<HostReading> {
  const reply = await taskRuntimeStatusRead.requestSingleFlight(client, host.id)
  const capabilities = taskRuntimeStatusRead.interpret(reply).capabilities ?? []
  if (!hostAdvertisesLocalTasks(capabilities)) {
    return { advertises: false, libraries: [] }
  }
  const [own, servers] = await Promise.all([
    readLocalTaskHomeLibrary(createLocalTasksApi(client), {
      label: localTaskHostMachineName(host)
    }),
    readServerLibraries(client, capabilities).catch(() => [])
  ])
  return { advertises: true, libraries: [own, ...servers] }
}

/**
 * Which paired hosts have local tasks, read when home gains focus or a host connects, each with the
 * libraries of the servers it relays to. Only a connected host is asked; one out of contact is
 * listed from what this session already read, and never read.
 */
export function useLocalTaskHomeHosts(connectedHosts: HostProfile[]): LocalTaskHomeHost[] {
  const ctx = useRpcClientContext()
  const [catalog, setCatalog] = useState<HostProfile[]>([])
  const [readings, setReadings] = useState<Record<string, HostReading>>({})
  const [focusCount, setFocusCount] = useState(0)

  useFocusEffect(
    useCallback(() => {
      let current = true
      void loadHosts().then((hosts) => {
        if (current) {
          setCatalog(hosts)
        }
      })
      setFocusCount((count) => count + 1)
      return () => {
        current = false
      }
    }, [])
  )

  const connectedKey = connectedHosts.map((host) => host.id).join('\u0000')
  useEffect(() => {
    let current = true
    for (const host of connectedHosts) {
      const client = ctx.getAllClients().find((entry) => entry.hostId === host.id)?.client
      if (!client) {
        continue
      }
      readHomeHost(client, host).then(
        (reading) => {
          if (current) {
            setReadings((previous) => ({ ...previous, [host.id]: reading }))
          }
        },
        () => {}
      )
    }
    return () => {
      current = false
    }
    // Why keyed on ids: the array is rebuilt on every home render.
  }, [connectedKey, focusCount, ctx])

  const connectedIds = new Set(connectedHosts.map((host) => host.id))
  const ready: LocalTaskHomeHost[] = connectedHosts.flatMap((host) => {
    const reading = readings[host.id]
    return reading?.advertises ? [{ kind: 'ready', host, libraries: reading.libraries }] : []
  })
  const closed: LocalTaskHomeHost[] = catalog
    .filter(
      (host) =>
        !connectedIds.has(host.id) &&
        readings[host.id]?.advertises === true &&
        isOutOfContact(ctx.getKnownState(host.id))
    )
    .map((host) => ({ kind: 'closed', host }))
  return [...ready, ...closed]
}
