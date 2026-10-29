import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskProject,
  LocalTasksHostState
} from '../../../shared/local-tasks/local-task-types'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTaskEndpointKey } from './local-task-endpoints'

/**
 * How one library's change stream stands; `ended` means the host closed it, `unsupported` that the
 * paired Orca does not advertise `local-tasks.v1` and needs an update.
 */
export type LocalTasksConnection = 'connecting' | 'live' | 'ended' | 'failed' | 'unsupported'

/** Everything this window holds of one library, in client ids (`local-task-client-rows.ts`). */
export type LocalTasksPartition = {
  endpoint: LocalTaskEndpointKey
  connection: LocalTasksConnection
  /** The shared contact verdict for the library's Orca; out of contact nothing is read. */
  inContact: boolean
  hostState: LocalTasksHostState | null
  hostReason: string | null
  /** Read failures belong to the resource that produced them. */
  readErrors: Record<string, string>
  projects: LocalTaskProject[]
  projectsLoaded: boolean
  tasks: LocalTask[]
  tasksLoaded: boolean
  eventsByTaskId: Record<string, LocalTaskEvent[]>
  preferences: Record<string, string | null>
  links: LocalTaskLinks
  linksLoaded: boolean
  /** The host's own judgement (`attention.get`), seen and snoozed items already left out. */
  progress: LocalTaskProgressSnapshot | null
  /** Bumped by the user's explicit retry; the sync gate re-subscribes when it changes. */
  subscriptionEpoch: number
}

export type PartitionWriter = {
  setConnection: (connection: LocalTasksConnection, reason?: string | null) => void
  setHostState: (state: LocalTasksHostState, reason: string | null) => void
  setReadError: (resource: string, message: string | null) => void
  applyProjects: (projects: LocalTaskProject[]) => void
  applyTasks: (tasks: LocalTask[]) => void
  applyEvents: (taskId: string, events: LocalTaskEvent[]) => void
  dropEvents: (taskId: string) => void
  applyPreferences: (values: Record<string, string | null>) => void
  applyLinks: (links: LocalTaskLinks) => void
  applyProgress: (progress: LocalTaskProgressSnapshot) => void
}

export function emptyLocalTasksPartition(endpoint: LocalTaskEndpointKey): LocalTasksPartition {
  return {
    endpoint,
    connection: 'connecting',
    inContact: true,
    hostState: null,
    hostReason: null,
    readErrors: {},
    projects: [],
    projectsLoaded: false,
    tasks: [],
    tasksLoaded: false,
    eventsByTaskId: {},
    preferences: {},
    links: { workspaces: [], sessions: [] },
    linksLoaded: false,
    progress: null,
    subscriptionEpoch: 0
  }
}
