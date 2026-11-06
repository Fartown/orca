import type { LocalTasksApi } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'
import type { LocalTaskSite } from './local-task-endpoint'
import { localTaskWorkspaceLinkFor } from './local-task-progress-projection'
import { localTaskSessionHref } from './local-task-work-navigation'
import type { LocalTasksLibrary } from './use-local-tasks-library'

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
