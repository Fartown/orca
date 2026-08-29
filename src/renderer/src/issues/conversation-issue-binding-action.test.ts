import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../../shared/issues/types'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refreshConversations: vi.fn(),
  refreshIssues: vi.fn(),
  filter: 'needs-me' as const
}))

vi.mock('./issue-runtime-client', () => ({
  IssueRuntimeClient: {
    forRoute: vi.fn(() => ({
      mutate: mocks.mutate,
      listIssues: vi.fn(),
      listConversations: vi.fn()
    }))
  }
}))

vi.mock('./IssueDomainSyncGate', () => ({
  refreshConversationPages: mocks.refreshConversations,
  refreshIssuePages: mocks.refreshIssues
}))

vi.mock('./issues-domain-store', () => ({
  issueDomainStore: { getState: () => ({ filter: mocks.filter }) }
}))

import {
  loadActiveIssueBindingOptions,
  updateConversationIssueBinding
} from './conversation-issue-binding-action'

describe('Conversation Issue binding action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutate.mockResolvedValue(undefined)
    mocks.refreshConversations.mockResolvedValue(undefined)
    mocks.refreshIssues.mockResolvedValue(undefined)
  })

  it('loads every active Issue on demand for the Workspace picker', async () => {
    await loadActiveIssueBindingOptions('runtime:paired')

    expect(mocks.refreshIssues).toHaveBeenCalledWith(
      expect.anything(),
      'runtime:paired',
      'all',
      1,
      expect.objectContaining({ current: 1 })
    )
  })

  it('uses the existing bind mutation and refreshes Conversation and Issue projections', async () => {
    const item = conversation()

    await updateConversationIssueBinding({
      route: 'local',
      conversation: item,
      issueId: 'issue-2'
    })

    expect(mocks.mutate).toHaveBeenCalledWith('conversations.bindIssue', {
      mutationId: expect.any(String),
      conversationId: item.id,
      issueId: 'issue-2',
      expectedRecordRevision: item.recordRevision
    })
    expect(mocks.refreshConversations).toHaveBeenCalledTimes(1)
    expect(mocks.refreshIssues).toHaveBeenCalledTimes(2)
    expect(mocks.refreshIssues.mock.calls.map((call) => call[2])).toEqual(['all', 'needs-me'])
  })

  it('does not refresh or hide a stale-write rejection', async () => {
    mocks.mutate.mockRejectedValue(new Error('conversation changed before this mutation'))

    await expect(
      updateConversationIssueBinding({
        route: 'local',
        conversation: conversation(),
        issueId: null
      })
    ).rejects.toThrow(/changed before this mutation/i)

    expect(mocks.refreshConversations).not.toHaveBeenCalled()
    expect(mocks.refreshIssues).not.toHaveBeenCalled()
  })

  it('keeps a successful mutation successful when the follow-up projection refresh fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.refreshConversations.mockRejectedValue(new Error('temporary refresh failure'))

    await expect(
      updateConversationIssueBinding({
        route: 'local',
        conversation: conversation(),
        issueId: 'issue-2'
      })
    ).resolves.toBeUndefined()

    expect(warning).toHaveBeenCalledWith(
      '[issues] binding saved but projection refresh failed',
      expect.any(Error)
    )
    warning.mockRestore()
  })
})

function conversation(): ConversationSummary {
  return {
    id: 'conversation-1',
    hostPartitionKey: 'local',
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex',
    title: 'Conversation',
    issueId: 'issue-1',
    recordRevision: 4,
    launchFailure: null,
    createdAt: 1,
    updatedAt: 2,
    effectiveProjectRef: null,
    attachment: { kind: 'attached', paneKey: 'tab:leaf', tabId: 'tab' },
    resumability: 'resumable',
    executionState: 'running',
    workspaceAvailability: 'available',
    unresolvedRoundCount: 0,
    latestRound: null,
    navigation: {
      paneKey: 'tab:leaf',
      providerSession: { key: 'session_id', id: 'thread-1' },
      resumeLocator: null
    }
  }
}
