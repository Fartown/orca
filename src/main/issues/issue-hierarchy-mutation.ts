import type { IssueRecord } from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { assertIssueParent } from './issue-hierarchy-validation'
import { bumpIssueHostRevisions, getIssueHostRevisions } from './issue-host-state'
import { executeIssueMutation } from './issue-mutation-receipt'
import { requireIssueRecord } from './issue-record-queries'
import { IssueRepositoryError } from './issue-repository-error'
import { boundedIndex, listIssueSiblingIds, writeIssueSiblingScope } from './issue-sibling-order'
import type {
  IssueMutationParams,
  ReparentIssueInput,
  ReparentIssueResult
} from './issue-repository-types'

export class IssueHierarchyMutation {
  constructor(private readonly database: IssueDatabase) {}

  reparent(params: IssueMutationParams<ReparentIssueInput>): ReparentIssueResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'issues.reparent',
      payload: params.input,
      operation: () => this.reparentWithinTransaction(params.input)
    })
  }

  reparentWithinTransaction(input: ReparentIssueInput): ReparentIssueResult {
    const issue = requireIssueRecord(this.database, input.issueId)
    const revisions = getIssueHostRevisions(this.database, issue.hostPartitionKey)
    if (revisions.treeRevision !== input.expectedTreeRevision) {
      throw new IssueRepositoryError(
        'issue_tree_revision_stale',
        `Issue tree revision ${input.expectedTreeRevision} is stale.`,
        { currentTreeRevision: revisions.treeRevision }
      )
    }
    assertIssueParent({
      database: this.database,
      parentId: input.parentId,
      hostPartitionKey: issue.hostPartitionKey,
      executionHostId: issue.executionHostId,
      issueId: issue.id
    })

    const oldParentId = issue.parentId
    const oldScope = this.listScope(issue, oldParentId)
    const newScope =
      oldParentId === input.parentId ? oldScope : this.listScope(issue, input.parentId)
    const oldNext = oldScope.filter((id) => id !== issue.id)
    const newNext =
      oldParentId === input.parentId ? oldNext : newScope.filter((id) => id !== issue.id)
    newNext.splice(boundedIndex(input.index, newNext.length), 0, issue.id)
    if (oldParentId === input.parentId && sameIds(oldScope, newNext)) {
      return { issue, affectedIssueIds: [], ...revisions }
    }

    const now = Date.now()
    if (oldParentId !== input.parentId) {
      this.writeScope(issue, oldParentId, oldNext, now)
    }
    this.writeScope(issue, input.parentId, newNext, now)
    const nextRevisions = bumpIssueHostRevisions(
      this.database,
      issue.hostPartitionKey,
      { tree: true },
      now
    )
    return {
      issue: requireIssueRecord(this.database, issue.id),
      affectedIssueIds: [...new Set([...oldScope, ...newNext])],
      ...nextRevisions
    }
  }

  private listScope(issue: IssueRecord, parentId: string | null): string[] {
    return listIssueSiblingIds({
      database: this.database,
      hostPartitionKey: issue.hostPartitionKey,
      parentId
    })
  }

  private writeScope(
    issue: IssueRecord,
    parentId: string | null,
    issueIds: readonly string[],
    now: number
  ): void {
    writeIssueSiblingScope({
      database: this.database,
      hostPartitionKey: issue.hostPartitionKey,
      parentId,
      issueIds,
      now
    })
  }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}
