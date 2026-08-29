// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../../../shared/issues/types'
import type { AiVaultOriginalPaneTarget } from '@/components/right-sidebar/ai-vault-original-pane'

const mocks = vi.hoisted(() => ({
  originalPaneTarget: null as AiVaultOriginalPaneTarget | null
}))

vi.mock('@/issues/conversation-session-titles', () => ({
  useConversationSessionTitles: () => new Map()
}))
vi.mock('@/components/right-sidebar/ai-vault-original-pane-actions', () => ({
  useAiVaultOriginalPaneActions: () => ({
    getOriginalPaneTarget: () => mocks.originalPaneTarget
  })
}))
vi.mock('./IssueConversationRowContent', () => ({
  IssueConversationRowContent: ({ originalPaneTarget }: { originalPaneTarget: unknown }) => (
    <div data-testid="conversation-row">
      {originalPaneTarget ? 'existing Workspace row' : 'persisted fallback row'}
    </div>
  )
}))
vi.mock('./IssueConversationResumeButton', () => ({
  IssueConversationResumeButton: () => <button type="button">Resume Conversation</button>
}))
vi.mock('./ConversationIssueBindingPopover', () => ({
  ConversationIssueBindingPopover: () => null
}))

import { IssueConversationList } from './IssueConversationList'

beforeEach(() => {
  mocks.originalPaneTarget = null
})

afterEach(cleanup)

describe('IssueConversationList original-pane arbitration', () => {
  it('removes Resume as soon as the shared AI Vault resolver sees the restored pane', () => {
    const props = { route: 'local' as const, conversations: [conversation()], onChanged: vi.fn() }
    const view = render(<IssueConversationList {...props} />)

    expect(screen.getByRole('button', { name: 'Resume Conversation' })).toBeTruthy()
    expect(screen.getByTestId('conversation-row').textContent).toBe('persisted fallback row')

    mocks.originalPaneTarget = {
      paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
      worktreeId: 'worktree-1',
      tabId: 'tab-1',
      leafId: '11111111-1111-4111-8111-111111111111'
    }
    view.rerender(<IssueConversationList {...props} />)

    expect(screen.queryByRole('button', { name: 'Resume Conversation' })).toBeNull()
    expect(screen.getByTestId('conversation-row').textContent).toBe('existing Workspace row')
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
    livenessVerdict: 'exited',
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
