import type { LocalTaskSessionLink, LocalTaskSessionState } from './local-task-link-types'
import type { LocalTask } from './local-task-types'
import { localTaskDescendantIds } from './local-task-tree'

type TreeTask = Pick<LocalTask, 'id' | 'parentId'>

/**
 * Where one line for a task goes, the same on every client: a Send back reason (REQ-024) or a
 * dispatch added to the task (REQ-029) reaches every session of the task and of its subtasks at
 * any depth that finished a turn. One working or waiting cannot take a line (REQ-015).
 */
export function localTaskFinishedSessions<
  Session extends Pick<LocalTaskSessionLink, 'id' | 'taskId'>
>(args: {
  taskId: string
  tasks: readonly TreeTask[]
  sessions: readonly Session[]
  stateOf: (sessionLinkId: string) => LocalTaskSessionState | undefined
}): Session[] {
  const children = new Map<string, TreeTask[]>()
  for (const task of args.tasks) {
    if (task.parentId) {
      const siblings = children.get(task.parentId) ?? []
      siblings.push(task)
      children.set(task.parentId, siblings)
    }
  }
  const taskIds = new Set([args.taskId, ...localTaskDescendantIds(args.taskId, children)])
  return args.sessions.filter(
    (session) => taskIds.has(session.taskId) && args.stateOf(session.id) === 'done'
  )
}
