import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MutableRefObject } from 'react'
import type { ConversationSummary, IssueSummary } from '../../../shared/issues/types'
import { issueDomainStore } from './issues-domain-store'
import {
  beginIssueRouteRefresh,
  refreshConversationPages,
  refreshIssuePages
} from './IssueDomainSyncGate'

vi.mock('../components/sidebar/use-sidebar-host-scope-options', () => ({
  useSidebarHostScopeOptions: () => ({ hostOptions: [] })
}))

const authority = {
  authorityId: '11111111-1111-4111-8111-111111111111',
  hostPartitionKey: 'local' as const,
  authorityExecutionHostId: 'local' as const
}

beforeEach(() => {
  issueDomainStore.setState({ partitionsByRouteExecutionHostId: {} })
})

describe('Issue snapshot pagination', () => {
  it('restarts a stale Issue snapshot and publishes only the replacement view', async () => {
    const listIssues = vi
      .fn()
      .mockResolvedValueOnce(issuePage([issue('old', 'Old')], 'next'))
      .mockResolvedValueOnce({ status: 'stale', authority, factsRevision: 2, treeRevision: 2 })
      .mockResolvedValueOnce(issuePage([issue('new', 'New')], null, 2))

    await refreshIssuePages({ listIssues }, 'local', 'all', 1, sequenceRef())

    const partition = issueDomainStore.getState().partitionsByRouteExecutionHostId.local!
    expect(partition.issueViewsByFilter.all.issueIds).toEqual([issueId('new')])
    expect(partition.issuesById[issueId('new')]?.localTitle).toBe('New')
    expect(partition.issueViewsByFilter.all.snapshotFactsRevision).toBe(2)
  })

  it('restarts a stale Conversation snapshot and removes entities absent from the replacement', async () => {
    const listConversations = vi
      .fn()
      .mockResolvedValueOnce(conversationPage([conversation('old', 'Old')], 'next'))
      .mockResolvedValueOnce({ status: 'stale', authority, factsRevision: 2 })
      .mockResolvedValueOnce(conversationPage([conversation('new', 'New')], null, 2))

    await refreshConversationPages({ listConversations }, 'local', 1, sequenceRef())

    const partition = issueDomainStore.getState().partitionsByRouteExecutionHostId.local!
    expect(partition.conversationScopesByKey.authority.conversationIds).toEqual([
      conversationId('new')
    ])
    expect(partition.conversationsById[conversationId('old')]).toBeUndefined()
    expect(partition.conversationsById[conversationId('new')]?.title).toBe('New')
  })

  it('uses revision-aware starts and keeps ready facts visible during polling', async () => {
    issueDomainStore
      .getState()
      .applyIssuePage('local', 'all', issuePage([issue('old', 'Old')], null, 7), false)
    issueDomainStore
      .getState()
      .applyConversationPage(
        'local',
        'authority',
        conversationPage([conversation('old', 'Old')], null, 7),
        false
      )
    const listIssues = vi.fn().mockResolvedValue({
      status: 'not-modified',
      authority,
      factsRevision: 7,
      treeRevision: 7,
      runtimeRevision: 7
    })
    const listConversations = vi.fn().mockResolvedValue({
      status: 'not-modified',
      authority,
      factsRevision: 7,
      runtimeRevision: 7
    })

    beginIssueRouteRefresh('local')
    expect(issueDomainStore.getState().partitionsByRouteExecutionHostId.local?.status).toBe('ready')
    await refreshIssuePages({ listIssues }, 'local', 'all', 1, sequenceRef())
    await refreshConversationPages({ listConversations }, 'local', 1, sequenceRef())

    expect(listIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'start',
        sinceFactsRevision: 7,
        sinceRuntimeRevision: 7
      })
    )
    expect(listConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'start',
        sinceFactsRevision: 7,
        sinceRuntimeRevision: 7
      })
    )
  })
})

function sequenceRef(): MutableRefObject<number> {
  return { current: 1 }
}

function issueId(seed: 'old' | 'new'): string {
  return seed === 'old'
    ? '22222222-2222-4222-8222-222222222222'
    : '33333333-3333-4333-8333-333333333333'
}

function issue(seed: 'old' | 'new', title: string): IssueSummary {
  return {
    id: issueId(seed),
    hostPartitionKey: 'local',
    executionHostId: 'local',
    source: { kind: 'local', number: seed === 'old' ? 1 : 2 },
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

function conversationId(seed: 'old' | 'new'): string {
  return seed === 'old'
    ? '44444444-4444-4444-8444-444444444444'
    : '55555555-5555-4555-8555-555555555555'
}

function conversation(seed: 'old' | 'new', title: string): ConversationSummary {
  return {
    id: conversationId(seed),
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

function issuePage(issues: IssueSummary[], nextCursor: string | null, revision = 1) {
  return {
    status: 'snapshot-page' as const,
    authority,
    snapshotFactsRevision: revision,
    snapshotTreeRevision: revision,
    snapshotRuntimeRevision: revision,
    issues,
    nextCursor
  }
}

function conversationPage(
  conversations: ConversationSummary[],
  nextCursor: string | null,
  revision = 1
) {
  return {
    status: 'snapshot-page' as const,
    authority,
    snapshotFactsRevision: revision,
    snapshotRuntimeRevision: revision,
    conversations,
    nextCursor
  }
}
