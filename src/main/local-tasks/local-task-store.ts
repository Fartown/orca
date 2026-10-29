import {
  LOCAL_TASK_PRIORITIES,
  formatLocalTaskRef,
  type LocalTaskPriority
} from '../../shared/local-tasks/local-task-model'
import type { LocalTask } from '../../shared/local-tasks/local-task-types'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
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
  return hydrateTasks(db, rows)
}

export function readLocalTask(db: LocalTasksDatabase, taskId: string): LocalTask | null {
  const row = db.prepare(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.id = ?`).get(taskId)
  return row ? (hydrateTasks(db, [row])[0] ?? null) : null
}

/** The task and every descendant, any depth, the task first. */
export function readLocalTaskSubtreeIds(db: LocalTasksDatabase, taskId: string): string[] {
  return db
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM local_tasks WHERE id = ?
         UNION SELECT t.id FROM local_tasks t JOIN subtree s ON t.parent_id = s.id
       ) SELECT id FROM subtree`
    )
    .all(taskId)
    .map((row) => rowString(row, 'id'))
}

// Why a bound: writes refuse cycles, but a damaged file must not hang the walk.
const LINEAGE_DEPTH_MAX = 1000

/** The task and its ancestors, nearest first. */
export function readLocalTaskLineageIds(db: LocalTasksDatabase, taskId: string): string[] {
  const ids = db
    .prepare(
      `WITH RECURSIVE lineage(id, parent_id, depth) AS (
         SELECT id, parent_id, 0 FROM local_tasks WHERE id = ?
         UNION ALL SELECT t.id, t.parent_id, l.depth + 1 FROM local_tasks t
           JOIN lineage l ON t.id = l.parent_id WHERE l.depth < ${LINEAGE_DEPTH_MAX}
       ) SELECT id FROM lineage ORDER BY depth`
    )
    .all(taskId)
    .map((row) => rowString(row, 'id'))
  return [...new Set(ids)]
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

/** Refs a task answered to in projects it moved out of; clients still find it by them. */
function readFormerRefs(db: LocalTasksDatabase, taskId: string): string[] {
  return db
    .prepare('SELECT alias FROM local_task_aliases WHERE task_id = ? ORDER BY rowid')
    .all(taskId)
    .map((row) => rowString(row, 'alias'))
}

function valuesByTask(rows: SqliteRow[], column: string): Map<string, string[]> {
  const byTask = new Map<string, string[]>()
  for (const row of rows) {
    const taskId = rowString(row, 'task_id')
    const values = byTask.get(taskId) ?? []
    values.push(rowString(row, column))
    byTask.set(taskId, values)
  }
  return byTask
}

function hydrateTasks(db: LocalTasksDatabase, rows: SqliteRow[]): LocalTask[] {
  if (rows.length === 0) {
    return []
  }
  if (rows.length === 1) {
    const taskId = rowString(rows[0], 'id')
    return [toTask(rows[0], readLocalTaskLabels(db, taskId), readFormerRefs(db, taskId))]
  }
  const labelsByTask = valuesByTask(
    db.prepare('SELECT task_id, label FROM local_task_labels ORDER BY label').all(),
    'label'
  )
  const formerRefsByTask = valuesByTask(
    db.prepare('SELECT task_id, alias FROM local_task_aliases ORDER BY rowid').all(),
    'alias'
  )
  return rows.map((row) => {
    const taskId = rowString(row, 'id')
    return toTask(row, labelsByTask.get(taskId) ?? [], formerRefsByTask.get(taskId) ?? [])
  })
}

function toTask(row: SqliteRow, labels: string[], formerRefs: string[]): LocalTask {
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
    revision: rowNumber(row, 'revision'),
    ...(formerRefs.length > 0 ? { formerRefs } : {})
  }
}

function readPriority(value: number): LocalTaskPriority {
  return LOCAL_TASK_PRIORITIES.find((priority) => priority === value) ?? 0
}
