// @vitest-environment happy-dom

import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../../../../shared/issues/types'
import {
  conversationMatchesWorkspace,
  selectDetachedConversations,
  WorkspaceConversationRowsHost
} from './workspace-conversation-rows'
import { buildIssueRows } from './issues/build-issue-rows'
import { issueDomainStore } from '../../issues/issues-domain-store'
import { beginIssueRouteRefresh } from '../../issues/IssueDomainSyncGate'

vi.mock('./useWorktreeAgentRows', () => ({ useWorktreeAgentRows: () => [] }))
vi.mock('./WorktreeCardAgents', () => ({ default: () => null }))
// 补行现在走 DashboardAgentRow,把它整个 mock 掉 —— 这个测试测的是行的归属,不是渲染
vi.mock('@/components/dashboard/DashboardAgentRow', () => ({ default: () => null }))
vi.mock('@/components/dashboard/useNow', () => ({ useNow: () => 0 }))
vi.mock('@/lib/agent-catalog', () => ({ AgentIcon: () => null }))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({ activateTabAndFocusPane: vi.fn() }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))

beforeEach(() => {
  issueDomainStore.setState({ partitionsByRouteExecutionHostId: {} })
})

afterEach(cleanup)

describe('Workspace Conversation rows', () => {
  it('supplements only the Conversations that have no live agent row', () => {
    const conversations = [conversation('mapped', 'pane-1'), conversation('detached', null)]
    const agents = [{ paneKey: 'pane-1' }, { paneKey: 'pane-unmapped' }]

    // 有活 pane 的那条由 WorktreeCardAgents 原样渲染,补行只补另一条 ——
    // 否则活着的 agent 行会被替换成信息更少的手写行。
    expect(selectDetachedConversations(conversations, agents).map((item) => item.id)).toEqual([
      'detached'
    ])
  })

  it('matches worktree and folder scopes without treating their ids as interchangeable', () => {
    expect(
      conversationMatchesWorkspace({ type: 'worktree', worktreeId: 'repo::/tree' }, 'repo::/tree')
    ).toBe(true)
    expect(
      conversationMatchesWorkspace(
        { type: 'folder', folderWorkspaceId: 'folder-1' },
        'folder:folder-1'
      )
    ).toBe(true)
    expect(
      conversationMatchesWorkspace({ type: 'worktree', worktreeId: 'folder-1' }, 'folder:folder-1')
    ).toBe(false)
  })

  it('projects the same canonical Conversation id in Workspaces and Issues', () => {
    const shared = conversation('projection-shared', null)
    issueDomainStore.getState().applyConversationPage(
      'local',
      'authority',
      {
        status: 'snapshot-page',
        authority: {
          authorityId: '11111111-1111-4111-8111-111111111111',
          hostPartitionKey: 'local',
          authorityExecutionHostId: 'local'
        },
        snapshotFactsRevision: 1,
        conversations: [shared],
        nextCursor: null
      },
      false
    )
    const view = render(
      createElement(WorkspaceConversationRowsHost, {
        worktreeId: 'repo::/tree',
        route: 'local',
        agents: []
      })
    )
    beginIssueRouteRefresh('local')
    const workspaceIds = [...view.container.querySelectorAll('[data-conversation-id]')].map((row) =>
      row.getAttribute('data-conversation-id')
    )
    const issueRows = buildIssueRows({
      issueIds: [],
      issuesById: {},
      conversationsById: { [shared.id]: shared },
      collapsedIssueIds: new Set(),
      filter: 'all',
      searchQuery: '',
      unassignedKey: 'unassigned:local'
    })
    const issueIds = issueRows
      .filter((row) => row.kind === 'conversation')
      .map((row) => row.conversation.id)

    expect(workspaceIds).toEqual(['projection-shared'])
    expect(issueIds).toEqual(workspaceIds)
    expect(issueRows.find((row) => row.kind === 'conversation')?.conversation).toBe(shared)
  })
})

function conversation(id: string, paneKey: string | null): ConversationSummary {
  return {
    id,
    hostPartitionKey: 'local',
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'repo::/tree' },
    workspaceSnapshot: { name: 'tree', path: '/tree' },
    agent: 'codex',
    title: id,
    issueId: null,
    recordRevision: 0,
    launchFailure: null,
    createdAt: 1,
    updatedAt: 1,
    effectiveProjectRef: null,
    attachment: paneKey ? { kind: 'attached', paneKey, tabId: 'tab-1' } : { kind: 'detached' },
    resumability: 'unavailable',
    executionState: paneKey ? 'running' : 'stopped',
    workspaceAvailability: 'available',
    unresolvedRoundCount: 0,
    latestRound: null,
    navigation: { paneKey, providerSession: null, resumeLocator: null }
  }
}
