// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentProviderSessionMetadata } from '../../../../shared/agent-session-resume'
import type { AgentStatusEntry, AgentType } from '../../../../shared/agent-status-types'
import type { ConversationSummary } from '../../../../shared/issues/types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'

const mocks = vi.hoisted(() => ({
  rows: [] as DashboardAgentRow[],
  executionHostId: 'local',
  nativeActivate: vi.fn(),
  setActiveIssueRoute: vi.fn(),
  sendTarget: false
}))

vi.mock('@/components/sidebar/useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: (_workspaceKey: string, active: boolean) => (active ? mocks.rows : [])
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => mocks.executionHostId
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({})
}))
vi.mock('@/components/sidebar/WorktreeCardAgents', () => ({
  default: ({ agents }: { agents: DashboardAgentRow[] }) => (
    <div
      className="worktree-agent-row-hover"
      data-agent-send-target={mocks.sendTarget ? 'eligible' : undefined}
      data-testid="workspace-agent-row"
      onClick={mocks.nativeActivate}
    >
      <span>{agents.map((agent) => agent.paneKey).join(',')}</span>
      <button type="button">Nested action</button>
    </div>
  )
}))
vi.mock('@/issues/issues-domain-store', () => ({
  issueDomainStore: {
    getState: () => ({ setActiveIssueRoute: mocks.setActiveIssueRoute })
  }
}))

import {
  IssueConversationRowContent,
  selectIssueConversationWorkspaceRows
} from './IssueConversationRowContent'

beforeEach(() => {
  mocks.rows = []
  mocks.executionHostId = 'local'
  mocks.nativeActivate.mockReset()
  mocks.setActiveIssueRoute.mockReset()
  mocks.sendTarget = false
})

afterEach(cleanup)

describe('IssueConversationRowContent', () => {
  it('renders the native Workspace row by provider identity even when attachment is stale', async () => {
    mocks.rows = [row('live:leaf', 'codex', provider('session-1'))]
    const missingAction = vi.fn(async () => undefined)

    render(
      <IssueConversationRowContent
        conversation={conversation({
          attachment: { kind: 'detached' },
          navigation: navigation(provider('session-1'))
        })}
        route="local"
        onMissingWorkspaceRowActivate={missingAction}
      />
    )

    fireEvent.click(screen.getByTestId('workspace-agent-row'))
    expect(mocks.nativeActivate).toHaveBeenCalledOnce()
    expect(missingAction).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null))
  })

  it('does not clear the Issue route for nested controls or send-target mode', async () => {
    mocks.rows = [row('live:leaf', 'codex', provider('session-1'))]
    const view = render(
      <IssueConversationRowContent
        conversation={conversation()}
        route="local"
        onMissingWorkspaceRowActivate={async () => undefined}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Nested action' }))
    await Promise.resolve()
    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalled()

    mocks.sendTarget = true
    view.rerender(
      <IssueConversationRowContent
        conversation={conversation()}
        route="local"
        onMissingWorkspaceRowActivate={async () => undefined}
      />
    )
    fireEvent.click(screen.getByTestId('workspace-agent-row'))
    await Promise.resolve()
    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalled()
  })

  it('uses the historical action when host or provider identity does not match', async () => {
    mocks.executionHostId = 'ssh:other'
    mocks.rows = [row('live:leaf', 'codex', provider('session-1'))]
    const missingAction = vi.fn(async () => undefined)

    render(
      <IssueConversationRowContent
        conversation={conversation()}
        route="local"
        onMissingWorkspaceRowActivate={missingAction}
      />
    )

    fireEvent.click(screen.getByTestId('issue-conversation-primary-action'))
    await waitFor(() => expect(missingAction).toHaveBeenCalledOnce())
    expect(screen.queryByTestId('workspace-agent-row')).toBeNull()
  })

  it('keeps the fallback action disabled while native Jump or Resume is pending', async () => {
    let finish: (() => void) | undefined
    const missingAction = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )

    render(
      <IssueConversationRowContent
        conversation={conversation({ title: null })}
        route="local"
        onMissingWorkspaceRowActivate={missingAction}
      />
    )

    const action = screen.getByTestId('issue-conversation-primary-action')
    expect(action.textContent).toContain('Codex')
    expect(action.textContent).not.toContain('Untitled Conversation')
    expect(action.getAttribute('title')).toBe('Resume')
    fireEvent.click(action)
    fireEvent.click(action)
    expect(missingAction).toHaveBeenCalledOnce()
    expect(action.getAttribute('aria-busy')).toBe('true')

    finish?.()
    await waitFor(() => expect(action.getAttribute('aria-busy')).toBe('false'))
  })
})

