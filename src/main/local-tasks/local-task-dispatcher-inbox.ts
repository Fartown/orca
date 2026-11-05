import type {
  LocalTaskInbox,
  LocalTaskInboxItem
} from '../../shared/local-tasks/local-task-dispatcher-types'
import {
  describeLocalTaskInboxEvent,
  inboxLine,
  LOCAL_TASK_INBOX_EVENT_KINDS
} from '../../shared/local-tasks/local-task-inbox-copy'
import type { LocalTaskProgressSnapshot } from '../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskResult } from '../../shared/local-tasks/local-task-types'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
import { readLocalTaskProject } from './local-task-project-store'
import { describeSettledProposal, unreportedLocalTaskProposals } from './local-task-proposal-rows'
import { readLocalTask } from './local-task-store'
import { reportForwardedFacts, type ForwardedPage } from './local-task-dispatcher-remote'
import { rowJsonObject, rowNullableString, rowNumber, rowString } from './local-tasks-sqlite-row'

const INBOX_EVENT_KINDS = LOCAL_TASK_INBOX_EVENT_KINDS.map((kind) => `'${kind}'`).join(', ')

const ATTENTION_WORDS: Record<string, string> = {
  approval: 'waits for the user to approve',
  question: 'waits for the user to answer',
  blocked: 'is blocked',
  'unread-done': 'finished a round the user has not seen'
}

export type LocalTaskInboxCursor = {
  eventAt: number
  eventRowid: number
  attention: string[]
  proposals: string[]
  /** The last forwarded fact from another library this page covered; 0 for none. */
  factRowid: number
}

export function encodeInboxCursor(cursor: LocalTaskInboxCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeInboxCursor(text: string): LocalTaskInboxCursor | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'))
    if (!value || typeof value !== 'object') {
      return null
    }
    const record: Record<string, unknown> = Object.fromEntries(Object.entries(value))
    const { eventAt, eventRowid, attention, proposals, factRowid } = record
    const strings = (list: unknown): list is string[] =>
      Array.isArray(list) && list.every((entry) => typeof entry === 'string')
    if (
      typeof eventAt !== 'number' ||
      typeof eventRowid !== 'number' ||
      !strings(attention) ||
      !strings(proposals)
    ) {
      return null
    }
    return {
      eventAt,
      eventRowid,
      attention,
      proposals,
      factRowid: typeof factRowid === 'number' ? factRowid : 0
    }
  } catch {
    return null
  }
}

