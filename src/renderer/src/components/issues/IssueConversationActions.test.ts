import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  launch: vi.fn(),
  revealWorkspace: vi.fn()
}))

vi.mock('@/issues/issue-runtime-client', () => ({
  IssueRuntimeClient: {
    forRoute: vi.fn(() => ({ mutate: mocks.mutate }))
  }
}))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: mocks.launch
}))
vi.mock('@/issues/issue-conversation-navigation', () => ({
  revealIssueConversationWorkspace: mocks.revealWorkspace
}))

import { prepareAndLaunchIssueConversation } from './issue-conversation-launch-action'

beforeEach(() => {
  mocks.mutate.mockReset()
  mocks.launch.mockReset()
  mocks.revealWorkspace.mockReset()
})

describe('Issue Conversation native launch adapter', () => {
  it('prepares the claim before invoking the existing Workspace launcher', async () => {
    mocks.mutate.mockResolvedValue({ disposition: 'created' })
    mocks.launch.mockReturnValue({ tabId: 'new-tab' })
    mocks.revealWorkspace.mockResolvedValue(true)

    await expect(prepareAndLaunchIssueConversation(launchInput())).resolves.toEqual({
      status: 'launched'
    })

    expect(mocks.mutate).toHaveBeenCalledWith('conversations.prepareLaunch', {
      mutationId: 'mutation-1',
      launchToken: 'launch-token-1',
      workspaceRef: { type: 'worktree', worktreeId: 'worktree-local' },
      workspaceSnapshot: { name: 'Local Workspace', path: '/workspace/local' },
      agent: 'codex',
      issueId: 'issue-1'
    })
    expect(mocks.launch).toHaveBeenCalledWith({
      agent: 'codex',
      worktreeId: 'worktree-local',
      launchToken: 'launch-token-1'
    })
    expect(mocks.mutate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.launch.mock.invocationCallOrder[0]!
    )
    expect(mocks.revealWorkspace).toHaveBeenCalledWith('worktree-local', 'local')
  })

  it('does not launch when prepare validation fails', async () => {
    mocks.mutate.mockRejectedValue(new Error('conversation_issue_host_mismatch'))

    await expect(prepareAndLaunchIssueConversation(launchInput())).rejects.toThrow(
      'conversation_issue_host_mismatch'
    )
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.revealWorkspace).not.toHaveBeenCalled()
  })

  it('surfaces a synchronous native launcher rejection without recording Issue failure state', async () => {
    mocks.mutate.mockResolvedValue({ disposition: 'created' })
    mocks.launch.mockReturnValue(null)

    await expect(prepareAndLaunchIssueConversation(launchInput())).rejects.toThrow(
      'The selected agent could not be launched.'
    )
    expect(mocks.mutate).toHaveBeenCalledOnce()
    expect(mocks.revealWorkspace).not.toHaveBeenCalled()
  })

  it('preserves the routed host when revealing the native Workspace', async () => {
    mocks.mutate.mockResolvedValue({ disposition: 'created' })
    mocks.launch.mockReturnValue({ tabId: null })
    mocks.revealWorkspace.mockResolvedValue(true)

    await expect(
      prepareAndLaunchIssueConversation({ ...launchInput(), route: 'runtime:paired' })
    ).resolves.toEqual({ status: 'launched' })
    expect(mocks.revealWorkspace).toHaveBeenCalledWith('worktree-local', 'runtime:paired')
  })
})

function launchInput(): Parameters<typeof prepareAndLaunchIssueConversation>[0] {
  return {
    route: 'local',
    issueId: 'issue-1',
    workspace: {
      id: 'worktree-local',
      label: 'Local Workspace',
      path: '/workspace/local',
      ref: { type: 'worktree', worktreeId: 'worktree-local' }
    },
    agent: 'codex',
    launchToken: 'launch-token-1',
    mutationId: 'mutation-1'
  }
}
