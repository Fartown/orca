import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationLaunchPreparation } from '../../../shared/issues/types'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), observeLaunch: vi.fn() }))

vi.mock('./issue-runtime-client', () => ({
  IssueRuntimeClient: { forRoute: () => ({ mutate: mocks.mutate }) },
  IssueRuntimeUnsupportedError: class IssueRuntimeUnsupportedError extends Error {}
}))
vi.mock('./issue-conversation-launch-observer', () => ({
  observePreparedIssueConversationLocalLaunch: mocks.observeLaunch
}))

import {
  observeResumedConversationLocalLaunch,
  recordResumedConversation,
  recordResumedConversationLaunchFailure
} from './issue-resume-bookkeeping'

afterEach(() => {
  vi.clearAllMocks()
})

const args = {
  executionHostId: 'local' as const,
  launchToken: 'token-1',
  workspaceRef: { type: 'worktree' as const, worktreeId: 'repo::/tree' },
  workspaceSnapshot: { name: 'tree', path: '/tree' },
  agent: 'claude',
  providerSession: { sessionId: 's-1' } as never
}

describe('resume book-keeping', () => {
  it('records the resumed session when the route accepts it', async () => {
    const prepared = preparation()
    mocks.mutate.mockResolvedValue(prepared)

    await expect(recordResumedConversation(args)).resolves.toEqual({
      recorded: true,
      route: 'local',
      preparation: prepared
    })
    expect(mocks.mutate).toHaveBeenCalledWith(
      'conversations.prepareResume',
      expect.objectContaining({ launchToken: 'token-1', agent: 'claude' })
    )
  })

  // Why: Resume predates Issues and needs no database. Every failure below used to abort the
  // resume itself — an unsupported host was caught, everything else was rethrown.
  it.each([
    ['host does not support Issues', new Error('issue_runtime_unsupported')],
    ['Issue store cannot be opened', new Error('issue_storage_unavailable')],
    ['migration failed', new Error('issue_migration_failed')],
    ['route went offline', new TypeError('Failed to fetch')]
  ])('never throws when %s', async (_label, failure) => {
    mocks.mutate.mockRejectedValue(failure)

    await expect(recordResumedConversation(args)).resolves.toEqual({ recorded: false })
  })

  it('skips the call when the target workspace cannot be resolved', async () => {
    await expect(
      recordResumedConversation({ ...args, workspaceSnapshot: { name: 'tree', path: null } })
    ).resolves.toEqual({ recorded: false })
    await expect(recordResumedConversation({ ...args, executionHostId: null })).resolves.toEqual({
      recorded: false
    })
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('settles a prepared Resume through the existing launch-failure mutation', async () => {
    const prepared = preparation()
    mocks.mutate.mockResolvedValue(undefined)

    await expect(
      recordResumedConversationLaunchFailure(
        { recorded: true, route: 'local', preparation: prepared },
        'launcher failed'
      )
    ).resolves.toBeUndefined()

    expect(mocks.mutate).toHaveBeenCalledWith('conversations.recordLaunchFailure', {
      mutationId: expect.any(String),
      conversationId: 'conversation-1',
      claimId: 'claim-1',
      expectedRecordRevision: 3,
      failure: 'launcher failed'
    })
  })

  it('never lets failure settlement break the native Resume result', async () => {
    mocks.mutate.mockRejectedValue(new Error('route went offline'))

    await expect(
      recordResumedConversationLaunchFailure(
        { recorded: true, route: 'local', preparation: preparation() },
        'launcher failed'
      )
    ).resolves.toBeUndefined()
  })

  it('reuses the shared launch observer only for a recorded Resume', () => {
    const prepared = preparation()

    observeResumedConversationLocalLaunch(
      { recorded: true, route: 'local', preparation: prepared },
      { worktreeId: 'repo::/tree', tabId: 'tab-1' }
    )
    observeResumedConversationLocalLaunch(
      { recorded: false },
      { worktreeId: 'repo::/tree', tabId: 'tab-2' }
    )

    expect(mocks.observeLaunch).toHaveBeenCalledTimes(1)
    expect(mocks.observeLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ mutate: mocks.mutate }),
      prepared,
      'local',
      { worktreeId: 'repo::/tree', tabId: 'tab-1' }
    )
  })
})

function preparation(): ConversationLaunchPreparation {
  return {
    conversation: {
      id: 'conversation-1',
      hostPartitionKey: 'local',
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: 'repo::/tree' },
      workspaceSnapshot: { name: 'tree', path: '/tree' },
      agent: 'claude',
      title: null,
      issueId: 'issue-1',
      recordRevision: 3,
      launchFailure: null,
      createdAt: 1,
      updatedAt: 2
    },
    claimId: 'claim-1',
    disposition: 'replayed'
  }
}
