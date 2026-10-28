import {
  LOCAL_TASK_STATUS_CATEGORIES,
  LOCAL_TASK_STATUS_COLORS,
  type LocalTaskStatusColor
} from '../../shared/local-tasks/local-task-model'
import type {
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../shared/local-tasks/local-task-types'
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
    .flatMap((row) => {
      const status = toStatus(row)
      return status ? [status] : []
    })
  const repos = db
    .prepare(
      'SELECT project_id, orca_project_id FROM local_task_project_repos ORDER BY position, rowid'
    )
    .all()
  return db
    .prepare(
      `SELECT id, name, default_repo_id, last_execution_host_id,
              rule_start_moves, rule_pr_merged_completes, created_at, updated_at, revision
       FROM local_task_projects ORDER BY created_at`
    )
    .all()
    .map((row) => toProject(row, prefixes, statuses, repos))
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

function toStatus(row: SqliteRow): LocalTaskStatusDef | null {
  const category = LOCAL_TASK_STATUS_CATEGORIES.find(
    (candidate) => candidate === rowString(row, 'category')
  )
  if (!category) {
    return null
  }
  return {
    id: rowString(row, 'id'),
    projectId: rowString(row, 'project_id'),
    category,
    name: rowString(row, 'name'),
    color: readColor(rowString(row, 'color')),
    position: rowNumber(row, 'position')
  }
}

function toProject(
  row: SqliteRow,
  prefixes: SqliteRow[],
  statuses: LocalTaskStatusDef[],
  repos: SqliteRow[]
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
    repos: repos
      .filter((repo) => rowString(repo, 'project_id') === id)
      .map((repo) => rowString(repo, 'orca_project_id')),
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

function readColor(value: string): LocalTaskStatusColor {
  return LOCAL_TASK_STATUS_COLORS.find((color) => color === value) ?? 'gray'
}
