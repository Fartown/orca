import type { AuthorityHostPartitionKey } from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'

export function listIssueSiblingIds(params: {
  database: IssueDatabase
  hostPartitionKey: AuthorityHostPartitionKey
  parentId: string | null
}): string[] {
  return (
    params.database
      .prepare(
        `SELECT id FROM issues
         WHERE host_partition_key = ? AND parent_id IS ?
         ORDER BY sibling_order, id`
      )
      .all(params.hostPartitionKey, params.parentId) as { id: string }[]
  ).map((row) => row.id)
}

export function writeIssueSiblingScope(params: {
  database: IssueDatabase
  hostPartitionKey: AuthorityHostPartitionKey
  parentId: string | null
  issueIds: readonly string[]
  now: number
}): void {
  const update = params.database.prepare(
    `UPDATE issues
     SET record_revision = record_revision + CASE
           WHEN parent_id IS NOT ? OR sibling_order <> ? THEN 1 ELSE 0 END,
         updated_at = CASE
           WHEN parent_id IS NOT ? OR sibling_order <> ? THEN ? ELSE updated_at END,
         parent_id = ?, sibling_order = ?
     WHERE id = ? AND host_partition_key = ?`
  )
  params.issueIds.forEach((id, index) => {
    update.run(
      params.parentId,
      index,
      params.parentId,
      index,
      params.now,
      params.parentId,
      index,
      id,
      params.hostPartitionKey
    )
  })
}

export function insertIssueAtSiblingIndex(params: {
  database: IssueDatabase
  hostPartitionKey: AuthorityHostPartitionKey
  parentId: string | null
  issueId: string
  index?: number
  now: number
}): string[] {
  const ids = listIssueSiblingIds(params).filter((id) => id !== params.issueId)
  const index = params.index === undefined ? ids.length : boundedIndex(params.index, ids.length)
  ids.splice(index, 0, params.issueId)
  writeIssueSiblingScope({ ...params, issueIds: ids })
  return ids
}

export function boundedIndex(index: number, length: number): number {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error('Issue sibling index must be a non-negative integer.')
  }
  return Math.min(index, length)
}
