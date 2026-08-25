import { afterEach, describe, expect, it } from 'vitest'
import type { IssueRecord } from '../../shared/issues/types'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { getIssueHostRevisions } from './issue-host-state'
import { IssueRepository, issueMutationIdentity } from './issue-repository'

afterEach(removeIssueTestDirectories)

describe('Issue hierarchy and lifecycle', () => {
  it('enforces three levels, self/cycle, subtree depth, and cross-host rules atomically', () => {
    const repository = openRepository('hierarchy')
    const root = createIssue(repository, 'root')
    const child = createIssue(repository, 'child', root.id)
    const grandchild = createIssue(repository, 'grandchild', child.id)
    const remote = createIssue(repository, 'remote', null, 'ssh:remote')

    expect(captureError(() => createIssue(repository, 'fourth', grandchild.id))).toMatchObject({
      code: 'issue_depth_exceeded'
    })
    expect(
      captureError(() =>
        repository.issueHierarchy.reparent({
          identity: identity('self'),
          input: {
            issueId: root.id,
            parentId: root.id,
            index: 0,
            expectedTreeRevision: currentTreeRevision(repository)
          }
        })
      )
    ).toMatchObject({ code: 'parent_cycle' })
    expect(
      captureError(() =>
        repository.issueHierarchy.reparent({
          identity: identity('cycle'),
          input: {
            issueId: root.id,
            parentId: grandchild.id,
            index: 0,
            expectedTreeRevision: currentTreeRevision(repository)
          }
        })
      )
    ).toMatchObject({ code: 'parent_cycle' })
    expect(
      captureError(() =>
        repository.issueHierarchy.reparent({
          identity: identity('cross-host'),
          input: {
            issueId: child.id,
            parentId: remote.id,
            index: 0,
            expectedTreeRevision: currentTreeRevision(repository)
          }
        })
      )
    ).toMatchObject({ code: 'parent_host_mismatch' })

    expect(repository.issues.get(root.id)?.parentId).toBeNull()
    expect(repository.issues.get(child.id)?.parentId).toBe(root.id)
    expect(repository.issues.get(grandchild.id)?.parentId).toBe(child.id)
    repository.close()
  })

  it('reparents and reorders one sibling scope atomically with record revisions', () => {
    const repository = openRepository('reparent')
    const root = createIssue(repository, 'root')
    const first = createIssue(repository, 'first', root.id)
    const second = createIssue(repository, 'second', root.id)
    const beforeTree = currentTreeRevision(repository)

    const result = repository.issueHierarchy.reparent({
      identity: identity('reorder'),
      input: {
        issueId: second.id,
        parentId: root.id,
        index: 0,
        expectedTreeRevision: beforeTree
      }
    })
    const replay = repository.issueHierarchy.reparent({
      identity: identity('reorder'),
      input: {
        issueId: second.id,
        parentId: root.id,
        index: 0,
        expectedTreeRevision: beforeTree
      }
    })

    expect(replay).toEqual(result)
    expect(childrenOf(repository, root.id)).toEqual([second.id, first.id])
    expect(repository.issues.get(second.id)?.recordRevision).toBeGreaterThan(0)
    expect(repository.issues.get(first.id)?.recordRevision).toBeGreaterThan(0)
    expect(currentTreeRevision(repository)).toBe(beforeTree + 1)
    repository.close()
  })

  it('rejects stale tree revisions without reparenting or persisting a receipt', () => {
    const repository = openRepository('stale-tree')
    const root = createIssue(repository, 'root')
    const child = createIssue(repository, 'child', root.id)
    const staleTreeRevision = currentTreeRevision(repository)
    createIssue(repository, 'later-sibling', root.id)

    expect(
      captureError(() =>
        repository.issueHierarchy.reparent({
          identity: identity('stale-reparent'),
          input: {
            issueId: child.id,
            parentId: null,
            index: 0,
            expectedTreeRevision: staleTreeRevision
          }
        })
      )
    ).toMatchObject({ code: 'issue_tree_revision_stale' })
    expect(repository.issues.get(child.id)).toMatchObject({ parentId: root.id, recordRevision: 0 })
    expect(receiptExists(repository, 'stale-reparent')).toBe(false)
    repository.close()
  })

  it('keeps parent and child lifecycle independent and blocks unresolved waiting', () => {
    const repository = openRepository('lifecycle')
    const parent = createIssue(repository, 'parent')
    const child = createIssue(repository, 'child', parent.id)
    const conversation = createConversation(repository, parent.id)
    const completion = repository.rounds.create({
      identity: identity('completion'),
      input: {
        conversationId: conversation.id,
        kind: 'completion',
        stateSource: 'hook',
        occurredAt: 1,
        dedupeKey: 'completion',
        agentOutput: { text: 'done' }
      }
    })

    const archived = repository.issueLifecycle.archive({
      identity: identity('archive-parent'),
      input: { id: parent.id, expectedRecordRevision: parent.recordRevision }
    })
    expect(archived.issue.state).toBe('archived')
    expect(repository.issues.get(child.id)?.state).toBe('active')
    expect(repository.rounds.get(completion.id)).toMatchObject({
      resolvedAt: expect.any(Number),
      resolution: 'archive'
    })

    const reopened = repository.issueLifecycle.reopen({
      identity: identity('reopen-parent'),
      input: {
        id: parent.id,
        expectedRecordRevision: archived.issue.recordRevision
      }
    })
    const waiting = repository.rounds.create({
      identity: identity('waiting'),
      input: {
        conversationId: conversation.id,
        kind: 'waiting',
        waitingReason: 'question',
        stateSource: 'hook',
        occurredAt: 2,
        dedupeKey: 'waiting',
        pendingQuestion: { text: 'Need input' }
      }
    })
    expect(
      captureError(() =>
        repository.issueLifecycle.archive({
          identity: identity('archive-blocked'),
          input: {
            id: parent.id,
            expectedRecordRevision: reopened.issue.recordRevision
          }
        })
      )
    ).toMatchObject({ code: 'issue_archive_blocked' })
    expect(repository.rounds.get(waiting.id)?.resolvedAt).toBeNull()
    repository.close()
  })

  it('deletes only the Issue after explicit child and Conversation destinations', () => {
    const repository = openRepository('delete')
    const parent = createIssue(repository, 'parent')
    const child = createIssue(repository, 'child', parent.id)
    const conversation = createConversation(repository, parent.id)
    const preparation = repository.issueDeletion.prepare(parent.id)

    const result = repository.issueDeletion.commit({
      identity: identity('delete-parent'),
      input: preparation.plan
    })

    expect(result.deletedIssueId).toBe(parent.id)
    expect(repository.issues.get(parent.id)).toBeUndefined()
    expect(repository.issues.get(child.id)).toMatchObject({ parentId: null })
    expect(repository.conversations.get(conversation.id)).toMatchObject({
      issueId: null,
      recordRevision: 1
    })
    repository.close()
  })

  it('rolls back an incomplete delete plan without partial moves', () => {
    const repository = openRepository('delete-rollback')
    const parent = createIssue(repository, 'parent')
    const child = createIssue(repository, 'child', parent.id)
    const conversation = createConversation(repository, parent.id)
    const preparation = repository.issueDeletion.prepare(parent.id)
    const factsBefore = getIssueHostRevisions(repository.database, 'local')

    expect(
      captureError(() =>
        repository.issueDeletion.commit({
          identity: identity('invalid-delete'),
          input: { ...preparation.plan, children: [] }
        })
      )
    ).toMatchObject({ code: 'issue_delete_plan_invalid' })
    expect(repository.issues.get(parent.id)).toBeDefined()
    expect(repository.issues.get(child.id)?.parentId).toBe(parent.id)
    expect(repository.conversations.get(conversation.id)?.issueId).toBe(parent.id)
    expect(getIssueHostRevisions(repository.database, 'local')).toEqual(factsBefore)
    expect(receiptExists(repository, 'invalid-delete')).toBe(false)
    repository.close()
  })

  it('rejects a stale delete snapshot without moving dependents', () => {
    const repository = openRepository('delete-stale')
    const parent = createIssue(repository, 'parent')
    const child = createIssue(repository, 'child', parent.id)
    const conversation = createConversation(repository, parent.id)
    const preparation = repository.issueDeletion.prepare(parent.id)
    repository.issues.update({
      identity: identity('child-update'),
      input: { id: child.id, expectedRecordRevision: child.recordRevision, title: 'Changed child' }
    })

    expect(
      captureError(() =>
        repository.issueDeletion.commit({
          identity: identity('stale-delete'),
          input: preparation.plan
        })
      )
    ).toMatchObject({ code: 'issue_snapshot_revision_stale' })
    expect(repository.issues.get(parent.id)).toBeDefined()
    expect(repository.issues.get(child.id)?.parentId).toBe(parent.id)
    expect(repository.conversations.get(conversation.id)?.issueId).toBe(parent.id)
    expect(receiptExists(repository, 'stale-delete')).toBe(false)
    repository.close()
  })
})

