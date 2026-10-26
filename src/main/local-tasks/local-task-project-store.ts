import { randomUUID } from 'node:crypto'
import {
  DEFAULT_LOCAL_TASK_STATUSES,
  LOCAL_TASK_STATUS_CATEGORIES,
  LOCAL_TASK_STATUS_COLORS,
  normalizeLocalTaskPrefix,
  type LocalTaskStatusCategory,
  type LocalTaskStatusColor
} from '../../shared/local-tasks/local-task-model'
import type {
  LocalTaskProject,
  LocalTaskResult,
  LocalTaskStatusDef
} from '../../shared/local-tasks/local-task-types'
import type {
  LocalTasksProjectsCreateInput,
  LocalTasksProjectsUpdateInput
} from '../../shared/local-tasks/local-tasks-rpc-params'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowNullableString, rowNumber, rowString } from './local-tasks-sqlite-row'

export function readLocalTaskProjects(db: LocalTasksDatabase): LocalTaskProject[] {
  const prefixes = db
    .prepare(
      'SELECT prefix, project_id, is_current FROM local_task_project_prefixes ORDER BY created_at'
    )
    .all()
  const statuses = db
    .prepare('SELECT id, project_id, category, name, color, position FROM local_task_statuses')
    .all()
    .map(toStatus)
  return db
    .prepare(
      `SELECT id, name, orca_project_id, default_repo_id, last_execution_host_id,
              rule_start_moves, rule_pr_merged_completes, created_at, updated_at, revision
       FROM local_task_projects ORDER BY created_at`
    )
    .all()
    .map((row) => toProject(row, prefixes, statuses))
}

export function readLocalTaskProject(
  db: LocalTasksDatabase,
  projectId: string
): LocalTaskProject | null {
  return readLocalTaskProjects(db).find((project) => project.id === projectId) ?? null
}

/** Any current or earlier prefix resolves to its project. */
export function projectIdForPrefix(db: LocalTasksDatabase, prefix: string): string | null {
  const row = db
    .prepare('SELECT project_id FROM local_task_project_prefixes WHERE prefix = ?')
    .get(prefix)
  return row ? rowString(row, 'project_id') : null
}

export function createLocalTaskProject(
  db: LocalTasksDatabase,
  input: LocalTasksProjectsCreateInput,
  now: number
): LocalTaskResult<{ project: LocalTaskProject }> {
  const prefix = normalizeLocalTaskPrefix(input.prefix)
  if (!prefix) {
    return { ok: false, code: 'prefix_invalid' }
  }
  const prefixOwner = prefixOwnerName(db, prefix)
  if (prefixOwner !== null) {
    return { ok: false, code: 'prefix_taken', detail: prefixOwner }
  }
  const linked = db
    .prepare('SELECT name FROM local_task_projects WHERE orca_project_id = ?')
    .get(input.orcaProjectId)
  if (linked) {
    return { ok: false, code: 'orca_project_linked', detail: rowString(linked, 'name') }
  }
  const projectId = randomUUID()
  db.prepare(
    `INSERT INTO local_task_projects (id, name, orca_project_id, default_repo_id,
       last_execution_host_id, next_number, rule_start_moves, rule_pr_merged_completes,
       created_at, updated_at, revision)
     VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?, ?, 0)`
  ).run(
    projectId,
    input.name,
    input.orcaProjectId,
    input.defaultRepoId ?? null,
    input.lastExecutionHostId ?? null,
    now,
    now
  )
  db.prepare(
    'INSERT INTO local_task_project_prefixes (prefix, project_id, is_current, created_at) VALUES (?, ?, 1, ?)'
  ).run(prefix, projectId, now)
  const insertStatus = db.prepare(
    'INSERT INTO local_task_statuses (id, project_id, category, name, color, position) VALUES (?, ?, ?, ?, ?, 0)'
  )
  for (const status of DEFAULT_LOCAL_TASK_STATUSES) {
    const name = input.statusNames?.[status.category] ?? status.name
    insertStatus.run(randomUUID(), projectId, status.category, name, status.color)
  }
  db.touch('projects')
  const project = readLocalTaskProject(db, projectId)
  if (!project) {
    throw new Error('local tasks: created project is missing')
  }
  return { ok: true, project }
}

