import { ISSUE_MAX_DEPTH } from '../../shared/issues/constants'
import type {
  AuthorityExecutionHostId,
  AuthorityHostPartitionKey,
  IssueRecord
} from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { getIssueRecord } from './issue-record-queries'
import { IssueRepositoryError } from './issue-repository-error'

export function assertIssueParent(params: {
  database: IssueDatabase
  parentId: string | null
  hostPartitionKey: AuthorityHostPartitionKey
  executionHostId: AuthorityExecutionHostId
  issueId?: string
}): void {
  const subtreeHeight = params.issueId ? getIssueSubtreeHeight(params.database, params.issueId) : 1
  if (!params.parentId) {
    assertDepth(subtreeHeight, params.issueId)
    return
  }

  const parent = getIssueRecord(params.database, params.parentId)
  if (!parent) {
    throw new IssueRepositoryError(
      'parent_not_found',
      `Parent Issue ${params.parentId} was not found.`
    )
  }
  if (
    parent.hostPartitionKey !== params.hostPartitionKey ||
    parent.executionHostId !== params.executionHostId
  ) {
    throw new IssueRepositoryError(
      'parent_host_mismatch',
      `Parent Issue ${params.parentId} belongs to another execution host.`
    )
  }

  const ancestorDepth = validateAncestorPath(params.database, parent, params.issueId)
  assertDepth(ancestorDepth + subtreeHeight, params.issueId)
}

function validateAncestorPath(
  database: IssueDatabase,
  parent: IssueRecord,
  issueId?: string
): number {
  let ancestor: IssueRecord | undefined = parent
  let depth = 0
  while (ancestor) {
    depth += 1
    if (ancestor.id === issueId) {
      throw new IssueRepositoryError('parent_cycle', `Issue ${issueId} cannot parent itself.`)
    }
    ancestor = ancestor.parentId ? getIssueRecord(database, ancestor.parentId) : undefined
  }
  return depth
}

export function getIssueSubtreeHeight(database: IssueDatabase, issueId: string): number {
  const row = database
    .prepare(
      `WITH RECURSIVE descendants(id, depth) AS (
         SELECT id, 1 FROM issues WHERE id = ?
         UNION ALL
         SELECT child.id, descendants.depth + 1
         FROM issues child JOIN descendants ON child.parent_id = descendants.id
       )
       SELECT COALESCE(MAX(depth), 1) AS height FROM descendants`
    )
    .get(issueId) as { height: number }
  return row.height
}

export function assertIssueForest(params: {
  database: IssueDatabase
  hostPartitionKey: AuthorityHostPartitionKey
  executionHostId: AuthorityExecutionHostId
  deletedIssueId?: string
  parentChanges?: ReadonlyMap<string, string | null>
}): void {
  const rows = params.database
    .prepare(
      `SELECT id, parent_id AS parentId, execution_host_id AS executionHostId
       FROM issues WHERE host_partition_key = ?`
    )
    .all(params.hostPartitionKey) as {
    id: string
    parentId: string | null
    executionHostId: AuthorityExecutionHostId
  }[]
  const activeRows = rows.filter((row) => row.id !== params.deletedIssueId)
  const parents = new Map(
    activeRows.map((row) => [
      row.id,
      params.parentChanges?.has(row.id) ? (params.parentChanges.get(row.id) ?? null) : row.parentId
    ])
  )
  for (const row of activeRows) {
    if (row.executionHostId !== params.executionHostId) {
      throw new IssueRepositoryError(
        'parent_host_mismatch',
        `Issue ${row.id} belongs to another execution host.`
      )
    }
    const parentId = parents.get(row.id) ?? null
    if (parentId !== null && !parents.has(parentId)) {
      throw new IssueRepositoryError(
        'parent_not_found',
        `Parent Issue ${parentId} was not found in the host partition.`
      )
    }
  }

  for (const row of activeRows) {
    let currentId: string | null = row.id
    let depth = 0
    const visited = new Set<string>()
    while (currentId !== null) {
      if (visited.has(currentId)) {
        throw new IssueRepositoryError(
          'parent_cycle',
          `Issue ${row.id} would create a parent cycle.`
        )
      }
      visited.add(currentId)
      depth += 1
      assertDepth(depth, row.id)
      currentId = parents.get(currentId) ?? null
    }
  }
}

function assertDepth(depth: number, issueId?: string): void {
  if (depth <= ISSUE_MAX_DEPTH) {
    return
  }
  throw new IssueRepositoryError(
    'issue_depth_exceeded',
    `Issue ${issueId ?? 'to create'} would exceed the ${ISSUE_MAX_DEPTH}-level limit.`
  )
}
