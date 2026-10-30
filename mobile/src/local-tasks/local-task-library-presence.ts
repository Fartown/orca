import { useEffect, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { createLocalTasksApi } from './local-tasks-api'
import { localTaskLibraryHasProjects, localTaskSourceShown } from './local-tasks-access'

type Presence = {
  hasProjects: boolean
  /** Not hidden from the desktop's task sources by the host's user. */
  shown: boolean
  /** Not hidden from workspace cards by the desktop's Display properties. */
  cardTaskShown: boolean
  /** The client's last connection when this was read: contact coming back makes it stale. */
  contact: number | null
}

// Per library client, for this document's life: the last answer, and the one read in flight.
const known = new WeakMap<RpcClient, Presence>()
const flights = new WeakMap<RpcClient, Promise<void>>()

function readPresence(client: RpcClient): Promise<void> {
  const inFlight = flights.get(client)
  if (inFlight) {
    return inFlight
  }
  const contact = client.getLastConnectedAt()
  const flight = createLocalTasksApi(client)
    .status()
    .then(
      (status) => {
        known.set(client, {
          hasProjects: localTaskLibraryHasProjects(status),
          shown: localTaskSourceShown(status),
          cardTaskShown: status.cardTaskHidden !== true,
          contact
        })
      },
      () => {}
    )
    .finally(() => flights.delete(client))
  flights.set(client, flight)
  return flight
}

/** The answer read since contact with the host last came back, which still speaks for it. */
function currentPresence(client: RpcClient): Presence | undefined {
  const presence = known.get(client)
  return presence && presence.contact === client.getLastConnectedAt() ? presence : undefined
}

function offersTasks(presence: Presence): boolean {
  return presence.hasProjects && presence.shown
}

function holdsTasks(presence: Presence): boolean {
  return presence.hasProjects
}

/**
 * The library's presence, read only when a screen asks and null until known. Once `wanted` holds it
 * is asked again only when contact with its host comes back; until then it is asked on each mount,
 * so a project created or a source shown since is picked up. Out of contact (`reachable` false) it
 * asks nothing and keeps the last answer.
 */
function useLibraryPresence(
  client: RpcClient | null,
  reachable: boolean,
  wanted: (presence: Presence) => boolean
): Presence | null {
  const [, setAnswers] = useState(0)
  useEffect(() => {
    const presence = client ? currentPresence(client) : undefined
    if (!client || !reachable || (presence && wanted(presence))) {
      return
    }
    let live = true
    void readPresence(client).then(() => {
      if (live) {
        setAnswers((count) => count + 1)
      }
    })
    return () => {
      live = false
    }
  }, [client, reachable, wanted])
  return (client ? known.get(client) : undefined) ?? null
}

/**
 * Whether the library `client` reaches offers task actions on upstream screens: it has a task
 * project and its host's user has not hidden local tasks. Asked when an action sheet opens on one
 * of its rows.
 */
export function useLocalTaskLibraryOffersTasks(
  client: RpcClient | null,
  reachable = true
): boolean | null {
  const presence = useLibraryPresence(client, reachable, offersTasks)
  return presence ? offersTasks(presence) : null
}

/**
 * Whether the library has a task project, shown or hidden: links it already holds keep showing on
 * workspaces after its user hides local tasks, as on the desktop (REQ-008).
 */
export function useLocalTaskLibraryHoldsTasks(
  client: RpcClient | null,
  reachable = true
): boolean | null {
  const presence = useLibraryPresence(client, reachable, holdsTasks)
  return presence ? holdsTasks(presence) : null
}

/** Whether rows show the task glyph, from the last status read; shown until known, as an older host never says. */
export function localTaskCardTaskShown(client: RpcClient): boolean {
  return known.get(client)?.cardTaskShown ?? true
}

/**
 * Whether the host's user hid local tasks from the desktop's task sources; false until known, as an
 * older host never says. Read when a screen showing the entry opens in contact and again once
 * contact comes back; never on a timer.
 */
export function useLocalTaskSourceHidden(client: RpcClient | null, connected: boolean): boolean {
  const [, setAnswers] = useState(0)
  useEffect(() => {
    if (!client || !connected || currentPresence(client)) {
      return
    }
    let live = true
    void readPresence(client).then(() => {
      if (live) {
        setAnswers((count) => count + 1)
      }
    })
    return () => {
      live = false
    }
  }, [client, connected])
  const presence = client ? known.get(client) : undefined
  return presence ? !presence.shown : false
}
