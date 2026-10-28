import type {
  LocalTask,
  LocalTaskEventKind,
  LocalTaskEventSource,
  LocalTaskResult
} from '../../shared/local-tasks/local-task-types'
import type { LocalTasksTasksUpdateInput } from '../../shared/local-tasks/local-tasks-rpc-params'
import type { LocalTasksDatabase } from './local-tasks-database'
import { appendLocalTaskEvent } from './local-task-event-store'
import {
  isValidParent,
  recordLabelChange,
  setTaskColumn,
  statusPayload
} from './local-task-mutation-rules'
import { readLocalTaskProject } from './local-task-project-store'
import { readLocalTask } from './local-task-store'

/** Applies only the fields that changed, one activity entry per changed field. */
export function updateLocalTask(
  db: LocalTasksDatabase,
  input: LocalTasksTasksUpdateInput,
  source: LocalTaskEventSource,
  now: number
): LocalTaskResult<{ task: LocalTask }> {
  const task = readLocalTask(db, input.taskId)
  const project = task ? readLocalTaskProject(db, task.projectId) : null
  if (!task || !project) {
    return { ok: false, code: 'not_found' }
  }
  if (input.expectedRevision !== undefined && input.expectedRevision !== task.revision) {
    return { ok: false, code: 'stale' }
  }
  const patch = input.patch
  if (
    patch.statusId !== undefined &&
    !project.statuses.some((status) => status.id === patch.statusId)
  ) {
    return { ok: false, code: 'status_invalid' }
  }
  // Why: any depth, but never under itself or its own subtree; its links stay as they name work.
  if (
    patch.parentId !== undefined &&
    patch.parentId !== task.parentId &&
    patch.parentId !== null &&
    !isValidParent(db, patch.parentId, project.id, task.id)
  ) {
    return { ok: false, code: 'parent_invalid' }
  }
  const event = (kind: LocalTaskEventKind, payload?: Record<string, unknown>): string =>
    appendLocalTaskEvent(db, { taskId: task.id, kind, source, payload: payload ?? null, now })
  const touchRow = (sql: string, value: string | null): void => {
    db.prepare(sql).run(value, now, task.id)
  }
  if (patch.title !== undefined && patch.title !== task.title) {
    touchRow(
      'UPDATE local_tasks SET title = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
      patch.title
    )
    event('title', { from: task.title, to: patch.title })
  }
  if (patch.description !== undefined && patch.description !== task.description) {
    touchRow(
      'UPDATE local_tasks SET description = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
      patch.description
    )
    event('description')
  }
  if (
    patch.criteria !== undefined &&
    JSON.stringify(patch.criteria) !== JSON.stringify(task.criteria)
  ) {
    touchRow(
      'UPDATE local_tasks SET criteria = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
      JSON.stringify(patch.criteria)
    )
    event('criteria')
  }
  if (patch.statusId !== undefined && patch.statusId !== task.statusId) {
    setTaskColumn(db, task.id, 'status_id', patch.statusId, now)
    event('status', statusPayload(project, task.statusId, patch.statusId))
  }
  if (patch.priority !== undefined && patch.priority !== task.priority) {
    setTaskColumn(db, task.id, 'priority', patch.priority, now)
    event('priority', { from: task.priority, to: patch.priority })
  }
  if (patch.labels !== undefined) {
    recordLabelChange(db, task.id, task.labels, [...new Set(patch.labels)], source, now)
  }
  if (patch.parentId !== undefined && patch.parentId !== task.parentId) {
    touchRow(
      'UPDATE local_tasks SET parent_id = ?, updated_at = ?, revision = revision + 1 WHERE id = ?',
      patch.parentId
    )
    event('parent', { from: task.parentId, to: patch.parentId })
  }
  const updated = readLocalTask(db, task.id)
  if (updated && updated.revision !== task.revision) {
    db.touch('tasks')
  }
  return updated ? { ok: true, task: updated } : { ok: false, code: 'not_found' }
}
