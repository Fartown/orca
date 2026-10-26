import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type {
  LocalTask,
  LocalTaskChangeScope,
  LocalTaskEvent,
  LocalTaskProject,
  LocalTasksStatus
} from '../../../src/shared/local-tasks/local-task-types'
import type { RpcClient } from '../transport/rpc-client'
import { createLocalTasksApi, type LocalTasksApi } from './local-tasks-api'
import { startLocalTasksChangeFeed } from './local-tasks-change-feed'

export type LocalTasksLibrary = {
  api: LocalTasksApi | null
  status: LocalTasksStatus | null
  projects: LocalTaskProject[]
  tasks: LocalTask[]
  /** Both lists have answered at least once on this connection. */
  loaded: boolean
  error: string | null
  /** Bumps whenever activity may have changed, so an open detail re-reads its events. */
  eventsVersion: number
  reload: (scopes?: readonly LocalTaskChangeScope[]) => void
  /** Shows tasks a write just returned, ahead of the re-read that confirms them. */
  acceptTasks: (tasks: readonly LocalTask[]) => void
}

type LibraryData = {
  /** The api instance that read this; data another one read belongs to another connection. */
  owner: LocalTasksApi | null
  status: LocalTasksStatus | null
  projects: LocalTaskProject[] | null
  tasks: LocalTask[] | null
  error: string | null
  eventsVersion: number
}

const EMPTY: LibraryData = {
  owner: null,
  status: null,
  projects: null,
  tasks: null,
  error: null,
  eventsVersion: 0
}

function ownedBy(data: LibraryData, owner: LocalTasksApi): LibraryData {
  return data.owner === owner ? data : { ...EMPTY, owner }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The task library of one host, for as long as `enabled` holds (the host is connected and
 * advertised `local-tasks.v1`). Re-subscribing on every reconnect is what triggers the re-read; no
 * timer polls the desktop, and nothing is read while the host is out of contact.
 */
export function useLocalTasksLibrary(
  client: RpcClient | null,
  enabled: boolean
): LocalTasksLibrary {
  const api = useMemo(
    () => (client && enabled ? createLocalTasksApi(client) : null),
    [client, enabled]
  )
  const [data, setData] = useState<LibraryData>(EMPTY)
  // Why per resource: a slower earlier read must not overwrite a later one.
  const sequence = useRef({ status: 0, projects: 0, tasks: 0 })

  const reload = useCallback(
    (scopes?: readonly LocalTaskChangeScope[]) => {
      if (!api) {
        return
      }
      const wants = (scope: LocalTaskChangeScope) => !scopes || scopes.includes(scope)
      const track = <T>(
        key: 'status' | 'projects' | 'tasks',
        request: () => Promise<T>,
        apply: (previous: LibraryData, value: T) => LibraryData
      ) => {
        const turn = ++sequence.current[key]
        request().then(
          (value) => {
            if (turn === sequence.current[key]) {
              setData((previous) => ({ ...apply(ownedBy(previous, api), value), error: null }))
            }
          },
          (error: unknown) => {
            if (turn === sequence.current[key]) {
              setData((previous) => ({ ...ownedBy(previous, api), error: message(error) }))
            }
          }
        )
      }
      if (!scopes) {
        track(
          'status',
          () => api.status(),
          (previous, status) => ({ ...previous, status })
        )
      }
      if (wants('projects')) {
        track(
          'projects',
          () => api.projects(),
          (previous, projects) => ({ ...previous, projects })
        )
      }
      if (wants('tasks')) {
        track(
          'tasks',
          () => api.tasks(),
          (previous, tasks) => ({ ...previous, tasks })
        )
      }
      if (wants('events') || wants('tasks')) {
        setData((previous) => {
          const own = ownedBy(previous, api)
          return { ...own, eventsVersion: own.eventsVersion + 1 }
        })
      }
    },
    [api]
  )
  const acceptTasks = useCallback(
    (accepted: readonly LocalTask[]) => {
      if (!api) {
        return
      }
      // Why bump: a read already in flight predates this write and must not paint over it.
      sequence.current.tasks += 1
      setData((previous) => {
        const own = ownedBy(previous, api)
        if (!own.tasks) {
          return own
        }
        const byId = new Map(own.tasks.map((task) => [task.id, task]))
        for (const task of accepted) {
          byId.set(task.id, task)
        }
        return { ...own, tasks: [...byId.values()] }
      })
    },
    [api]
  )
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  }, [reload])

  useEffect(() => {
    if (!client || !enabled) {
      return
    }
    return startLocalTasksChangeFeed({
      client,
      appState: AppState,
      onFullReload: () => reloadRef.current(),
      onScopes: (scopes) => reloadRef.current(scopes)
    })
  }, [client, enabled])

  // Why derived: a reconnect or a lost capability makes a new api, and what the old one read is
  // never shown for it — the phone keeps no cache of a desktop out of contact.
  const current = api && data.owner === api ? data : EMPTY
  return {
    api,
    status: current.status,
    projects: current.projects ?? [],
    tasks: current.tasks ?? [],
    loaded: current.projects !== null && current.tasks !== null,
    error: current.error,
    eventsVersion: current.eventsVersion,
    reload,
    acceptTasks
  }
}

/** One task's comments and activity, re-read whenever the library says activity may have moved. */
export function useLocalTaskEvents(
  api: LocalTasksApi | null,
  taskId: string,
  version: number
): { events: LocalTaskEvent[]; loaded: boolean } {
  const [state, setState] = useState<{ taskId: string; events: LocalTaskEvent[] } | null>(null)
  useEffect(() => {
    if (!api) {
      return
    }
    let current = true
    api.events(taskId).then(
      (events) => {
        if (current) {
          setState({ taskId, events })
        }
      },
      () => {}
    )
    return () => {
      current = false
    }
  }, [api, taskId, version])
  const own = state?.taskId === taskId ? state : null
  return { events: own?.events ?? [], loaded: own !== null }
}
