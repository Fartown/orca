import { randomUUID } from 'node:crypto'
import {
  LocalTaskProposalItemSchema,
  type LocalTaskProposalItem
} from '../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type {
  LocalTaskProposal,
  LocalTaskProposalItemResult,
  LocalTaskProposalStatus
} from '../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskEventSource } from '../../shared/local-tasks/local-task-types'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
import {
  rowNullableNumber,
  rowNullableString,
  rowNumber,
  rowString
} from './local-tasks-sqlite-row'

const STATUSES: readonly LocalTaskProposalStatus[] = [
  'pending',
  'confirmed',
  'dismissed',
  'executed'
]
const SOURCES: readonly LocalTaskEventSource[] = ['desktop', 'mobile', 'cli', 'rule']

export function insertLocalTaskProposal(
  db: LocalTasksDatabase,
  conversationId: string,
  summary: string | undefined,
  items: LocalTaskProposalItem[],
  now: number
): string {
  const proposalId = randomUUID()
  db.prepare(
    `INSERT INTO local_task_proposals (id, conversation_id, summary, items, status, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?)`
  ).run(proposalId, conversationId, summary ?? null, JSON.stringify(items), now)
  return proposalId
}

export function readLocalTaskProposal(
  db: LocalTasksDatabase,
  proposalId: string
): LocalTaskProposal | null {
  const row = db.prepare('SELECT * FROM local_task_proposals WHERE id = ?').get(proposalId)
  return row ? toLocalTaskProposal(row) : null
}

export function listLocalTaskProposals(
  db: LocalTasksDatabase,
  filter: { conversationId?: string; status?: LocalTaskProposalStatus }
): LocalTaskProposal[] {
  const clauses: string[] = []
  const values: string[] = []
  if (filter.conversationId) {
    clauses.push('conversation_id = ?')
    values.push(filter.conversationId)
  }
  if (filter.status) {
    clauses.push('status = ?')
    values.push(filter.status)
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  return db
    .prepare(`SELECT * FROM local_task_proposals ${where} ORDER BY created_at DESC LIMIT 200`)
    .all(...values)
    .flatMap((row) => toLocalTaskProposal(row) ?? [])
}

/** Settled proposals the dispatcher has not been told about yet. */
export function unreportedLocalTaskProposals(
  db: LocalTasksDatabase,
  conversationId: string
): LocalTaskProposal[] {
  return db
    .prepare(
      `SELECT * FROM local_task_proposals WHERE conversation_id = ? AND reported_at IS NULL
         AND status IN ('dismissed', 'executed') ORDER BY decided_at`
    )
    .all(conversationId)
    .flatMap((row) => toLocalTaskProposal(row) ?? [])
}

function jsonValue(text: string | null): unknown {
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function toLocalTaskProposal(row: SqliteRow): LocalTaskProposal | null {
  const status = STATUSES.find((candidate) => candidate === rowString(row, 'status'))
  const items = LocalTaskProposalItemSchema.array().safeParse(jsonValue(rowString(row, 'items')))
  // Why skip rather than throw: a row a newer Orca wrote must not break the whole list.
  if (!status || !items.success) {
    return null
  }
  const kept = jsonValue(rowNullableString(row, 'kept_items'))
  const results = jsonValue(rowNullableString(row, 'results'))
  const source = rowNullableString(row, 'decided_source')
  return {
    id: rowString(row, 'id'),
    conversationId: rowString(row, 'conversation_id'),
    summary: rowNullableString(row, 'summary'),
    items: items.data,
    status,
    keptItemIndexes: Array.isArray(kept)
      ? kept.filter((index): index is number => typeof index === 'number')
      : null,
    results: Array.isArray(results) ? (results as LocalTaskProposalItemResult[]) : null,
    createdAt: rowNumber(row, 'created_at'),
    decidedAt: rowNullableNumber(row, 'decided_at'),
    decidedSource: SOURCES.find((candidate) => candidate === source) ?? null
  }
}

/** One line telling the dispatcher how the person settled its proposal. */
export function describeSettledProposal(proposal: LocalTaskProposal): string {
  const what = proposal.summary ?? `${proposal.items.length} item(s)`
  if (proposal.status === 'dismissed') {
    return `The user dismissed your proposal: ${what}`
  }
  const results = proposal.results ?? []
  const failed = results.filter((result) => !result.ok)
  const done = results.length - failed.length
  const failures = failed
    .map((result) => `item ${result.index + 1}: ${result.detail ?? 'failed'}`)
    .join('; ')
  return `The user confirmed your proposal (${what}); ${done} done${
    failed.length ? `, ${failed.length} failed — ${failures}` : ''
  }`
}
