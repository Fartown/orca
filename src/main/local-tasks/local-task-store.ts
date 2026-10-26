import {
  LOCAL_TASK_PRIORITIES,
  formatLocalTaskRef,
  parseLocalTaskRef,
  type LocalTaskPriority
} from '../../shared/local-tasks/local-task-model'
import type { LocalTask } from '../../shared/local-tasks/local-task-types'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
import { projectIdForPrefix } from './local-task-project-store'
import { rowNullableString, rowNumber, rowString, rowStringArray } from './local-tasks-sqlite-row'

const TASK_COLUMNS = `t.id, t.project_id, t.number, t.title, t.description, t.criteria, t.status_id,
  t.priority, t.parent_id, t.created_at, t.updated_at, t.revision, x.prefix AS prefix`
const TASK_FROM = `FROM local_tasks t JOIN local_task_project_prefixes x
  ON x.project_id = t.project_id AND x.is_current = 1`

export function readLocalTasks(db: LocalTasksDatabase, projectId?: string): LocalTask[] {
  const rows = projectId
    ? db
        .prepare(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.project_id = ? ORDER BY t.number`)
        .all(projectId)
    : db.prepare(`SELECT ${TASK_COLUMNS} ${TASK_FROM} ORDER BY t.project_id, t.number`).all()
  return withLabels(db, rows)
}

export function readLocalTask(db: LocalTasksDatabase, taskId: string): LocalTask | null {
  const row = db.prepare(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.id = ?`).get(taskId)
  return row ? (withLabels(db, [row])[0] ?? null) : null
}

export function readLocalTaskChildren(db: LocalTasksDatabase, parentId: string): LocalTask[] {
  const rows = db
    .prepare(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.parent_id = ? ORDER BY t.number`)
    .all(parentId)
  return withLabels(db, rows)
}

/** Task id, a ref with the current or an earlier prefix, or the ref a moved task used to have. */
export function resolveLocalTaskRef(db: LocalTasksDatabase, ref: string): LocalTask | null {
  const byId = readLocalTask(db, ref)
  if (byId) {
    return byId
  }
  const parsed = parseLocalTaskRef(ref)
  if (!parsed) {
    return null
  }
  const projectId = projectIdForPrefix(db, parsed.prefix)
  if (projectId) {
    const row = db
      .prepare('SELECT id FROM local_tasks WHERE project_id = ? AND number = ?')
      .get(projectId, parsed.taskNumber)
    if (row) {
      return readLocalTask(db, rowString(row, 'id'))
    }
  }
  const alias = db
    .prepare('SELECT task_id FROM local_task_aliases WHERE alias = ?')
    .get(formatLocalTaskRef(parsed.prefix, parsed.taskNumber))
  return alias ? readLocalTask(db, rowString(alias, 'task_id')) : null
}

/** A ref match first, then titles containing every word; small libraries make a scan cheap. */
export function searchLocalTasks(
  db: LocalTasksDatabase,
  query: string,
  limit: number
): LocalTask[] {
  const exact = resolveLocalTaskRef(db, query)
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = readLocalTasks(db).filter(
    (task) =>
      task.id !== exact?.id &&
      words.every(
        (word) => task.title.toLowerCase().includes(word) || task.ref.toLowerCase().includes(word)
      )
  )
  matches.sort((a, b) => b.updatedAt - a.updatedAt)
  return (exact ? [exact, ...matches] : matches).slice(0, limit)
}

export function readLocalTaskLabels(db: LocalTasksDatabase, taskId: string): string[] {
  return db
    .prepare('SELECT label FROM local_task_labels WHERE task_id = ? ORDER BY label')
    .all(taskId)
    .map((row) => rowString(row, 'label'))
}

export function writeLocalTaskLabels(
  db: LocalTasksDatabase,
  taskId: string,
  labels: string[]
): void {
  db.prepare('DELETE FROM local_task_labels WHERE task_id = ?').run(taskId)
  const insert = db.prepare(
    'INSERT OR IGNORE INTO local_task_labels (task_id, label) VALUES (?, ?)'
  )
  for (const label of labels) {
    insert.run(taskId, label)
  }
}

function withLabels(db: LocalTasksDatabase, rows: SqliteRow[]): LocalTask[] {
  if (rows.length === 0) {
    return []
  }
  if (rows.length === 1) {
    return [toTask(rows[0], readLocalTaskLabels(db, rowString(rows[0], 'id')))]
  }
  const labelsByTask = new Map<string, string[]>()
  for (const row of db
    .prepare('SELECT task_id, label FROM local_task_labels ORDER BY label')
    .all()) {
    const taskId = rowString(row, 'task_id')
    const labels = labelsByTask.get(taskId) ?? []
    labels.push(rowString(row, 'label'))
    labelsByTask.set(taskId, labels)
  }
  return rows.map((row) => toTask(row, labelsByTask.get(rowString(row, 'id')) ?? []))
}

function toTask(row: SqliteRow, labels: string[]): LocalTask {
  const taskNumber = rowNumber(row, 'number')
  return {
    id: rowString(row, 'id'),
    projectId: rowString(row, 'project_id'),
    number: taskNumber,
    ref: formatLocalTaskRef(rowString(row, 'prefix'), taskNumber),
    title: rowString(row, 'title'),
    description: rowString(row, 'description'),
    criteria: rowStringArray(row, 'criteria'),
    statusId: rowString(row, 'status_id'),
    priority: readPriority(rowNumber(row, 'priority')),
    labels,
    parentId: rowNullableString(row, 'parent_id'),
    createdAt: rowNumber(row, 'created_at'),
    updatedAt: rowNumber(row, 'updated_at'),
    revision: rowNumber(row, 'revision')
  }
}

function readPriority(value: number): LocalTaskPriority {
  return LOCAL_TASK_PRIORITIES.find((priority) => priority === value) ?? 0
}
