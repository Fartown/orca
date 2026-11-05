import type {
  LocalTaskInbox,
  LocalTaskInboxItem
} from '../../shared/local-tasks/local-task-dispatcher-types'
import { localTaskEventText } from '../../shared/local-tasks/local-task-event-payload'
import type { LocalTaskProgressSnapshot } from '../../shared/local-tasks/local-task-link-types'
import { isLocalTaskProgressPayload } from '../../shared/local-tasks/local-task-progress'
import type { LocalTask } from '../../shared/local-tasks/local-task-types'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
import { readLocalTaskProject } from './local-task-project-store'
import { describeSettledProposal, unreportedLocalTaskProposals } from './local-task-proposal-rows'
import { readLocalTask } from './local-task-store'
import { rowJsonObject, rowNullableString, rowNumber, rowString } from './local-tasks-sqlite-row'

const SUMMARY_MAX = 240
// Why these kinds: what a dispatcher reports on; titles, labels and links are bookkeeping.
const INBOX_EVENT_KINDS = `'comment', 'status', 'session-linked', 'session-unlinked'`
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
    const { eventAt, eventRowid, attention, proposals } = value as Record<string, unknown>
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
    return { eventAt, eventRowid, attention, proposals }
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

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > SUMMARY_MAX ? `${flat.slice(0, SUMMARY_MAX - 1)}…` : flat
}

/** What changed on a conversation's watched tasks since its last ack; reading changes nothing. */
export function readLocalTaskInbox(
  db: LocalTasksDatabase,
  conversation: SqliteRow,
  watched: Set<string>,
  attention: LocalTaskProgressSnapshot,
  limit: number
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
  items.sort((a, b) => a.at - b.at)
  return {
    conversationId,
    items,
    cursor: encodeInboxCursor({
      eventAt: last ? rowNumber(last, 'created_at') : after.at,
      eventRowid: last ? rowNumber(last, 'seq') : after.rowid,
      attention: waiting.map((item) => item.key),
      proposals: settled.map((proposal) => proposal.id)
    }),
    more: events.length > limit,
    watchedTaskCount: watched.size
  }
}

function eventItem(
  db: LocalTasksDatabase,
  event: SqliteRow,
  task: LocalTask | null
): LocalTaskInboxItem | null {
  const kind = rowString(event, 'kind')
  const payload = rowJsonObject(event, 'payload')
  const body = rowNullableString(event, 'body') ?? ''
  const base = {
    at: rowNumber(event, 'created_at'),
    taskId: rowString(event, 'task_id'),
    taskRef: task?.ref ?? null
  }
  const title = task?.title ?? 'A task'
  if (kind === 'comment') {
    if (isLocalTaskProgressPayload(payload)) {
      const needsYou = localTaskEventText(payload, 'needsYou')
      return {
        ...base,
        kind: 'progress',
        summary: oneLine(`${title}: ${body}`),
        ...(needsYou ? { needsYou } : {})
      }
    }
    // Why: the dispatcher's own notes and agents' plain comments come through the CLI.
    return rowString(event, 'source') === 'cli'
      ? null
      : { ...base, kind: 'comment', summary: oneLine(`${title}: ${body}`) }
  }
  if (kind === 'status') {
    const toName = localTaskEventText(payload, 'toName') ?? 'another status'
    const project = task ? readLocalTaskProject(db, task.projectId) : null
    const category = project?.statuses.find(
      (status) => status.id === localTaskEventText(payload, 'to')
    )?.category
    const review = category === 'review' ? ' — waiting for the user to review' : ''
    return { ...base, kind: 'status', summary: oneLine(`${title} moved to ${toName}${review}`) }
  }
  const change = kind === 'session-linked' ? 'got a new session' : 'lost a session'
  return { ...base, kind: 'session', summary: oneLine(`${title} ${change}`) }
}