export function parseStoredKeys(text: string | null): string[] {
  if (!text) {
    return []
  }
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

const oneLine = inboxLine

/** What changed on a conversation's watched tasks since its last ack; reading changes nothing. */
export function readLocalTaskInbox(
  db: LocalTasksDatabase,
  conversation: SqliteRow,
  watched: Set<string>,
  attention: LocalTaskProgressSnapshot,
  limit: number,
  forwarded: ForwardedPage,
  remoteWatchCount: number
): LocalTaskInbox {
  const conversationId = rowString(conversation, 'id')
  const tasks = new Map<string, LocalTask | null>()
  const taskOf = (taskId: string): LocalTask | null => {
    if (!tasks.has(taskId)) {
      tasks.set(taskId, readLocalTask(db, taskId))
    }
    return tasks.get(taskId) ?? null
  }
  const after = {
    at: rowNumber(conversation, 'inbox_event_at'),
    rowid: rowNumber(conversation, 'inbox_event_rowid')
  }
  // Why the (time, rowid) pair: a deleted newest row frees its rowid, but not its time.
  const events = db
    .prepare(
      `SELECT e.rowid AS seq, e.task_id, e.kind, e.source, e.body, e.payload, e.created_at
       FROM local_task_events e JOIN local_task_conversation_watches w
         ON w.task_id = e.task_id AND w.conversation_id = ?
       WHERE e.kind IN (${INBOX_EVENT_KINDS})
         AND (e.created_at > ? OR (e.created_at = ? AND e.rowid > ?))
       ORDER BY e.created_at, e.rowid LIMIT ?`
    )
    .all(conversationId, after.at, after.at, after.rowid, limit + 1)
  const shown = events.slice(0, limit)
  const items: LocalTaskInboxItem[] = shown.flatMap(
    (event) => eventItem(db, event, taskOf(rowString(event, 'task_id'))) ?? []
  )
  const last = shown.at(-1)
  const acked = new Set(parseStoredKeys(rowNullableString(conversation, 'acked_attention')))
  const waiting = attention.items.filter((item) => watched.has(item.taskId) && !acked.has(item.key))
  for (const item of waiting) {
    const task = taskOf(item.taskId)
    const said = item.lastMessage ? ` — ${item.lastMessage}` : ''
    items.push({
      kind: 'needs-you',
      at: item.since,
      taskId: item.taskId,
      taskRef: task?.ref ?? null,
      summary: oneLine(
        `${task?.title ?? 'A task'}: ${item.agent ?? 'a session'} ${ATTENTION_WORDS[item.kind] ?? 'waits'}${said}`
      )
    })
  }
  const settled = unreportedLocalTaskProposals(db, conversationId)
  for (const proposal of settled) {
    items.push({
      kind: 'proposal',
      at: proposal.decidedAt ?? proposal.createdAt,
      taskId: null,
      taskRef: null,
      summary: oneLine(describeSettledProposal(proposal))
    })
  }
  items.push(...forwarded.items)
  items.sort((a, b) => a.at - b.at)
  return {
    conversationId,
    items,
    cursor: encodeInboxCursor({
      eventAt: last ? rowNumber(last, 'created_at') : after.at,
      eventRowid: last ? rowNumber(last, 'seq') : after.rowid,
      attention: waiting.map((item) => item.key),
      proposals: settled.map((proposal) => proposal.id),
      factRowid: forwarded.lastRowid
    }),
    more: events.length > limit || forwarded.more,
    watchedTaskCount: watched.size + remoteWatchCount
  }
}

function eventItem(
  db: LocalTasksDatabase,
  event: SqliteRow,
  task: LocalTask | null
): LocalTaskInboxItem | null {
  const project = task ? readLocalTaskProject(db, task.projectId) : null
  const copy = describeLocalTaskInboxEvent(
    {
      kind: rowString(event, 'kind'),
      source: rowString(event, 'source'),
      body: rowNullableString(event, 'body'),
      payload: rowJsonObject(event, 'payload')
    },
    task,
    (statusId) => project?.statuses.find((status) => status.id === statusId)?.category ?? null
  )
  if (!copy) {
    return null
  }
  return {
    kind: copy.kind,
    at: rowNumber(event, 'created_at'),
    taskId: rowString(event, 'task_id'),
    taskRef: task?.ref ?? null,
    summary: copy.summary,
    ...(copy.needsYou ? { needsYou: copy.needsYou } : {})
  }
}

/**
 * Moves a conversation's inbox past what the cursor covered: events, needs-you items still being
 * judged, settled proposals and forwarded facts. Tasks that finished are no longer followed.
 */
export function ackLocalTaskInbox(
  db: LocalTasksDatabase,
  conversation: SqliteRow,
  cursorText: string,
  liveAttention: ReadonlySet<string>,
  now: number
): LocalTaskResult<object> {
  const cursor = decodeInboxCursor(cursorText)
  if (!cursor) {
    return { ok: false, code: 'invalid_argument' }
  }
  const conversationId = rowString(conversation, 'id')
  const at = rowNumber(conversation, 'inbox_event_at')
  const rowid = rowNumber(conversation, 'inbox_event_rowid')
  const forward =
    cursor.eventAt > at || (cursor.eventAt === at && cursor.eventRowid > rowid)
      ? { at: cursor.eventAt, rowid: cursor.eventRowid }
      : { at, rowid }
  // Why prune to live items: a key that left the judgment never comes back the same.
  const stored = parseStoredKeys(rowNullableString(conversation, 'acked_attention'))
  const acked = [...new Set([...stored, ...cursor.attention])].filter((key) =>
    liveAttention.has(key)
  )
  db.prepare(
    `UPDATE local_task_conversations SET inbox_event_at = ?, inbox_event_rowid = ?,
       acked_attention = ?, updated_at = ? WHERE id = ?`
  ).run(forward.at, forward.rowid, JSON.stringify(acked), now, conversationId)
  const report = db.prepare(
    'UPDATE local_task_proposals SET reported_at = ? WHERE id = ? AND conversation_id = ?'
  )
  for (const proposalId of cursor.proposals) {
    report.run(now, proposalId, conversationId)
  }
  // Why only covered tasks: a finished task's later events must still reach the dispatcher.
  db.prepare(
    `DELETE FROM local_task_conversation_watches WHERE conversation_id = ? AND task_id IN (
       SELECT t.id FROM local_tasks t JOIN local_task_statuses s ON s.id = t.status_id
       WHERE s.category IN ('completed', 'canceled') AND NOT EXISTS (
         SELECT 1 FROM local_task_events e WHERE e.task_id = t.id
           AND (e.created_at > ? OR (e.created_at = ? AND e.rowid > ?))))`
  ).run(conversationId, forward.at, forward.at, forward.rowid)
  reportForwardedFacts(db, conversationId, cursor.factRowid, now)
  db.touch('events')
  return { ok: true }
}
