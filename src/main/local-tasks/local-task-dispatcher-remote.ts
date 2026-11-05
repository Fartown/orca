import type {
  LocalTaskForwardedFact,
  LocalTaskInboxItem,
  LocalTaskInboxKind,
  LocalTaskWatch
} from '../../shared/local-tasks/local-task-dispatcher-types'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowNullableString, rowNumber, rowString } from './local-tasks-sqlite-row'

// Tasks the dispatcher follows in other Orcas' libraries (D-008), and the facts a desktop window
// read there for it. The other library is never written: it may predate the dispatcher.

export function addRemoteWatch(
  db: LocalTasksDatabase,
  conversationId: string,
  taskClientId: string,
  addedBy: string,
  now: number
): void {
  db.prepare(
    `INSERT OR IGNORE INTO local_task_conversation_remote_watches
       (conversation_id, task_client_id, added_at, added_by) VALUES (?, ?, ?, ?)`
  ).run(conversationId, taskClientId, now, addedBy)
}

export function removeRemoteWatch(
  db: LocalTasksDatabase,
  conversationId: string,
  taskClientId: string
): void {
  db.prepare(
    'DELETE FROM local_task_conversation_remote_watches WHERE conversation_id = ? AND task_client_id = ?'
  ).run(conversationId, taskClientId)
}

/** Every task the conversation follows, here and in other libraries, newest first. */
export function listDispatcherWatches(
  db: LocalTasksDatabase,
  conversationId: string
): LocalTaskWatch[] {
  const local: LocalTaskWatch[] = db
    .prepare(
      `SELECT task_id, added_at, added_by FROM local_task_conversation_watches
       WHERE conversation_id = ?`
    )
    .all(conversationId)
    .map((row) => ({
      taskId: rowString(row, 'task_id'),
      addedAt: rowNumber(row, 'added_at'),
      addedBy: rowString(row, 'added_by') === 'proposal' ? 'proposal' : 'dispatcher'
    }))
  return [...local, ...listRemoteWatches(db, conversationId)].sort((a, b) => b.addedAt - a.addedAt)
}

export function listRemoteWatches(
  db: LocalTasksDatabase,
  conversationId: string
): LocalTaskWatch[] {
  return db
    .prepare(
      `SELECT task_client_id, added_at, added_by FROM local_task_conversation_remote_watches
       WHERE conversation_id = ? ORDER BY added_at DESC`
    )
    .all(conversationId)
    .map((row) => ({
      taskId: rowString(row, 'task_client_id'),
      addedAt: rowNumber(row, 'added_at'),
      addedBy: rowString(row, 'added_by') === 'proposal' ? 'proposal' : 'dispatcher'
    }))
}

/** Keeps facts on followed tasks and host facts, each source once; returns how many were new. */
export function recordForwardedFacts(
  db: LocalTasksDatabase,
  conversationId: string,
  facts: readonly LocalTaskForwardedFact[]
): number {
  const followed = new Set(listRemoteWatches(db, conversationId).map((watch) => watch.taskId))
  const insert = db.prepare(
    `INSERT OR IGNORE INTO local_task_conversation_facts (conversation_id, source_id,
       task_client_id, task_ref, kind, at, summary, needs_you, finished)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let kept = 0
  for (const fact of facts) {
    if (fact.taskId !== null ? !followed.has(fact.taskId) : fact.kind !== 'host') {
      continue
    }
    const written = insert.run(
      conversationId,
      fact.sourceId,
      fact.taskId,
      fact.taskRef,
      fact.kind,
      fact.at,
      fact.summary,
      fact.needsYou ?? null,
      fact.finished ? 1 : 0
    )
    kept += Number(written.changes)
  }
  return kept
}

export type ForwardedPage = { items: LocalTaskInboxItem[]; lastRowid: number; more: boolean }

const FACT_KINDS: readonly LocalTaskInboxKind[] = [
  'progress',
  'status',
  'session',
  'comment',
  'needs-you',
  'host'
]

function factItem(row: SqliteRow): LocalTaskInboxItem {
  const kind = rowString(row, 'kind')
  const needsYou = rowNullableString(row, 'needs_you')
  return {
    kind: FACT_KINDS.find((candidate) => candidate === kind) ?? 'comment',
    at: rowNumber(row, 'at'),
    taskId: rowNullableString(row, 'task_client_id'),
    taskRef: rowNullableString(row, 'task_ref'),
    summary: rowString(row, 'summary'),
    ...(needsYou ? { needsYou } : {})
  }
}

/** Forwarded facts the dispatcher has not acked, oldest first. */
export function readForwardedFacts(
  db: LocalTasksDatabase,
  conversationId: string,
  limit: number
): ForwardedPage {
  const rows = db
    .prepare(
      `SELECT rowid AS seq, task_client_id, task_ref, kind, at, summary, needs_you
       FROM local_task_conversation_facts WHERE conversation_id = ? AND reported_at IS NULL
       ORDER BY rowid LIMIT ?`
    )
    .all(conversationId, limit + 1)
  const shown = rows.slice(0, limit)
  const last = shown.at(-1)
  return {
    items: shown.map(factItem),
    lastRowid: last ? rowNumber(last, 'seq') : 0,
    more: rows.length > limit
  }
}

/**
 * Marks the facts a cursor covered as reported, then stops following other-host tasks whose
 * newest fact said they finished and was reported.
 */
export function reportForwardedFacts(
  db: LocalTasksDatabase,
  conversationId: string,
  uptoRowid: number,
  now: number
): void {
  if (uptoRowid > 0) {
    db.prepare(
      `UPDATE local_task_conversation_facts SET reported_at = ?
       WHERE conversation_id = ? AND rowid <= ? AND reported_at IS NULL`
    ).run(now, conversationId, uptoRowid)
  }
  db.prepare(
    `DELETE FROM local_task_conversation_remote_watches WHERE conversation_id = ?
       AND task_client_id IN (
         SELECT f.task_client_id FROM local_task_conversation_facts f
         WHERE f.conversation_id = ? AND f.finished = 1 AND f.reported_at IS NOT NULL
           AND f.rowid = (SELECT MAX(g.rowid) FROM local_task_conversation_facts g
                          WHERE g.conversation_id = f.conversation_id
                            AND g.task_client_id = f.task_client_id))`
  ).run(conversationId, conversationId)
}
