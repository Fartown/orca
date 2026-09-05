import { describe, expect, it } from 'vitest'
import { createIssueTestUserDataPath } from './issue-database.test-environment'
import { IssueRepository, issueMutationIdentity } from './issue-repository'

function openRepository(suffix: string): IssueRepository {
  return IssueRepository.open({
    profileId: 'profile-a',
    userDataPath: createIssueTestUserDataPath(`orca-title-${suffix}`)
  })
}

function createConversation(repository: IssueRepository, mutationId: string) {
  return repository.conversations.create({
    identity: issueMutationIdentity('caller-a', mutationId),
    input: {
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
      workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
      agent: 'claude',
      issueId: null
    }
  }).conversation
}

describe('conversation title lifecycle', () => {
  it('stores Provider follow in its own snapshot slot', () => {
    const repository = openRepository('follow')
    const created = createConversation(repository, 'create')
    expect(created.title).toBeNull()
    expect(created.providerTitle).toBeNull()

    const followed = repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: created.id,
        expectedRecordRevision: created.recordRevision,
        title: 'Fix the flaky sidebar test'
      })
    )
    expect(followed.outcome).toBe('written')
    expect(followed.conversation.title).toBeNull()
    expect(followed.conversation.titleSource).toBeNull()
    expect(followed.conversation.providerTitle).toBe('Fix the flaky sidebar test')

    const replay = repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: created.id,
        expectedRecordRevision: followed.conversation.recordRevision,
        title: 'Fix the flaky sidebar test'
      })
    )
    expect(replay.outcome).toBe('unchanged')
    repository.close()
  })

  it('keeps refreshing the Provider snapshot under Rename and restores it on Clear', () => {
    const repository = openRepository('override')
    const created = createConversation(repository, 'create')
    const provider = repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: created.id,
        expectedRecordRevision: created.recordRevision,
        title: 'Provider name'
      })
    ).conversation
    const renamed = repository.conversations.updateTitle({
      identity: issueMutationIdentity('caller-a', 'rename'),
      input: { id: created.id, expectedRecordRevision: provider.recordRevision, title: 'My name' }
    }).conversation
    expect(renamed.title).toBe('My name')
    expect(renamed.titleSource).toBe('user')
    expect(renamed.providerTitle).toBe('Provider name')

    const refreshed = repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: created.id,
        expectedRecordRevision: renamed.recordRevision,
        title: 'New Provider name'
      })
    ).conversation
    expect(refreshed.title).toBe('My name')
    expect(refreshed.providerTitle).toBe('New Provider name')

    const cleared = repository.conversations.updateTitle({
      identity: issueMutationIdentity('caller-a', 'clear'),
      input: { id: created.id, expectedRecordRevision: refreshed.recordRevision, title: null }
    }).conversation
    expect(cleared.title).toBeNull()
    expect(cleared.titleSource).toBeNull()
    expect(cleared.providerTitle).toBe('New Provider name')
    repository.close()
  })

  it('rejects a stale Provider snapshot write without touching a Rename', () => {
    const repository = openRepository('stale')
    const created = createConversation(repository, 'create')
    repository.conversations.updateTitle({
      identity: issueMutationIdentity('caller-a', 'rename'),
      input: {
        id: created.id,
        expectedRecordRevision: created.recordRevision,
        title: 'User won'
      }
    })
    expect(() =>
      repository.database.transaction(() =>
        repository.conversations.applyProviderTitleWithinTransaction({
          id: created.id,
          expectedRecordRevision: created.recordRevision,
          title: 'Stale Provider value'
        })
      )
    ).toThrowError()
    expect(repository.conversations.get(created.id)).toMatchObject({
      title: 'User won',
      providerTitle: null
    })
    repository.close()
  })
})
