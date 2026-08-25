import type { DeleteIssuePlan, IssueMutationIdentity, IssueRecord } from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { assertIssueForest } from './issue-hierarchy-validation'
import { bumpIssueHostRevisions, getIssueHostRevisions } from './issue-host-state'
import { executeIssueMutation } from './issue-mutation-receipt'
import { getIssueRecord, requireIssueRecord } from './issue-record-queries'
import { IssueRepositoryError } from './issue-repository-error'
import { listIssueSiblingIds, writeIssueSiblingScope } from './issue-sibling-order'
import type { CommitDeleteIssueResult } from './issue-repository-types'

export type IssueDeletePreparation = {
  plan: DeleteIssuePlan
  legalParentTargetsByChild: Record<string, (string | null)[]>
  legalConversationTargets: (string | null)[]
}

export class IssueDeleteRepository {
  constructor(private readonly database: IssueDatabase) {}

  prepare(issueId: string): IssueDeletePreparation {
    const issue = requireIssueRecord(this.database, issueId)
    const revisions = getIssueHostRevisions(this.database, issue.hostPartitionKey)
    const children = this.listChildren(issue)
    const conversations = this.listConversationIds(issue)
    const legalTargets = this.listLegalTargets(issue)
    return {
      plan: {
        issueId: issue.id,
        snapshotFactsRevision: revisions.factsRevision,
        snapshotTreeRevision: revisions.treeRevision,
        children: children.map((child, offset) => ({
          issueId: child.id,
          destination: issue.parentId
            ? { kind: 'parent' as const, parentId: issue.parentId }
            : { kind: 'root' as const },
          index: issue.siblingOrder + offset
        })),
        conversations: conversations.map((conversationId) => ({
          conversationId,
          destinationIssueId: null
        }))
      },
      legalParentTargetsByChild: Object.fromEntries(
        children.map((child) => [
          child.id,
          legalTargets.filter((target) => this.isLegalParent(child, target, issue.id))
        ])
      ),
      legalConversationTargets: legalTargets.filter((target) => {
        return target === null || getIssueRecord(this.database, target)?.state === 'active'
      })
    }
  }

  commit(params: {
    identity: IssueMutationIdentity
    input: DeleteIssuePlan
  }): CommitDeleteIssueResult {
    return executeIssueMutation({
      database: this.database,
      identity: params.identity,
      method: 'issues.delete',
      payload: params.input,
      operation: () => this.commitWithinTransaction(params.input)
    })
  }

  private commitWithinTransaction(plan: DeleteIssuePlan): CommitDeleteIssueResult {
    const issue = requireIssueRecord(this.database, plan.issueId)
    const revisions = getIssueHostRevisions(this.database, issue.hostPartitionKey)
    if (
      revisions.factsRevision !== plan.snapshotFactsRevision ||
      revisions.treeRevision !== plan.snapshotTreeRevision
    ) {
      throw new IssueRepositoryError(
        'issue_snapshot_revision_stale',
        'Issue delete plan no longer matches the authority snapshot.',
        { current: revisions }
      )
    }
    const children = this.listChildren(issue)
    const conversations = this.listConversationIds(issue)
    assertExactIds(
      children.map((child) => child.id),
      plan.children.map((child) => child.issueId),
      'child'
    )
    assertExactIds(
      conversations,
      plan.conversations.map((conversation) => conversation.conversationId),
      'Conversation'
    )

    const parentChanges = new Map<string, string | null>()
    for (const child of plan.children) {
      parentChanges.set(
        child.issueId,
        child.destination.kind === 'parent' ? child.destination.parentId : null
      )
    }
    assertIssueForest({
      database: this.database,
      hostPartitionKey: issue.hostPartitionKey,
      executionHostId: issue.executionHostId,
      deletedIssueId: issue.id,
      parentChanges
    })
    for (const binding of plan.conversations) {
      this.assertConversationDestination(issue, binding.destinationIssueId)
    }

    const now = Date.now()
    const affectedIssueIds = this.applyChildMoves(issue, plan.children, now)
    const moveConversation = this.database.prepare(
      `UPDATE conversations
       SET issue_id = ?, record_revision = record_revision + 1, updated_at = ?
       WHERE id = ? AND issue_id = ?`
    )
    for (const binding of plan.conversations) {
      if (
        moveConversation.run(binding.destinationIssueId, now, binding.conversationId, issue.id)
          .changes !== 1
      ) {
        throw invalidPlan(`Conversation ${binding.conversationId} changed during delete.`)
      }
    }
    this.assertEmpty(issue.id)
    this.database.prepare('DELETE FROM issues WHERE id = ?').run(issue.id)
    const next = bumpIssueHostRevisions(this.database, issue.hostPartitionKey, { tree: true }, now)
    return {
      deletedIssueId: issue.id,
      affectedIssueIds: [...new Set(affectedIssueIds.filter((id) => id !== issue.id))],
      affectedConversationIds: conversations,
      ...next
    }
  }

