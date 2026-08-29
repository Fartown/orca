import { beforeEach, describe, expect, it } from 'vitest'
import type { ConversationSummary, IssueSummary } from '../../../shared/issues/types'
import { useAppStore } from '../store'
import { issueDomainStore } from './issues-domain-store'

beforeEach(() => {
  useAppStore.getState().setActiveView('terminal')
  issueDomainStore.setState({
    partitionsByRouteExecutionHostId: {},
    activeIssueRoute: null,
    sidebarRootMode: 'workspaces',
    filter: 'all',
    searchQuery: '',
    collapsedIssueIds: new Set(),
    expandedUnassignedKeys: new Set()
  })
})

describe('Issue domain store normalization', () => {
  it('reveals Issue detail on the terminal surface without trapping other app pages', () => {
    useAppStore.getState().setActiveView('artifacts')

    issueDomainStore.getState().setActiveIssueRoute({
      routeExecutionHostId: 'local',
      issueId: 'issue-1'
    })

    expect(useAppStore.getState().activeView).toBe('terminal')
    expect(issueDomainStore.getState().activeIssueRoute?.issueId).toBe('issue-1')
    useAppStore.getState().setActiveView('tasks')
    expect(useAppStore.getState().activeView).toBe('tasks')
  })

  it('closes Issue detail when the user returns to Workspaces', () => {
    issueDomainStore.setState({
      sidebarRootMode: 'issues',
      activeIssueRoute: { routeExecutionHostId: 'local', issueId: 'issue-1' }
    })

    issueDomainStore.getState().setSidebarRootMode('workspaces')

    expect(issueDomainStore.getState()).toMatchObject({
      sidebarRootMode: 'workspaces',
      activeIssueRoute: null
    })
  })

  it('tracks default-collapsed Unassigned groups separately from Issue collapse state', () => {
    const actions = issueDomainStore.getState()
    actions.toggleUnassigned('unassigned:local')

    expect(issueDomainStore.getState().expandedUnassignedKeys).toEqual(
      new Set(['unassigned:local'])
    )
    expect(issueDomainStore.getState().collapsedIssueIds).toEqual(new Set())
  })

  it('keeps canonical Conversations when Issue filters change or go stale', () => {
    const actions = issueDomainStore.getState()
    actions.applyConversationPage(
      'local',
      'authority',
      conversationPage('authority-a', [conversation('A')]),
      false
    )
    actions.applyIssuePage('local', 'all', issuePage('authority-a', [issue('I')]), false)
    actions.applyIssuePage('local', 'needs-me', issuePage('authority-a', []), false)

    let partition = issueDomainStore.getState().partitionsByRouteExecutionHostId.local!
    expect(partition.conversationsById['11111111-1111-4111-8111-111111111111'].title).toBe('A')
    expect(partition.issueViewsByFilter.all.issueIds).toHaveLength(1)
    expect(partition.issueViewsByFilter['needs-me'].issueIds).toEqual([])

    actions.applyConversationPage(
      'local',
      'authority',
      {
        status: 'stale',
        authority: authority('authority-a'),
        factsRevision: 2
      },
      true
    )
    partition = issueDomainStore.getState().partitionsByRouteExecutionHostId.local!
    expect(partition.conversationScopesByKey.authority.conversationIds).toEqual([])
    expect(partition.conversationsById['11111111-1111-4111-8111-111111111111']).toBeDefined()
  })

  it('clears the whole route generation when authorityId changes', () => {
    const actions = issueDomainStore.getState()
    actions.applyConversationPage(
      'local',
      'authority',
      conversationPage('authority-a', [conversation('A')]),
      false
    )
    actions.applyIssuePage('local', 'all', issuePage('authority-b', [issue('B')]), false)

    const partition = issueDomainStore.getState().partitionsByRouteExecutionHostId.local!
    expect(partition.authority?.authorityId).toBe('22222222-2222-4222-8222-222222222222')
    expect(partition.conversationsById).toEqual({})
    expect(Object.values(partition.issuesById)).toMatchObject([{ localTitle: 'B' }])
  })

  it('removes a forgotten Conversation after a complete authority replacement', () => {
    const actions = issueDomainStore.getState()
    actions.applyConversationPage(
      'local',
      'authority',
      conversationPage('authority-a', [conversation('A')]),
      false
    )
    actions.applyConversationPage('local', 'authority', conversationPage('authority-a', []), false)

    const partition = issueDomainStore.getState().partitionsByRouteExecutionHostId.local!
    expect(partition.conversationScopesByKey.authority.conversationIds).toEqual([])
    expect(partition.conversationsById).toEqual({})
  })

  it('marks offline without presenting retained entities as ready facts', () => {
    const actions = issueDomainStore.getState()
    actions.applyConversationPage(
      'local',
      'authority',
      conversationPage('authority-a', [conversation('A')]),
      false
    )
    actions.setRouteStatus('local', 'offline')

    const partition = issueDomainStore.getState().partitionsByRouteExecutionHostId.local!
    expect(partition.status).toBe('offline')
    expect(Object.keys(partition.conversationsById)).toHaveLength(1)
  })

  it('retains the hook readiness reason while degraded pages refresh', () => {
    const actions = issueDomainStore.getState()
    actions.setRouteStatus(
      'local',
      'degraded',
      'Hook evidence is disabled; Issue CRUD remains available'
    )
    actions.applyIssuePage('local', 'all', issuePage('authority-a', [issue('I')]), false)
    actions.applyConversationPage(
      'local',
      'authority',
      conversationPage('authority-a', [conversation('A')]),
      false
    )

    expect(issueDomainStore.getState().partitionsByRouteExecutionHostId.local).toMatchObject({
      status: 'degraded',
      error: 'Hook evidence is disabled; Issue CRUD remains available'
    })
  })
})

function authority(id: 'authority-a' | 'authority-b') {
  return {
    authorityId:
      id === 'authority-a'
        ? '11111111-1111-4111-8111-111111111112'
        : '22222222-2222-4222-8222-222222222222',
    hostPartitionKey: 'local' as const,
    authorityExecutionHostId: 'local' as const
  }
}

function conversation(title: string): ConversationSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    hostPartitionKey: 'local',
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex',
    title,
    issueId: null,
    recordRevision: 0,
    launchFailure: null,
    createdAt: 1,
    updatedAt: 1,
    effectiveProjectRef: null,
    attachment: { kind: 'detached' },
    resumability: 'unavailable',
    executionState: 'stopped',
    workspaceAvailability: 'available',
    unresolvedRoundCount: 0,
    latestRound: null
  }
}

function issue(title: string): IssueSummary {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    hostPartitionKey: 'local',
    executionHostId: 'local',
    source: { kind: 'local', number: 1 },
    localTitle: title,
    typeLabel: null,
    note: null,
    state: 'active',
    parentId: null,
    siblingOrder: 0,
    recordRevision: 0,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    ownUnresolvedCount: 0,
    descendantAttentionCount: 0,
    directConversationCount: 0,
    runningConversationCount: 0
  }
}

function conversationPage(authorityId: 'authority-a', conversations: ConversationSummary[]) {
  return {
    status: 'snapshot-page' as const,
    authority: authority(authorityId),
    snapshotFactsRevision: 1,
    conversations,
    nextCursor: null
  }
}

function issuePage(authorityId: 'authority-a' | 'authority-b', issues: IssueSummary[]) {
  return {
    status: 'snapshot-page' as const,
    authority: authority(authorityId),
    snapshotFactsRevision: 1,
    snapshotTreeRevision: 1,
    issues,
    nextCursor: null
  }
}