export function updateLocalTaskProject(
  db: LocalTasksDatabase,
  input: LocalTasksProjectsUpdateInput,
  now: number
): LocalTaskResult<{ project: LocalTaskProject }> {
  const project = readLocalTaskProject(db, input.projectId)
  if (!project) {
    return { ok: false, code: 'not_found' }
  }
  if (input.expectedRevision !== undefined && input.expectedRevision !== project.revision) {
    return { ok: false, code: 'stale' }
  }
  if (input.prefix !== undefined) {
    const changed = changeProjectPrefix(db, project, input.prefix, now)
    if (changed) {
      return changed
    }
  }
  const rules = { ...project.rules, ...input.rules }
  db.prepare(
    `UPDATE local_task_projects
     SET name = ?, rule_start_moves = ?, rule_pr_merged_completes = ?, default_repo_id = ?,
         last_execution_host_id = ?, updated_at = ?, revision = revision + 1
     WHERE id = ?`
  ).run(
    input.name ?? project.name,
    rules.startMovesToInProgress ? 1 : 0,
    rules.prMergedCompletes ? 1 : 0,
    input.defaultRepoId === undefined ? project.defaultRepoId : input.defaultRepoId,
    input.lastExecutionHostId === undefined
      ? project.lastExecutionHostId
      : input.lastExecutionHostId,
    now,
    project.id
  )
  db.touch('projects')
  // Why: refs shown on every task carry the prefix, so task views re-read too.
  db.touch('tasks')
  const updated = readLocalTaskProject(db, project.id)
  return updated ? { ok: true, project: updated } : { ok: false, code: 'not_found' }
}

export function removeLocalTaskProject(
  db: LocalTasksDatabase,
  projectId: string
): LocalTaskResult<object> {
  if (!readLocalTaskProject(db, projectId)) {
    return { ok: false, code: 'not_found' }
  }
  // Why: tasks first — they reference statuses, which the project row cascades away.
  db.prepare('DELETE FROM local_tasks WHERE project_id = ? AND parent_id IS NOT NULL').run(
    projectId
  )
  db.prepare('DELETE FROM local_tasks WHERE project_id = ?').run(projectId)
  db.prepare('DELETE FROM local_task_projects WHERE id = ?').run(projectId)
  db.touch('projects')
  db.touch('tasks')
  return { ok: true }
}

function changeProjectPrefix(
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

function prefixOwnerName(db: LocalTasksDatabase, prefix: string): string | null {
  const row = db
    .prepare(
      `SELECT p.name AS name FROM local_task_project_prefixes x
       JOIN local_task_projects p ON p.id = x.project_id WHERE x.prefix = ?`
    )
    .get(prefix)
  return row ? rowString(row, 'name') : null
}

function toStatus(row: SqliteRow): LocalTaskStatusDef {
  return {
    id: rowString(row, 'id'),
    projectId: rowString(row, 'project_id'),
    category: readCategory(rowString(row, 'category')),
    name: rowString(row, 'name'),
    color: readColor(rowString(row, 'color')),
    position: rowNumber(row, 'position')
  }
}

function toProject(
  row: SqliteRow,
  prefixes: SqliteRow[],
  statuses: LocalTaskStatusDef[]
): LocalTaskProject {
  const id = rowString(row, 'id')
  const own = prefixes.filter((prefix) => rowString(prefix, 'project_id') === id)
  const current = own.find((prefix) => rowNumber(prefix, 'is_current') === 1)
  return {
    id,
    name: rowString(row, 'name'),
    prefix: current ? rowString(current, 'prefix') : '',
    aliases: own
      .filter((prefix) => prefix !== current)
      .map((prefix) => rowString(prefix, 'prefix')),
    orcaProjectId: rowString(row, 'orca_project_id'),
    defaultRepoId: rowNullableString(row, 'default_repo_id'),
    lastExecutionHostId: rowNullableString(row, 'last_execution_host_id'),
    rules: {
      startMovesToInProgress: rowNumber(row, 'rule_start_moves') === 1,
      prMergedCompletes: rowNumber(row, 'rule_pr_merged_completes') === 1
    },
    statuses: sortStatuses(statuses.filter((status) => status.projectId === id)),
    createdAt: rowNumber(row, 'created_at'),
    updatedAt: rowNumber(row, 'updated_at'),
    revision: rowNumber(row, 'revision')
  }
}

/** Category order first, then the user's order inside each category. */
export function sortStatuses(statuses: LocalTaskStatusDef[]): LocalTaskStatusDef[] {
  return [...statuses].sort(
    (a, b) =>
      LOCAL_TASK_STATUS_CATEGORIES.indexOf(a.category) -
        LOCAL_TASK_STATUS_CATEGORIES.indexOf(b.category) || a.position - b.position
  )
}

function readCategory(value: string): LocalTaskStatusCategory {
  const match = LOCAL_TASK_STATUS_CATEGORIES.find((category) => category === value)
  if (!match) {
    throw new Error(`local tasks: unknown status category ${value}`)
  }
  return match
}

function readColor(value: string): LocalTaskStatusColor {
  return LOCAL_TASK_STATUS_COLORS.find((color) => color === value) ?? 'gray'
}
