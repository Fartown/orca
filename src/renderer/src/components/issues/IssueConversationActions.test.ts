import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONVERSATION_LAUNCH_CLAIM_TTL_MS } from '../../../../shared/issues/constants'
import type { AuthorityExecutionHostId, ConversationSummary } from '../../../../shared/issues/types'

type LaunchObserverState = {
  tabsByWorktree: Record<string, { id: string }[]>
  agentStatusByPaneKey: Record<
    string,
    { paneKey: string; tabId?: string; providerSession?: { key: 'session_id'; id: string } }
  >
  sleepingAgentSessionsByPaneKey: Record<
    string,
    { tabId?: string; providerSession: { key: 'session_id'; id: string } }
  >
}

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  launch: vi.fn(),
  revealWorkspace: vi.fn(),
  registerPending: vi.fn(),
  toastError: vi.fn(),
  pendingReleases: [] as ReturnType<typeof vi.fn>[],
  storeState: {
    tabsByWorktree: {} as Record<string, { id: string }[]>,
    agentStatusByPaneKey: {} as LaunchObserverState['agentStatusByPaneKey'],
    sleepingAgentSessionsByPaneKey: {} as LaunchObserverState['sleepingAgentSessionsByPaneKey']
  },
  storeListeners: [] as ((state: LaunchObserverState) => void)[]
}))

vi.mock('@/issues/issue-runtime-client', () => ({
  IssueRuntimeClient: {
    forRoute: vi.fn(() => ({ mutate: mocks.mutate }))
  }
}))

vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: mocks.launch
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))
vi.mock('@/issues/issue-conversation-navigation', () => ({
  revealIssueConversationWorkspace: mocks.revealWorkspace
}))
vi.mock('@/issues/issue-conversation-pending-tab', () => ({
  registerPendingIssueConversationTab: mocks.registerPending
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mocks.storeState,
    subscribe: (listener: (state: LaunchObserverState) => void) => {
      mocks.storeListeners.push(listener)
      return () => {
        const index = mocks.storeListeners.indexOf(listener)
        if (index !== -1) {
          mocks.storeListeners.splice(index, 1)
        }
      }
    }
  }
}))

import {
  prepareAndLaunchIssueConversation,
  retryIssueConversation
} from './issue-conversation-launch-action'

beforeEach(() => {
  mocks.mutate.mockReset()
  mocks.launch.mockReset()
  mocks.revealWorkspace.mockReset()
  mocks.registerPending.mockReset()
  mocks.toastError.mockReset()
  mocks.pendingReleases.length = 0
  mocks.registerPending.mockImplementation(() => {
    const release = vi.fn()
    mocks.pendingReleases.push(release)
    return release
  })
  mocks.storeState.tabsByWorktree = { 'worktree-local': [{ id: 'new-tab' }] }
  mocks.storeState.agentStatusByPaneKey = {}
  mocks.storeState.sleepingAgentSessionsByPaneKey = {}
  mocks.storeListeners.length = 0
})

