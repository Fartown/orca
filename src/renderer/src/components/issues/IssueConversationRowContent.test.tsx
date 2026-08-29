// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ConversationSummary } from '../../../../shared/issues/types'

const mocks = vi.hoisted(() => ({
  rows: [] as DashboardAgentRow[],
  sleepingAgentSessionsByPaneKey: {} as Record<string, unknown>,
  setActiveIssueRoute: vi.fn()
}))

vi.mock('@/components/sidebar/useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: (_workspaceKey: string, active: boolean) => (active ? mocks.rows : [])
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ sleepingAgentSessionsByPaneKey: mocks.sleepingAgentSessionsByPaneKey })
}))
vi.mock('@/components/sidebar/WorktreeCardAgents', () => ({
  default: ({
    agents,
    onAgentActivate,
    onRetainedAgentActivate
  }: {
    agents: DashboardAgentRow[]
    onAgentActivate?: () => void
    onRetainedAgentActivate?: () => void
  }) => (
    <button
      type="button"
      data-testid="workspace-agent-row"
      onClick={agents[0]?.rowSource === 'retained' ? onRetainedAgentActivate : onAgentActivate}
    >
      {agents.map((agent) => agent.paneKey).join(',')}
    </button>
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
  mocks.sleepingAgentSessionsByPaneKey = {}
  mocks.setActiveIssueRoute.mockReset()
})

afterEach(cleanup)

describe('IssueConversationRowContent', () => {
  it('renders and delegates to the exact existing Workspace agent row', () => {
    mocks.rows = [row('selected:leaf')]
    const onMissingWorkspaceRowActivate = vi.fn()

    render(
      <IssueConversationRowContent
        conversation={conversation('selected:leaf')}
        route="local"
        originalPaneTarget={null}
        onMissingWorkspaceRowActivate={onMissingWorkspaceRowActivate}
      />
    )

    fireEvent.click(screen.getByTestId('workspace-agent-row'))
    expect(screen.queryByTestId('issue-conversation-primary-action')).toBeNull()
    expect(onMissingWorkspaceRowActivate).not.toHaveBeenCalled()
    expect(mocks.setActiveIssueRoute).toHaveBeenCalledWith(null)
  })

  it('uses the missing-Workspace-row action when the attachment projection is stale', () => {
    const onMissingWorkspaceRowActivate = vi.fn()

    render(
      <IssueConversationRowContent
        conversation={conversation('missing:leaf')}
        route="local"
        originalPaneTarget={null}
        onMissingWorkspaceRowActivate={onMissingWorkspaceRowActivate}
      />
    )

    fireEvent.click(screen.getByTestId('issue-conversation-primary-action'))
    expect(screen.queryByTestId('workspace-agent-row')).toBeNull()
    expect(screen.queryByText('Live')).toBeNull()
    expect(onMissingWorkspaceRowActivate).toHaveBeenCalledTimes(1)
  })

  it('reuses a Workspace row by provider identity when the Issue projection is detached', () => {
    mocks.rows = [row('live:leaf', undefined, 'session-1')]
    const onMissingWorkspaceRowActivate = vi.fn()

    render(
      <IssueConversationRowContent
        conversation={conversation('old:leaf', {
          attachment: { kind: 'detached' },
          navigation: providerNavigation('session-1')
        })}
        route="local"
        originalPaneTarget={target('live:leaf')}
        onMissingWorkspaceRowActivate={onMissingWorkspaceRowActivate}
      />
    )

    expect(screen.getByTestId('workspace-agent-row').textContent).toBe('live:leaf')
    expect(screen.queryByTestId('issue-conversation-primary-action')).toBeNull()
    expect(onMissingWorkspaceRowActivate).not.toHaveBeenCalled()
  })

  it('reuses the exact Workspace row resolved by the existing sleeping-session identity', () => {
    mocks.rows = [row('restored:leaf')]
    mocks.sleepingAgentSessionsByPaneKey = {
      'restored:leaf': {
        paneKey: 'restored:leaf',
        tabId: 'restored',
        worktreeId: 'worktree-1',
        agent: 'codex',
        providerSession: { key: 'session_id', id: 'session-1' }
      }
    }

    render(
      <IssueConversationRowContent
        conversation={conversation('old:leaf', {
          attachment: { kind: 'detached' },
          navigation: providerNavigation('session-1')
        })}
        route="local"
        originalPaneTarget={target('restored:leaf')}
        onMissingWorkspaceRowActivate={() => undefined}
      />
    )

    expect(screen.getByTestId('workspace-agent-row').textContent).toBe('restored:leaf')
  })

  it('routes a retained Workspace row through the shared Issue navigation action', () => {
    mocks.rows = [{ ...row('retained:leaf'), rowSource: 'retained' }]
    const onMissingWorkspaceRowActivate = vi.fn()

    render(
      <IssueConversationRowContent
        conversation={conversation('retained:leaf')}
        route="local"
        originalPaneTarget={target('retained:leaf')}
        onMissingWorkspaceRowActivate={onMissingWorkspaceRowActivate}
      />
    )

    fireEvent.click(screen.getByTestId('workspace-agent-row'))
    expect(onMissingWorkspaceRowActivate).toHaveBeenCalledOnce()
    expect(mocks.setActiveIssueRoute).not.toHaveBeenCalled()
  })

  it('does not present a stale attached projection as Starting without a Workspace row', () => {
    render(
      <IssueConversationRowContent
        conversation={conversation('missing:leaf', { executionState: 'launching' })}
        route="local"
        originalPaneTarget={null}
        onMissingWorkspaceRowActivate={() => undefined}
      />
    )

    expect(screen.queryByText('Starting')).toBeNull()
  })

  it('keeps Starting while a newly allocated Conversation is still unattached', () => {
    render(
      <TooltipProvider>
        <IssueConversationRowContent
          conversation={conversation('pending:leaf', {
            attachment: { kind: 'detached' },
            executionState: 'launching'
          })}
          route="local"
          originalPaneTarget={null}
          onMissingWorkspaceRowActivate={() => undefined}
        />
      </TooltipProvider>
    )

    expect(screen.getByText('Starting')).toBeTruthy()
  })
})

describe('selectIssueConversationWorkspaceRows', () => {
  it('keeps the exact pane row and its existing lineage branch', () => {
    const otherRoot = row('other:leaf')
    const selected = row('selected:leaf')
    const child = row('child:leaf', 'selected:leaf')
    const grandchild = row('grandchild:leaf', 'child:leaf')

    expect(
      selectIssueConversationWorkspaceRows(
        [otherRoot, selected, child, grandchild],
        'selected:leaf'
      ).map((item) => item.paneKey)
    ).toEqual(['selected:leaf', 'child:leaf', 'grandchild:leaf'])
  })

  it('does not substitute a different Workspace row when the pane key is missing', () => {
    expect(selectIssueConversationWorkspaceRows([row('other:leaf')], 'missing:leaf')).toEqual([])
    expect(selectIssueConversationWorkspaceRows([row('other:leaf')], null)).toEqual([])
  })

  it('reuses the existing Workspace row without a second local-tab liveness guess', () => {
    expect(selectIssueConversationWorkspaceRows([row('remote:leaf')], 'remote:leaf')).toEqual([
      row('remote:leaf')
    ])
  })

  it('uses only the exact row selected by the shared original-pane resolver', () => {
    const first = row('first:leaf', undefined, 'session-1')
    const second = row('second:leaf', undefined, 'session-1')
    const unrelated = row('other:leaf', undefined, 'session-2')

    expect(
      selectIssueConversationWorkspaceRows([first, unrelated, second], 'second:leaf').map(
        (item) => item.paneKey
      )
    ).toEqual(['second:leaf'])
  })
})

function target(paneKey: string) {
  return {
    paneKey,
    worktreeId: 'worktree-1',
    tabId: paneKey.split(':')[0] ?? paneKey,
    leafId: paneKey.split(':')[1] ?? 'leaf'
  }
}

function row(
  paneKey: string,
  parentPaneKey?: string,
  providerSessionId?: string
): DashboardAgentRow {
  const entry: AgentStatusEntry = {
    paneKey,
    state: 'done',
    prompt: paneKey,
    updatedAt: 1,
    stateStartedAt: 1,
    stateHistory: [],
    agentType: 'codex',
    ...(providerSessionId
      ? { providerSession: { key: 'session_id' as const, id: providerSessionId } }
      : {}),
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
    agentType: 'codex',
    state: 'done',
    startedAt: 1
  }
}

function providerNavigation(sessionId: string): NonNullable<ConversationSummary['navigation']> {
  return {
    paneKey: null,
    providerSession: { key: 'session_id', id: sessionId },
    resumeLocator: null
  }
}

function conversation(
  paneKey: string,
  overrides: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    id: 'conversation-1',
    issueId: 'issue-1',
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex',
    title: 'Named Conversation',
    attachment: { kind: 'attached', paneKey, tabId: paneKey.split(':')[0] ?? null },
    executionState: 'running',
    unresolvedRoundCount: 0,
    ...overrides
  } as ConversationSummary
}