describe('selectIssueConversationWorkspaceRows', () => {
  it('uses attachment only as a tie-breaker and keeps the selected lineage branch', () => {
    const session = provider('session-1')
    const first = row('first:leaf', 'codex', session)
    const selected = row('selected:leaf', 'codex', session)
    const child = row('child:leaf', 'codex', provider('child'), 'selected:leaf')
    const unrelated = row('other:leaf', 'codex', provider('session-2'))

    expect(
      selectIssueConversationWorkspaceRows(
        [first, unrelated, selected, child],
        'codex',
        session,
        'selected:leaf'
      ).map((item) => item.paneKey)
    ).toEqual(['selected:leaf', 'child:leaf'])
  })

  it('finds the exact identity when the attachment pane is stale', () => {
    const selected = row('current:leaf', 'codex', provider('session-1'))

    expect(
      selectIssueConversationWorkspaceRows([selected], 'codex', provider('session-1'), 'stale:leaf')
    ).toEqual([selected])
  })

  it('uses the historical action for a retained Workspace completion row', async () => {
    mocks.rows = [row('closed:leaf', 'codex', provider('session-1'), undefined, 'retained')]
    const missingAction = vi.fn(async () => undefined)

    render(
      <IssueConversationRowContent
        conversation={conversation({ attachment: { kind: 'detached' } })}
        route="local"
        onMissingWorkspaceRowActivate={missingAction}
      />
    )

    expect(screen.queryByTestId('workspace-agent-row')).toBeNull()
    fireEvent.click(screen.getByTestId('issue-conversation-primary-action'))
    await waitFor(() => expect(missingAction).toHaveBeenCalledOnce())
  })

  it('requires Pi transcript identity as well as session id', () => {
    const candidate = row('pi:leaf', 'pi', provider('session-1', '/tmp/first.jsonl'))

    expect(
      selectIssueConversationWorkspaceRows(
        [candidate],
        'pi',
        provider('session-1', '/tmp/second.jsonl'),
        null
      )
    ).toEqual([])
  })
})

function provider(id: string, transcriptPath?: string): AgentProviderSessionMetadata {
  return {
    key: 'session_id',
    id,
    ...(transcriptPath ? { transcriptPath } : {})
  }
}

function navigation(
  providerSession: AgentProviderSessionMetadata
): NonNullable<ConversationSummary['navigation']> {
  return { paneKey: null, providerSession, resumeLocator: null }
}

function row(
  paneKey: string,
  agentType: AgentType,
  providerSession: AgentProviderSessionMetadata,
  parentPaneKey?: string,
  rowSource: DashboardAgentRow['rowSource'] = 'live'
): DashboardAgentRow {
  const entry: AgentStatusEntry = {
    paneKey,
    state: 'done',
    prompt: paneKey,
    updatedAt: 1,
    stateStartedAt: 1,
    stateHistory: [],
    agentType,
    providerSession,
    ...(parentPaneKey
      ? {
          orchestration: {
            taskId: `${paneKey}-task`,
            dispatchId: `${paneKey}-dispatch`,
            parentPaneKey
          }
        }
      : {})
  }
  const tab: TerminalTab = {
    id: paneKey.split(':')[0] ?? paneKey,
    worktreeId: 'worktree-1',
    ptyId: null,
    title: paneKey,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
  return {
    paneKey,
    entry,
    tab,
    agentType,
    rowSource,
    state: 'done',
    startedAt: 1
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
    attachment: { kind: 'attached', paneKey: 'old:leaf', tabId: 'old' },
    resumability: 'resumable',
    executionState: 'running',
    workspaceAvailability: 'available',
    unresolvedRoundCount: 0,
    latestRound: null,
    navigation: navigation(provider('session-1')),
    ...overrides
  }
}
