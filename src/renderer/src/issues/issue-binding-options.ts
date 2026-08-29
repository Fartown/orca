import { projectIssueTree } from '../../../shared/issues/hierarchy'
import type { IssueSummary } from '../../../shared/issues/types'

export type IssueBindingOption = {
  issue: IssueSummary
  title: string
  path: string
  searchValue: string
}

export function issueBindingTitle(issue: IssueSummary): string {
  return issue.source.kind === 'local' ? (issue.localTitle ?? '') : issue.source.titleSnapshot
}

export function buildIssueBindingOptions(issues: readonly IssueSummary[]): IssueBindingOption[] {
  const projected = projectIssueTree(issues)
  const projectedById = new Map(projected.map((item) => [item.issue.id, item]))
  return projected
    .filter((item) => item.issue.state === 'active')
    .map((item) => {
      const title = issueBindingTitle(item.issue)
      const ancestors: string[] = []
      let parentId = item.parentId
      while (parentId) {
        const parent = projectedById.get(parentId)
        if (!parent) {
          break
        }
        ancestors.unshift(issueBindingTitle(parent.issue))
        parentId = parent.parentId
      }
      const path = [...ancestors, title].filter(Boolean).join(' / ')
      const identifier = item.issue.source.kind === 'external' ? item.issue.source.identifier : ''
      return {
        issue: item.issue,
        title,
        path,
        searchValue: [path, identifier, item.issue.typeLabel ?? ''].filter(Boolean).join(' ')
      }
    })
}
