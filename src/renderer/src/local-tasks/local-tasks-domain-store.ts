import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskProject,
  LocalTasksHostState
} from '../../../shared/local-tasks/local-task-types'

/** How this renderer's change stream stands; `ended` means the host closed it (app quitting). */
export type LocalTasksConnection = 'connecting' | 'live' | 'ended' | 'failed'

export type LocalTasksDomainState = {
  connection: LocalTasksConnection
  hostState: LocalTasksHostState | null
  hostReason: string | null
  /** Last read failure; cleared by the next successful read. */
  readError: string | null
  projects: LocalTaskProject[]
  projectsLoaded: boolean
  tasks: LocalTask[]
  tasksLoaded: boolean
  eventsByTaskId: Record<string, LocalTaskEvent[]>
  preferences: Record<string, string | null>
  /** Bumped by the user's explicit retry; the sync gate re-subscribes when it changes. */
  subscriptionEpoch: number
  setConnection: (connection: LocalTasksConnection, reason?: string | null) => void
  setHostState: (state: LocalTasksHostState, reason: string | null) => void
  setReadError: (message: string | null) => void
  applyProjects: (projects: LocalTaskProject[]) => void
  applyTasks: (tasks: LocalTask[]) => void
  upsertTasks: (tasks: LocalTask[]) => void
  applyEvents: (taskId: string, events: LocalTaskEvent[]) => void
  dropEvents: (taskId: string) => void
  applyPreferences: (values: Record<string, string | null>) => void
  retry: () => void
}

export const localTasksDomainStore = createStore<LocalTasksDomainState>((set) => ({
  connection: 'connecting',
  hostState: null,
  hostReason: null,
  readError: null,
  projects: [],
  projectsLoaded: false,
  tasks: [],
  tasksLoaded: false,
  eventsByTaskId: {},
  preferences: {},
  subscriptionEpoch: 0,
  setConnection: (connection, reason = null) =>
    set(connection === 'failed' ? { connection, hostReason: reason } : { connection }),
  setHostState: (hostState, hostReason) => set({ hostState, hostReason }),
  setReadError: (readError) => set({ readError }),
  applyProjects: (projects) => set({ projects, projectsLoaded: true, readError: null }),
  applyTasks: (tasks) => set({ tasks, tasksLoaded: true, readError: null }),
  // Why: a write's own result lands before the change notice, so the UI reflects it without a gap.
  upsertTasks: (incoming) =>
    set((state) => {
      const byId = new Map(incoming.map((task) => [task.id, task]))
      const merged = state.tasks.map((task) => byId.get(task.id) ?? task)
      for (const task of incoming) {
        if (!state.tasks.some((existing) => existing.id === task.id)) {
          merged.push(task)
        }
      }
      return { tasks: merged }
    }),
  applyEvents: (taskId, events) =>
    set((state) => ({ eventsByTaskId: { ...state.eventsByTaskId, [taskId]: events } })),
  dropEvents: (taskId) =>
    set((state) => ({
      eventsByTaskId: Object.fromEntries(
        Object.entries(state.eventsByTaskId).filter(([id]) => id !== taskId)
      )
    })),
  applyPreferences: (values) =>
    set((state) => ({ preferences: { ...state.preferences, ...values } })),
  retry: () =>
    set((state) => ({
      connection: 'connecting',
      readError: null,
      subscriptionEpoch: state.subscriptionEpoch + 1
    }))
}))

export function useLocalTasksDomain<T>(selector: (state: LocalTasksDomainState) => T): T {
  return useStore(localTasksDomainStore, selector)
}

/** Writes need a live stream and a writable library; read-only libraries come from a newer Orca. */
export function isLocalTasksWritable(state: LocalTasksDomainState): boolean {
  return state.connection === 'live' && state.hostState === 'ready'
}

export function isLocalTasksReadable(state: LocalTasksDomainState): boolean {
  return (
    state.connection === 'live' && (state.hostState === 'ready' || state.hostState === 'read-only')
  )
}
