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
  it('mints once, follows provider renames, and re-reads a fresh record', () => {
    const repository = openRepository('follow')
    const created = createConversation(repository, 'create')
    expect(created.title).toBeNull()

    const minted = repository.database.transaction(() =>
      repository.conversations.mintTitleWithinTransaction({
        id: created.id,
        sessionId: 'a1b2c3d4-uuid'
      })
    )
    expect(minted.outcome).toBe('written')
    expect(minted.conversation.title).toBe('Claude a1b2c3d4')
    expect(minted.conversation.titleSource).toBe('minted')
    expect(minted.conversation.recordRevision).toBe(created.recordRevision + 1)

    // Re-attach (replay) must not re-mint.
    const replay = repository.database.transaction(() =>
      repository.conversations.mintTitleWithinTransaction({
        id: created.id,
        sessionId: 'a1b2c3d4-uuid'
      })
    )
    expect(replay.outcome).toBe('unchanged')

    const followed = repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: created.id,
        expectedRecordRevision: minted.conversation.recordRevision,
        title: 'Fix the flaky sidebar test'
      })
    )
    expect(followed.outcome).toBe('written')
    expect(followed.conversation.title).toBe('Fix the flaky sidebar test')
    expect(followed.conversation.titleSource).toBe('provider')

    const revised = repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: created.id,
        expectedRecordRevision: followed.conversation.recordRevision,
        title: 'Fix sidebar flake for good'
      })
    )
    expect(revised.outcome).toBe('written')
    repository.close()
  })

  it('freezes a manual rename against provider follow; clearing re-opens it', () => {
    const repository = openRepository('freeze')
    const created = createConversation(repository, 'create')
    const renamed = repository.conversations.updateTitle({
      identity: issueMutationIdentity('caller-a', 'rename'),
      input: { id: created.id, expectedRecordRevision: created.recordRevision, title: 'My name' }
    }).conversation
    expect(renamed.title).toBe('My name')
    expect(renamed.titleSource).toBe('user')

    const rejected = repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: created.id,
        expectedRecordRevision: renamed.recordRevision,
        title: 'AI name'
      })
    )
    expect(rejected.outcome).toBe('rejected')
    expect(rejected.conversation.title).toBe('My name')

    const cleared = repository.conversations.updateTitle({
      identity: issueMutationIdentity('caller-a', 'clear'),
      input: { id: created.id, expectedRecordRevision: renamed.recordRevision, title: null }
    }).conversation
    expect(cleared.title).toBeNull()
    expect(cleared.titleSource).toBeNull()

    const followedAgain = repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: created.id,
        expectedRecordRevision: cleared.recordRevision,
        title: 'AI name'
      })
    )
    expect(followedAgain.outcome).toBe('written')
    repository.close()
  })

  it('promotes source on identical text and bumps the record revision', () => {
    const repository = openRepository('source-only')
    const created = createConversation(repository, 'create')
    const minted = repository.database.transaction(() =>
      repository.conversations.mintTitleWithinTransaction({
        id: created.id,
        sessionId: 'a1b2c3d4'
      })
    )
    const promoted = repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: created.id,
        expectedRecordRevision: minted.conversation.recordRevision,
        title: 'Claude a1b2c3d4'
      })
    )
    expect(promoted.outcome).toBe('written')
    expect(promoted.conversation.titleSource).toBe('provider')
    expect(promoted.conversation.recordRevision).toBe(minted.conversation.recordRevision + 1)
    repository.close()
  })

  it('stale revisions from a concurrent rename throw and leave the row intact', () => {
    const repository = openRepository('stale')
    const created = createConversation(repository, 'create')
    const minted = repository.database.transaction(() =>
      repository.conversations.mintTitleWithinTransaction({ id: created.id, sessionId: 'aaaa1111' })
    )
    repository.conversations.updateTitle({
      identity: issueMutationIdentity('caller-a', 'rename'),
      input: {
        id: created.id,
        expectedRecordRevision: minted.conversation.recordRevision,
        title: 'User won'
      }
    })
    expect(() =>
      repository.database.transaction(() =>
        repository.conversations.applyProviderTitleWithinTransaction({
          id: created.id,
          expectedRecordRevision: minted.conversation.recordRevision,
          title: 'Provider lost'
        })
      )
    ).toThrowError()
    expect(repository.conversations.get(created.id)?.title).toBe('User won')
    repository.close()
  })
})
