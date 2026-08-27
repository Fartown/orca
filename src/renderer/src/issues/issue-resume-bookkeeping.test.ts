import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('./issue-runtime-client', () => ({
  IssueRuntimeClient: { forRoute: () => ({ mutate: mocks.mutate }) },
  IssueRuntimeUnsupportedError: class IssueRuntimeUnsupportedError extends Error {}
}))

import { recordResumedConversation } from './issue-resume-bookkeeping'

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
    mocks.mutate.mockResolvedValue({})

    await expect(recordResumedConversation(args)).resolves.toEqual({ recorded: true })
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
})
