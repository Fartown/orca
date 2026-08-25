import type { IssueRecord } from '../../shared/issues/types'

export type IssueRow = {
  id: string
  host_partition_key: IssueRecord['hostPartitionKey']
  execution_host_id: IssueRecord['executionHostId']
  source_kind: 'local' | 'external'
  source_provider: string | null
  source_identifier: string | null
  source_url: string | null
  source_title: string | null
  local_number: number | null
  local_title: string | null
  type_label: string | null
  note: string | null
  state: IssueRecord['state']
  parent_id: string | null
  sibling_order: number
  record_revision: number
  created_at: number
  updated_at: number
  archived_at: number | null
}

export function issueRecordFromRow(row: IssueRow): IssueRecord {
  const source: IssueRecord['source'] =
    row.source_kind === 'local'
      ? { kind: 'local', number: requireValue(row.local_number, 'local issue number') }
      : {
          kind: 'external',
          provider: requireValue(row.source_provider, 'external provider') as Extract<
            IssueRecord['source'],
            { kind: 'external' }
          >['provider'],
          identifier: requireValue(row.source_identifier, 'external identifier'),
          url: requireValue(row.source_url, 'external URL'),
          titleSnapshot: requireValue(row.source_title, 'external title')
        }
  return {
    id: row.id,
    hostPartitionKey: row.host_partition_key,
    executionHostId: row.execution_host_id,
    source,
    localTitle: row.local_title,
    typeLabel: row.type_label,
    note: row.note,
    state: row.state,
    parentId: row.parent_id,
    siblingOrder: row.sibling_order,
    recordRevision: row.record_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at
  }
}

function requireValue<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Issue row is missing ${label}.`)
  }
  return value
}
