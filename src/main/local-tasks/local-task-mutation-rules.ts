import type {
  LocalTaskEventSource,
  LocalTaskProject
} from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import { appendLocalTaskEvent } from './local-task-event-store'
import { readLocalTask, readLocalTaskSubtreeIds, writeLocalTaskLabels } from './local-task-store'

export function defaultStatusId(project: LocalTaskProject): string {
  const status =
    project.statuses.find((candidate) => candidate.category === 'unstarted') ?? project.statuses[0]
  if (!status) {
    throw new Error('local tasks: project has no statuses')
  }
  return status.id
}

/** A parent is any task of the same project that is neither the child nor one of its descendants. */
export function isValidParent(
  db: LocalTasksDatabase,
  parentId: string,
  projectId: string,
  childId: string | null
): boolean {
  const parent = readLocalTask(db, parentId)
  if (!parent || parent.projectId !== projectId) {
    return false
  }
  return childId === null || !readLocalTaskSubtreeIds(db, childId).includes(parent.id)
}

export function hasWorkspaceOrSessions(db: LocalTasksDatabase, taskIds: string[]): boolean {
  const workspace = db.prepare('SELECT 1 FROM local_task_workspaces WHERE task_id = ?')
  const session = db.prepare('SELECT 1 FROM local_task_sessions WHERE task_id = ? LIMIT 1')
  return taskIds.some(
    (taskId) => workspace.get(taskId) !== undefined || session.get(taskId) !== undefined
  )
}

export function setTaskColumn(
  db: LocalTasksDatabase,
  taskId: string,
  column: 'status_id' | 'priority',
  value: string | number,
  now: number
): void {
  const sql =
    column === 'status_id'
      ? 'UPDATE local_tasks SET status_id = ?, updated_at = ?, revision = revision + 1 WHERE id = ?'
      : 'UPDATE local_tasks SET priority = ?, updated_at = ?, revision = revision + 1 WHERE id = ?'
  db.prepare(sql).run(value, now, taskId)
}

export function statusPayload(
  project: LocalTaskProject | null,
  fromId: string,
  toId: string
): Record<string, unknown> {
  const name = (statusId: string): string | null =>
    project?.statuses.find((status) => status.id === statusId)?.name ?? null
  return { from: fromId, to: toId, fromName: name(fromId), toName: name(toId) }
}

export function recordLabelChange(
  db: LocalTasksDatabase,
  taskId: string,
  before: string[],
  after: string[],
  source: LocalTaskEventSource,
  now: number
): void {
  const added = after.filter((label) => !before.includes(label))
  const removed = before.filter((label) => !after.includes(label))
  if (added.length === 0 && removed.length === 0) {
    return
  }
  writeLocalTaskLabels(db, taskId, after)
  db.prepare('UPDATE local_tasks SET updated_at = ?, revision = revision + 1 WHERE id = ?').run(
    now,
    taskId
  )
  db.touch('tasks')
  appendLocalTaskEvent(db, { taskId, kind: 'labels', source, payload: { added, removed }, now })
}
