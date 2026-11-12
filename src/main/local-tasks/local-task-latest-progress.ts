import { localTaskEventText } from '../../shared/local-tasks/local-task-event-payload'
import {
  chooseLocalTaskOwnProgress,
  type LocalTaskTurnEndCandidate
} from '../../shared/local-tasks/local-task-latest-progress-choice'
import type { LocalTaskLatestProgress } from '../../shared/local-tasks/local-task-types'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowJsonObject, rowNullableString, rowNumber, rowString } from './local-tasks-sqlite-row'

const WRITEBACK = `kind = 'comment' AND json_extract(payload, '$.progress') = 1`
/** A list carries the start of each result; the task's own read carries all of it. */
const LIST_BODY_MAX = 2000
const LIST_BODY = `CASE WHEN length(body) > ${LIST_BODY_MAX}
  THEN substr(body, 1, ${LIST_BODY_MAX}) || '…' ELSE body END AS body`

/**
 * Each task's own latest progress (REQ-022): its newest writeback, or a turn end that came in a
 * later round. One task when `taskId` is given, every task otherwise.
 */
export function readLatestProgressByTask(
  db: LocalTasksDatabase,
  taskId?: string
): Map<string, LocalTaskLatestProgress> {
  const writebacks = new Map<string, LocalTaskLatestProgress>()
  for (const row of readWritebackRows(db, taskId)) {
    writebacks.set(rowString(row, 'task_id'), toProgress(row, 'progress'))
  }
  const turnEnds = new Map<string, LocalTaskTurnEndCandidate[]>()
  for (const row of readTurnEndRows(db, taskId)) {
    const id = rowString(row, 'task_id')
    const roundStartedAt = rowJsonObject(row, 'payload')?.roundStartedAt
    const candidates = turnEnds.get(id) ?? []
    candidates.push({
      progress: toProgress(row, 'turn-ended'),
      roundStartedAt: typeof roundStartedAt === 'number' ? roundStartedAt : null
    })
    turnEnds.set(id, candidates)
  }
  const latest = new Map<string, LocalTaskLatestProgress>()
  for (const id of new Set([...writebacks.keys(), ...turnEnds.keys()])) {
    const chosen = chooseLocalTaskOwnProgress(writebacks.get(id) ?? null, turnEnds.get(id) ?? [])
    if (chosen) {
      latest.set(id, chosen)
    }
  }
  return latest
}

function readWritebackRows(db: LocalTasksDatabase, taskId: string | undefined): SqliteRow[] {
  return taskId
    ? db
        .prepare(
          `SELECT task_id, body, payload, created_at FROM local_task_events
           WHERE ${WRITEBACK} AND task_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`
        )
        .all(taskId)
    : db
        .prepare(
          `SELECT task_id, body, payload, created_at FROM (
             SELECT task_id, ${LIST_BODY}, payload, created_at, ROW_NUMBER() OVER (
               PARTITION BY task_id ORDER BY created_at DESC, rowid DESC) AS newest
             FROM local_task_events WHERE ${WRITEBACK})
           WHERE newest = 1`
        )
        .all()
}

/** One per session, newest first: a session's next turn end replaces its last. */
function readTurnEndRows(db: LocalTasksDatabase, taskId: string | undefined): SqliteRow[] {
  return taskId
    ? db
        .prepare(
          `SELECT task_id, body, payload, created_at FROM local_task_events
           WHERE kind = 'turn-ended' AND task_id = ? ORDER BY created_at DESC, rowid DESC`
        )
        .all(taskId)
    : db
        .prepare(
          `SELECT task_id, ${LIST_BODY}, payload, created_at FROM local_task_events
           WHERE kind = 'turn-ended' ORDER BY created_at DESC, rowid DESC`
        )
        .all()
}

function toProgress(
  row: SqliteRow,
  kind: LocalTaskLatestProgress['kind']
): LocalTaskLatestProgress {
  const payload = rowJsonObject(row, 'payload')
  const needsYou = kind === 'progress' ? localTaskEventText(payload, 'needsYou') : null
  return {
    kind,
    body: rowNullableString(row, 'body') ?? '',
    at: rowNumber(row, 'created_at'),
    sessionLinkId: localTaskEventText(payload, 'sessionLinkId'),
    ...(needsYou ? { needsYou } : {})
  }
}
