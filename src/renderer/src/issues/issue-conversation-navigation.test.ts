import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../../shared/issues/types'

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  activateWorkspace: vi.fn(async (workspaceKey: string) => {
    mocks.events.push(`workspace:${workspaceKey}`)
    return true
  }),
  focusPane: vi.fn((tabId: string) => {
    mocks.events.push(`pane:${tabId}`)
  }),
  setActiveIssueRoute: vi.fn((route: unknown) => {
    mocks.events.push(`issue:${route === null ? 'null' : 'set'}`)
  }),
  resume: vi.fn(async () => true),
  jumpToOriginalPane: vi.fn((): 'focused' | 'missing' | 'workspace-unavailable' => 'missing'),
  tabsByWorktree: {} as Record<string, { id: string }[]>
}))

vi.mock('@/lib/sidebar-worktree-activation', () => ({
  activateWorktreeFromSidebar: mocks.activateWorkspace
}))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.focusPane
}))
vi.mock('@/issues/issues-domain-store', () => ({
  issueDomainStore: {
    getState: () => ({ setActiveIssueRoute: mocks.setActiveIssueRoute })
  }
}))
vi.mock('@/issues/issue-conversation-resume', () => ({
  resumeIssueConversationWithAiVault: mocks.resume
}))
vi.mock('@/components/right-sidebar/ai-vault-original-pane-actions', () => ({
  jumpToAiVaultOriginalPane: mocks.jumpToOriginalPane
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ tabsByWorktree: mocks.tabsByWorktree })
  }
}))

import {
  activateMissingWorkspaceIssueConversation,
  registerPendingIssueConversationTab
} from './issue-conversation-navigation'

beforeEach(() => {
  mocks.events.length = 0
  mocks.activateWorkspace.mockClear()
  mocks.activateWorkspace.mockImplementation(async (workspaceKey: string) => {
    mocks.events.push(`workspace:${workspaceKey}`)
    return true
  })
  mocks.focusPane.mockClear()
  mocks.setActiveIssueRoute.mockClear()
  mocks.resume.mockClear()
  mocks.jumpToOriginalPane.mockReset()
  mocks.jumpToOriginalPane.mockReturnValue('missing')
  mocks.tabsByWorktree = {}
})

