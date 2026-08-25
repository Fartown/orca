import { randomUUID } from 'node:crypto'
import type { IssueRecord } from '../../shared/issues/types'
import { ISSUE_NOTE_MAX_BYTES, ISSUE_TITLE_MAX_BYTES } from '../../shared/issues/constants'
import type { IssueDatabase } from './issue-database'
import { hostPartitionForExecutionHost } from './issue-host-partition'
import {
  bumpIssueHostRevisions,
  ensureIssueHostState,
  getIssueHostRevisions,
  type IssueHostRevisions
} from './issue-host-state'
import { executeIssueMutation } from './issue-mutation-receipt'
import { assertIssueParent } from './issue-hierarchy-validation'
import {
  allocateLocalIssueNumber,
  getIssueRecord,
  listIssueRecords,
  requireIssueRecord
} from './issue-record-queries'
import { boundedIndex } from './issue-sibling-order'
import { IssueRepositoryError } from './issue-repository-error'
import type {
  CreateLocalIssueInput,
  IssueMutationParams,
  TrackExternalIssueInput,
  UpdateIssueInput
} from './issue-repository-types'

export type IssueRecordMutationResult = IssueHostRevisions & { issue: IssueRecord }

export class IssueRecordRepository {
  constructor(private readonly database: IssueDatabase) {}

  get(id: string): IssueRecord | undefined {
    return getIssueRecord(this.database, id)
  }

  list(): IssueRecord[] {
    return listIssueRecords(this.database)
  }