afterEach(() => {
  mocks.storeState.agentStatusByPaneKey = {
    'new-tab:leaf': {
      paneKey: 'new-tab:leaf',
      tabId: 'new-tab',
      providerSession: { key: 'session_id', id: 'confirmed-session' }
    }
  }
  emitStoreChange()
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
      message: 'The selected agent could not be launched.',
      failureNotified: false
    })

    expect(persistedFailures).toEqual([
      expect.objectContaining({
        conversationId: preparation().conversation.id,
        claimId: preparation().claimId,
        expectedRecordRevision: 0,
        failure: 'The selected agent could not be launched.'
      })
    ])
    expect(mocks.revealWorkspace).not.toHaveBeenCalled()
  })

  it('reveals the created terminal instead of leaving the Issue overlay open', async () => {
    mocks.mutate.mockResolvedValueOnce(preparation())
    mocks.launch.mockReturnValue({ tabId: 'new-tab' })

    await expect(prepareAndLaunchIssueConversation(launchInput())).resolves.toEqual({
      status: 'launched'
    })

    expect(mocks.revealWorkspace).toHaveBeenCalledWith('worktree-local', 'local')
    expect(mocks.registerPending).toHaveBeenCalledWith({
      route: 'local',
      conversationId: preparation().conversation.id,
      workspaceKey: 'worktree-local',
      tabId: 'new-tab'
    })
  })

  it('keeps the renderer runtime route instead of substituting its local authority', async () => {
    mocks.mutate.mockResolvedValueOnce(preparation())
    mocks.launch.mockReturnValue({ tabId: 'new-tab' })

    await expect(
      prepareAndLaunchIssueConversation({ ...launchInput(), route: 'runtime:paired' })
    ).resolves.toEqual({ status: 'launched' })

    expect(mocks.revealWorkspace).toHaveBeenCalledWith('worktree-local', 'runtime:paired')
    expect(mocks.registerPending).toHaveBeenCalledWith({
      route: 'runtime:paired',
      conversationId: preparation().conversation.id,
      workspaceKey: 'worktree-local',
      tabId: 'new-tab'
    })
  })

  it('reuses the existing prepareRetry and launcher chain for an unconfirmed Conversation', async () => {
    const onChanged = vi.fn()
    mocks.mutate.mockResolvedValueOnce(preparation())
    mocks.launch.mockReturnValue({ tabId: 'new-tab' })

    await expect(retryIssueConversation('local', retryableConversation(), onChanged)).resolves.toBe(
      true
    )

    expect(mocks.mutate).toHaveBeenCalledWith(
      'conversations.prepareRetry',
      expect.objectContaining({
        conversationId: preparation().conversation.id,
        expectedRecordRevision: 0,
        launchToken: expect.any(String)
      })
    )
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        worktreeId: 'worktree-local',
        launchToken: expect.any(String)
      })
    )
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('persists failure when a local terminal closes before any agent hook confirms it', async () => {
    mocks.mutate.mockResolvedValueOnce(preparation()).mockResolvedValueOnce(undefined)
    mocks.launch.mockReturnValue({ tabId: 'new-tab' })

    await expect(prepareAndLaunchIssueConversation(launchInput())).resolves.toEqual({
      status: 'launched'
    })
    mocks.storeState.tabsByWorktree = { 'worktree-local': [] }
    emitStoreChange()

    await vi.waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2))
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      'conversations.recordLaunchFailure',
      expect.objectContaining({
        conversationId: preparation().conversation.id,
        claimId: preparation().claimId,
        failure: 'The terminal closed before the agent session was confirmed.'
      })
    )
  })

  it('stops watching after a matching hook confirms the launched session', async () => {
    vi.useFakeTimers()
    mocks.mutate.mockResolvedValueOnce(preparation())
    mocks.launch.mockReturnValue({ tabId: 'new-tab' })

    try {
      await prepareAndLaunchIssueConversation(launchInput())
      mocks.storeState.agentStatusByPaneKey = {
        'new-tab:leaf': {
          paneKey: 'new-tab:leaf',
          tabId: 'new-tab',
          providerSession: { key: 'session_id', id: 'confirmed-session' }
        }
      }
      emitStoreChange()
      mocks.storeState.tabsByWorktree = { 'worktree-local': [] }
      emitStoreChange()
      await vi.advanceTimersByTimeAsync(CONVERSATION_LAUNCH_CLAIM_TTL_MS)

      expect(mocks.mutate).toHaveBeenCalledTimes(1)
      expect(mocks.storeListeners).toHaveLength(0)
      expect(mocks.pendingReleases[0]).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('persists failure when a local launch times out without success evidence', async () => {
    vi.useFakeTimers()
    mocks.mutate.mockResolvedValueOnce(preparation()).mockResolvedValueOnce(undefined)
    mocks.launch.mockReturnValue({ tabId: 'new-tab' })

    try {
      await prepareAndLaunchIssueConversation(launchInput())
      await vi.advanceTimersByTimeAsync(CONVERSATION_LAUNCH_CLAIM_TTL_MS)

      expect(mocks.mutate).toHaveBeenLastCalledWith(
        'conversations.recordLaunchFailure',
        expect.objectContaining({
          conversationId: preparation().conversation.id,
          claimId: preparation().claimId,
          failure: 'The agent session did not start before the launch timeout.'
        })
      )
      expect(mocks.pendingReleases[0]).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not report remote process death when an unconfirmed SSH tab disappears', async () => {
    mocks.mutate.mockResolvedValueOnce(
      preparation({ executionHostId: 'ssh:build', hostPartitionKey: 'ssh:build' })
    )
    mocks.launch.mockReturnValue({ tabId: 'new-tab' })

    await prepareAndLaunchIssueConversation({ ...launchInput(), route: 'ssh:build' })
    mocks.storeState.tabsByWorktree = { 'worktree-local': [] }
    emitStoreChange()

    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    expect(mocks.pendingReleases[0]).toHaveBeenCalledTimes(1)
  })

  it('persists an asynchronous paired-host launch failure', async () => {
    mocks.mutate.mockResolvedValueOnce(preparation()).mockResolvedValueOnce(undefined)
    mocks.launch.mockReturnValue({
      tabId: null,
      runtimeLaunchResult: Promise.resolve({
        launched: false,
        delivered: false,
        failureNotified: true,
        message: 'remote host rejected launch'
      })
    })

    await expect(prepareAndLaunchIssueConversation(launchInput())).resolves.toEqual({
      status: 'launcher-failed',
      message: 'remote host rejected launch',
      failureNotified: true
    })
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      'conversations.recordLaunchFailure',
      expect.objectContaining({ failure: 'remote host rejected launch' })
    )
  })

  it('normalizes an empty launcher error before persisting it', async () => {
    mocks.mutate.mockResolvedValueOnce(preparation()).mockResolvedValueOnce(undefined)
    mocks.launch.mockImplementation(() => {
      throw new Error('   ')
    })

    await expect(prepareAndLaunchIssueConversation(launchInput())).resolves.toEqual({
      status: 'launcher-failed',
      message: 'The selected agent could not be launched.',
      failureNotified: false
    })
    expect(mocks.mutate).toHaveBeenLastCalledWith(
      'conversations.recordLaunchFailure',
      expect.objectContaining({ failure: 'The selected agent could not be launched.' })
    )
  })
})

function emitStoreChange(): void {
  for (const listener of mocks.storeListeners.slice()) {
    listener(mocks.storeState)
  }
}

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

function preparation(
  overrides: Partial<{
    executionHostId: AuthorityExecutionHostId
    hostPartitionKey: AuthorityExecutionHostId
  }> = {}
) {
  return {
    conversation: {
      id: '11111111-1111-4111-8111-111111111111',
      hostPartitionKey: overrides.hostPartitionKey ?? ('local' as const),
      executionHostId: overrides.executionHostId ?? ('local' as const),
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

function retryableConversation(): ConversationSummary {
  return {
    ...preparation().conversation,
    effectiveProjectRef: null,
    attachment: { kind: 'detached' },
    resumability: 'unavailable',
    executionState: 'stopped',
    workspaceAvailability: 'available',
    unresolvedRoundCount: 0,
    latestRound: null,
    navigation: { paneKey: null, providerSession: null, resumeLocator: null }
  }
}
