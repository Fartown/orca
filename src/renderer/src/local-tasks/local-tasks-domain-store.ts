import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import {
  SELF_LOCAL_TASK_ENDPOINT,
  localTaskIdEndpoint,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import { createDerive, type LocalTasksDerived } from './local-tasks-derived-state'
import {
  emptyLocalTasksPartition,
  type LocalTasksPartition,
  type PartitionWriter
} from './local-tasks-partition'

/** One library's data and writers, as `createLocalTasksSync` reads and applies them. */
export type LocalTasksPartitionView = LocalTasksPartition & PartitionWriter

export type LocalTasksDomainState = LocalTasksDerived & {
  /** This app's own library first (none in a browser client), then each paired Orca's. */
  partitions: readonly LocalTasksPartition[]
  openEndpoint: (endpoint: LocalTaskEndpointKey) => void
  closeEndpoint: (endpoint: LocalTaskEndpointKey) => void
  setEndpointContact: (endpoint: LocalTaskEndpointKey, inContact: boolean) => void
  /**
   * A write's own result lands before the change notice, so the UI reflects it without a gap. Only
   * a create adds rows: a late reply to an edit must not revive a task removed meanwhile.
   */
  upsertTasks: (tasks: LocalTask[], options?: { created?: boolean }) => void
  upsertProject: (project: LocalTaskProject) => void
  /** UI choices kept in the page's own library, applied before the host confirms them. */
  applyHomePreferences: (values: Record<string, string | null>) => void
  writer: (endpoint: LocalTaskEndpointKey) => PartitionWriter
  retry: (endpoint?: LocalTaskEndpointKey) => void
}

function mergeTasks(current: LocalTask[], incoming: LocalTask[], created: boolean): LocalTask[] {
  const byId = new Map(incoming.map((task) => [task.id, task]))
  const merged = current.map((task) => {
    const candidate = byId.get(task.id)
    return candidate && candidate.revision >= task.revision ? candidate : task
  })
  if (created) {
    const known = new Set(current.map((task) => task.id))
    merged.push(...incoming.filter((task) => !known.has(task.id)))
  }
  return merged
}

export function createLocalTasksDomainStore() {
  const derive = createDerive()
  return createStore<LocalTasksDomainState>((set, get) => {
    const commit = (partitions: readonly LocalTasksPartition[]) => ({
      partitions,
      ...derive(partitions)
    })
    const update = (
      endpoint: LocalTaskEndpointKey,
      change: (partition: LocalTasksPartition) => Partial<LocalTasksPartition> | null
    ): void =>
      set((state) => {
        let changed = false
        const partitions = state.partitions.map((partition) => {
          if (partition.endpoint !== endpoint) {
            return partition
          }
          const patch = change(partition)
          if (!patch) {
            return partition
          }
          changed = true
          return { ...partition, ...patch }
        })
        return changed ? commit(partitions) : state
      })
    const writers = new Map<LocalTaskEndpointKey, PartitionWriter>()
    const writer = (endpoint: LocalTaskEndpointKey): PartitionWriter => {
      const existing = writers.get(endpoint)
      if (existing) {
        return existing
      }
      const created: PartitionWriter = {
        setConnection: (connection, reason = null) =>
          update(endpoint, () =>
            connection === 'failed' ? { connection, hostReason: reason } : { connection }
          ),
        setHostState: (hostState, hostReason) =>
          update(endpoint, () => ({ hostState, hostReason })),
        applyStatus: (status) =>
          update(endpoint, () => ({
            hostState: status.state,
            hostReason: status.reason,
            projectCount: status.projectCount ?? 'unreported'
          })),
        setReadError: (resource, message) =>
          update(endpoint, (partition) => {
            if (message === null && !(resource in partition.readErrors)) {
              return null
            }
            const readErrors = { ...partition.readErrors }
            if (message === null) {
              delete readErrors[resource]
            } else {
              readErrors[resource] = message
            }
            return { readErrors }
          }),
        applyProjects: (projects) => update(endpoint, () => ({ projects, projectsLoaded: true })),
        applyTasks: (tasks) =>
          update(endpoint, (partition) => {
            const previous = new Map(partition.tasks.map((task) => [task.id, task]))
            return {
              tasks: tasks.map((task) => {
                const current = previous.get(task.id)
                return current && current.revision > task.revision ? current : task
              }),
              tasksLoaded: true
            }
          }),
        applyEvents: (taskId, events) =>
          update(endpoint, (partition) => ({
            eventsByTaskId: { ...partition.eventsByTaskId, [taskId]: events }
          })),
        dropEvents: (taskId) =>
          update(endpoint, (partition) =>
            taskId in partition.eventsByTaskId
              ? {
                  eventsByTaskId: Object.fromEntries(
                    Object.entries(partition.eventsByTaskId).filter(([id]) => id !== taskId)
                  )
                }
              : null
          ),
        applyPreferences: (values) =>
          update(endpoint, (partition) => ({
            preferences: { ...partition.preferences, ...values }
          })),
        applyLinks: (links) => update(endpoint, () => ({ links, linksLoaded: true })),
        applyProgress: (progress) => update(endpoint, () => ({ progress }))
      }
      writers.set(endpoint, created)
      return created
    }
    return {
      ...commit([]),
      openEndpoint: (endpoint) =>
        set((state) =>
          state.partitions.some((partition) => partition.endpoint === endpoint)
            ? state
            : commit(
                endpoint === SELF_LOCAL_TASK_ENDPOINT
                  ? [emptyLocalTasksPartition(endpoint), ...state.partitions]
                  : [...state.partitions, emptyLocalTasksPartition(endpoint)]
              )
        ),
      closeEndpoint: (endpoint) =>
        set((state) =>
          state.partitions.some((partition) => partition.endpoint === endpoint)
            ? commit(state.partitions.filter((partition) => partition.endpoint !== endpoint))
            : state
        ),
      setEndpointContact: (endpoint, inContact) =>
        update(endpoint, (partition) => (partition.inContact === inContact ? null : { inContact })),
      upsertTasks: (incoming, options) => {
        const byEndpoint = new Map<LocalTaskEndpointKey, LocalTask[]>()
        for (const task of incoming) {
          const endpoint = localTaskIdEndpoint(task.id)
          byEndpoint.set(endpoint, [...(byEndpoint.get(endpoint) ?? []), task])
        }
        for (const [endpoint, tasks] of byEndpoint) {
          update(endpoint, (partition) => ({
            tasks: mergeTasks(partition.tasks, tasks, options?.created === true)
          }))
        }
      },
      upsertProject: (project) =>
        update(localTaskIdEndpoint(project.id), (partition) => ({
          projects: partition.projects.some((candidate) => candidate.id === project.id)
            ? partition.projects.map((candidate) =>
                candidate.id === project.id && candidate.revision <= project.revision
                  ? project
                  : candidate
              )
            : [...partition.projects, project]
        })),
      applyHomePreferences: (values) => {
        const { home } = get()
        if (home) {
          writer(home).applyPreferences(values)
        }
      },
      writer,
      retry: (endpoint) => {
        const target = endpoint ?? get().home
        if (target) {
          update(target, (partition) => ({
            connection: 'connecting',
            subscriptionEpoch: partition.subscriptionEpoch + 1
          }))
        }
      }
    }
  })
}

export const localTasksDomainStore = createLocalTasksDomainStore()

export function useLocalTasksDomain<T>(selector: (state: LocalTasksDomainState) => T): T {
  return useStore(localTasksDomainStore, selector)
}

export function selectLocalTasksPartition(
  state: Pick<LocalTasksDomainState, 'partitions'>,
  endpoint: LocalTaskEndpointKey | null
): LocalTasksPartition | undefined {
  return endpoint === null
    ? undefined
    : state.partitions.find((partition) => partition.endpoint === endpoint)
}

/**
 * Writes need a live stream, a writable library and its Orca in contact; read-only libraries come
 * from a newer Orca. Without an endpoint this asks about the page's own library.
 */
export function isLocalTasksWritable(
  state: Pick<LocalTasksDomainState, 'partitions' | 'home'>,
  endpoint?: LocalTaskEndpointKey
): boolean {
  const partition = selectLocalTasksPartition(state, endpoint ?? state.home)
  return (
    partition?.inContact === true &&
    partition.connection === 'live' &&
    partition.hostState === 'ready'
  )
}

export function isLocalTasksReadable(
  state: Pick<LocalTasksDomainState, 'partitions' | 'home'>,
  endpoint?: LocalTaskEndpointKey
): boolean {
  const partition = selectLocalTasksPartition(state, endpoint ?? state.home)
  return (
    partition?.connection === 'live' &&
    (partition.hostState === 'ready' || partition.hostState === 'read-only')
  )
}

/** Whether the library that owns this row (task, project, session) takes writes now. */
export function isLocalTaskRowWritable(
  state: Pick<LocalTasksDomainState, 'partitions' | 'home'>,
  clientId: string
): boolean {
  return isLocalTasksWritable(state, localTaskIdEndpoint(clientId))
}

export function useLocalTaskRowWritable(clientId: string | null): boolean {
  return useLocalTasksDomain((state) =>
    clientId === null ? false : isLocalTaskRowWritable(state, clientId)
  )
}

/** Libraries that take writes now, for lists whose rows span several. */
export function useWritableLocalTaskEndpoints(): readonly LocalTaskEndpointKey[] {
  return useLocalTasksDomain(
    useShallow((state) =>
      state.partitions
        .filter((partition) => isLocalTasksWritable(state, partition.endpoint))
        .map((partition) => partition.endpoint)
    )
  )
}