  createLocal(params: IssueMutationParams<CreateLocalIssueInput>): IssueRecordMutationResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'issues.create',
      payload: params.input,
      operation: () => this.insertLocal(params.input)
    })
  }

  trackExternal(params: IssueMutationParams<TrackExternalIssueInput>): IssueRecordMutationResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'issues.create',
      payload: params.input,
      operation: () => this.insertExternal(params.input)
    })
  }

  update(params: IssueMutationParams<UpdateIssueInput>): IssueRecordMutationResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'issues.update',
      payload: params.input,
      operation: () => this.updateRecord(params.input)
    })
  }

  private insertLocal(input: CreateLocalIssueInput): IssueRecordMutationResult {
    const now = Date.now()
    const hostPartitionKey = hostPartitionForExecutionHost(input.executionHostId)
    ensureIssueHostState(this.database, hostPartitionKey, now)
    assertIssueParent({
      database: this.database,
      parentId: input.parentId ?? null,
      hostPartitionKey,
      executionHostId: input.executionHostId
    })
    const siblingOrder = this.prepareSiblingOrder(
      hostPartitionKey,
      input.parentId ?? null,
      input.index,
      now
    )
    const id = randomUUID()
    this.database
      .prepare(
        `INSERT INTO issues (
           id, host_partition_key, execution_host_id, source_kind,
           local_number, local_title, type_label, note, state,
           parent_id, sibling_order, record_revision, created_at, updated_at, archived_at
         ) VALUES (?, ?, ?, 'local', ?, ?, ?, ?, 'active', ?, ?, 0, ?, ?, NULL)`
      )
      .run(
        id,
        hostPartitionKey,
        input.executionHostId,
        allocateLocalIssueNumber(this.database, hostPartitionKey),
        normalizedTitle(input.title),
        input.typeLabel ?? null,
        normalizedNote(input.note),
        input.parentId ?? null,
        siblingOrder,
        now,
        now
      )
    const revisions = bumpIssueHostRevisions(this.database, hostPartitionKey, { tree: true }, now)
    return { issue: requireIssueRecord(this.database, id), ...revisions }
  }

  private insertExternal(input: TrackExternalIssueInput): IssueRecordMutationResult {
    const now = Date.now()
    const hostPartitionKey = hostPartitionForExecutionHost(input.executionHostId)
    ensureIssueHostState(this.database, hostPartitionKey, now)
    assertIssueParent({
      database: this.database,
      parentId: input.parentId ?? null,
      hostPartitionKey,
      executionHostId: input.executionHostId
    })
    const siblingOrder = this.prepareSiblingOrder(
      hostPartitionKey,
      input.parentId ?? null,
      input.index,
      now
    )
    const id = randomUUID()
    this.database
      .prepare(
        `INSERT INTO issues (
           id, host_partition_key, execution_host_id, source_kind,
           source_provider, source_identifier, source_url, source_title,
           local_title, type_label, note, state, parent_id, sibling_order,
           record_revision, created_at, updated_at, archived_at
         ) VALUES (?, ?, ?, 'external', ?, ?, ?, ?, NULL, ?, ?, 'active', ?, ?, 0, ?, ?, NULL)`
      )
      .run(
        id,
        hostPartitionKey,
        input.executionHostId,
        input.provider,
        normalizedIdentifier(input.identifier),
        normalizedUrl(input.url),
        normalizedTitle(input.titleSnapshot),
        input.typeLabel ?? null,
        normalizedNote(input.note),
        input.parentId ?? null,
        siblingOrder,
        now,
        now
      )
    const revisions = bumpIssueHostRevisions(this.database, hostPartitionKey, { tree: true }, now)
    return { issue: requireIssueRecord(this.database, id), ...revisions }
  }

  private updateRecord(input: UpdateIssueInput): IssueRecordMutationResult {
    const current = requireIssueRecord(this.database, input.id)
    if (current.recordRevision !== input.expectedRecordRevision) {
      throw staleIssueRevision(current)
    }
    const assignments: string[] = []
    const bindings: (string | number | null)[] = []
    if (input.title !== undefined) {
      assignments.push(current.source.kind === 'local' ? 'local_title = ?' : 'source_title = ?')
      bindings.push(normalizedTitle(input.title))
    }
    if (input.typeLabel !== undefined) {
      assignments.push('type_label = ?')
      bindings.push(input.typeLabel)
    }
    if (input.note !== undefined) {
      assignments.push('note = ?')
      bindings.push(normalizedNote(input.note))
    }
    if (assignments.length === 0) {
      return { issue: current, ...getIssueHostRevisions(this.database, current.hostPartitionKey) }
    }
    const now = Date.now()
    const update = this.database
      .prepare(
        `UPDATE issues
         SET ${assignments.join(', ')}, record_revision = record_revision + 1, updated_at = ?
         WHERE id = ? AND record_revision = ?`
      )
      .run(...bindings, now, input.id, input.expectedRecordRevision)
    if (update.changes !== 1) {
      throw staleIssueRevision(requireIssueRecord(this.database, input.id))
    }
    const revisions = bumpIssueHostRevisions(
      this.database,
      current.hostPartitionKey,
      { tree: false },
      now
    )
    return { issue: requireIssueRecord(this.database, input.id), ...revisions }
  }

  private prepareSiblingOrder(
    hostPartitionKey: IssueRecord['hostPartitionKey'],
    parentId: string | null,
    requestedIndex: number | undefined,
    now: number
  ): number {
    const count = (
      this.database
        .prepare(
          `SELECT COUNT(*) AS count FROM issues
           WHERE host_partition_key = ? AND parent_id IS ?`
        )
        .get(hostPartitionKey, parentId) as { count: number }
    ).count
    const index = requestedIndex === undefined ? count : boundedIndex(requestedIndex, count)
    if (index < count) {
      this.database
        .prepare(
          `UPDATE issues
           SET sibling_order = sibling_order + 1,
               record_revision = record_revision + 1,
               updated_at = ?
           WHERE host_partition_key = ? AND parent_id IS ? AND sibling_order >= ?`
        )
        .run(now, hostPartitionKey, parentId, index)
    }
    return index
  }
}

function normalizedTitle(value: string): string {
  const title = value.trim()
  if (!title || Buffer.byteLength(title, 'utf8') > ISSUE_TITLE_MAX_BYTES) {
    throw new Error('Issue title is invalid.')
  }
  return title
}

function normalizedIdentifier(value: string): string {
  const identifier = value.trim()
  if (!identifier || identifier.length > 1_024) {
    throw new Error('External Issue identifier is invalid.')
  }
  return identifier
}

function normalizedUrl(value: string): string {
  const url = new URL(value).toString()
  if (url.length > 32_768) {
    throw new Error('External Issue URL is too long.')
  }
  return url
}

function normalizedNote(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }
  if (Buffer.byteLength(value, 'utf8') > ISSUE_NOTE_MAX_BYTES) {
    throw new Error('Issue note is too long.')
  }
  return value
}

function staleIssueRevision(current: IssueRecord): IssueRepositoryError {
  return new IssueRepositoryError(
    'issue_record_revision_stale',
    `Issue ${current.id} changed before this mutation.`,
    { current }
  )
}