function openRepository(suffix: string): IssueRepository {
  return IssueRepository.open({
    profileId: 'profile-a',
    userDataPath: createIssueTestUserDataPath(`orca-issue-hierarchy-${suffix}`)
  })
}

function createIssue(
  repository: IssueRepository,
  title: string,
  parentId: string | null = null,
  executionHostId: 'local' | `ssh:${string}` = 'local'
): IssueRecord {
  return repository.issues.createLocal({
    identity: identity(`create-${title}-${executionHostId}`),
    input: { executionHostId, title, parentId }
  }).issue
}

function createConversation(repository: IssueRepository, issueId: string) {
  return repository.conversations.create({
    identity: identity(`conversation-${issueId}`),
    input: {
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: `worktree-${issueId}` },
      workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
      agent: 'codex',
      issueId
    }
  }).conversation
}

function currentTreeRevision(repository: IssueRepository): number {
  return getIssueHostRevisions(repository.database, 'local').treeRevision
}

function childrenOf(repository: IssueRepository, parentId: string): string[] {
  return (
    repository.database
      .prepare('SELECT id FROM issues WHERE parent_id = ? ORDER BY sibling_order, id')
      .all(parentId) as { id: string }[]
  ).map((row) => row.id)
}

function identity(mutationId: string) {
  return issueMutationIdentity('caller-a', mutationId)
}

function receiptExists(repository: IssueRepository, mutationId: string): boolean {
  return Boolean(
    repository.database
      .prepare('SELECT 1 FROM issue_mutation_receipts WHERE mutation_id = ?')
      .get(mutationId)
  )
}

function captureError(operation: () => unknown): unknown {
  try {
    operation()
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to throw.')
}
