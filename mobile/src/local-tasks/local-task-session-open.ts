import type { LocalTaskSessionLink } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTasksApi } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'
import {
  localTaskRouteExecutionHost,
  type LocalTaskEndpoint,
  type LocalTaskSite
} from './local-task-endpoint'
import { localTaskWorkspaceLinkFor } from './local-task-progress-projection'
import { localTaskSessionHref, localTaskWorkspaceRouteId } from './local-task-work-navigation'
import type { LocalTasksLibrary } from './use-local-tasks-library'

/**
 * Where a chat session previews in the drawer, or null: a terminal session opens its session page
 * instead (Q2), and so does a chat whose workspace the phone cannot route to. `executionHost` is
 * the one its session page's route would carry, so a server library's chat is read on that server.
 */
export function localTaskChatPreviewTarget(
  library: Pick<LocalTasksLibrary, 'tasks' | 'work'>,
  endpoint: LocalTaskEndpoint,
  taskSessionId: string
): {
  session: LocalTaskSessionLink
  worktreeId: string
  executionHost: `runtime:${string}` | undefined
} | null {
  const session = library.work.links.sessions.find((entry) => entry.id === taskSessionId)
  if (session?.surface !== 'chat') {
    return null
  }
  const tasksById = new Map(library.tasks.map((task) => [task.id, task]))
  const owner = tasksById.get(session.taskId)
  const workspace = owner ? localTaskWorkspaceLinkFor(owner, tasksById, library.work.links) : null
  const worktreeId = session.worktreeId ?? (workspace ? localTaskWorkspaceRouteId(workspace) : null)
  // The same host the session page's href routes on (localTaskSessionHref).
  const ownerHostId = session.worktreeId ? session.hostId : workspace?.hostId
  const executionHost = ownerHostId ? localTaskRouteExecutionHost(endpoint, ownerHostId) : null
  return worktreeId && executionHost !== null ? { session, worktreeId, executionHost } : null
}

/**
 * Opens a linked session's screen in the workspace it ran in, or says why it can't (it is no
 * longer recorded, or an older Orca recorded it where the phone has no route). The reason is shown
 * where the user asked, so a tap is never silent.
 */
export function openLinkedLocalTaskSession(args: {
  site: Pick<LocalTaskSite, 'hostId' | 'endpoint'>
  api: LocalTasksApi
  library: Pick<LocalTasksLibrary, 'tasks' | 'work' | 'reload'>
  copy: LocalTasksCopy
  taskSessionId: string
  onNavigate: (href: string) => void
}): string | null {
  const { library } = args
  const session = library.work.links.sessions.find((entry) => entry.id === args.taskSessionId)
  if (!session) {
    return args.copy.work.sessionNoLongerRecorded
  }
  const tasksById = new Map(library.tasks.map((task) => [task.id, task]))
  const owner = tasksById.get(session.taskId)
  const href = localTaskSessionHref({
    hostId: args.site.hostId,
    endpoint: args.site.endpoint,
    session,
    workspace: owner ? localTaskWorkspaceLinkFor(owner, tasksById, library.work.links) : null
  })
  if (!href) {
    return args.copy.work.cannotOpenHere
  }
  args.onNavigate(href)
  return null
}
