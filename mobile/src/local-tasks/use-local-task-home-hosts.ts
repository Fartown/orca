import { useCallback, useEffect, useRef, useState } from 'react'
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
  /** A connected host whose own library or a relayed server's has a project. */
  | { kind: 'ready'; host: HostProfile; libraries: LocalTaskHomeLibrary[] }
  /**
   * A host that had such a library earlier in this session and cannot be reached now. Unreachable
   * says nothing about whether its Orca is open (AGENTS.md: loss of contact is not exit).
   */
  | { kind: 'unreachable'; host: HostProfile; pairingInvalid: boolean }

// Why not "connecting" or "reconnecting": a host on its way back is not worth a notice.
function unreachableState(state: ConnectionState | null): 'disconnected' | 'auth-failed' | null {
  return state === 'disconnected' || state === 'auth-failed' ? state : null
}

/** The libraries home lists for one host: none when it has no local tasks or no project. */
type HostReading = { libraries: LocalTaskHomeLibrary[] }

function presentLibraries(libraries: readonly (LocalTaskHomeLibrary | null)[]) {
  return libraries.flatMap((library) => (library ? [library] : []))
}

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
  return presentLibraries(libraries)
}

async function readHomeHost(client: RpcClient, host: HostProfile): Promise<HostReading> {
  const reply = await taskRuntimeStatusRead.requestSingleFlight(client, host.id)
  const capabilities = taskRuntimeStatusRead.interpret(reply).capabilities ?? []
  if (!hostAdvertisesLocalTasks(capabilities)) {
    return { libraries: [] }
  }
  const [own, servers] = await Promise.all([
    readLocalTaskHomeLibrary(createLocalTasksApi(client), {
      label: localTaskHostMachineName(host)
    }),
    readServerLibraries(client, capabilities).catch(() => [])
  ])
  return { libraries: presentLibraries([own, ...servers]) }
}

/**
 * Which paired hosts have task libraries with projects, each with the libraries of the servers it
 * relays to. Every connected host is read once when home gains focus, and a host that connects
 * while home is in view is read then, alone. A host out of contact is never read; one that had a
 * library earlier is listed as unreachable from that earlier read.
 */
export function useLocalTaskHomeHosts(connectedHosts: HostProfile[]): LocalTaskHomeHost[] {
  const ctx = useRpcClientContext()
  const [catalog, setCatalog] = useState<HostProfile[]>([])
  const [readings, setReadings] = useState<Record<string, HostReading>>({})
  const [focus, setFocus] = useState<{ turn: number; focused: boolean }>({
    turn: 0,
    focused: false
  })
  const turns = useRef(new Map<string, number>())
  // The hosts this focus already read, so a connection change reads only the host that changed.
  const readThisFocus = useRef<{ turn: number; hostIds: ReadonlySet<string> }>({
    turn: 0,
    hostIds: new Set()
  })

  useFocusEffect(
    useCallback(() => {
      let current = true
      void loadHosts().then((hosts) => {
        if (current) {
          setCatalog(hosts)
        }
      })
      setFocus((previous) => ({ turn: previous.turn + 1, focused: true }))
      return () => {
        current = false
        setFocus((previous) => ({ ...previous, focused: false }))
      }
    }, [])
  )

  const readHost = useCallback(
    (host: HostProfile) => {
      const client = ctx.getAllClients().find((entry) => entry.hostId === host.id)?.client
      if (!client) {
        return
      }
      const turn = (turns.current.get(host.id) ?? 0) + 1
      turns.current.set(host.id, turn)
      readHomeHost(client, host).then(
        (reading) => {
          if (turns.current.get(host.id) === turn) {
            setReadings((previous) => ({ ...previous, [host.id]: reading }))
          }
        },
        () => {}
      )
    },
    [ctx]
  )

  useEffect(() => {
    const pending = turns.current
    return () => pending.clear()
  }, [])

  // Why keyed on ids, with the hosts from a ref: the array is rebuilt on every home render.
  const connectedKey = connectedHosts.map((host) => host.id).join('\u0000')
  const latestConnected = useRef(connectedHosts)
  useEffect(() => {
    latestConnected.current = connectedHosts
  })
  useEffect(() => {
    if (!focus.focused) {
      return
    }
    const hosts = latestConnected.current
    const already =
      readThisFocus.current.turn === focus.turn ? readThisFocus.current.hostIds : new Set<string>()
    for (const host of hosts) {
      if (!already.has(host.id)) {
        readHost(host)
      }
    }
    // A host that dropped out is read again when it comes back.
    readThisFocus.current = { turn: focus.turn, hostIds: new Set(hosts.map((host) => host.id)) }
  }, [connectedKey, focus, readHost])

  const connectedIds = new Set(connectedHosts.map((host) => host.id))
  const ready: LocalTaskHomeHost[] = connectedHosts.flatMap((host) => {
    const libraries = readings[host.id]?.libraries ?? []
    return libraries.length > 0 ? [{ kind: 'ready', host, libraries }] : []
  })
  const unreachable: LocalTaskHomeHost[] = catalog.flatMap((host) => {
    const state = unreachableState(ctx.getKnownState(host.id))
    return !connectedIds.has(host.id) && state && (readings[host.id]?.libraries.length ?? 0) > 0
      ? [{ kind: 'unreachable', host, pairingInvalid: state === 'auth-failed' }]
      : []
  })
  return [...ready, ...unreachable]
}
