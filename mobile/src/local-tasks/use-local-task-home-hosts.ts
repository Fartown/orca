import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { taskRuntimeStatusRead } from '../tasks/mobile-task-runtime-operations'
import { useRpcClientContext } from '../transport/client-context'
import { loadHosts } from '../transport/host-store'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, HostProfile } from '../transport/types'
import { hostAdvertisesLocalTasks, readLocalTasksInProgress } from './local-tasks-access'
import {
  loadRememberedLocalTaskHosts,
  recordLocalTaskHostAdvertisement,
  type RememberedLocalTaskHosts
} from './local-task-host-memory'

export type LocalTaskHomeHost =
  /** A connected task host; `inProgress` is null until its library answers. */
  | { kind: 'ready'; host: HostProfile; inProgress: number | null }
  /** A host that advertised before and is out of contact now: its Orca is not open. */
  | { kind: 'closed'; host: HostProfile }

// Why not "connecting": a host still dialing at app start is not evidence its Orca is closed.
function isOutOfContact(state: ConnectionState | null): boolean {
  return state === 'disconnected' || state === 'reconnecting' || state === 'auth-failed'
}

type HostReading = { advertises: boolean; inProgress: number | null }

async function readHomeHost(client: RpcClient, hostId: string): Promise<HostReading> {
  const reply = await taskRuntimeStatusRead.requestSingleFlight(client, hostId)
  const capabilities = taskRuntimeStatusRead.interpret(reply).capabilities
  return {
    advertises: hostAdvertisesLocalTasks(capabilities),
    // Why caught here: a failed count still leaves a known task host, shown without a number.
    inProgress: await readLocalTasksInProgress(client, capabilities).catch(() => null)
  }
}

/**
 * Which paired desktops host a task library, read when home gains focus or a host connects. Only a
 * connected host is asked; one out of contact is listed from memory and never read.
 */
export function useLocalTaskHomeHosts(connectedHosts: HostProfile[]): LocalTaskHomeHost[] {
  const ctx = useRpcClientContext()
  const [remembered, setRemembered] = useState<RememberedLocalTaskHosts>({})
  const [catalog, setCatalog] = useState<HostProfile[]>([])
  const [readings, setReadings] = useState<Record<string, HostReading>>({})
  const [focusCount, setFocusCount] = useState(0)

  useFocusEffect(
    useCallback(() => {
      let current = true
      void Promise.all([loadRememberedLocalTaskHosts(), loadHosts()]).then(([memory, hosts]) => {
        if (current) {
          setRemembered(memory)
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
      readHomeHost(client, host.id).then(
        (reading) => {
          if (!current) {
            return
          }
          setReadings((previous) => ({ ...previous, [host.id]: reading }))
          void recordLocalTaskHostAdvertisement(host.id, reading.advertises).then((memory) => {
            if (current) {
              setRemembered(memory)
            }
          })
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
  const ready: LocalTaskHomeHost[] = connectedHosts
    .filter((host) => readings[host.id]?.advertises === true)
    .map((host) => ({ kind: 'ready', host, inProgress: readings[host.id]?.inProgress ?? null }))
  const closed: LocalTaskHomeHost[] = catalog
    .filter(
      (host) =>
        !connectedIds.has(host.id) &&
        Object.hasOwn(remembered, host.id) &&
        isOutOfContact(ctx.getKnownState(host.id))
    )
    .map((host) => ({ kind: 'closed', host }))
  return [...ready, ...closed]
}
