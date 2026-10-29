import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskProject,
  LocalTasksHostState
} from '../../../shared/local-tasks/local-task-types'
import type {
  LocalTaskAttentionItem,
  LocalTaskLinks,
  LocalTaskSessionProgress
} from '../../../shared/local-tasks/local-task-link-types'
import { SELF_LOCAL_TASK_ENDPOINT, type LocalTaskEndpointKey } from './local-task-endpoints'
import type { LocalTasksConnection, LocalTasksPartition } from './local-tasks-partition'

/** Every library's sessions and items as this window can vouch for them now. */
export type LocalTaskProgressView = {
  sessions: ReadonlyMap<string, LocalTaskSessionProgress>
  /** Only libraries in contact; newest first. */
  items: LocalTaskAttentionItem[]
  /** A library holding sessions is out of contact, so its sessions read as unverifiable. */
  unverifiable: boolean
}

export type LocalTasksDerived = {
  /** The library whose state, preferences and retry the page follows: this app's own, else the paired host's. */
  home: LocalTaskEndpointKey | null
  connection: LocalTasksConnection
  hostState: LocalTasksHostState | null
  hostReason: string | null
  readErrors: Record<string, string>
  projects: LocalTaskProject[]
  projectsLoaded: boolean
  tasks: LocalTask[]
  tasksLoaded: boolean
  eventsByTaskId: Record<string, LocalTaskEvent[]>
  preferences: Record<string, string | null>
  links: LocalTaskLinks
  linksLoaded: boolean
  progress: LocalTaskProgressView | null
  subscriptionEpoch: number
}

/** Keeps the last output while every input is the same reference, so selectors stay stable. */
function lastValue<T>(): (inputs: readonly unknown[], compute: () => T) => T {
  let last: { inputs: readonly unknown[]; output: T } | null = null
  return (inputs, compute) => {
    if (
      last &&
      last.inputs.length === inputs.length &&
      last.inputs.every((value, index) => value === inputs[index])
    ) {
      return last.output
    }
    const output = compute()
    last = { inputs, output }
    return output
  }
}

function sessionsOutOfContact(
  partition: LocalTasksPartition,
  sessions: Map<string, LocalTaskSessionProgress>
): void {
  const known = new Map(
    (partition.progress?.sessions ?? []).map((session) => [session.taskSessionId, session])
  )
  for (const link of partition.links.sessions) {
    // Loss of contact is never evidence: the last words stay, the state is not claimed.
    sessions.set(link.id, {
      taskSessionId: link.id,
      state: 'unverifiable',
      lastMessage: known.get(link.id)?.lastMessage ?? null,
      stateSince: null,
      unread: false
    })
  }
}

function buildProgressView(
  partitions: readonly LocalTasksPartition[]
): LocalTaskProgressView | null {
  const sessions = new Map<string, LocalTaskSessionProgress>()
  const items: LocalTaskAttentionItem[] = []
  let unverifiable = false
  let answered = false
  for (const partition of partitions) {
    if (!partition.inContact) {
      answered = true
      unverifiable ||= partition.links.sessions.length > 0
      sessionsOutOfContact(partition, sessions)
      continue
    }
    if (!partition.progress) {
      continue
    }
    answered = true
    for (const session of partition.progress.sessions) {
      sessions.set(session.taskSessionId, session)
    }
    items.push(...partition.progress.items)
  }
  if (!answered) {
    return null
  }
  items.sort((a, b) => b.since - a.since || a.key.localeCompare(b.key))
  return { sessions, items, unverifiable }
}

export function createDerive(): (partitions: readonly LocalTasksPartition[]) => LocalTasksDerived {
  const projects = lastValue<LocalTaskProject[]>()
  const tasks = lastValue<LocalTask[]>()
  const events = lastValue<Record<string, LocalTaskEvent[]>>()
  const links = lastValue<LocalTaskLinks>()
  const errors = lastValue<Record<string, string>>()
  const progress = lastValue<LocalTaskProgressView | null>()
  return (partitions) => {
    const home =
      partitions.find((partition) => partition.endpoint === SELF_LOCAL_TASK_ENDPOINT) ??
      partitions[0]
    const pick = <T>(read: (partition: LocalTasksPartition) => T): T[] => partitions.map(read)
    return {
      home: home?.endpoint ?? null,
      connection: home?.connection ?? 'connecting',
      hostState: home?.hostState ?? null,
      hostReason: home?.hostReason ?? null,
      readErrors: errors(
        pick((partition) => partition.readErrors),
        () => {
          const merged: Record<string, string> = {}
          for (const partition of partitions) {
            for (const [key, message] of Object.entries(partition.readErrors)) {
              // Why: an activity read names its task, so it cannot pass for another library's.
              if (key.startsWith('events:')) {
                merged[key] = message
              }
            }
          }
          // Why home only: the page's notice speaks for its own library; others get their own line.
          if (home) {
            Object.assign(merged, home.readErrors)
          }
          return merged
        }
      ),
      projects: projects(
        pick((partition) => partition.projects),
        () => partitions.flatMap((partition) => partition.projects)
      ),
      projectsLoaded: home?.projectsLoaded ?? false,
      tasks: tasks(
        pick((partition) => partition.tasks),
        () => partitions.flatMap((partition) => partition.tasks)
      ),
      tasksLoaded: home?.tasksLoaded ?? false,
      eventsByTaskId: events(
        pick((partition) => partition.eventsByTaskId),
        () => {
          const merged: Record<string, LocalTaskEvent[]> = {}
          for (const partition of partitions) {
            Object.assign(merged, partition.eventsByTaskId)
          }
          return merged
        }
      ),
      preferences: home?.preferences ?? {},
      links: links(
        pick((partition) => partition.links),
        () => ({
          workspaces: partitions.flatMap((partition) => partition.links.workspaces),
          sessions: partitions.flatMap((partition) => partition.links.sessions)
        })
      ),
      linksLoaded: home?.linksLoaded ?? false,
      progress: progress(
        pick((partition) => [partition.progress, partition.links, partition.inContact]).flat(),
        () => buildProgressView(partitions)
      ),
      subscriptionEpoch: home?.subscriptionEpoch ?? 0
    }
  }
}
