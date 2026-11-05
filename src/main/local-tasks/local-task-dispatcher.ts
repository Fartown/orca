import { randomUUID } from 'node:crypto'
import type {
  LocalTasksProposalsCreateInput,
  LocalTasksProposalsDecideInput,
  LocalTasksProposalsRecordResultsInput
} from '../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type {
  LocalTaskConversation,
  LocalTaskInbox,
  LocalTaskProposal,
  LocalTaskProposalStatus
} from '../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskProgressSnapshot } from '../../shared/local-tasks/local-task-link-types'
import type {
  LocalTaskEventSource,
  LocalTaskFailure,
  LocalTaskResult
} from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import {
  decodeInboxCursor,
  parseStoredKeys,
  readLocalTaskInbox
} from './local-task-dispatcher-inbox'
import {
  insertLocalTaskProposal,
  listLocalTaskProposals,
  readLocalTaskProposal
} from './local-task-proposal-rows'
import { readLocalTask } from './local-task-store'
import {
  rowNullableNumber,
  rowNullableString,
  rowNumber,
  rowString
} from './local-tasks-sqlite-row'

const NOT_DISPATCHER: LocalTaskFailure = { ok: false, code: 'not_found', detail: 'dispatcher' }
const PERSON_ONLY: LocalTaskFailure = { ok: false, code: 'desktop_only' }
const INBOX_LIMIT_DEFAULT = 30

type ProposalResult = LocalTaskResult<{ proposal: LocalTaskProposal }>

/**
 * The dispatcher's conversation, proposals, watched tasks and inbox (REQ-030, REQ-031). Proposals
 * only record intent and decisions; a desktop client executes them and reports the results.
 */
export class LocalTaskDispatcher {
  constructor(
    private readonly db: LocalTasksDatabase,
    private readonly attention: () => LocalTaskProgressSnapshot
  ) {}

  register(
    paneKey: string,
    agent: string | undefined,
    now: number,
    previousPaneKey?: string
  ): LocalTaskResult<{ conversation: LocalTaskConversation }> {
    const existing = this.conversationFor(paneKey)
    const previous = !existing && previousPaneKey ? this.conversationFor(previousPaneKey) : null
    if (previous) {
      this.db
        .prepare(
          'UPDATE local_task_conversations SET pane_key = ?, agent = ?, updated_at = ? WHERE id = ?'
        )
        .run(paneKey, agent ?? previous.agent, now, previous.id)
    } else if (existing) {
      this.db
        .prepare('UPDATE local_task_conversations SET agent = ?, updated_at = ? WHERE id = ?')
        .run(agent ?? existing.agent, now, existing.id)
    } else {
      // Why start the inbox now: a new dispatcher hears what happens from here, not the history.
      const lastRow = this.db.prepare('SELECT MAX(rowid) AS last FROM local_task_events').get()
      this.db
        .prepare(
          `INSERT INTO local_task_conversations (id, pane_key, agent, inbox_event_at,
             inbox_event_rowid, acked_attention, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`
        )
        .run(
          randomUUID(),
          paneKey,
          agent ?? null,
          now,
          lastRow ? (rowNullableNumber(lastRow, 'last') ?? 0) : 0,
          now,
          now
        )
    }
    this.db.touch('events')
    const conversation = this.conversationFor(paneKey)
    return conversation ? { ok: true, conversation } : { ok: false, code: 'not_found' }
  }

  conversationFor(paneKey: string): LocalTaskConversation | null {
    const row = this.db
      .prepare(
        'SELECT id, pane_key, agent, created_at, updated_at FROM local_task_conversations WHERE pane_key = ?'
      )
      .get(paneKey)
    return row
      ? {
          id: rowString(row, 'id'),
          paneKey: rowString(row, 'pane_key'),
          agent: rowNullableString(row, 'agent'),
          createdAt: rowNumber(row, 'created_at'),
          updatedAt: rowNumber(row, 'updated_at')
        }
      : null
  }

  createProposal(input: LocalTasksProposalsCreateInput, now: number): ProposalResult {
    const conversation = this.conversationFor(input.paneKey)
    if (!conversation) {
      return NOT_DISPATCHER
    }
    const id = insertLocalTaskProposal(this.db, conversation.id, input.summary, input.items, now)
    this.db.touch('events')
    return this.proposalResult(id)
  }

  listProposals(filter: { conversationId?: string; status?: LocalTaskProposalStatus }) {
    return { proposals: listLocalTaskProposals(this.db, filter) }
  }

  /** A person's decision; the CLI (an agent) never decides its own proposal. */
  decide(
    input: LocalTasksProposalsDecideInput,
    source: LocalTaskEventSource,
    now: number
  ): ProposalResult {
    if (source === 'cli' || source === 'rule') {
      return PERSON_ONLY
    }
    const proposal = readLocalTaskProposal(this.db, input.proposalId)
    if (!proposal) {
      return { ok: false, code: 'not_found' }
    }
    if (proposal.status !== 'pending') {
      return { ok: false, code: 'stale', detail: proposal.status }
    }
    const kept = input.keepItemIndexes
    if (kept && kept.some((index) => index >= proposal.items.length)) {
      return { ok: false, code: 'invalid_argument' }
    }
    this.db
      .prepare(
        `UPDATE local_task_proposals SET status = ?, kept_items = ?, decided_at = ?,
           decided_source = ? WHERE id = ?`
      )
      .run(input.decision, kept ? JSON.stringify(kept) : null, now, source, proposal.id)
    this.db.touch('events')
    return this.proposalResult(proposal.id)
  }

