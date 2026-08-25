import { afterEach, describe, expect, it } from 'vitest'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { bumpIssueHostRevisions, getIssueHostRevisions } from './issue-host-state'
import { IssueRepository, issueMutationIdentity } from './issue-repository'

afterEach(removeIssueTestDirectories)

describe('IssueRepository v1 invariants', () => {
  it('replays one mutation receipt without creating a second side effect', () => {
    const repository = openRepository('receipt')
    const params = {
      identity: issueMutationIdentity('caller-a', 'create-1'),
      input: { executionHostId: 'local' as const, title: 'Stable issue' }
    }

    const first = repository.issues.createLocal(params)
    const replay = repository.issues.createLocal(params)

    expect(replay).toEqual(first)
    expect(repository.issues.list()).toHaveLength(1)
    expect(receiptCount(repository)).toBe(1)
    expect(
      captureError(() =>
        repository.issues.createLocal({
          ...params,
          input: { ...params.input, title: 'Different payload' }
        })
      )
    ).toMatchObject({ code: 'mutation_receipt_conflict' })
    repository.close()
  })

  it('keeps recordRevision local to the edited record', () => {
    const repository = openRepository('record-revision')
    const created = repository.issues.createLocal({
      identity: issueMutationIdentity('caller-a', 'create-1'),
      input: { executionHostId: 'local', title: 'Before' }
    })
    bumpIssueHostRevisions(repository.database, 'local', { tree: false }, Date.now())

    const updated = repository.issues.update({
      identity: issueMutationIdentity('caller-a', 'update-1'),
      input: {
        id: created.issue.id,
        expectedRecordRevision: created.issue.recordRevision,
        title: 'After'
      }
    })

    expect(updated.issue).toMatchObject({ localTitle: 'After', recordRevision: 1 })
    expect(
      captureError(() =>
        repository.issues.update({
          identity: issueMutationIdentity('caller-a', 'update-stale'),
          input: { id: created.issue.id, expectedRecordRevision: 0, title: 'Stale' }
        })
      )
    ).toMatchObject({ code: 'issue_record_revision_stale' })
    repository.close()
  })

  it('rejects a stale Conversation edit without changing title, revision, or receipt', () => {
    const repository = openRepository('conversation-record-revision')
    const conversation = createConversation(repository, 'conversation-create', null)
    const updated = repository.conversations.updateTitle({
      identity: issueMutationIdentity('caller-a', 'conversation-update'),
      input: {
        id: conversation.id,
        expectedRecordRevision: conversation.recordRevision,
        title: 'Current title'
      }
    }).conversation

    expect(
      captureError(() =>
        repository.conversations.updateTitle({
          identity: issueMutationIdentity('caller-a', 'conversation-stale'),
          input: {
            id: conversation.id,
            expectedRecordRevision: conversation.recordRevision,
            title: 'Stale title'
          }
        })
      )
    ).toMatchObject({ code: 'conversation_record_revision_stale' })
    expect(repository.conversations.get(conversation.id)).toEqual(updated)
    expect(receiptExists(repository, 'conversation-stale')).toBe(false)
    repository.close()
  })

  it('rejects immutable host changes and runtime authority ids in SQLite', () => {
    const repository = openRepository('host-immutable')
    const issue = repository.issues.createLocal({
      identity: issueMutationIdentity('caller-a', 'create-issue'),
      input: { executionHostId: 'local', title: 'Local issue' }
    }).issue
    const conversation = createConversation(repository, 'create-conversation', null)

    expect(() =>
      repository.database
        .prepare("UPDATE issues SET execution_host_id = 'ssh:remote' WHERE id = ?")
        .run(issue.id)
    ).toThrow(/issue_execution_host_immutable/)
    expect(() =>
      repository.database
        .prepare("UPDATE conversations SET host_partition_key = 'ssh:remote' WHERE id = ?")
        .run(conversation.id)
    ).toThrow(/conversation_execution_host_immutable/)
    expect(() =>
      repository.database
        .prepare(
          `INSERT INTO issues (
             id, host_partition_key, execution_host_id, source_kind, local_number, local_title,
             state, sibling_order, record_revision, created_at, updated_at
           ) VALUES ('runtime-issue', 'runtime:paired', 'runtime:paired', 'local', 99, 'bad',
                     'active', 0, 0, 1, 1)`
        )
        .run()
    ).toThrow(/CHECK constraint failed/)
    repository.close()
  })

  it('rejects cross-host parent and binding without partial receipts or revision drift', () => {
    const repository = openRepository('cross-host')
    const localParent = repository.issues.createLocal({
      identity: issueMutationIdentity('caller-a', 'parent'),
      input: { executionHostId: 'local', title: 'Local parent' }
    }).issue
    const remoteIssue = repository.issues.createLocal({
      identity: issueMutationIdentity('caller-a', 'remote'),
      input: { executionHostId: 'ssh:remote', title: 'Remote issue' }
    }).issue

    expect(
      captureError(() =>
        repository.issues.createLocal({
          identity: issueMutationIdentity('caller-a', 'cross-parent'),
          input: {
            executionHostId: 'ssh:remote',
            title: 'Invalid child',
            parentId: localParent.id
          }
        })
      )
    ).toMatchObject({ code: 'parent_host_mismatch' })
    expect(repository.issues.list()).toHaveLength(2)
    expect(receiptExists(repository, 'cross-parent')).toBe(false)

    const conversation = createConversation(repository, 'conversation', null)
    const revisionsBefore = getIssueHostRevisions(repository.database, 'local')
    expect(() =>
      repository.conversations.bindIssue({
        identity: issueMutationIdentity('caller-a', 'cross-bind'),
        input: {
          id: conversation.id,
          issueId: remoteIssue.id,
          expectedRecordRevision: conversation.recordRevision
        }
      })
    ).toThrow(/conversation_issue_host_mismatch/)
    expect(repository.conversations.get(conversation.id)).toMatchObject({
      issueId: null,
      recordRevision: 0
    })
    expect(getIssueHostRevisions(repository.database, 'local')).toEqual(revisionsBefore)
    expect(receiptExists(repository, 'cross-bind')).toBe(false)
    repository.close()
  })

  it('stores an external reference as a manual snapshot without provider state', () => {
    const repository = openRepository('external')
    const result = repository.issues.trackExternal({
      identity: issueMutationIdentity('caller-a', 'external-1'),
      input: {
        executionHostId: 'local',
        provider: 'gitlab',
        identifier: '#42',
        url: 'https://gitlab.example.test/group/project/-/issues/42',
        titleSnapshot: 'Manual snapshot'
      }
    })

    expect(result.issue).toMatchObject({
      localTitle: null,
      recordRevision: 0,
      source: {
        kind: 'external',
        provider: 'gitlab',
        identifier: '#42',
        titleSnapshot: 'Manual snapshot'
      }
    })
    const columns = repository.database.pragma('table_info(issues)') as { name: string }[]
    expect(columns.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining(['source_synced_at', 'source_refresh_error', 'native_parent_json'])
    )
    repository.close()
  })
})

function openRepository(suffix: string): IssueRepository {
  return IssueRepository.open({
    profileId: 'profile-a',
    userDataPath: createIssueTestUserDataPath(`orca-issues-${suffix}`)
  })
}

function createConversation(
  repository: IssueRepository,
  mutationId: string,
  issueId: string | null
) {
  return repository.conversations.create({
    identity: issueMutationIdentity('caller-a', mutationId),
    input: {
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
      workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
      agent: 'codex',
      issueId
    }
  }).conversation
}

function receiptCount(repository: IssueRepository): number {
  return (
    repository.database.prepare('SELECT COUNT(*) AS count FROM issue_mutation_receipts').get() as {
      count: number
    }
  ).count
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
