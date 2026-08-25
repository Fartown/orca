import type { AuthorityHostPartitionKey } from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'

export type IssueHostRevisions = {
  factsRevision: number
  treeRevision: number
}

export function ensureIssueHostState(
  database: IssueDatabase,
  hostPartitionKey: AuthorityHostPartitionKey,
  now: number
): void {
  database
    .prepare(
      `INSERT OR IGNORE INTO issue_host_state (
         host_partition_key, next_local_issue_number, facts_revision, tree_revision, updated_at
       ) VALUES (?, 1, 0, 0, ?)`
    )
    .run(hostPartitionKey, now)
}

export function bumpIssueHostRevisions(
  database: IssueDatabase,
  hostPartitionKey: AuthorityHostPartitionKey,
  options: { tree: boolean },
  now: number
): IssueHostRevisions {
  ensureIssueHostState(database, hostPartitionKey, now)
  database
    .prepare(
      `UPDATE issue_host_state
       SET facts_revision = facts_revision + 1,
           tree_revision = tree_revision + ?,
           updated_at = ?
       WHERE host_partition_key = ?`
    )
    .run(options.tree ? 1 : 0, now, hostPartitionKey)
  const revisions = getIssueHostRevisions(database, hostPartitionKey)
  database.recordFactsChanged(hostPartitionKey, revisions)
  return revisions
}

export function getIssueHostRevisions(
  database: IssueDatabase,
  hostPartitionKey: AuthorityHostPartitionKey
): IssueHostRevisions {
  const row = database
    .prepare(
      `SELECT facts_revision AS factsRevision, tree_revision AS treeRevision
       FROM issue_host_state WHERE host_partition_key = ?`
    )
    .get(hostPartitionKey) as IssueHostRevisions | undefined
  if (!row) {
    throw new Error(`Issue host state ${hostPartitionKey} is missing.`)
  }
  return row
}
