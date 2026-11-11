import { randomUUID } from 'node:crypto'
import type {
  LocalTasksProposalsCreateInput,
  LocalTasksProposalsDecideInput,
  LocalTasksProposalsRecordResultsInput
} from '../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type {
  LocalTaskConversation,
  LocalTaskForwardedFact,
  LocalTaskInbox,
  LocalTaskProposal,
  LocalTaskProposalStatus,
  LocalTaskWatch
} from '../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskProgressSnapshot } from '../../shared/local-tasks/local-task-link-types'
import type {
  LocalTaskEventSource,
  LocalTaskFailure,
  LocalTaskResult
} from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import { ackLocalTaskInbox, readLocalTaskInbox } from './local-task-dispatcher-inbox'
import { insertLocalTaskProposal, readLocalTaskProposal } from './local-task-proposal-rows'
import { readLocalTask } from './local-task-store'
import {
  isOtherLibraryTaskId,
  pendingWatchRef
} from '../../shared/local-tasks/local-task-inbox-copy'
import { recordLocalTaskProposalResults } from './local-task-proposal-results'
import { LocalTaskProposalOwnership } from './local-task-proposal-ownership'
import {
  addDispatcherRemoteWatch,
  addLocalWatch,
  addRemoteWatch,
  listDispatcherWatches,
  listLocalWatchTaskIds,
  listRemoteWatches,
  readForwardedFacts,
  recordForwardedFacts,
  removeDispatcherWatch
} from './local-task-dispatcher-remote'
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
  readonly ownership: LocalTaskProposalOwnership

  constructor(
    private readonly db: LocalTasksDatabase,
    private readonly attention: () => LocalTaskProgressSnapshot,
    /** Whether an acknowledged key may be raised again; ack keeps only those. */
    private readonly attentionKeyMayReturn: () => (key: string) => boolean
  ) {
    this.ownership = new LocalTaskProposalOwnership(db)
  }

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
    return this.ownership.list(filter)
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
    // Why sorted and unique: a repeated index would run the same item twice.
    const kept = input.keepItemIndexes
      ? [...new Set(input.keepItemIndexes)].sort((a, b) => a - b)
      : undefined
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

  /**
   * A desktop takes a confirmed proposal to run it. Only one claim succeeds, so a second window,
   * a stale card or a reload never runs the same items again.
   */
  claim(proposalId: string, connectionId: string, now: number): ProposalResult {
    const proposal = readLocalTaskProposal(this.db, proposalId)
    if (!proposal) {
      return { ok: false, code: 'not_found' }
    }
    if (proposal.status !== 'confirmed') {
      return { ok: false, code: 'stale', detail: proposal.status }
    }
    this.db
      .prepare(`UPDATE local_task_proposals SET status = 'executing', decided_at = ? WHERE id = ?`)
      .run(proposal.decidedAt ?? now, proposal.id)
    this.ownership.claim(proposal.id, connectionId)
    this.db.touch('events')
    return this.proposalResult(proposal.id)
  }

  /**
   * The claiming desktop's report; every task an item created becomes watched, even when its
   * session did not start. An interrupted run is closed with whatever results are known.
   */
  recordResults(
    input: LocalTasksProposalsRecordResultsInput,
    connectionId: string,
    now: number
  ): ProposalResult {
    const proposal = readLocalTaskProposal(this.db, input.proposalId)
    if (!proposal) {
      return { ok: false, code: 'not_found' }
    }
    if (proposal.status !== 'executing') {
      return { ok: false, code: 'stale', detail: proposal.status }
    }
    const recorded = recordLocalTaskProposalResults(
      this.db,
      proposal,
      input,
      this.ownership.ownerOf(proposal.id),
      connectionId,
      (taskId) => {
        if (isOtherLibraryTaskId(taskId)) {
          addRemoteWatch(this.db, proposal.conversationId, taskId, 'proposal', now)
        } else if (readLocalTask(this.db, taskId)) {
          addLocalWatch(this.db, proposal.conversationId, taskId, 'proposal', now)
        }
      }
    )
    if (!recorded.ok) {
      return recorded
    }
    if (recorded.finalized) {
      this.ownership.release(proposal.id)
    }
    return this.proposalResult(proposal.id)
  }

  /** `replacesRef`: the pending ref a desktop window resolved to `taskId`; only its row goes. */
  watch(
    paneKey: string,
    taskId: string,
    now: number,
    replacesRef?: string
  ): LocalTaskResult<object> {
    const conversation = this.conversationFor(paneKey)
    if (!conversation) {
      return NOT_DISPATCHER
    }
    // Why no check for another library's task, or a ref a desktop window finds in one: this host
    // cannot read that library.
    if (isOtherLibraryTaskId(taskId) || pendingWatchRef(taskId) !== null) {
      addDispatcherRemoteWatch(this.db, conversation.id, taskId, now, replacesRef)
      this.db.touch('events')
      return { ok: true }
    }
    if (!readLocalTask(this.db, taskId)) {
      return { ok: false, code: 'not_found' }
    }
    addLocalWatch(this.db, conversation.id, taskId, 'dispatcher', now)
    return { ok: true }
  }

  unwatch(paneKey: string, taskId: string): LocalTaskResult<object> {
    const conversation = this.conversationFor(paneKey)
    if (!conversation) {
      return NOT_DISPATCHER
    }
    if (!removeDispatcherWatch(this.db, conversation.id, taskId)) {
      return { ok: false, code: 'not_found', detail: 'watch' }
    }
    this.db.touch('events')
    return { ok: true }
  }

  /** Facts a desktop window read in other libraries for this dispatcher (REQ-031, D-008). */
  recordFacts(paneKey: string, facts: readonly LocalTaskForwardedFact[]): LocalTaskResult<object> {
    const conversation = this.conversationFor(paneKey)
    if (!conversation) {
      return NOT_DISPATCHER
    }
    if (recordForwardedFacts(this.db, conversation.id, facts) > 0) {
      this.db.touch('events')
    }
    return { ok: true }
  }

  inbox(paneKey: string, limit = INBOX_LIMIT_DEFAULT): LocalTaskResult<{ inbox: LocalTaskInbox }> {
    const row = this.db
      .prepare('SELECT * FROM local_task_conversations WHERE pane_key = ?')
      .get(paneKey)
    if (!row) {
      return NOT_DISPATCHER
    }
    const conversationId = rowString(row, 'id')
    const watched = new Set(listLocalWatchTaskIds(this.db, conversationId))
    return {
      ok: true,
      inbox: readLocalTaskInbox(
        this.db,
        row,
        watched,
        this.attention(),
        limit,
        readForwardedFacts(this.db, conversationId, limit),
        listRemoteWatches(this.db, conversationId).length
      )
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
    return ackLocalTaskInbox(this.db, row, cursorText, this.attentionKeyMayReturn(), now)
  }

  /** What the dispatcher follows, newest first, for the person's ledger (REQ-031). */
  watches(paneKey: string): LocalTaskResult<{ watches: LocalTaskWatch[] }> {
    const conversation = this.conversationFor(paneKey)
    return conversation
      ? { ok: true, watches: listDispatcherWatches(this.db, conversation.id) }
      : NOT_DISPATCHER
  }

  proposalResult(proposalId: string): ProposalResult {
    return this.ownership.result(proposalId)
  }
}
