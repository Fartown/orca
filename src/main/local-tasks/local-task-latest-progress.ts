import { localTaskEventText } from '../../shared/local-tasks/local-task-event-payload'
import type { LocalTaskLatestProgress } from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowJsonObject, rowNullableString, rowNumber, rowString } from './local-tasks-sqlite-row'

const PROGRESS = `kind = 'comment' AND json_extract(payload, '$.progress') = 1`
/** A list carries the start of each result; the task's own read carries all of it. */
const LIST_BODY_MAX = 2000

/** Each task's newest writeback (REQ-022); one task when `taskId` is given, every task otherwise. */
export function readLatestProgressByTask(
  db: LocalTasksDatabase,
  taskId?: string
): Map<string, LocalTaskLatestProgress> {
  const rows = taskId
    ? db
        .prepare(
          `SELECT task_id, body, payload, created_at FROM local_task_events
           WHERE ${PROGRESS} AND task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`
        )
        .all(taskId)
    : db
        .prepare(
          `SELECT task_id, body, payload, created_at FROM (
             SELECT task_id, CASE WHEN length(body) > ${LIST_BODY_MAX}
               THEN substr(body, 1, ${LIST_BODY_MAX}) || '…' ELSE body END AS body,
               payload, created_at, ROW_NUMBER() OVER (
                 PARTITION BY task_id ORDER BY created_at DESC, rowid DESC) AS newest
             FROM local_task_events WHERE ${PROGRESS})
           WHERE newest = 1`
        )
        .all()
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
