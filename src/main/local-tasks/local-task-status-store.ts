import { randomUUID } from 'node:crypto'
import type {
  LocalTaskEventSource,
  LocalTaskResult
} from '../../shared/local-tasks/local-task-types'
import type {
  LocalTasksStatusesRemoveInput,
  LocalTasksStatusesReorderInput,
  LocalTasksStatusesUpsertInput
} from '../../shared/local-tasks/local-tasks-rpc-params'
import type { LocalTasksDatabase } from './local-tasks-database'
import { appendLocalTaskEvent } from './local-task-event-store'
import { readLocalTaskProject } from './local-task-project-store'
import { rowNumber, rowString } from './local-tasks-sqlite-row'

export function upsertLocalTaskStatus(
  db: LocalTasksDatabase,
  input: LocalTasksStatusesUpsertInput
): LocalTaskResult<{ statusId: string }> {
  const project = readLocalTaskProject(db, input.projectId)
  if (!project) {
    return { ok: false, code: 'not_found' }
  }
  if (input.statusId) {
    const existing = project.statuses.find((status) => status.id === input.statusId)
    if (!existing || (input.category && input.category !== existing.category)) {
      return { ok: false, code: 'status_invalid' }
    }
    if (existing.name === input.name && existing.color === input.color) {
      return { ok: true, statusId: existing.id }
    }
    db.prepare('UPDATE local_task_statuses SET name = ?, color = ? WHERE id = ?').run(
      input.name,
      input.color,
      existing.id
    )
    db.touch('projects')
    return { ok: true, statusId: existing.id }
  }
  if (!input.category) {
    return { ok: false, code: 'status_invalid' }
  }
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(position), -1) AS last FROM local_task_statuses WHERE project_id = ? AND category = ?'
    )
    .get(project.id, input.category)
  const statusId = randomUUID()
  db.prepare(
    'INSERT INTO local_task_statuses (id, project_id, category, name, color, position) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    statusId,
    project.id,
    input.category,
    input.name,
    input.color,
    (row ? rowNumber(row, 'last') : -1) + 1
  )
  db.touch('projects')
  return { ok: true, statusId }
}

/** The list covers every status of the project; positions only matter inside a category. */
export function reorderLocalTaskStatuses(
  db: LocalTasksDatabase,
  input: LocalTasksStatusesReorderInput
): LocalTaskResult<object> {
  const project = readLocalTaskProject(db, input.projectId)
  if (!project) {
    return { ok: false, code: 'not_found' }
  }
  const known = new Set(project.statuses.map((status) => status.id))
  const requested = new Set(input.orderedStatusIds)
  if (
    input.orderedStatusIds.length !== known.size ||
    requested.size !== known.size ||
    [...requested].some((statusId) => !known.has(statusId))
  ) {
    return { ok: false, code: 'status_invalid' }
  }
  if (input.orderedStatusIds.every((id, index) => project.statuses[index]?.id === id)) {
    return { ok: true }
  }
  const update = db.prepare('UPDATE local_task_statuses SET position = ? WHERE id = ?')
  input.orderedStatusIds.forEach((statusId, index) => update.run(index, statusId))
  db.touch('projects')
  return { ok: true }
}

export function removeLocalTaskStatus(
  db: LocalTasksDatabase,
  input: LocalTasksStatusesRemoveInput,
  source: LocalTaskEventSource,
  now: number
): LocalTaskResult<object> {
  const row = db
    .prepare('SELECT project_id FROM local_task_statuses WHERE id = ?')
    .get(input.statusId)
  const project = row ? readLocalTaskProject(db, rowString(row, 'project_id')) : null
  const status = project?.statuses.find((candidate) => candidate.id === input.statusId)
  if (!project || !status) {
    return { ok: false, code: 'not_found' }
  }
  if (project.statuses.filter((candidate) => candidate.category === status.category).length <= 1) {
    return { ok: false, code: 'last_status_in_category' }
  }
  const users = db.prepare('SELECT id FROM local_tasks WHERE status_id = ?').all(status.id)
  if (users.length > 0) {
    const target = project.statuses.find((candidate) => candidate.id === input.moveTasksToStatusId)
    if (!target || target.id === status.id) {
      return { ok: false, code: 'status_in_use', detail: String(users.length) }
    }
    const move = db.prepare(
      'UPDATE local_tasks SET status_id = ?, updated_at = ?, revision = revision + 1 WHERE id = ?'
    )
    for (const user of users) {
      const taskId = rowString(user, 'id')
      move.run(target.id, now, taskId)
      appendLocalTaskEvent(db, {
        taskId,
        kind: 'status',
        source,
        payload: { from: status.id, to: target.id, fromName: status.name, toName: target.name },
        now
      })
    }
    db.touch('tasks')
  }
  db.prepare('DELETE FROM local_task_statuses WHERE id = ?').run(status.id)
  db.touch('projects')
  return { ok: true }
}
