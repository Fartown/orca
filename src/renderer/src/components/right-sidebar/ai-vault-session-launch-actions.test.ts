import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { AiVaultSessionResumeTargetState } from './ai-vault-session-resume'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  listSessions: vi.fn(),
  resolveTarget: vi.fn(),
  prepareSession: vi.fn(),
  buildStartup: vi.fn(),
  recordConversation: vi.fn(),
  recordFailure: vi.fn(),
  observeLaunch: vi.fn(),
  launch: vi.fn(),
  activateStructured: vi.fn(),
  activate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  state: { activeWorktreeId: 'worktree-current' }
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}))
vi.mock('@/lib/ai-vault-resume-command', () => ({
  buildAiVaultResumeCopyCommandForWorktree: vi.fn(() => 'codex resume session-1'),
  buildAiVaultResumeStartupForWorktree: (...args: unknown[]) => {
    mocks.events.push('build-startup')
    return mocks.buildStartup(...args)
  },
  getAiVaultAgentProviderSession: (session: AiVaultSession) => ({
    key: 'session_id',
    id: session.sessionId
  })
}))
vi.mock('@/lib/launch-ai-vault-session', () => ({
  launchAiVaultSessionInNewTab: (...args: unknown[]) => {
    mocks.events.push('launch')
    return mocks.launch(...args)
  }
}))
vi.mock('@/lib/activate-ai-vault-structured-session', () => ({
  activateAiVaultStructuredSession: (...args: unknown[]) => mocks.activateStructured(...args)
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => mocks.state }
}))
vi.mock('@/lib/ai-vault-resume-target', () => ({
  getAiVaultResumeWorkspaceExecutionHostId: vi.fn(() => 'ssh:build')
}))
vi.mock('@/lib/ai-vault-session-resume-preparation', () => ({
  prepareAiVaultSessionForResume: (...args: unknown[]) => {
    mocks.events.push('prepare')
    return mocks.prepareSession(...args)
  }
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('./ai-vault-session-filters', () => ({ agentLabel: () => 'Codex' }))
vi.mock('./ai-vault-session-continuation', () => ({
  prepareAiVaultSessionContinuation: vi.fn()
}))
vi.mock('@/issues/issue-resume-bookkeeping', () => ({
  observeResumedConversationLocalLaunch: (...args: unknown[]) => mocks.observeLaunch(...args),
  recordResumedConversation: (...args: unknown[]) => {
    mocks.events.push('record')
    return mocks.recordConversation(...args)
  },
  recordResumedConversationLaunchFailure: (...args: unknown[]) => mocks.recordFailure(...args)
}))
vi.mock('./ai-vault-session-launch-target', () => ({
  activateAiVaultResumeWorkspace: (...args: unknown[]) => {
    mocks.events.push('activate')
    return mocks.activate(...args)
  },
  resolveAiVaultSessionLaunchTarget: vi.fn(),
  resolveAiVaultSessionLaunchTargetOrNotify: (...args: unknown[]) => {
    mocks.events.push('resolve-target')
    return mocks.resolveTarget(...args)
  },
  resolveAiVaultTargetWorkspacePath: vi.fn(() => '/workspace/orca'),
  workspaceDisplayName: vi.fn(() => 'Orca'),
  workspaceScopeForIssueResume: vi.fn((worktreeId: string) => ({
    type: 'worktree',
    worktreeId
  }))
}))

import { resolveAiVaultSessionByProviderIdentity } from './ai-vault-provider-session-resolution'
import { resumeAiVaultSession } from './ai-vault-session-launch-actions'

beforeEach(() => {
  mocks.events.length = 0
  vi.clearAllMocks()
  vi.stubGlobal('window', {
    api: {
      aiVault: {
        listSessions: (...args: unknown[]) => {
          mocks.events.push('list')
          return mocks.listSessions(...args)
        }
      }
    }
  })
  mocks.resolveTarget.mockReturnValue({ worktreeId: 'worktree-original' })
  mocks.prepareSession.mockImplementation(async (session) => session)
  mocks.buildStartup.mockReturnValue({
    command: 'codex resume session-1',
    providerSession: { key: 'session_id', id: 'session-1' }
  })
  mocks.recordConversation.mockResolvedValue({ recorded: false })
  mocks.launch.mockReturnValue({ tabId: 'tab-resumed' })
  mocks.activateStructured.mockResolvedValue(true)
})

describe('provider-session resolution and native AI Vault Resume', () => {
  it('keeps structured sessions on the native structured activation path', async () => {
    const structuredSession = {
      ...session(),
      structuredSession: { sessionId: 'structured-1', workspaceId: 'worktree-structured' }
    }

    await expect(
      resumeAiVaultSession({
        session: structuredSession,
        activeWorktreeId: 'worktree-current',
        targetState: targetState()
      })
    ).resolves.toEqual({ launched: true, bookkeeping: { recorded: false } })

    expect(mocks.activateStructured).toHaveBeenCalledWith(structuredSession)
    expect(mocks.resolveTarget).not.toHaveBeenCalled()
    expect(mocks.recordConversation).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('finds the exact host session, then enters the native AI Vault resume chain', async () => {
    const expected = session()
    mocks.listSessions.mockResolvedValue({
      sessions: [{ ...expected, id: 'wrong-host', executionHostId: 'local' }, expected],
      issues: [],
      scannedAt: '2026-08-28T00:00:00.000Z'
    })

    await expect(
      resolveAiVaultSessionByProviderIdentity({
        executionHostId: 'ssh:build',
        agent: 'codex',
        providerSession: { key: 'session_id', id: 'session-1' },
        workspacePaths: ['/workspace/orca']
      })
    ).resolves.toEqual(expected)

    expect(mocks.listSessions).toHaveBeenCalledWith({
      unlimited: true,
      scopePaths: ['/workspace/orca'],
      executionHostScope: 'ssh:build'
    })
    expect(mocks.prepareSession).not.toHaveBeenCalled()
    expect(mocks.events).toEqual(['list'])

    await expect(
      resumeAiVaultSession({
        session: expected,
        activeWorktreeId: 'worktree-current',
        targetWorktreeId: 'worktree-original',
        targetState: targetState()
      })
    ).resolves.toEqual({
      launched: true,
      bookkeeping: { recorded: false }
    })

    expect(mocks.prepareSession).toHaveBeenCalledWith(expected)
    expect(mocks.resolveTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionExecutionHostId: 'ssh:build',
        activeWorktreeId: 'worktree-current',
        targetWorktreeId: 'worktree-original'
      })
    )
    expect(mocks.recordConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        executionHostId: 'ssh:build',
        workspaceRef: { type: 'worktree', worktreeId: 'worktree-original' },
        providerSession: { key: 'session_id', id: 'session-1' }
      })
    )
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        worktreeId: 'worktree-original',
        command: 'codex resume session-1',
        providerSession: { key: 'session_id', id: 'session-1' }
      })
    )
    expect(mocks.activate).toHaveBeenCalledWith('worktree-original')
    expect(mocks.events).toEqual([
      'list',
      'resolve-target',
      'prepare',
      'build-startup',
      'record',
      'launch',
      'activate'
    ])
  })

  it('does not launch when the provider identity is not unique', async () => {
    const first = session()
    mocks.listSessions.mockResolvedValue({
      sessions: [first, { ...first, id: `${first.id}:duplicate` }],
      issues: [],
      scannedAt: '2026-08-28T00:00:00.000Z'
    })

    await expect(
      resolveAiVaultSessionByProviderIdentity({
        executionHostId: 'ssh:build',
        agent: 'codex',
        providerSession: { key: 'session_id', id: 'session-1' },
        workspacePaths: ['/workspace/orca']
      })
    ).resolves.toBeNull()

    expect(mocks.resolveTarget).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      'This Conversation could not be found in Agent Session History.'
    )
  })

  it('reuses the native zero-turn Resume gate', async () => {
    mocks.listSessions.mockResolvedValue({
      sessions: [{ ...session(), messageCount: 0, previewMessages: [] }],
      issues: [],
      scannedAt: '2026-08-28T00:00:00.000Z'
    })

    await expect(
      resolveAiVaultSessionByProviderIdentity({
        executionHostId: 'ssh:build',
        agent: 'codex',
        providerSession: { key: 'session_id', id: 'session-1' },
        workspacePaths: ['/workspace/orca']
      })
    ).resolves.toBeNull()

    expect(mocks.resolveTarget).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      'This session has no saved conversation and cannot be resumed.'
    )
  })

  it('records the launch claim before launching so the resumed hook cannot outrun its mapping', async () => {
    mocks.listSessions.mockResolvedValue({
      sessions: [session()],
      issues: [],
      scannedAt: '2026-08-28T00:00:00.000Z'
    })
    let finishRecord: (value: { recorded: false }) => void = () => undefined
    mocks.recordConversation.mockReturnValue(
      new Promise((resolve) => {
        finishRecord = resolve
      })
    )

    const resume = resumeAiVaultSession({
      session: session(),
      activeWorktreeId: 'worktree-current',
      targetWorktreeId: 'worktree-original',
      targetState: targetState()
    })

    await vi.waitFor(() => expect(mocks.recordConversation).toHaveBeenCalledTimes(1))
    expect(mocks.launch).not.toHaveBeenCalled()
    finishRecord({ recorded: false })
    await expect(resume).resolves.toEqual({
      launched: true,
      bookkeeping: { recorded: false }
    })
    expect(mocks.launch).toHaveBeenCalledTimes(1)
  })

  it('keeps the native Resume best-effort when Issue book-keeping is unavailable', async () => {
    mocks.recordConversation.mockResolvedValue({ recorded: false })

    await expect(
      resumeAiVaultSession({
        session: session(),
        activeWorktreeId: 'worktree-current',
        targetWorktreeId: 'worktree-original',
        targetState: targetState()
      })
    ).resolves.toEqual({
      launched: true,
      bookkeeping: { recorded: false }
    })

    expect(mocks.launch).toHaveBeenCalledTimes(1)
    expect(mocks.observeLaunch).toHaveBeenCalledWith(
      { recorded: false },
      { worktreeId: 'worktree-original', tabId: 'tab-resumed' }
    )
  })

  it('reuses the Issue launch-gap locator for a recorded local Resume', async () => {
    const bookkeeping = {
      recorded: true,
      route: 'ssh:build',
      preparation: { conversation: { id: 'conversation-1' }, claimId: 'claim-1' }
    }
    mocks.recordConversation.mockResolvedValue(bookkeeping)

    await resumeAiVaultSession({
      session: session(),
      activeWorktreeId: 'worktree-current',
      targetWorktreeId: 'worktree-original',
      targetState: targetState()
    })

    expect(mocks.observeLaunch).toHaveBeenCalledWith(bookkeeping, {
      worktreeId: 'worktree-original',
      tabId: 'tab-resumed'
    })
  })

  it('settles the existing Resume claim when the native runtime launcher fails', async () => {
    const bookkeeping = {
      recorded: true,
      route: 'ssh:build',
      preparation: { conversation: { id: 'conversation-1' }, claimId: 'claim-1' }
    }
    mocks.recordConversation.mockResolvedValue(bookkeeping)
    mocks.launch.mockReturnValue({
      tabId: null,
      runtimeLaunch: Promise.resolve({ status: 'failed', message: 'runtime launcher failed' })
    })

    await expect(
      resumeAiVaultSession({
        session: session(),
        activeWorktreeId: 'worktree-current',
        targetWorktreeId: 'worktree-original',
        targetState: targetState()
      })
    ).resolves.toEqual({ launched: false, bookkeeping })

    expect(mocks.recordFailure).toHaveBeenCalledOnce()
    expect(mocks.recordFailure).toHaveBeenCalledWith(bookkeeping, 'runtime launcher failed')
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('runtime launcher failed')
  })
})

function targetState(): AiVaultSessionResumeTargetState {
  return {
    folderWorkspaces: [],
    projectGroups: [],
    repos: [],
    worktreesByRepo: {}
  }
}

function session(): AiVaultSession {
  return {
    id: 'ssh:build:codex:session-1:/sessions/session-1.jsonl',
    executionHostId: 'ssh:build',
    executionHostPlatform: 'linux',
    agent: 'codex',
    sessionId: 'session-1',
    title: 'Resume me',
    cwd: '/workspace/orca',
    branch: 'main',
    model: 'gpt-5.6-sol',
    filePath: '/sessions/session-1.jsonl',
    codexHome: '/home/ada/.codex',
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:01:00.000Z',
    modifiedAt: '2026-08-28T00:01:00.000Z',
    messageCount: 2,
    totalTokens: 100,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'codex resume session-1',
    subagent: null
  }
}
