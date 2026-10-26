import type { StoreApi } from 'zustand/vanilla'
import type { LocalTaskChangeScope } from '../../../shared/local-tasks/local-task-types'
import { changeMessageSchema } from '../../../shared/local-tasks/local-task-result-schemas'
import { localTasksClient, type LocalTasksClient } from './local-tasks-runtime-client'
import { localTasksDomainStore, type LocalTasksDomainState } from './local-tasks-domain-store'
import { LOCAL_TASK_PREFERENCE_KEYS } from './local-task-preference-keys'

const ALL_SCOPES: readonly LocalTaskChangeScope[] = ['projects', 'tasks', 'events', 'preferences']

type ReadClient = Pick<
  LocalTasksClient,
  'status' | 'listProjects' | 'listTasks' | 'listEvents' | 'getPreferences'
>

export type LocalTasksSync = {
  /** One frame of `localTasks.subscribeChanges`. */
  receive: (frame: unknown) => void
  fail: (error: unknown) => void
  /** Re-reads the given scopes; `null` re-reads status and everything. */
  refresh: (scopes: readonly LocalTaskChangeScope[] | null) => Promise<void>
  /** Keeps a task's activity loaded while something shows it; returns the release. */
  watchEvents: (taskId: string) => () => void
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Re-reads follow the host's change notices only: `ready` resyncs everything (notices sent while
 * disconnected are never replayed), `changed` re-reads its scopes. No timer, no polling.
 */
export function createLocalTasksSync(
  client: ReadClient,
  store: StoreApi<LocalTasksDomainState>
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
      }
    } catch (error) {
      if (latestRead.get(key) === sequence) {
        store.getState().setReadError(describe(error))
      }
    }
  }

  function readable(): boolean {
    const { hostState } = store.getState()
    return hostState === 'ready' || hostState === 'read-only'
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
        return [
          guarded(
            'preferences',
            () => client.getPreferences(LOCAL_TASK_PREFERENCE_KEYS),
            state.applyPreferences
          )
        ]
    }
  }

  async function refresh(scopes: readonly LocalTaskChangeScope[] | null): Promise<void> {
    if (scopes === null) {
      await guarded(
        'status',
        () => client.status(),
        (status) => store.getState().setHostState(status.state, status.reason)
      )
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

export const localTasksSync = createLocalTasksSync(localTasksClient, localTasksDomainStore)
