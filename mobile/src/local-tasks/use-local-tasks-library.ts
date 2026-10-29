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
import { useLocalTaskWork, type LocalTaskWork } from './use-local-task-work'

export type LocalTasksLibrary = {
  api: LocalTasksApi | null
  status: LocalTasksStatus | null
  projects: LocalTaskProject[]
  tasks: LocalTask[]
  /** Both lists have answered at least once for this host. */
  loaded: boolean
  error: string | null
  /** Bumps whenever activity may have changed, so an open detail re-reads its events. */
  eventsVersion: number
  live: boolean
  streamEnded: boolean
  reload: (scopes?: readonly LocalTaskChangeScope[]) => void
  retryFailed: () => void
  resubscribe: () => void
  /** Shows tasks a write just returned, ahead of the re-read that confirms them. */
  acceptTasks: (tasks: readonly LocalTask[]) => void
  /** Links and the host's live "Needs you" judgement. */
  work: LocalTaskWork
}

type LibraryData = {
  hostKey: string | null
  /** The api instance that read this; data another one read belongs to another connection. */
  owner: LocalTasksApi | null
  status: LocalTasksStatus | null
  projects: LocalTaskProject[] | null
  tasks: LocalTask[] | null
  errors: { status: string | null; projects: string | null; tasks: string | null }
  eventsVersion: number
}

const EMPTY: LibraryData = {
  hostKey: null,
  owner: null,
  status: null,
  projects: null,
  tasks: null,
  errors: { status: null, projects: null, tasks: null },
  eventsVersion: 0
}

function ownedBy(data: LibraryData, owner: LocalTasksApi, hostKey: string | null): LibraryData {
  if (data.hostKey !== hostKey) {
    return { ...EMPTY, hostKey, owner }
  }
  return data.owner === owner ? data : { ...data, owner }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The task library of one host. A lost connection keeps its last successful view while writes
 * are disabled; reconnect re-subscribes and re-reads without a timer.
 */
export function useLocalTasksLibrary(
  client: RpcClient | null,
  enabled: boolean,
  hostKey: string | null = null
): LocalTasksLibrary {
  const activeApi = useMemo(
    () => (client && enabled ? createLocalTasksApi(client) : null),
    [client, enabled, hostKey]
  )
  const [data, setData] = useState<LibraryData>(EMPTY)
  const work = useLocalTaskWork(activeApi, hostKey)
  const reloadWork = work.reload
  const [live, setLive] = useState(false)
  const [streamEnded, setStreamEnded] = useState(false)
  const [subscriptionEpoch, setSubscriptionEpoch] = useState(0)
  const activeApiRef = useRef(activeApi)
  useEffect(() => {
    activeApiRef.current = activeApi
  }, [activeApi])
  const current = data.hostKey === hostKey ? data : EMPTY
  const api = activeApi ?? current.owner
  // Why per resource: a slower earlier read must not overwrite a later one.
  const sequence = useRef({ status: 0, projects: 0, tasks: 0 })

  const reload = useCallback(
    (scopes?: readonly LocalTaskChangeScope[]) => {
      if (!activeApi) {
        return
      }
      const api = activeApi
      const wants = (scope: LocalTaskChangeScope) => !scopes || scopes.includes(scope)
      const track = <T>(
        key: 'status' | 'projects' | 'tasks',
        request: () => Promise<T>,
        apply: (previous: LibraryData, value: T) => LibraryData
      ) => {
        const turn = ++sequence.current[key]
        request().then(
          (value) => {
            if (turn === sequence.current[key] && activeApiRef.current === api) {
              setData((previous) => {
                const own = ownedBy(previous, api, hostKey)
                return { ...apply(own, value), errors: { ...own.errors, [key]: null } }
              })
            }
          },
          (error: unknown) => {
            if (turn === sequence.current[key] && activeApiRef.current === api) {
              setData((previous) => {
                const own = ownedBy(previous, api, hostKey)
                return { ...own, errors: { ...own.errors, [key]: message(error) } }
              })
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
      reloadWork(scopes)
      if (wants('events') || wants('tasks')) {
        setData((previous) => {
          const own = ownedBy(previous, api, hostKey)
          return { ...own, eventsVersion: own.eventsVersion + 1 }
        })
      }
    },
    [activeApi, hostKey, reloadWork]
  )
  const acceptTasks = useCallback(
    (accepted: readonly LocalTask[]) => {
      if (!activeApi) {
        return
      }
      const api = activeApi
      // Why bump: a read already in flight predates this write and must not paint over it.
      sequence.current.tasks += 1
      setData((previous) => {
        const own = ownedBy(previous, api, hostKey)
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
    [activeApi, hostKey]
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
      onScopes: (scopes) => reloadRef.current(scopes),
      onLiveChange: (next) => {
        setLive(next)
        setStreamEnded(!next)
      }
    })
  }, [client, enabled, hostKey, subscriptionEpoch])

  // A route changing hosts never inherits the previous host's cached library.
  return {
    api,
    status: current.status,
    projects: current.projects ?? [],
    tasks: current.tasks ?? [],
    loaded: current.projects !== null && current.tasks !== null,
    error: current.errors.status ?? current.errors.projects ?? current.errors.tasks,
    eventsVersion: current.eventsVersion,
    live: enabled && live,
    streamEnded: enabled && streamEnded,
    reload,
    retryFailed: () => {
      if (!activeApi) {
        return
      }
      work.retry()
      if (current.errors.status) {
        reload()
        return
      }
      const scopes: LocalTaskChangeScope[] = []
      if (current.errors.projects) {
        scopes.push('projects')
      }
      if (current.errors.tasks) {
        scopes.push('tasks')
      }
      if (scopes.length > 0) {
        reload(scopes)
      }
    },
    resubscribe: () => {
      if (activeApi) {
        setSubscriptionEpoch((epoch) => epoch + 1)
      }
    },
    acceptTasks,
    work: { links: work.links, progress: work.progress, error: work.error }
  }
}

/** One task's comments and activity, re-read whenever the library says activity may have moved. */
export function useLocalTaskEvents(
  api: LocalTasksApi | null,
  taskId: string,
  version: number
): { events: LocalTaskEvent[]; loaded: boolean; error: boolean; retry: () => void } {
  const [state, setState] = useState<{ taskId: string; events: LocalTaskEvent[] } | null>(null)
  const [error, setError] = useState(false)
  const [retryVersion, setRetryVersion] = useState(0)
  useEffect(() => {
    if (!api) {
      return
    }
    let current = true
    api.events(taskId).then(
      (events) => {
        if (current) {
          setState({ taskId, events })
          setError(false)
        }
      },
      () => {
        if (current) {
          setError(true)
        }
      }
    )
    return () => {
      current = false
    }
  }, [api, taskId, version, retryVersion])
  const own = state?.taskId === taskId ? state : null
  return {
    events: own?.events ?? [],
    loaded: own !== null,
    error,
    retry: () => setRetryVersion((value) => value + 1)
  }
}
