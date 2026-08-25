import type { AuthorityExecutionHostId, IssueRecord } from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { issueRecordFromRow, type IssueRow } from './issue-record-codec'
import { IssueRepositoryError } from './issue-repository-error'

export function getIssueRecord(database: IssueDatabase, id: string): IssueRecord | undefined {
  const row = database.prepare('SELECT * FROM issues WHERE id = ?').get(id) as IssueRow | undefined
  return row ? issueRecordFromRow(row) : undefined
}

export function requireIssueRecord(database: IssueDatabase, id: string): IssueRecord {
  const issue = getIssueRecord(database, id)
  if (!issue) {
    throw new IssueRepositoryError('issue_not_found', `Issue ${id} was not found.`)
  }
  return issue
}

export function listIssueRecords(
  database: IssueDatabase,
  filter: { executionHostId?: AuthorityExecutionHostId; state?: IssueRecord['state'] } = {}
): IssueRecord[] {
  const conditions: string[] = []
  const bindings: (string | number)[] = []
  if (filter.executionHostId) {
    conditions.push('execution_host_id = ?')
    bindings.push(filter.executionHostId)
  }
  if (filter.state) {
    conditions.push('state = ?')
    bindings.push(filter.state)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = database
    .prepare(
      `SELECT * FROM issues ${where}
       ORDER BY host_partition_key, parent_id, sibling_order, id`
    )
    .all(...bindings) as IssueRow[]
  return rows.map(issueRecordFromRow)
}

export function allocateLocalIssueNumber(
  database: IssueDatabase,
  hostPartitionKey: IssueRecord['hostPartitionKey']
): number {
  const row = database
    .prepare(
      `SELECT next_local_issue_number AS number
       FROM issue_host_state WHERE host_partition_key = ?`
    )
    .get(hostPartitionKey) as { number: number } | undefined
  if (!row) {
    throw new Error(`Issue host state ${hostPartitionKey} is missing.`)
  }
  database
    .prepare(
      `UPDATE issue_host_state
       SET next_local_issue_number = next_local_issue_number + 1
       WHERE host_partition_key = ?`
    )
    .run(hostPartitionKey)
  return row.number
}
