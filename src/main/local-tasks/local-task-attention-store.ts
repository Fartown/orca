import type { LocalTaskResult } from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowNullableNumber, rowString } from './local-tasks-sqlite-row'

const STATE_TTL_MS = 30 * 24 * 60 * 60 * 1000

type AttentionMark = { itemKey: string; taskSessionId: string }
export type LocalTaskAttentionState = { seenAt: number | null; snoozedUntil: number | null }

/** A mark's item in the host's judgment at write time (`LocalTaskAttentionMonitor.markTarget`). */
export type LocalTaskAttentionMarkTarget = {
  /**
   * `raised`: the session raises the item now. `moved-on`: an earlier wait of the session's own
   * pane, which no longer shows. `other-session`: anything else, e.g. another session's item.
   */
  standing: 'raised' | 'moved-on' | 'other-session'
  /** Keys the rules raise now, seen or not; marks on other keys may be pruned. */
  liveKeys: ReadonlySet<string>
}

/** Marks an attention item seen; the same session's next wait has a new key and shows again. */
export function acknowledgeLocalTaskAttention(
  db: LocalTasksDatabase,
  mark: AttentionMark,
  target: LocalTaskAttentionMarkTarget,
  now: number
): LocalTaskResult<object> {
  const settled = unwrittenMarkResult(db, mark, target)
  if (settled) {
    return settled
  }
  pruneAttentionStates(db, target.liveKeys, now)
  if ((readLocalTaskAttentionStates(db).get(mark.itemKey)?.seenAt ?? null) !== null) {
    return { ok: true }
  }
  db.prepare(
    `INSERT INTO local_task_attention_state (item_key, task_session_id, seen_at, snoozed_until, created_at)
     VALUES (?, ?, ?, NULL, ?)
     ON CONFLICT(item_key) DO UPDATE SET seen_at = excluded.seen_at`
  ).run(mark.itemKey, mark.taskSessionId, now, now)
  db.touch('attention')
  return { ok: true }
}

export function snoozeLocalTaskAttention(
  db: LocalTasksDatabase,
  mark: AttentionMark & { until: number },
  target: LocalTaskAttentionMarkTarget,
  now: number
): LocalTaskResult<object> {
  if (mark.until <= now) {
    return { ok: false, code: 'invalid_argument' }
  }
  const settled = unwrittenMarkResult(db, mark, target)
  if (settled) {
    return settled
  }
  pruneAttentionStates(db, target.liveKeys, now)
  db.prepare(
    `INSERT INTO local_task_attention_state (item_key, task_session_id, seen_at, snoozed_until, created_at)
     VALUES (?, ?, NULL, ?, ?)
     ON CONFLICT(item_key) DO UPDATE SET snoozed_until = excluded.snoozed_until`
  ).run(mark.itemKey, mark.taskSessionId, mark.until, now)
  db.touch('attention')
  return { ok: true }
}

/** The earliest future snooze end among the items on screen, for the expiry notice. */
export function nextLocalTaskSnoozeExpiry(
  db: LocalTasksDatabase,
  liveKeys: ReadonlySet<string>,
  now: number
): number | null {
  let next: number | null = null
  for (const [key, state] of readLocalTaskAttentionStates(db)) {
    const until = state.snoozedUntil
    if (liveKeys.has(key) && until !== null && until > now && (next === null || until < next)) {
      next = until
    }
  }
  return next
}

/** Seen and snooze marks by item key. */
export function readLocalTaskAttentionStates(
  db: LocalTasksDatabase
): Map<string, LocalTaskAttentionState> {
  const states = new Map<string, LocalTaskAttentionState>()
  for (const row of db
    .prepare('SELECT item_key, seen_at, snoozed_until FROM local_task_attention_state')
    .all()) {
    states.set(rowString(row, 'item_key'), {
      seenAt: rowNullableNumber(row, 'seen_at'),
      snoozedUntil: rowNullableNumber(row, 'snoozed_until')
    })
  }
  return states
}

// Why: keys carry the wait's start time, so old marks only matter while that wait is still shown.
function pruneAttentionStates(
  db: LocalTasksDatabase,
  liveKeys: ReadonlySet<string>,
  now: number
): void {
  const stale = db
    .prepare(
      `SELECT item_key FROM local_task_attention_state
       WHERE created_at < ? AND (snoozed_until IS NULL OR snoozed_until <= ?)`
    )
    .all(now - STATE_TTL_MS, now)
    .map((row) => rowString(row, 'item_key'))
    .filter((key) => !liveKeys.has(key))
  const remove = db.prepare('DELETE FROM local_task_attention_state WHERE item_key = ?')
  for (const key of stale) {
    remove.run(key)
  }
}

/** The answer for a mark that is not written; null when it lands on an item raised now. */
function unwrittenMarkResult(
  db: LocalTasksDatabase,
  mark: AttentionMark,
  target: LocalTaskAttentionMarkTarget
): LocalTaskResult<object> | null {
  if (!sessionExists(db, mark.taskSessionId)) {
    return { ok: false, code: 'not_found' }
  }
  // Why: a mark is filed under its session; on another session's key it would hide that item and
  // vanish with the wrong session.
  if (target.standing === 'other-session') {
    return { ok: false, code: 'attention_item_mismatch' }
  }
  // Why not refused: a wait the session left no longer shows, and its next wait must show again.
  return target.standing === 'moved-on' ? { ok: true } : null
}

function sessionExists(db: LocalTasksDatabase, taskSessionId: string): boolean {
  return (
    db.prepare('SELECT 1 FROM local_task_sessions WHERE id = ?').get(taskSessionId) !== undefined
  )
}
