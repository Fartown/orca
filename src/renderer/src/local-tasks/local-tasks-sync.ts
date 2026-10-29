import { isWebClientLocation } from '@/lib/web-client-location'
import type { LocalTaskChangeScope } from '../../../shared/local-tasks/local-task-types'
import { changeMessageSchema } from '../../../shared/local-tasks/local-task-result-schemas'
import { localTasksEndpointReads, type LocalTasksEndpointReads } from './local-tasks-endpoint-calls'
import {
  localTasksDomainStore,
  selectLocalTasksPartition,
  type LocalTasksDomainState,
  type LocalTasksPartitionView
} from './local-tasks-domain-store'
import { emptyLocalTasksPartition } from './local-tasks-partition'
import {
  SELF_LOCAL_TASK_ENDPOINT,
  localTaskIdEndpoint,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import { LOCAL_TASK_PREFERENCE_KEYS } from './local-task-preference-keys'

const ALL_SCOPES: readonly LocalTaskChangeScope[] = [
  'projects',
  'tasks',
  'events',
  'preferences',
  'links',
  'attention'
]

export type LocalTasksSync = {
  /** One frame of `localTasks.subscribeChanges`. */
  receive: (frame: unknown) => void
  fail: (error: unknown) => void
  /** Re-reads the given scopes; `null` re-reads status and everything. */
  refresh: (scopes: readonly LocalTaskChangeScope[] | null) => Promise<void>
  /** Reads the host's status alone, for a library that is not streamed. */
  readStatus: () => Promise<void>
  /** Keeps a task's activity loaded while something shows it; returns the release. */
  watchEvents: (taskId: string) => () => void
  retryEvents: (taskId: string) => Promise<void>
}

type PartitionStore = { getState: () => LocalTasksPartitionView }

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * One library's reads. They follow its host's change notices only: `ready` resyncs everything
 * (notices sent while away are never replayed), `changed` re-reads its scopes. No timer, no polling.
 */
export function createLocalTasksSync(
  client: LocalTasksEndpointReads,
  store: PartitionStore,
  options: { preferences: boolean } = { preferences: true }
): LocalTasksSync {
  const latestRead = new Map<string, number>()
  const watchers = new Map<string, number>()

  // Why per-key sequence: a slow response must never overwrite one that was requested later.
  async function guarded<T>(
    key: string,
    load: () => Promise<T>,
    apply: (value: T) => void
  ): Promise<void> {
    const sequence = (latestRead.get(key) ?? 0) + 1
    latestRead.set(key, sequence)
    try {
      const value = await load()
      if (latestRead.get(key) === sequence) {
        apply(value)
        store.getState().setReadError(key, null)
      }
    } catch (error) {
      if (latestRead.get(key) === sequence) {
        store.getState().setReadError(key, describe(error))
      }
    }
  }

  function readable(): boolean {
    const { hostState, inContact } = store.getState()
    return inContact && (hostState === 'ready' || hostState === 'read-only')
  }

  function readEvents(taskId: string): Promise<void> {
    return guarded(
      `events:${taskId}`,
      () => client.listEvents(taskId),
      (events) => {
        if (watchers.has(taskId)) {
          store.getState().applyEvents(taskId, events)
        }
      }
    )
  }

  function readScope(scope: LocalTaskChangeScope): Promise<void>[] {
    const state = store.getState()
    switch (scope) {
      case 'projects':
        return [guarded('projects', () => client.listProjects(), state.applyProjects)]
      case 'tasks':
        return [guarded('tasks', () => client.listTasks(), state.applyTasks)]
      case 'events':
        return [...watchers.keys()].map(readEvents)
      case 'preferences':
        return options.preferences
          ? [
              guarded(
                'preferences',
                () => client.getPreferences(LOCAL_TASK_PREFERENCE_KEYS),
                state.applyPreferences
              )
            ]
          : []
      case 'links':
        return [guarded('links', () => client.listLinks(), state.applyLinks)]
      case 'attention':
        // Why: the host judges sessions on every call, and a library with no project has none.
        return state.projectCount === 0 && state.projects.length === 0
          ? []
          : [guarded('attention', () => client.getProgress(), state.applyProgress)]
    }
  }

  function readStatus(): Promise<void> {
    return guarded('status', () => client.status(), store.getState().applyStatus)
  }

  async function refresh(scopes: readonly LocalTaskChangeScope[] | null): Promise<void> {
    if (!store.getState().inContact) {
      return
    }
    if (scopes === null) {
      await readStatus()
    }
    if (!readable()) {
      return
    }
    await Promise.all((scopes ?? ALL_SCOPES).flatMap(readScope))
  }

  return {
    receive: (frame) => {
      const parsed = changeMessageSchema.safeParse(frame)
      if (!parsed.success) {
        return
      }
      const message = parsed.data
      switch (message.type) {
        case 'ready':
          store.getState().setConnection('live')
          store.getState().setHostState(message.state, null)
          void refresh(null)
          return
        case 'changed':
          void refresh(message.scopes)
          return
        case 'end':
          store.getState().setConnection('ended')
      }
    },
    fail: (error) => store.getState().setConnection('failed', describe(error)),
    refresh,
    readStatus: async () => {
      if (store.getState().inContact) {
        await readStatus()
      }
    },
    retryEvents: readEvents,
    watchEvents: (taskId) => {
      const count = watchers.get(taskId) ?? 0
      watchers.set(taskId, count + 1)
      if (count === 0 && readable() && store.getState().connection === 'live') {
        void readEvents(taskId)
      }
      let released = false
      return () => {
        if (released) {
          return
        }
        released = true
        const remaining = (watchers.get(taskId) ?? 1) - 1
        if (remaining > 0) {
          watchers.set(taskId, remaining)
          return
        }
        watchers.delete(taskId)
        store.getState().dropEvents(taskId)
      }
    }
  }
}

/** A partition's data plus its writers, read fresh from the domain store on every call. */
export function localTasksPartitionStore(
  domain: { getState: () => LocalTasksDomainState },
  endpoint: LocalTaskEndpointKey
): PartitionStore {
  return {
    getState: () => {
      const state = domain.getState()
      return {
        ...(selectLocalTasksPartition(state, endpoint) ?? emptyLocalTasksPartition(endpoint)),
        ...state.writer(endpoint)
      }
    }
  }
}

const syncs = new Map<LocalTaskEndpointKey, LocalTasksSync>()

/** The one sync per library this window reads; created when the library is first opened. */
export function localTasksSyncFor(endpoint: LocalTaskEndpointKey): LocalTasksSync {
  let sync = syncs.get(endpoint)
  if (!sync) {
    localTasksDomainStore.getState().openEndpoint(endpoint)
    sync = createLocalTasksSync(
      localTasksEndpointReads(endpoint),
      localTasksPartitionStore(localTasksDomainStore, endpoint),
      // Why: UI choices are kept in the page's own library; another Orca's are its user's.
      { preferences: endpoint === SELF_LOCAL_TASK_ENDPOINT || isWebClientLocation() }
    )
    syncs.set(endpoint, sync)
  }
  return sync
}

/** Forgets a library this window no longer pairs with. */
export function closeLocalTasksSync(endpoint: LocalTaskEndpointKey): void {
  syncs.delete(endpoint)
  localTasksDomainStore.getState().closeEndpoint(endpoint)
}

/** Every open library at once, or the one that owns an id; what the page and panels call. */
export const localTasksSync = {
  refresh: async (
    scopes: readonly LocalTaskChangeScope[] | null,
    endpoint?: LocalTaskEndpointKey
  ): Promise<void> => {
    const endpoints = endpoint
      ? [endpoint]
      : localTasksDomainStore.getState().partitions.map((partition) => partition.endpoint)
    await Promise.all(endpoints.map((key) => localTasksSyncFor(key).refresh(scopes)))
  },
  watchEvents: (taskId: string): (() => void) =>
    localTasksSyncFor(localTaskIdEndpoint(taskId)).watchEvents(taskId),
  retryEvents: (taskId: string): Promise<void> =>
    localTasksSyncFor(localTaskIdEndpoint(taskId)).retryEvents(taskId)
}
