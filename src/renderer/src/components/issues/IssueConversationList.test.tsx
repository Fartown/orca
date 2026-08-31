// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../../../shared/issues/types'

const mocks = vi.hoisted(() => ({
  titleSources: [] as { conversation: ConversationSummary; executionHostScope: string }[]
}))

vi.mock('@/issues/conversation-session-titles', () => ({
  useConversationSessionTitles: (
    sources: { conversation: ConversationSummary; executionHostScope: string }[]
  ) => {
    mocks.titleSources = sources
    return new Map()
  }
}))
vi.mock('./IssueConversationRowContent', () => ({
  IssueConversationRowContent: ({ conversation }: { conversation: ConversationSummary }) => (
    <div data-testid="conversation-row">{conversation.id}</div>
  )
}))
vi.mock('./ConversationIssueBindingPopover', () => ({
  ConversationIssueBindingPopover: () => null
}))

import { IssueConversationList } from './IssueConversationList'

afterEach(cleanup)

describe('IssueConversationList visibility', () => {
  it('renders and resolves titles only for Conversations with provider identity', () => {
    render(
      <IssueConversationList
        route="local"
        conversations={[
          conversation('visible', { key: 'session_id', id: 'session-1' }),
          conversation('hidden', null)
        ]}
        onChanged={vi.fn()}
      />
    )

    expect(screen.getAllByTestId('conversation-row')).toHaveLength(1)
    expect(screen.getByTestId('conversation-row').textContent).toBe('visible')
    expect(mocks.titleSources.map((source) => source.conversation.id)).toEqual(['visible'])
    expect(screen.queryByText('hidden')).toBeNull()
  })

  it('shows the empty state when only a prepared identity-less record exists', () => {
    render(
      <IssueConversationList
        route="local"
        conversations={[conversation('hidden', null)]}
        onChanged={vi.fn()}
      />
    )

    expect(screen.getByText('No direct Conversations')).toBeTruthy()
    expect(screen.queryByTestId('conversation-row')).toBeNull()
  })
})

function conversation(
  id: string,
  providerSession: NonNullable<ConversationSummary['navigation']>['providerSession']
): ConversationSummary {
  return {
    id,
    hostPartitionKey: 'local',
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex',
    title: id,
    issueId: 'issue-1',
    recordRevision: 1,
    launchFailure: null,
    createdAt: 1,
    updatedAt: 1,
    effectiveProjectRef: null,
    attachment: { kind: 'detached' },
    resumability: providerSession ? 'resumable' : 'unavailable',
    executionState: providerSession ? 'stopped' : 'launching',
    workspaceAvailability: 'available',
    unresolvedRoundCount: 0,
    latestRound: null,
    navigation: { paneKey: null, providerSession, resumeLocator: null }
  }
}
