import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  launch: vi.fn()
}))

vi.mock('@/issues/issue-runtime-client', () => ({
  IssueRuntimeClient: {
    forRoute: vi.fn(() => ({ mutate: mocks.mutate }))
  }
}))

vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: mocks.launch
}))

import { prepareAndLaunchIssueConversation } from './issue-conversation-launch-action'

beforeEach(() => {
  mocks.mutate.mockReset()
  mocks.launch.mockReset()
})

describe('IssueConversationActions launch ordering', () => {
  it('does not invoke the launcher when prepare validation rejects', async () => {
    const launchedTabs: string[] = []
    mocks.mutate.mockRejectedValue(new Error('conversation_issue_host_mismatch'))
    mocks.launch.mockImplementation(() => {
      launchedTabs.push('unexpected-tab')
      return { tabId: 'unexpected-tab' }
    })

    await expect(prepareAndLaunchIssueConversation(launchInput())).rejects.toThrow(
      /conversation_issue_host_mismatch/
    )

    expect(mocks.mutate).toHaveBeenCalledWith(
      'conversations.prepareLaunch',
      expect.objectContaining({ issueId: 'issue-remote', launchToken: 'secret-launch-token' })
    )
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    expect(mocks.launch).toHaveBeenCalledTimes(0)
    expect(launchedTabs).toEqual([])
  })

  it('persists launcher failure before exposing Retry state', async () => {
    const persistedFailures: Record<string, unknown>[] = []
    mocks.mutate
      .mockResolvedValueOnce(preparation())
      .mockImplementationOnce(async (method: string, params: Record<string, unknown>) => {
        expect(method).toBe('conversations.recordLaunchFailure')
        persistedFailures.push(params)
        return preparation().conversation
      })
    mocks.launch.mockReturnValue(null)

    await expect(prepareAndLaunchIssueConversation(launchInput())).resolves.toEqual({
      status: 'launcher-failed',
      message: 'The selected agent could not be launched.'
    })

    expect(persistedFailures).toEqual([
      expect.objectContaining({
        conversationId: preparation().conversation.id,
        claimId: preparation().claimId,
        expectedRecordRevision: 0,
        failure: 'The selected agent could not be launched.'
      })
    ])
  })
})

function launchInput(): Parameters<typeof prepareAndLaunchIssueConversation>[0] {
  return {
    route: 'local',
    issueId: 'issue-remote',
    workspace: {
      id: 'worktree-local',
      label: 'Local Workspace',
      path: '/workspace/local',
      ref: { type: 'worktree', worktreeId: 'worktree-local' }
    },
    agent: 'codex',
    launchToken: 'secret-launch-token',
    mutationId: 'invalid-launch'
  }
}

function preparation() {
  return {
    conversation: {
      id: '11111111-1111-4111-8111-111111111111',
      hostPartitionKey: 'local' as const,
      executionHostId: 'local' as const,
      workspaceRef: { type: 'worktree' as const, worktreeId: 'worktree-local' },
      workspaceSnapshot: { name: 'Local Workspace', path: '/workspace/local' },
      agent: 'codex' as const,
      title: null,
      issueId: '22222222-2222-4222-8222-222222222222',
      recordRevision: 0,
      launchFailure: null,
      createdAt: 1,
      updatedAt: 1
    },
    claimId: '33333333-3333-4333-8333-333333333333',
    disposition: 'created' as const
  }
}
