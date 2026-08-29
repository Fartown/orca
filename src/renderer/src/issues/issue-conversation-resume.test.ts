import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type { ConversationSummary } from '../../../shared/issues/types'

const mocks = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  nativeResume: vi.fn(),
  jump: vi.fn(),
  focusPending: vi.fn(),
  state: {
    activeWorktreeId: 'active-worktree',
    settings: { agentCmdOverrides: { codex: 'codex-local' } }
  },
  setActiveIssueRoute: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@/components/right-sidebar/ai-vault-provider-session-resolution', () => ({
  resolveAiVaultSessionByProviderIdentity: mocks.resolveSession
}))
vi.mock('@/components/right-sidebar/ai-vault-session-launch-actions', () => ({
  resumeAiVaultSession: mocks.nativeResume
}))
vi.mock('@/components/right-sidebar/ai-vault-session-launch-target', () => ({
  resolveAiVaultTargetWorkspacePath: vi.fn((state: { workspacePath?: string }) =>
    state.workspacePath === undefined ? '/workspace' : state.workspacePath
  )
}))
vi.mock('@/components/right-sidebar/ai-vault-original-pane-actions', () => ({
  jumpToAiVaultOriginalPane: mocks.jump
}))
vi.mock('./issue-conversation-pending-tab', () => ({
  focusPendingIssueConversationTab: mocks.focusPending
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mocks.state
  }
}))
vi.mock('@/issues/issues-domain-store', () => ({
  issueDomainStore: { getState: () => ({ setActiveIssueRoute: mocks.setActiveIssueRoute }) }
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

import {
  isIssueConversationResumePending,
  resumeIssueConversationWithAiVault,
  subscribeIssueConversationResumePending
} from './issue-conversation-resume'

beforeEach(() => {
  mocks.resolveSession.mockReset()
  mocks.nativeResume.mockReset()
  mocks.jump.mockReset()
  mocks.focusPending.mockReset()
  mocks.setActiveIssueRoute.mockReset()
  mocks.toastError.mockReset()
  mocks.state = {
    activeWorktreeId: 'active-worktree',
    settings: { agentCmdOverrides: { codex: 'codex-local' } }
  }
  mocks.resolveSession.mockResolvedValue(session())
  mocks.nativeResume.mockResolvedValue({
    launched: true,
    bookkeeping: { recorded: false }
  })
  mocks.jump.mockReturnValue('missing')
  mocks.focusPending.mockResolvedValue(null)
})

describe('resumeIssueConversationWithAiVault', () => {
  it('deduplicates concurrent row and icon clicks onto the existing AI Vault Resume chain', async () => {
    let finishNativeResume: (value: {
      launched: true
      bookkeeping: { recorded: false }
    }) => void = () => undefined
    mocks.nativeResume.mockReturnValue(
      new Promise((resolve) => {
        finishNativeResume = resolve
      })
    )
    const item = conversation()

    const rowClick = resumeIssueConversationWithAiVault('local', item)
    const iconClick = resumeIssueConversationWithAiVault('local', item)

    expect(rowClick).toBe(iconClick)
    expect(isIssueConversationResumePending('local', item.id)).toBe(true)
    await vi.waitFor(() => expect(mocks.resolveSession).toHaveBeenCalledTimes(1))
    expect(mocks.resolveSession).toHaveBeenCalledWith({
      executionHostId: 'local',
      agent: 'codex',
      providerSession: item.navigation!.providerSession,
      workspacePaths: ['/workspace']
    })
    await vi.waitFor(() => expect(mocks.nativeResume).toHaveBeenCalledTimes(1))
    expect(mocks.nativeResume).toHaveBeenCalledWith({
      session: session(),
      activeWorktreeId: 'active-worktree',
      targetWorktreeId: 'worktree-1',
      targetState: mocks.state,
      agentCmdOverrides: { codex: 'codex-local' }
    })
    expect(mocks.jump).toHaveBeenCalledTimes(2)
    finishNativeResume({ launched: true, bookkeeping: { recorded: false } })
    await expect(rowClick).resolves.toBe(true)
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('publishes one shared pending state for every rendered entry point', async () => {
    mocks.nativeResume.mockResolvedValue({
      launched: false,
      bookkeeping: { recorded: false }
    })
    const listener = vi.fn()
    const unsubscribe = subscribeIssueConversationResumePending(listener)
    const item = conversation()

    expect(isIssueConversationResumePending('local', item.id)).toBe(false)
    const resume = resumeIssueConversationWithAiVault('local', item)
    expect(isIssueConversationResumePending('local', item.id)).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)

    await expect(resume).resolves.toBe(false)
    expect(isIssueConversationResumePending('local', item.id)).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('focuses an existing pane without launching another provider session', async () => {
    mocks.jump.mockReturnValue('focused')

    await expect(resumeIssueConversationWithAiVault('local', conversation())).resolves.toBe(true)

    expect(mocks.resolveSession).not.toHaveBeenCalled()
    expect(mocks.nativeResume).not.toHaveBeenCalled()
    expect(mocks.jump).toHaveBeenCalledTimes(1)
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('focuses the shared launch-gap tab instead of starting a duplicate Resume', async () => {
    mocks.focusPending.mockResolvedValue('focused-pane')

    await expect(resumeIssueConversationWithAiVault('local', conversation())).resolves.toBe(true)

    expect(mocks.focusPending).toHaveBeenCalledWith('conversation-1', 'local')
    expect(mocks.resolveSession).not.toHaveBeenCalled()
    expect(mocks.nativeResume).not.toHaveBeenCalled()
  })

  it('allows an immediate retry when the native AI Vault resume reports failure', async () => {
    mocks.nativeResume.mockResolvedValue({
      launched: false,
      bookkeeping: { recorded: false }
    })
    const item = conversation()

    await expect(resumeIssueConversationWithAiVault('local', item)).resolves.toBe(false)
    await expect(resumeIssueConversationWithAiVault('local', item)).resolves.toBe(false)

    expect(mocks.resolveSession).toHaveBeenCalledTimes(2)
    expect(mocks.nativeResume).toHaveBeenCalledTimes(2)
  })

  it('rechecks the shared resolver after the AI Vault scan and skips a raced duplicate launch', async () => {
    mocks.jump.mockReturnValueOnce('missing').mockReturnValueOnce('focused')

    await expect(resumeIssueConversationWithAiVault('local', conversation())).resolves.toBe(true)

    expect(mocks.resolveSession).toHaveBeenCalledTimes(1)
    expect(mocks.nativeResume).not.toHaveBeenCalled()
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('uses the current Workspace target state after an asynchronous AI Vault scan', async () => {
    let finishScan: (value: AiVaultSession) => void = () => undefined
    mocks.resolveSession.mockReturnValue(
      new Promise((resolve) => {
        finishScan = resolve
      })
    )

    const resume = resumeIssueConversationWithAiVault('local', conversation())
    await vi.waitFor(() => expect(mocks.resolveSession).toHaveBeenCalledOnce())
    mocks.state = {
      activeWorktreeId: 'new-active-worktree',
      settings: { agentCmdOverrides: { codex: 'codex-after-scan' } }
    }
    finishScan(session())

    await vi.waitFor(() => expect(mocks.nativeResume).toHaveBeenCalledOnce())
    expect(mocks.nativeResume).toHaveBeenCalledWith({
      session: session(),
      activeWorktreeId: 'new-active-worktree',
      targetWorktreeId: 'worktree-1',
      targetState: mocks.state,
      agentCmdOverrides: { codex: 'codex-after-scan' }
    })
    await expect(resume).resolves.toBe(true)
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('scans the current Workspace path instead of a stale persisted snapshot', async () => {
    mocks.state = {
      ...mocks.state,
      workspacePath: '/workspace/moved'
    } as typeof mocks.state
    mocks.nativeResume.mockResolvedValue({
      launched: false,
      bookkeeping: { recorded: false }
    })

    const resume = resumeIssueConversationWithAiVault('local', conversation())
    await vi.waitFor(() => expect(mocks.resolveSession).toHaveBeenCalledOnce())

    expect(mocks.resolveSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspacePaths: ['/workspace/moved', '/workspace'] })
    )
    await expect(resume).resolves.toBe(false)
  })

  it('settles when the native Resume queues the target instead of inventing a second pane wait', async () => {
    await expect(resumeIssueConversationWithAiVault('ssh:build', conversation())).resolves.toBe(
      true
    )

    expect(mocks.nativeResume).toHaveBeenCalledOnce()
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
    expect(isIssueConversationResumePending('ssh:build', 'conversation-1')).toBe(false)
  })
})

function session(): AiVaultSession {
  return {
    id: 'local:codex:session-1',
    executionHostId: 'local',
    agent: 'codex',
    sessionId: 'session-1',
    title: 'Resume me',
    cwd: '/workspace',
    branch: null,
    model: null,
    filePath: '/sessions/session-1.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-08-29T00:00:00.000Z',
    messageCount: 2,
    totalTokens: 1,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'codex resume session-1',
    subagent: null
  }
}

function conversation(): ConversationSummary {
  return {
    id: 'conversation-1',
    hostPartitionKey: 'local',
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex',
    title: null,
    issueId: null,
    recordRevision: 0,
    launchFailure: null,
    createdAt: 1,
    updatedAt: 1,
    effectiveProjectRef: null,
    attachment: { kind: 'detached' },
    resumability: 'resumable',
    executionState: 'stopped',
    workspaceAvailability: 'available',
    unresolvedRoundCount: 0,
    latestRound: null,
    navigation: {
      paneKey: null,
      providerSession: { key: 'session_id', id: 'session-1' },
      resumeLocator: null
    }
  }
}
