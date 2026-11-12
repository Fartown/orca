import { appendLocalTaskEvent } from './local-task-event-store'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowJsonObject, rowNullableString, rowNumber } from './local-tasks-sqlite-row'

export type LocalTaskTurnEnd = {
  sessionLinkId: string
  taskId: string
  key: string
  body: string
  /** When the session was linked: the start of its first round here. */
  sessionOpenedAt: number
}

export function readLocalTaskTurnEnd(
  db: LocalTasksDatabase,
  sessionLinkId: string
): { key: string; body: string; at: number } | null {
  const row = db
    .prepare(
      `SELECT body, payload, created_at FROM local_task_events
       WHERE kind = 'turn-ended' AND json_extract(payload, '$.sessionLinkId') = ?
       ORDER BY created_at DESC, rowid DESC LIMIT 1`
    )
    .get(sessionLinkId)
  if (!row) {
    return null
  }
  const key = rowJsonObject(row, 'payload')?.attentionKey
  return typeof key === 'string'
    ? { key, body: rowNullableString(row, 'body') ?? '', at: rowNumber(row, 'created_at') }
    : null
}

export function writeLocalTaskTurnEnds(
  db: LocalTasksDatabase,
  turns: readonly LocalTaskTurnEnd[],
  now: number
): void {
  if (db.readOnly) {
    return
  }
  for (const turn of turns) {
    const saved = readLocalTaskTurnEnd(db, turn.sessionLinkId)
    if (saved?.key === turn.key) {
      if (turn.body && turn.body !== saved.body) {
        db.prepare(
          `UPDATE local_task_events SET body = ?, edited_at = ?
           WHERE kind = 'turn-ended' AND json_extract(payload, '$.sessionLinkId') = ?`
        ).run(turn.body, now, turn.sessionLinkId)
        db.touch('events')
        db.touch('tasks')
      }
      continue
    }
    db.prepare(
      `DELETE FROM local_task_events
       WHERE kind = 'turn-ended' AND json_extract(payload, '$.sessionLinkId') = ?`
    ).run(turn.sessionLinkId)
    appendLocalTaskEvent(db, {
      taskId: turn.taskId,
      kind: 'turn-ended',
      source: 'rule',
      body: turn.body,
      // Why the round start: a writeback from this round outranks its turn end (REQ-022), and only
      // the newest turn end per session is kept, so the boundary travels with it.
      payload: {
        sessionLinkId: turn.sessionLinkId,
        attentionKey: turn.key,
        roundStartedAt: saved?.at ?? turn.sessionOpenedAt
      },
      now
    })
    db.touch('tasks')
  }
}
