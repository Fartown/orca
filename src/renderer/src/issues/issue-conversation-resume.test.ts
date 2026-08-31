import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../shared/ai-vault-types'
import type { ConversationSummary } from '../../../shared/issues/types'

const mocks = vi.hoisted(() => ({
  resolveSession: vi.fn(),
  nativeResume: vi.fn(),
  jump: vi.fn(),
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
vi.mock('@/components/right-sidebar/ai-vault-original-pane-actions', () => ({
  jumpToAiVaultOriginalPane: mocks.jump
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => mocks.state }
}))
vi.mock('@/issues/issues-domain-store', () => ({
  issueDomainStore: { getState: () => ({ setActiveIssueRoute: mocks.setActiveIssueRoute }) }
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

import { resumeIssueConversationWithAiVault } from './issue-conversation-resume'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveSession.mockResolvedValue(session())
  mocks.nativeResume.mockResolvedValue(true)
  mocks.jump.mockReturnValue('missing')
})

describe('resumeIssueConversationWithAiVault', () => {
  it('resolves the real AI Vault session by the persisted provider identity', async () => {
    const item = conversation()

    await expect(resumeIssueConversationWithAiVault('ssh:build', item)).resolves.toBe(true)

    expect(mocks.resolveSession).toHaveBeenCalledWith({
      executionHostId: 'ssh:build',
      agent: 'codex',
      providerSession: { key: 'session_id', id: 'session-1' },
      workspacePaths: ['/workspace']
    })
    expect(mocks.jump).toHaveBeenCalledWith(session(), { notifyWhenMissing: false })
    expect(mocks.nativeResume).toHaveBeenCalledWith({
      session: session(),
      activeWorktreeId: 'active-worktree',
      targetWorktreeId: 'worktree-1',
      targetState: mocks.state,
      agentCmdOverrides: { codex: 'codex-local' }
    })
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('jumps to an existing native pane without launching another Resume', async () => {
    mocks.jump.mockReturnValue('focused')

    await expect(resumeIssueConversationWithAiVault('local', conversation())).resolves.toBe(true)

    expect(mocks.resolveSession).toHaveBeenCalledOnce()
    expect(mocks.nativeResume).not.toHaveBeenCalled()
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('keeps the Issue open when lookup, Jump, or native Resume fails', async () => {
    mocks.resolveSession.mockResolvedValueOnce(null)
    await expect(resumeIssueConversationWithAiVault('local', conversation())).resolves.toBe(false)

    mocks.resolveSession.mockResolvedValueOnce(session())
    mocks.jump.mockReturnValueOnce('workspace-unavailable')
    await expect(resumeIssueConversationWithAiVault('local', conversation())).resolves.toBe(false)

    mocks.resolveSession.mockResolvedValueOnce(session())
    mocks.jump.mockReturnValueOnce('missing')
    mocks.nativeResume.mockResolvedValueOnce(false)
    await expect(resumeIssueConversationWithAiVault('local', conversation())).resolves.toBe(false)

    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalled()
  })

  it('uses the persisted folder Workspace key for native Resume', async () => {
    await expect(
      resumeIssueConversationWithAiVault(
        'local',
        conversation({ workspaceRef: { type: 'folder', folderWorkspaceId: 'folder-1' } })
      )
    ).resolves.toBe(true)

    expect(mocks.nativeResume).toHaveBeenCalledWith(
      expect.objectContaining({ targetWorktreeId: 'folder:folder-1' })
    )
  })

  it('rejects an identity-less record without scanning AI Vault', async () => {
    const item = conversation({
      navigation: { paneKey: null, providerSession: null, resumeLocator: null }
    })

    await expect(resumeIssueConversationWithAiVault('local', item)).resolves.toBe(false)
    expect(mocks.resolveSession).not.toHaveBeenCalled()
    expect(mocks.nativeResume).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('This Conversation cannot be resumed.')
  })
})

function session(): AiVaultSession {
  return {
    id: 'ssh:build:codex:session-1',
    executionHostId: 'ssh:build',
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

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'conversation-1',
    hostPartitionKey: 'local',
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex',
    title: 'Named Conversation',
    issueId: 'issue-1',
    recordRevision: 1,
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
    },
    ...overrides
  }
}
