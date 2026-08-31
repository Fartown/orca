import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../../shared/issues/types'

const mocks = vi.hoisted(() => ({
  activateWorkspace: vi.fn(),
  setActiveIssueRoute: vi.fn(),
  resume: vi.fn()
}))

vi.mock('@/lib/sidebar-worktree-activation', () => ({
  activateWorktreeFromSidebar: mocks.activateWorkspace
}))
vi.mock('@/issues/issues-domain-store', () => ({
  issueDomainStore: {
    getState: () => ({ setActiveIssueRoute: mocks.setActiveIssueRoute })
  }
}))
vi.mock('@/issues/issue-conversation-resume', () => ({
  resumeIssueConversationWithAiVault: mocks.resume
}))

import {
  activateMissingWorkspaceIssueConversation,
  revealIssueConversationWorkspace
} from './issue-conversation-navigation'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.activateWorkspace.mockResolvedValue(true)
  mocks.resume.mockResolvedValue(true)
})

describe('Issue Conversation navigation', () => {
  it('delegates every persisted identity to the AI Vault Jump or Resume adapter', async () => {
    const item = conversation()

    await expect(activateMissingWorkspaceIssueConversation(item, 'local')).resolves.toBe('resumed')
    expect(mocks.resume).toHaveBeenCalledWith('local', item)
    expect(mocks.activateWorkspace).not.toHaveBeenCalled()
  })

  it('keeps the Issue open when the AI Vault adapter cannot resolve or resume', async () => {
    mocks.resume.mockResolvedValue(false)

    await expect(
      activateMissingWorkspaceIssueConversation(conversation(), 'ssh:build')
    ).resolves.toBe('resume-failed')
    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalled()
  })

  it('opens the bound Issue when an identity-less internal record is addressed directly', async () => {
    const item = conversation({
      navigation: { paneKey: null, providerSession: null, resumeLocator: null }
    })

    await expect(activateMissingWorkspaceIssueConversation(item, 'local')).resolves.toBe(
      'opened-issue'
    )
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith({
      routeExecutionHostId: 'local',
      issueId: 'issue-1'
    })
  })

  it('reveals an unassigned folder Workspace with the routed host', async () => {
    const item = conversation({
      issueId: null,
      workspaceRef: { type: 'folder', folderWorkspaceId: 'folder-1' },
      navigation: { paneKey: null, providerSession: null, resumeLocator: null }
    })

    await expect(activateMissingWorkspaceIssueConversation(item, 'ssh:build')).resolves.toBe(
      'opened-workspace'
    )
    expect(mocks.activateWorkspace).toHaveBeenCalledWith('folder:folder-1', 'ssh:build')
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('does not close the Issue when Workspace activation fails', async () => {
    mocks.activateWorkspace.mockResolvedValue(false)

    await expect(revealIssueConversationWorkspace('worktree-1', 'local')).resolves.toBe(false)
    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalled()
  })
})

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'conversation-1',
    issueId: 'issue-1',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex',
    navigation: {
      paneKey: null,
      providerSession: { key: 'session_id', id: 'session-1' },
      resumeLocator: null
    },
    ...overrides
  } as ConversationSummary
}