describe('activateMissingWorkspaceIssueConversation', () => {
  it('opens the bound Issue when no Workspace row and no Resume target exist', async () => {
    await expect(activateMissingWorkspaceIssueConversation(conversation(), 'local')).resolves.toBe(
      'opened-issue'
    )
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith({
      routeExecutionHostId: 'local',
      issueId: 'issue-1'
    })
    expect(mocks.activateWorkspace).not.toHaveBeenCalled()
    expect(mocks.focusPane).not.toHaveBeenCalled()
  })

  it('reveals an unassigned folder Workspace when no Resume target exists', async () => {
    await expect(
      activateMissingWorkspaceIssueConversation(
        conversation({
          issueId: null,
          workspaceRef: { type: 'folder', folderWorkspaceId: 'folder-1' }
        }),
        'ssh:build'
      )
    ).resolves.toBe('opened-workspace')
    expect(mocks.activateWorkspace).toHaveBeenCalledWith('folder:folder-1', 'ssh:build')
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('keeps the Issue view open when its fallback Workspace cannot be activated', async () => {
    mocks.activateWorkspace.mockResolvedValueOnce(false)

    await expect(
      activateMissingWorkspaceIssueConversation(
        conversation({
          issueId: null,
          workspaceRef: { type: 'folder', folderWorkspaceId: 'folder-1' }
        }),
        'ssh:build'
      )
    ).resolves.toBe('workspace-unavailable')

    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalled()
    expect(mocks.focusPane).not.toHaveBeenCalled()
  })

  it('uses the same AI Vault Resume chain when the detached row body is clicked', async () => {
    const item = conversation({
      attachment: { kind: 'detached' },
      executionState: 'stopped',
      workspaceAvailability: 'available',
      resumability: 'resumable',
      livenessVerdict: 'exited',
      agent: 'codex',
      navigation: {
        paneKey: null,
        providerSession: { key: 'session_id', id: 'session-1' },
        resumeLocator: null
      }
    })

    await expect(activateMissingWorkspaceIssueConversation(item, 'local')).resolves.toBe('resumed')
    expect(mocks.resume).toHaveBeenCalledWith('local', item)
    expect(mocks.activateWorkspace).not.toHaveBeenCalled()
    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalled()
  })

  it('uses the shared AI Vault original-pane action when the Workspace session exists', async () => {
    const item = conversation({
      attachment: { kind: 'detached' },
      agent: 'codex',
      navigation: {
        paneKey: null,
        providerSession: { key: 'session_id', id: 'session-1' },
        resumeLocator: null
      }
    })
    mocks.jumpToOriginalPane.mockReturnValue('focused')

    await expect(activateMissingWorkspaceIssueConversation(item, 'local')).resolves.toBe(
      'focused-pane'
    )
    expect(mocks.jumpToOriginalPane).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'codex', sessionId: 'session-1' }),
      { notifyWhenMissing: false }
    )
    expect(mocks.resume).not.toHaveBeenCalled()
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('does not resume a running attachment when its exact Workspace row is temporarily missing', async () => {
    const item = conversation({
      attachment: {
        kind: 'attached',
        paneKey: 'remote-tab:11111111-1111-4111-8111-111111111111',
        tabId: 'remote-tab'
      },
      executionState: 'running',
      workspaceAvailability: 'available',
      resumability: 'resumable',
      agent: 'codex',
      navigation: {
        paneKey: 'remote-tab:11111111-1111-4111-8111-111111111111',
        providerSession: { key: 'session_id', id: 'session-1' },
        resumeLocator: null
      }
    })

    mocks.tabsByWorktree = { 'worktree-1': [{ id: 'remote-tab' }] }

    await expect(activateMissingWorkspaceIssueConversation(item, 'local')).resolves.toBe(
      'opened-issue'
    )
    expect(mocks.resume).not.toHaveBeenCalled()
    expect(mocks.focusPane).not.toHaveBeenCalled()
  })

  it('does not resume a detached Conversation while its launch claim is still starting', async () => {
    const item = conversation({
      attachment: { kind: 'detached' },
      executionState: 'launching',
      workspaceAvailability: 'available',
      resumability: 'resumable',
      agent: 'codex',
      navigation: {
        paneKey: null,
        providerSession: { key: 'session_id', id: 'session-1' },
        resumeLocator: null
      }
    })

    await expect(activateMissingWorkspaceIssueConversation(item, 'local')).resolves.toBe(
      'opened-issue'
    )
    expect(mocks.resume).not.toHaveBeenCalled()
  })

  it('does not resume an unverifiable SSH attachment whose pane is unavailable', async () => {
    const item = conversation({
      attachment: {
        kind: 'attached',
        paneKey: 'remote-tab:11111111-1111-4111-8111-111111111111',
        tabId: 'remote-tab'
      },
      executionState: 'running',
      workspaceAvailability: 'available',
      resumability: 'resumable',
      livenessVerdict: 'unverifiable',
      agent: 'codex',
      navigation: {
        paneKey: 'remote-tab:11111111-1111-4111-8111-111111111111',
        providerSession: { key: 'session_id', id: 'session-1' },
        resumeLocator: null
      }
    })

    await expect(activateMissingWorkspaceIssueConversation(item, 'ssh:build')).resolves.toBe(
      'opened-issue'
    )
    expect(mocks.resume).not.toHaveBeenCalled()
    expect(mocks.focusPane).not.toHaveBeenCalled()
  })

  it('focuses the actual tab while an Issue launch is still being confirmed', async () => {
    mocks.tabsByWorktree = { 'worktree-1': [{ id: 'starting-tab' }] }
    const release = registerPendingIssueConversationTab({
      route: 'local',
      conversationId: 'conversation-1',
      workspaceKey: 'worktree-1',
      tabId: 'starting-tab'
    })

    await expect(
      activateMissingWorkspaceIssueConversation(
        conversation({ executionState: 'launching', attachment: { kind: 'detached' } }),
        'local'
      )
    ).resolves.toBe('focused-pane')
    expect(mocks.events).toEqual(['workspace:worktree-1', 'pane:starting-tab', 'issue:null'])
    expect(mocks.resume).not.toHaveBeenCalled()
    release()
  })

  it('does not close the Issue or focus a pending tab when Workspace activation fails', async () => {
    mocks.tabsByWorktree = { 'worktree-1': [{ id: 'starting-tab' }] }
    const release = registerPendingIssueConversationTab({
      route: 'local',
      conversationId: 'conversation-1',
      workspaceKey: 'worktree-1',
      tabId: 'starting-tab'
    })
    mocks.activateWorkspace.mockResolvedValueOnce(false)

    await expect(
      activateMissingWorkspaceIssueConversation(
        conversation({ executionState: 'launching', attachment: { kind: 'detached' } }),
        'local'
      )
    ).resolves.toBe('workspace-unavailable')

    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalled()
    expect(mocks.focusPane).not.toHaveBeenCalled()
    release()
  })

  it('keeps the Issue open when the pending tab disappears during Workspace activation', async () => {
    mocks.tabsByWorktree = { 'worktree-1': [{ id: 'starting-tab' }] }
    const release = registerPendingIssueConversationTab({
      route: 'local',
      conversationId: 'conversation-1',
      workspaceKey: 'worktree-1',
      tabId: 'starting-tab'
    })
    mocks.activateWorkspace.mockImplementationOnce(async (workspaceKey: string) => {
      mocks.events.push(`workspace:${workspaceKey}`)
      mocks.tabsByWorktree = { 'worktree-1': [] }
      return true
    })

    await expect(
      activateMissingWorkspaceIssueConversation(
        conversation({ executionState: 'launching', attachment: { kind: 'detached' } }),
        'local'
      )
    ).resolves.toBe('opened-issue')

    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith({
      routeExecutionHostId: 'local',
      issueId: 'issue-1'
    })
    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalledWith(null)
    expect(mocks.focusPane).not.toHaveBeenCalled()
    release()
  })

  it('prefers the exact native pane after provider identity arrives over the launch-gap tab fallback', async () => {
    mocks.tabsByWorktree = { 'worktree-1': [{ id: 'starting-tab' }] }
    const release = registerPendingIssueConversationTab({
      route: 'local',
      conversationId: 'conversation-1',
      workspaceKey: 'worktree-1',
      tabId: 'starting-tab'
    })
    mocks.jumpToOriginalPane.mockReturnValue('focused')
    const item = conversation({
      executionState: 'running',
      navigation: {
        paneKey: 'starting-tab:11111111-1111-4111-8111-111111111111',
        providerSession: { key: 'session_id', id: 'session-1' },
        resumeLocator: null
      }
    })

    await expect(activateMissingWorkspaceIssueConversation(item, 'local')).resolves.toBe(
      'focused-pane'
    )
    expect(mocks.jumpToOriginalPane).toHaveBeenCalledOnce()
    expect(mocks.activateWorkspace).not.toHaveBeenCalled()
    expect(mocks.focusPane).not.toHaveBeenCalled()
    release()
  })
})

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'conversation-1',
    issueId: 'issue-1',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    attachment: { kind: 'detached' },
    executionState: 'stopped',
    ...overrides
  } as ConversationSummary
}
