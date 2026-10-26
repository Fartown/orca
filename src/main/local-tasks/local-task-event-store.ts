import { randomUUID } from 'node:crypto'
import type {
  LocalTaskEvent,
  LocalTaskEventKind,
  LocalTaskEventSource,
  LocalTaskResult
} from '../../shared/local-tasks/local-task-types'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
import {
  rowJsonObject,
  rowNullableNumber,
  rowNullableString,
  rowNumber,
  rowString
} from './local-tasks-sqlite-row'

const EVENT_KINDS: readonly LocalTaskEventKind[] = [
  'comment',
  'created',
  'title',
  'description',
  'criteria',
  'status',
  'priority',
  'labels',
  'parent',
  'moved'
]
const EVENT_SOURCES: readonly LocalTaskEventSource[] = ['desktop', 'mobile', 'cli', 'rule']

export type AppendLocalTaskEventInput = {
  taskId: string
  kind: LocalTaskEventKind
  source: LocalTaskEventSource
  body?: string | null
  payload?: Record<string, unknown> | null
  now: number
}

export function appendLocalTaskEvent(
  db: LocalTasksDatabase,
  input: AppendLocalTaskEventInput
): string {
  const eventId = randomUUID()
  db.prepare(
    `INSERT INTO local_task_events (id, task_id, kind, source, body, payload, created_at, edited_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    eventId,
    input.taskId,
    input.kind,
    input.source,
    input.body ?? null,
    input.payload ? JSON.stringify(input.payload) : null,
    input.now
  )
  db.touch('events')
  return eventId
}

export function listLocalTaskEvents(db: LocalTasksDatabase, taskId: string): LocalTaskEvent[] {
  return db
    .prepare(
      `SELECT id, task_id, kind, source, body, payload, created_at, edited_at
       FROM local_task_events WHERE task_id = ? ORDER BY created_at, rowid`
    )
    .all(taskId)
    .map(toEvent)
}

export function addLocalTaskComment(
  db: LocalTasksDatabase,
  taskId: string,
  body: string,
  source: LocalTaskEventSource,
  now: number
): LocalTaskResult<{ eventId: string }> {
  if (!db.prepare('SELECT 1 FROM local_tasks WHERE id = ?').get(taskId)) {
    return { ok: false, code: 'not_found' }
  }
  return {
    ok: true,
    eventId: appendLocalTaskEvent(db, { taskId, kind: 'comment', source, body, now })
  }
}

export function editLocalTaskComment(
  db: LocalTasksDatabase,
  eventId: string,
  body: string,
  now: number
): LocalTaskResult<object> {
  const failure = requireComment(db, eventId)
  if (failure) {
    return failure
  }
  db.prepare('UPDATE local_task_events SET body = ?, edited_at = ? WHERE id = ?').run(
    body,
    now,
    eventId
  )
  db.touch('events')
  return { ok: true }
}

export function removeLocalTaskComment(
  db: LocalTasksDatabase,
  eventId: string
): LocalTaskResult<object> {
  const failure = requireComment(db, eventId)
  if (failure) {
    return failure
  }
  db.prepare('DELETE FROM local_task_events WHERE id = ?').run(eventId)
  db.touch('events')
  return { ok: true }
}

// Why: activity is history; only the user's own comments are editable.
function requireComment(
  db: LocalTasksDatabase,
  eventId: string
): { ok: false; code: 'not_found' | 'comment_not_editable' } | null {
  const row = db.prepare('SELECT kind FROM local_task_events WHERE id = ?').get(eventId)
  if (!row) {
    return { ok: false, code: 'not_found' }
  }
  return rowString(row, 'kind') === 'comment' ? null : { ok: false, code: 'comment_not_editable' }
}

function toEvent(row: SqliteRow): LocalTaskEvent {
  const kind = rowString(row, 'kind')
  const source = rowString(row, 'source')
  return {
    id: rowString(row, 'id'),
    taskId: rowString(row, 'task_id'),
    kind: EVENT_KINDS.find((candidate) => candidate === kind) ?? 'comment',
    source: EVENT_SOURCES.find((candidate) => candidate === source) ?? 'desktop',
    body: rowNullableString(row, 'body'),
    payload: rowJsonObject(row, 'payload'),
    createdAt: rowNumber(row, 'created_at'),
    editedAt: rowNullableNumber(row, 'edited_at')
  }
}
