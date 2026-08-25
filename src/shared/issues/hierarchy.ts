import { ISSUE_MAX_DEPTH } from './constants'
import type { IssueRecord } from './types'

export type IssueParentEdgeError = 'self' | 'cross-host' | 'missing-parent' | 'cycle' | 'depth'

export type ProjectedIssue<T extends IssueRecord = IssueRecord> = {
  issue: T
  parentId: string | null
  childIssueIds: string[]
  depth: 0 | 1 | 2
  parentEdgeError: IssueParentEdgeError | null
}

export function validateIssueParentEdge(
  child: Pick<IssueRecord, 'id' | 'hostPartitionKey' | 'executionHostId'>,
  parent: Pick<IssueRecord, 'id' | 'hostPartitionKey' | 'executionHostId'> | undefined
): IssueParentEdgeError | null {
  if (!parent) {
    return 'missing-parent'
  }
  if (child.id === parent.id) {
    return 'self'
  }
  if (
    child.hostPartitionKey !== parent.hostPartitionKey ||
    child.executionHostId !== parent.executionHostId
  ) {
    return 'cross-host'
  }
  return null
}

export function getCyclicIssueIds(
  issues: readonly Pick<IssueRecord, 'id' | 'parentId' | 'hostPartitionKey' | 'executionHostId'>[]
): Set<string> {
  const issueById = new Map(issues.map((issue) => [issue.id, issue]))
  const validParentById = new Map<string, string>()
  for (const issue of issues) {
    if (!issue.parentId) {
      continue
    }
    if (validateIssueParentEdge(issue, issueById.get(issue.parentId)) === null) {
      validParentById.set(issue.id, issue.parentId)
    }
  }

  const processed = new Set<string>()
  const cyclic = new Set<string>()
  for (const issue of issues) {
    if (processed.has(issue.id)) {
      continue
    }
    const path: string[] = []
    const pathIndex = new Map<string, number>()
    let currentId: string | undefined = issue.id
    while (currentId && validParentById.has(currentId) && !processed.has(currentId)) {
      const cycleStart = pathIndex.get(currentId)
      if (cycleStart !== undefined) {
        for (let index = cycleStart; index < path.length; index += 1) {
          cyclic.add(path[index])
        }
        break
      }
      pathIndex.set(currentId, path.length)
      path.push(currentId)
      currentId = validParentById.get(currentId)
    }
    for (const id of path) {
      processed.add(id)
    }
  }
  return cyclic
}

export function projectIssueTree<T extends IssueRecord>(issues: readonly T[]): ProjectedIssue<T>[] {
  const issueById = new Map(issues.map((issue) => [issue.id, issue]))
  const cyclicIds = getCyclicIssueIds(issues)
  const parentById = new Map<string, string | null>()
  const errorById = new Map<string, IssueParentEdgeError | null>()

  for (const issue of issues) {
    if (!issue.parentId) {
      parentById.set(issue.id, null)
      errorById.set(issue.id, null)
      continue
    }
    const edgeError = validateIssueParentEdge(issue, issueById.get(issue.parentId))
    const error = cyclicIds.has(issue.id) ? 'cycle' : edgeError
    parentById.set(issue.id, error ? null : issue.parentId)
    errorById.set(issue.id, error)
  }

  for (const issue of issues) {
    if (projectedDepth(issue.id, parentById) > ISSUE_MAX_DEPTH) {
      parentById.set(issue.id, null)
      errorById.set(issue.id, 'depth')
    }
  }

  const childrenByParent = new Map<string | null, T[]>()
  for (const issue of issues) {
    const parentId = parentById.get(issue.id) ?? null
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(issue)
    childrenByParent.set(parentId, siblings)
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort(compareIssueOrder)
  }

  const rows: ProjectedIssue<T>[] = []
  const append = (issue: T, depth: 0 | 1 | 2): void => {
    const children = childrenByParent.get(issue.id) ?? []
    rows.push({
      issue,
      parentId: parentById.get(issue.id) ?? null,
      childIssueIds: children.map((child) => child.id),
      depth,
      parentEdgeError: errorById.get(issue.id) ?? null
    })
    const childDepth = Math.min(depth + 1, ISSUE_MAX_DEPTH - 1) as 0 | 1 | 2
    for (const child of children) {
      append(child, childDepth)
    }
  }
  for (const root of childrenByParent.get(null) ?? []) {
    append(root, 0)
  }
  return rows
}

function projectedDepth(issueId: string, parentById: ReadonlyMap<string, string | null>): number {
  let depth = 0
  let currentId: string | null = issueId
  const visited = new Set<string>()
  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId)
    depth += 1
    currentId = parentById.get(currentId) ?? null
  }
  return depth
}

function compareIssueOrder(
  left: Pick<IssueRecord, 'id' | 'siblingOrder'>,
  right: Pick<IssueRecord, 'id' | 'siblingOrder'>
): number {
  return left.siblingOrder - right.siblingOrder || left.id.localeCompare(right.id)
}
