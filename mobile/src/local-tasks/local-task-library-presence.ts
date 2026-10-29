import { useEffect, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import { createLocalTasksApi } from './local-tasks-api'
import { localTaskLibraryHasProjects } from './local-tasks-access'

// Per library client, for this document's life: an answer, and the one read in flight.
const known = new WeakMap<RpcClient, boolean>()
const flights = new WeakMap<RpcClient, Promise<void>>()

function readPresence(client: RpcClient): Promise<void> {
  const inFlight = flights.get(client)
  if (inFlight) {
    return inFlight
  }
  const flight = createLocalTasksApi(client)
    .status()
    .then(
      (status) => {
        known.set(client, localTaskLibraryHasProjects(status))
      },
      () => {}
    )
    .finally(() => flights.delete(client))
  flights.set(client, flight)
  return flight
}

/**
 * Whether the library `client` reaches has a task project, read only when a screen asks (an action
 * sheet opening on one of its rows) and null until known. A library known to have one is not asked
 * again; one without is asked on each opening, so a project created since is picked up.
 */
export function useLocalTaskLibraryHasProjects(client: RpcClient | null): boolean | null {
  const [, setAnswers] = useState(0)
  useEffect(() => {
    if (!client || known.get(client) === true) {
      return
    }
    let current = true
    void readPresence(client).then(() => {
      if (current) {
        setAnswers((count) => count + 1)
      }
    })
    return () => {
      current = false
    }
  }, [client])
  return client ? (known.get(client) ?? null) : null
}
