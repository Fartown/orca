import { randomUUID } from 'node:crypto'
import type { ConversationRecord } from '../../shared/issues/types'
import { ISSUE_TITLE_MAX_BYTES } from '../../shared/issues/constants'
import { conversationRecordFromRow, type ConversationRow } from './conversation-record-codec'
import type { IssueDatabase } from './issue-database'
import { hostPartitionForExecutionHost } from './issue-host-partition'
import {
  bumpIssueHostRevisions,
  ensureIssueHostState,
  getIssueHostRevisions,
  type IssueHostRevisions
} from './issue-host-state'
import { executeIssueMutation } from './issue-mutation-receipt'
import { IssueRepositoryError } from './issue-repository-error'
import type {
  BindConversationIssueInput,
  CreateConversationInput,
  IssueMutationParams,
  UpdateConversationTitleInput
} from './issue-repository-types'

export type ConversationRecordMutationResult = IssueHostRevisions & {
  conversation: ConversationRecord
}

export class ConversationRecordRepository {
  constructor(private readonly database: IssueDatabase) {}

  get(id: string): ConversationRecord | undefined {
    const row = this.database.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | ConversationRow
      | undefined
    return row ? conversationRecordFromRow(row) : undefined
  }

  list(): ConversationRecord[] {
    return (
      this.database
        .prepare('SELECT * FROM conversations ORDER BY host_partition_key, created_at, id')
        .all() as ConversationRow[]
    ).map(conversationRecordFromRow)
  }

