// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import type { AiVaultSessionResumeTargetState } from './ai-vault-session-resume'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  listSessions: vi.fn(),
  prepareSession: vi.fn(),
  buildStartup: vi.fn(),
  launch: vi.fn(),
  activateStructured: vi.fn(),
  activateWorktree: vi.fn(),
  activateFolder: vi.fn(),
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
  }
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
vi.mock('@/lib/ai-vault-session-resume-preparation', () => ({
  prepareAiVaultSessionForResume: (...args: unknown[]) => {
    mocks.events.push('prepare')
    return mocks.prepareSession(...args)
  }
}))
vi.mock('@/lib/ai-vault-resume-target', () => ({
  canResumeAiVaultSessionOnTarget: () => true,
  getAiVaultResumeWorkspaceExecutionHostId: () => 'ssh:build',
  getAiVaultResumeWorkspaceTargetStatus: () => 'ssh'
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: (...args: unknown[]) => {
    mocks.events.push('activate')
    return mocks.activateWorktree(...args)
  },
  activateAndRevealFolderWorkspace: mocks.activateFolder
}))
vi.mock('./ai-vault-session-resume', () => ({
  isKnownAiVaultResumeWorkspaceTarget: () => true
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('./ai-vault-session-filters', () => ({ agentLabel: () => 'Codex' }))
vi.mock('./ai-vault-session-continuation', () => ({
  prepareAiVaultSessionContinuation: vi.fn()
}))
vi.mock('@/store/slices/worktree-helpers', () => ({ findWorktreeById: vi.fn() }))

import { resolveAiVaultSessionByProviderIdentity } from './ai-vault-provider-session-resolution'
import { resumeAiVaultSession } from './ai-vault-session-launch-actions'

beforeEach(() => {
  mocks.events.length = 0
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { aiVault: { listSessions: mocks.listSessions } }
  })
  mocks.prepareSession.mockImplementation(async (value) => value)
  mocks.buildStartup.mockReturnValue({
    command: 'codex resume session-1',
    providerSession: { key: 'session_id', id: 'session-1' }
  })
  mocks.launch.mockReturnValue({ tabId: 'tab-resumed' })
  mocks.activateStructured.mockResolvedValue(true)
  mocks.activateWorktree.mockReturnValue(true)
})

describe('provider-session resolution and native AI Vault Resume', () => {
  it('finds one exact host, agent, and provider identity from the native listSessions result', async () => {
    const expected = session()
    mocks.listSessions.mockResolvedValue({
      sessions: [
        { ...expected, id: 'wrong-host', executionHostId: 'local' },
        { ...expected, id: 'wrong-session', sessionId: 'session-2' },
        expected
      ],
      issues: [],
      scannedAt: '2026-08-28T00:00:00.000Z'
    })

    await expect(
      resolveAiVaultSessionByProviderIdentity({
        executionHostId: 'ssh:build',
        agent: 'codex',
        providerSession: { key: 'session_id', id: 'session-1' },
        workspacePaths: ['/workspace/orca', '/workspace/orca']
      })
    ).resolves.toEqual(expected)
    expect(mocks.listSessions).toHaveBeenCalledWith({
      unlimited: true,
      scopePaths: ['/workspace/orca'],
      executionHostScope: 'ssh:build'
    })
  })

  it('fails closed for ambiguous identity and Pi transcript mismatch', async () => {
    const candidate = session()
    mocks.listSessions.mockResolvedValueOnce({
      sessions: [candidate, { ...candidate, id: `${candidate.id}:duplicate` }],
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

    mocks.listSessions.mockResolvedValueOnce({
      sessions: [{ ...candidate, agent: 'pi', filePath: '/sessions/first.jsonl' }],
      issues: [],
      scannedAt: '2026-08-28T00:00:00.000Z'
    })
    await expect(
      resolveAiVaultSessionByProviderIdentity({
        executionHostId: 'ssh:build',
        agent: 'pi',
        providerSession: {
          key: 'session_id',
          id: 'session-1',
          transcriptPath: '/sessions/second.jsonl'
        },
        workspacePaths: ['/workspace/orca']
      })
    ).resolves.toBeNull()
    expect(mocks.toastError).toHaveBeenCalledTimes(2)
  })

  it('extracts the existing target, preparation, launch, activation, and toast chain unchanged', async () => {
    await expect(
      resumeAiVaultSession({
        session: session(),
        activeWorktreeId: 'worktree-current',
        targetWorktreeId: 'worktree-original',
        targetState: targetState(),
        agentCmdOverrides: { codex: 'codex-local' }
      })
    ).resolves.toBe(true)

    expect(mocks.launch).toHaveBeenCalledWith({
      agent: 'codex',
      worktreeId: 'worktree-original',
      command: 'codex resume session-1',
      providerSession: { key: 'session_id', id: 'session-1' }
    })
    expect(mocks.events).toEqual(['prepare', 'build-startup', 'launch', 'activate'])
    expect(mocks.toastSuccess).toHaveBeenCalledWith('{{value0}} session queued')
  })

  it('preserves native runtime-launch and preparation failures', async () => {
    mocks.launch.mockReturnValueOnce({
      tabId: null,
      runtimeLaunch: Promise.resolve({ status: 'failed', message: 'runtime rejected launch' })
    })
    await expect(
      resumeAiVaultSession({
        session: session(),
        activeWorktreeId: 'worktree-current',
        targetWorktreeId: 'worktree-original',
        targetState: targetState()
      })
    ).resolves.toBe(false)
    expect(mocks.toastError).toHaveBeenCalledWith('runtime rejected launch')

    mocks.prepareSession.mockRejectedValueOnce(new Error('transcript unavailable'))
    await expect(
      resumeAiVaultSession({
        session: session(),
        activeWorktreeId: 'worktree-current',
        targetWorktreeId: 'worktree-original',
        targetState: targetState()
      })
    ).resolves.toBe(false)
    expect(mocks.toastError).toHaveBeenCalledWith('transcript unavailable')
  })

  it('keeps structured sessions on the native structured activation path', async () => {
    const structured = {
      ...session(),
      structuredSession: { sessionId: 'structured-1', workspaceId: 'worktree-structured' }
    }

    await expect(
      resumeAiVaultSession({
        session: structured,
        activeWorktreeId: 'worktree-current',
        targetState: targetState()
      })
    ).resolves.toBe(true)
    expect(mocks.activateStructured).toHaveBeenCalledWith(structured)
    expect(mocks.launch).not.toHaveBeenCalled()
  })
})

function targetState(): AiVaultSessionResumeTargetState {
  return { folderWorkspaces: [], projectGroups: [], repos: [], worktreesByRepo: {} }
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
