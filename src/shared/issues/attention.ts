import { projectIssueTree } from './hierarchy'
import type { IssueRecord } from './types'

export type IssueAttentionFilter = 'all' | 'needs-me' | 'archived'

export type IssueAttentionInput = IssueRecord & {
  ownUnresolvedCount: number
}

export type IssueAttentionRow<T extends IssueAttentionInput = IssueAttentionInput> = {
  issue: T
  depth: 0 | 1 | 2
  contextOnly: boolean
  descendantAttentionCount: number
}

export type IssueAttentionProjection<T extends IssueAttentionInput = IssueAttentionInput> = {
  rows: IssueAttentionRow<T>[]
  globalAttentionIssueCount: number
}

export function buildAttentionPreservingIssueRows<T extends IssueAttentionInput>(
  issues: readonly T[],
  filter: IssueAttentionFilter
): IssueAttentionProjection<T> {
  const projected = projectIssueTree(issues)
  const projectedById = new Map(projected.map((row) => [row.issue.id, row]))
  const directMatches = new Set(
    projected.filter(({ issue }) => matchesFilter(issue, filter)).map(({ issue }) => issue.id)
  )
  const included = new Set(directMatches)
  for (const issueId of directMatches) {
    let parentId = projectedById.get(issueId)?.parentId ?? null
    while (parentId) {
      included.add(parentId)
      parentId = projectedById.get(parentId)?.parentId ?? null
    }
  }

  const descendantCounts = new Map<string, number>()
  for (const candidate of projected) {
    if (candidate.issue.state !== 'active' || candidate.issue.ownUnresolvedCount <= 0) {
      continue
    }
    let parentId = candidate.parentId
    while (parentId) {
      descendantCounts.set(parentId, (descendantCounts.get(parentId) ?? 0) + 1)
      parentId = projectedById.get(parentId)?.parentId ?? null
    }
  }

  return {
    rows: projected
      .filter(({ issue }) => included.has(issue.id))
      .map(({ issue, depth }) => ({
        issue,
        depth,
        contextOnly: !directMatches.has(issue.id),
        descendantAttentionCount: descendantCounts.get(issue.id) ?? 0
      })),
    globalAttentionIssueCount: projected.filter(
      ({ issue }) => issue.state === 'active' && issue.ownUnresolvedCount > 0
    ).length
  }
}

function matchesFilter(issue: IssueAttentionInput, filter: IssueAttentionFilter): boolean {
  if (filter === 'all') {
    return issue.state === 'active'
  }
  if (filter === 'archived') {
    return issue.state === 'archived'
  }
  return issue.state === 'active' && issue.ownUnresolvedCount > 0
}