  /** The executing desktop's report; every task an item started or touched becomes watched. */
  recordResults(input: LocalTasksProposalsRecordResultsInput, now: number): ProposalResult {
    const proposal = readLocalTaskProposal(this.db, input.proposalId)
    if (!proposal) {
      return { ok: false, code: 'not_found' }
    }
    if (proposal.status !== 'confirmed') {
      return { ok: false, code: 'stale', detail: proposal.status }
    }
    this.db
      .prepare(`UPDATE local_task_proposals SET status = 'executed', results = ? WHERE id = ?`)
      .run(JSON.stringify(input.results), proposal.id)
    for (const result of input.results) {
      if (result.ok && result.taskId && readLocalTask(this.db, result.taskId)) {
        this.addWatch(proposal.conversationId, result.taskId, 'proposal', now)
      }
    }
    this.db.touch('events')
    return this.proposalResult(proposal.id)
  }

  watch(paneKey: string, taskId: string, now: number): LocalTaskResult<object> {
    const conversation = this.conversationFor(paneKey)
    if (!conversation) {
      return NOT_DISPATCHER
    }
    if (!readLocalTask(this.db, taskId)) {
      return { ok: false, code: 'not_found' }
    }
    this.addWatch(conversation.id, taskId, 'dispatcher', now)
    return { ok: true }
  }

  unwatch(paneKey: string, taskId: string): LocalTaskResult<object> {
    const conversation = this.conversationFor(paneKey)
    if (!conversation) {
      return NOT_DISPATCHER
    }
    this.db
      .prepare(
        'DELETE FROM local_task_conversation_watches WHERE conversation_id = ? AND task_id = ?'
      )
      .run(conversation.id, taskId)
    this.db.touch('events')
    return { ok: true }
  }

  inbox(paneKey: string, limit = INBOX_LIMIT_DEFAULT): LocalTaskResult<{ inbox: LocalTaskInbox }> {
    const row = this.db
      .prepare('SELECT * FROM local_task_conversations WHERE pane_key = ?')
      .get(paneKey)
    if (!row) {
      return NOT_DISPATCHER
    }
    const watched = new Set(this.watchedTaskIds(rowString(row, 'id')))
    return {
      ok: true,
      inbox: readLocalTaskInbox(this.db, row, watched, this.attention(), limit)
    }
  }

  /** Moves the inbox past what the cursor covered; finished tasks stop being watched. */
  ack(paneKey: string, cursorText: string, now: number): LocalTaskResult<object> {
    const row = this.db
      .prepare('SELECT * FROM local_task_conversations WHERE pane_key = ?')
      .get(paneKey)
    if (!row) {
      return NOT_DISPATCHER
    }
    const cursor = decodeInboxCursor(cursorText)
    if (!cursor) {
      return { ok: false, code: 'invalid_argument' }
    }
    const conversationId = rowString(row, 'id')
    const at = rowNumber(row, 'inbox_event_at')
    const rowid = rowNumber(row, 'inbox_event_rowid')
    const forward =
      cursor.eventAt > at || (cursor.eventAt === at && cursor.eventRowid > rowid)
        ? { at: cursor.eventAt, rowid: cursor.eventRowid }
        : { at, rowid }
    // Why prune to live items: a key that left the judgment never comes back the same.
    const live = new Set(this.attention().items.map((item) => item.key))
    const stored = parseStoredKeys(rowNullableString(row, 'acked_attention'))
    const acked = [...new Set([...stored, ...cursor.attention])].filter((key) => live.has(key))
    this.db
      .prepare(
        `UPDATE local_task_conversations SET inbox_event_at = ?, inbox_event_rowid = ?,
           acked_attention = ?, updated_at = ? WHERE id = ?`
      )
      .run(forward.at, forward.rowid, JSON.stringify(acked), now, conversationId)
    const report = this.db.prepare(
      'UPDATE local_task_proposals SET reported_at = ? WHERE id = ? AND conversation_id = ?'
    )
    for (const proposalId of cursor.proposals) {
      report.run(now, proposalId, conversationId)
    }
    this.db
      .prepare(
        `DELETE FROM local_task_conversation_watches WHERE conversation_id = ? AND task_id IN (
           SELECT t.id FROM local_tasks t JOIN local_task_statuses s ON s.id = t.status_id
           WHERE s.category IN ('completed', 'canceled'))`
      )
      .run(conversationId)
    this.db.touch('events')
    return { ok: true }
  }

  private watchedTaskIds(conversationId: string): string[] {
    return this.db
      .prepare('SELECT task_id FROM local_task_conversation_watches WHERE conversation_id = ?')
      .all(conversationId)
      .map((row) => rowString(row, 'task_id'))
  }

  private addWatch(conversationId: string, taskId: string, addedBy: string, now: number): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO local_task_conversation_watches
           (conversation_id, task_id, added_at, added_by) VALUES (?, ?, ?, ?)`
      )
      .run(conversationId, taskId, now, addedBy)
    this.db.touch('events')
  }

  private proposalResult(proposalId: string): ProposalResult {
    const proposal = readLocalTaskProposal(this.db, proposalId)
    return proposal ? { ok: true, proposal } : { ok: false, code: 'not_found' }
  }
}
