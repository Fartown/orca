import { afterEach, describe, expect, it } from 'vitest'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { getIssueDatabasePath } from './issue-database'
import { ProfileIssueProjectMoveGuard } from './issue-project-move-guard'
import { IssueRepository, issueMutationIdentity } from './issue-repository'
import SyncDatabase from '../sqlite/sync-database'

afterEach(removeIssueTestDirectories)

describe('ProfileIssueProjectMoveGuard', () => {
  it('reads matching worktree Conversations without mutating the profile DB', () => {
    const userDataPath = createIssueTestUserDataPath('orca-project-move-guard')
    const repository = IssueRepository.open({ profileId: 'profile-a', userDataPath })
    const conversation = repository.conversations.create({
      identity: issueMutationIdentity('caller-a', 'conversation'),
      input: {
        executionHostId: 'local',
        workspaceRef: { type: 'worktree', worktreeId: 'repo-1::/workspace/tree' },
        workspaceSnapshot: { name: 'tree', path: '/workspace/tree' },
        agent: 'codex',
        title: 'Managed work'
      }
    }).conversation
    const revisions = repository.database
      .prepare(
        "SELECT facts_revision, tree_revision FROM issue_host_state WHERE host_partition_key = 'local'"
      )
      .get()
    repository.close()

    const guard = new ProfileIssueProjectMoveGuard(userDataPath)
    expect(
      guard.findManagedConversationsForRepo({ profileId: 'profile-a', repoId: 'repo-1' })
    ).toEqual([
      {
        conversationId: conversation.id,
        workspaceRef: { type: 'worktree', worktreeId: 'repo-1::/workspace/tree' },
        title: 'Managed work'
      }
    ])
    expect(
      guard.findManagedConversationsForRepo({ profileId: 'profile-a', repoId: 'repo-2' })
    ).toEqual([])

    const raw = new SyncDatabase(getIssueDatabasePath('profile-a', userDataPath), {
      readonly: true,
      fileMustExist: true
    })
    expect(raw.pragma('user_version', { simple: true })).toBe(1)
    expect(
      raw
        .prepare(
          "SELECT facts_revision, tree_revision FROM issue_host_state WHERE host_partition_key = 'local'"
        )
        .get()
    ).toEqual(revisions)
    raw.close()
  })
})
