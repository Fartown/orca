import { normalizeLocalTaskPrefix } from '../../shared/local-tasks/local-task-model'
import type { LocalTaskProject, LocalTaskResult } from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import { projectIdForPrefix } from './local-task-project-store'
import { rowString } from './local-tasks-sqlite-row'

export function changeProjectPrefix(
  db: LocalTasksDatabase,
  project: LocalTaskProject,
  requested: string,
  now: number
): LocalTaskResult<never> | null {
  const prefix = normalizeLocalTaskPrefix(requested)
  if (!prefix) {
    return { ok: false, code: 'prefix_invalid' }
  }
  if (prefix === project.prefix) {
    return null
  }
  const owner = projectIdForPrefix(db, prefix)
  if (owner !== null && owner !== project.id) {
    return { ok: false, code: 'prefix_taken', detail: prefixOwnerName(db, prefix) ?? undefined }
  }
  if (owner === null) {
    const aliasOwner = movedAliasOwner(db, prefix)
    if (aliasOwner !== null) {
      return aliasOwner.id === project.id
        ? { ok: false, code: 'prefix_history_in_project' }
        : { ok: false, code: 'prefix_taken', detail: aliasOwner.name }
    }
  }
  db.prepare('UPDATE local_task_project_prefixes SET is_current = 0 WHERE project_id = ?').run(
    project.id
  )
  if (owner === project.id) {
    // Why: switching back to an earlier prefix reuses its row, so old refs keep resolving.
    db.prepare('UPDATE local_task_project_prefixes SET is_current = 1 WHERE prefix = ?').run(prefix)
  } else {
    db.prepare(
      'INSERT INTO local_task_project_prefixes (prefix, project_id, is_current, created_at) VALUES (?, ?, 1, ?)'
    ).run(prefix, project.id, now)
  }
  return null
}

export function prefixOwnerName(db: LocalTasksDatabase, prefix: string): string | null {
  const row = db
    .prepare(
      `SELECT p.name AS name FROM local_task_project_prefixes x
       JOIN local_task_projects p ON p.id = x.project_id WHERE x.prefix = ?`
    )
    .get(prefix)
  if (row) {
    return rowString(row, 'name')
  }
  return movedAliasOwner(db, prefix)?.name ?? null
}

function movedAliasOwner(
  db: LocalTasksDatabase,
  prefix: string
): { id: string; name: string } | null {
  const aliasOwner = db
    .prepare(
      `SELECT p.id AS id, p.name AS name FROM local_task_aliases a
       JOIN local_tasks t ON t.id = a.task_id
       JOIN local_task_projects p ON p.id = t.project_id
       WHERE a.alias LIKE ? LIMIT 1`
    )
    .get(`${prefix}-%`)
  return aliasOwner
    ? { id: rowString(aliasOwner, 'id'), name: rowString(aliasOwner, 'name') }
    : null
}
