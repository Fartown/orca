// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../../../shared/issues/types'
import { TooltipProvider } from '@/components/ui/tooltip'

const mocks = vi.hoisted(() => ({
  pending: false,
  finish: null as (() => void) | null,
  listeners: new Set<() => void>(),
  resume: vi.fn()
}))

vi.mock('@/issues/issue-conversation-resume', () => ({
  isIssueConversationResumePending: () => mocks.pending,
  subscribeIssueConversationResumePending: (listener: () => void) => {
    mocks.listeners.add(listener)
    return () => mocks.listeners.delete(listener)
  },
  resumeIssueConversationWithAiVault: mocks.resume
}))

import { IssueConversationResumeButton } from './IssueConversationResumeButton'

beforeEach(() => {
  mocks.pending = false
  mocks.finish = null
  mocks.listeners.clear()
  mocks.resume.mockReset()
  mocks.resume.mockImplementation(async () => {
    mocks.pending = true
    for (const listener of mocks.listeners) {
      listener()
    }
    await new Promise<void>((resolve) => {
      mocks.finish = resolve
    })
    mocks.pending = false
    for (const listener of mocks.listeners) {
      listener()
    }
    return true
  })
})

afterEach(cleanup)

describe('IssueConversationResumeButton', () => {
  it('disables every entry point while one shared resume is pending', async () => {
    render(
      <TooltipProvider>
        <IssueConversationResumeButton route="local" conversation={conversation()} />
        <IssueConversationResumeButton route="local" conversation={conversation()} compact />
      </TooltipProvider>
    )

    const detailButton = screen.getByRole('button', { name: 'Resume' })
    const sidebarButton = screen.getByRole('button', { name: 'Resume Conversation' })
    fireEvent.click(detailButton)

    await waitFor(() => {
      expect(detailButton).toHaveProperty('disabled', true)
      expect(sidebarButton).toHaveProperty('disabled', true)
    })
    fireEvent.click(sidebarButton)
    expect(mocks.resume).toHaveBeenCalledOnce()

    mocks.finish?.()
    await waitFor(() => {
      expect(detailButton).toHaveProperty('disabled', false)
      expect(sidebarButton).toHaveProperty('disabled', false)
    })
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