  create(params: IssueMutationParams<CreateConversationInput>): ConversationRecordMutationResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'conversations.create',
      payload: params.input,
      operation: () => this.insert(params.input)
    })
  }

  createWithinTransaction(input: CreateConversationInput): ConversationRecord {
    return this.insert(input).conversation
  }

  recordLaunchFailureWithinTransaction(
    id: string,
    expectedRecordRevision: number,
    message: string,
    failedAt = Date.now()
  ): ConversationRecord {
    const current = this.require(id)
    this.assertRevision(current, expectedRecordRevision)
    const boundedMessage = message.trim().slice(0, 2_048)
    if (!boundedMessage) {
      throw new Error('Launch failure message is empty.')
    }
    const update = this.database
      .prepare(
        `UPDATE conversations
         SET launch_failure_message = ?, launch_failed_at = ?,
             record_revision = record_revision + 1, updated_at = ?
         WHERE id = ? AND record_revision = ?`
      )
      .run(boundedMessage, failedAt, failedAt, id, current.recordRevision)
    if (update.changes !== 1) {
      throw staleConversationRevision(this.require(id))
    }
    bumpIssueHostRevisions(this.database, current.hostPartitionKey, { tree: false }, failedAt)
    return this.require(id)
  }

  prepareRetryWithinTransaction(input: {
    id: string
    expectedRecordRevision: number
    now?: number
  }): ConversationRecord {
    const current = this.require(input.id)
    this.assertRevision(current, input.expectedRecordRevision)
    const now = input.now ?? Date.now()
    const update = this.database
      .prepare(
        `UPDATE conversations
         SET launch_failure_message = NULL, launch_failed_at = NULL,
             record_revision = record_revision + 1, updated_at = ?
         WHERE id = ? AND record_revision = ?`
      )
      .run(now, input.id, input.expectedRecordRevision)
    if (update.changes !== 1) {
      throw staleConversationRevision(this.require(input.id))
    }
    bumpIssueHostRevisions(this.database, current.hostPartitionKey, { tree: false }, now)
    return this.require(input.id)
  }

  deleteWithinTransaction(id: string, expectedRecordRevision: number): ConversationRecord {
    const current = this.require(id)
    this.assertRevision(current, expectedRecordRevision)
    const deletion = this.database
      .prepare('DELETE FROM conversations WHERE id = ? AND record_revision = ?')
      .run(id, expectedRecordRevision)
    if (deletion.changes !== 1) {
      throw staleConversationRevision(this.require(id))
    }
    bumpIssueHostRevisions(this.database, current.hostPartitionKey, { tree: false }, Date.now())
    return current
  }

  updateTitle(
    params: IssueMutationParams<UpdateConversationTitleInput>
  ): ConversationRecordMutationResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'conversations.update',
      payload: params.input,
      operation: () => this.updateTitleRecord(params.input)
    })
  }

  bindIssue(
    params: IssueMutationParams<BindConversationIssueInput>
  ): ConversationRecordMutationResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'conversations.bindIssue',
      payload: params.input,
      operation: () => this.bindIssueRecord(params.input)
    })
  }

  private insert(input: CreateConversationInput): ConversationRecordMutationResult {
    const now = Date.now()
    const id = randomUUID()
    const hostPartitionKey = hostPartitionForExecutionHost(input.executionHostId)
    ensureIssueHostState(this.database, hostPartitionKey, now)
    const workspace = workspaceColumns(input)
    this.database
      .prepare(
        `INSERT INTO conversations (
           id, host_partition_key, execution_host_id,
           workspace_kind, workspace_id, workspace_name_snapshot, workspace_path_snapshot,
           agent, title, issue_id, record_revision,
           launch_failure_message, launch_failed_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)`
      )
      .run(
        id,
        hostPartitionKey,
        input.executionHostId,
        workspace.kind,
        workspace.id,
        input.workspaceSnapshot.name,
        input.workspaceSnapshot.path,
        input.agent,
        normalizedConversationTitle(input.title ?? null),
        input.issueId ?? null,
        now,
        now
      )
    const revisions = bumpIssueHostRevisions(this.database, hostPartitionKey, { tree: false }, now)
    return { conversation: this.require(id), ...revisions }
  }

  private updateTitleRecord(input: UpdateConversationTitleInput): ConversationRecordMutationResult {
    const current = this.require(input.id)
    this.assertRevision(current, input.expectedRecordRevision)
    const title = normalizedConversationTitle(input.title)
    if (title === current.title) {
      return {
        conversation: current,
        ...getIssueHostRevisions(this.database, current.hostPartitionKey)
      }
    }
    const now = Date.now()
    const update = this.database
      .prepare(
        `UPDATE conversations
         SET title = ?, record_revision = record_revision + 1, updated_at = ?
         WHERE id = ? AND record_revision = ?`
      )
      .run(title, now, input.id, input.expectedRecordRevision)
    if (update.changes !== 1) {
      throw staleConversationRevision(this.require(input.id))
    }
    const revisions = bumpIssueHostRevisions(
      this.database,
      current.hostPartitionKey,
      { tree: false },
      now
    )
    return { conversation: this.require(input.id), ...revisions }
  }

  private bindIssueRecord(input: BindConversationIssueInput): ConversationRecordMutationResult {
    const current = this.require(input.id)
    this.assertRevision(current, input.expectedRecordRevision)
    if (input.issueId === current.issueId) {
      return {
        conversation: current,
        ...getIssueHostRevisions(this.database, current.hostPartitionKey)
      }
    }
    const now = Date.now()
    const update = this.database
      .prepare(
        `UPDATE conversations
         SET issue_id = ?, record_revision = record_revision + 1, updated_at = ?
         WHERE id = ? AND record_revision = ?`
      )
      .run(input.issueId, now, input.id, input.expectedRecordRevision)
    if (update.changes !== 1) {
      throw staleConversationRevision(this.require(input.id))
    }
    const revisions = bumpIssueHostRevisions(
      this.database,
      current.hostPartitionKey,
      { tree: false },
      now
    )
    return { conversation: this.require(input.id), ...revisions }
  }

  private require(id: string): ConversationRecord {
    const conversation = this.get(id)
    if (!conversation) {
      throw new IssueRepositoryError('conversation_not_found', `Conversation ${id} was not found.`)
    }
    return conversation
  }

  private assertRevision(conversation: ConversationRecord, expected: number): void {
    if (conversation.recordRevision !== expected) {
      throw staleConversationRevision(conversation)
    }
  }
}

function workspaceColumns(input: CreateConversationInput): {
  kind: 'worktree' | 'folder'
  id: string
} {
  return input.workspaceRef.type === 'worktree'
    ? { kind: 'worktree', id: input.workspaceRef.worktreeId }
    : { kind: 'folder', id: input.workspaceRef.folderWorkspaceId }
}

function normalizedConversationTitle(value: string | null): string | null {
  if (value === null) {
    return null
  }
  const title = value.trim()
  if (!title || Buffer.byteLength(title, 'utf8') > ISSUE_TITLE_MAX_BYTES) {
    throw new Error('Conversation title is invalid.')
  }
  return title
}

function staleConversationRevision(current: ConversationRecord): IssueRepositoryError {
  return new IssueRepositoryError(
    'conversation_record_revision_stale',
    `Conversation ${current.id} changed before this mutation.`,
    { current }
  )
}