  private listChildren(issue: IssueRecord): IssueRecord[] {
    return (
      this.database
        .prepare(
          `SELECT id FROM issues WHERE host_partition_key = ? AND parent_id = ?
           ORDER BY sibling_order, id`
        )
        .all(issue.hostPartitionKey, issue.id) as { id: string }[]
    ).map((row) => requireIssueRecord(this.database, row.id))
  }

  private listConversationIds(issue: IssueRecord): string[] {
    return (
      this.database
        .prepare(
          `SELECT id FROM conversations WHERE host_partition_key = ? AND issue_id = ?
           ORDER BY updated_at, id`
        )
        .all(issue.hostPartitionKey, issue.id) as { id: string }[]
    ).map((row) => row.id)
  }

  private listLegalTargets(issue: IssueRecord): (string | null)[] {
    return [
      null,
      ...(
        this.database
          .prepare(
            `SELECT id FROM issues
             WHERE host_partition_key = ? AND id <> ? ORDER BY parent_id, sibling_order, id`
          )
          .all(issue.hostPartitionKey, issue.id) as { id: string }[]
      ).map((row) => row.id)
    ]
  }

  private isLegalParent(child: IssueRecord, parentId: string | null, deletedId: string): boolean {
    if (parentId === deletedId) {
      return false
    }
    try {
      assertIssueForest({
        database: this.database,
        hostPartitionKey: child.hostPartitionKey,
        executionHostId: child.executionHostId,
        deletedIssueId: deletedId,
        parentChanges: new Map([[child.id, parentId]])
      })
      return true
    } catch {
      return false
    }
  }

  private assertConversationDestination(source: IssueRecord, destinationId: string | null): void {
    if (destinationId === null) {
      return
    }
    const destination = requireIssueRecord(this.database, destinationId)
    if (
      destination.id === source.id ||
      destination.hostPartitionKey !== source.hostPartitionKey ||
      destination.executionHostId !== source.executionHostId ||
      destination.state !== 'active'
    ) {
      throw invalidPlan(`Conversation destination ${destinationId} is not legal.`)
    }
  }

  private applyChildMoves(
    issue: IssueRecord,
    plans: DeleteIssuePlan['children'],
    now: number
  ): string[] {
    const moved = new Set(plans.map((plan) => plan.issueId))
    const scopes = new Set<string | null>([issue.id, issue.parentId])
    for (const plan of plans) {
      scopes.add(plan.destination.kind === 'parent' ? plan.destination.parentId : null)
    }
    const byScope = new Map<string | null, string[]>()
    for (const scope of scopes) {
      byScope.set(
        scope,
        listIssueSiblingIds({
          database: this.database,
          hostPartitionKey: issue.hostPartitionKey,
          parentId: scope
        }).filter((id) => id !== issue.id && !moved.has(id))
      )
    }
    for (const plan of plans) {
      const parentId = plan.destination.kind === 'parent' ? plan.destination.parentId : null
      const ids = byScope.get(parentId) ?? []
      ids.splice(Math.min(plan.index, ids.length), 0, plan.issueId)
      byScope.set(parentId, ids)
    }
    const affected: string[] = []
    for (const [parentId, issueIds] of byScope) {
      if (parentId === issue.id) {
        continue
      }
      writeIssueSiblingScope({
        database: this.database,
        hostPartitionKey: issue.hostPartitionKey,
        parentId,
        issueIds,
        now
      })
      affected.push(...issueIds)
    }
    return affected
  }

  private assertEmpty(issueId: string): void {
    const row = this.database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM issues WHERE parent_id = ?) AS children,
           (SELECT COUNT(*) FROM conversations WHERE issue_id = ?) AS conversations`
      )
      .get(issueId, issueId) as { children: number; conversations: number }
    if (row.children !== 0 || row.conversations !== 0) {
      throw invalidPlan(`Issue ${issueId} still has direct dependents.`)
    }
  }
}

function assertExactIds(expected: string[], actual: string[], label: string): void {
  const normalized = [...new Set(actual)].sort()
  const expectedSorted = [...expected].sort()
  if (
    normalized.length !== actual.length ||
    normalized.length !== expectedSorted.length ||
    normalized.some((id, index) => id !== expectedSorted[index])
  ) {
    throw invalidPlan(`Delete plan must include every direct ${label} exactly once.`)
  }
}

function invalidPlan(message: string): IssueRepositoryError {
  return new IssueRepositoryError('issue_delete_plan_invalid', message)
}
