import { localTaskEventText } from '../../shared/local-tasks/local-task-event-payload'
import type { LocalTaskLatestProgress } from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowJsonObject, rowNullableString, rowNumber, rowString } from './local-tasks-sqlite-row'

const PROGRESS_ROWS = `SELECT task_id, body, payload, created_at FROM local_task_events
  WHERE kind = 'comment' AND json_extract(payload, '$.progress') = 1`

/** Each task's newest writeback (REQ-022); one task when `taskId` is given, every task otherwise. */
export function readLatestProgressByTask(
  db: LocalTasksDatabase,
  taskId?: string
): Map<string, LocalTaskLatestProgress> {
  const rows = taskId
    ? db
        .prepare(`${PROGRESS_ROWS} AND task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`)
        .all(taskId)
    : db.prepare(`${PROGRESS_ROWS} ORDER BY created_at DESC, rowid DESC`).all()
  const latest = new Map<string, LocalTaskLatestProgress>()
  for (const row of rows) {
    const id = rowString(row, 'task_id')
    if (latest.has(id)) {
      continue
    }
    const payload = rowJsonObject(row, 'payload')
    const needsYou = localTaskEventText(payload, 'needsYou')
    latest.set(id, {
      kind: 'progress',
      body: rowNullableString(row, 'body') ?? '',
      at: rowNumber(row, 'created_at'),
      sessionLinkId: localTaskEventText(payload, 'sessionLinkId'),
      ...(needsYou ? { needsYou } : {})
    })
  }
  return latest
}
