import { describe, expect, it } from 'vitest'
import type { ConversationSummary, IssueSummary } from '../../../../../shared/issues/types'
import { conversationSessionTitleKey } from '@/issues/issue-conversation-presentation'
import { buildIssueRows } from './build-issue-rows'

describe('buildIssueRows', () => {
  it('keeps ancestor context, direct Conversations, and unassigned distinct', () => {
    const root = issue('root', null, 0)
    const child = issue('child', root.id, 1)
    const rows = buildIssueRows({
      issueIds: [root.id, child.id],
      issuesById: { [root.id]: root, [child.id]: child },
      conversationsById: {
        assigned: conversation('assigned', child.id, 1),
        unassigned: conversation('unassigned', null, 2)
      },
      collapsedIssueIds: new Set(),
      expandedUnassignedKeys: new Set(['unassigned:local']),
      filter: 'needs-me',
      searchQuery: '',
      unassignedKey: 'unassigned:local'
    })

    expect(rows.map((row) => [row.kind, row.key])).toEqual([
      ['issue', `issue:${root.id}`],
      ['issue', `issue:${child.id}`],
      ['conversation', 'conversation:assigned'],
      ['unassigned', 'unassigned:local'],
      ['conversation', 'conversation:unassigned']
    ])
    expect(rows[0]).toMatchObject({ contextOnly: true })
    expect(rows[1]).toMatchObject({ contextOnly: false })
  })

  it('never duplicates a Conversation when filters change', () => {
    const item = issue('issue', null, 1)
    const base = {
      issueIds: [item.id],
      issuesById: { [item.id]: item },
      conversationsById: { one: conversation('one', item.id, 0) },
      collapsedIssueIds: new Set<string>(),
      expandedUnassignedKeys: new Set<string>(),
      searchQuery: '',
      unassignedKey: 'unassigned:local'
    }
    for (const filter of ['all', 'needs-me', 'archived'] as const) {
      expect(
        buildIssueRows({ ...base, filter }).filter((row) => row.kind === 'conversation')
      ).toHaveLength(1)
    }
  })

  it('keeps unassigned history collapsed until opened while search reveals matches', () => {
    const item = conversation('history', null, 0)
    const base = {
      issueIds: [],
      issuesById: {},
      conversationsById: { history: item },
      collapsedIssueIds: new Set<string>(),
      expandedUnassignedKeys: new Set<string>(),
      filter: 'all' as const,
      unassignedKey: 'unassigned:local'
    }

    expect(buildIssueRows({ ...base, searchQuery: '' }).map((row) => row.kind)).toEqual([
      'unassigned'
    ])
    expect(buildIssueRows({ ...base, searchQuery: 'history' }).map((row) => row.kind)).toEqual([
      'unassigned',
      'conversation'
    ])
  })

  it('orders live and attention Conversations before inactive history', () => {
    const item = issue('issue', null, 0)
    const rows = buildIssueRows({
      issueIds: [item.id],
      issuesById: { [item.id]: item },
      conversationsById: {
        stopped: conversation('stopped', item.id, 0),
        attention: conversation('attention', item.id, 1),
        live: conversation('live', item.id, 0, {
          attachment: { kind: 'attached', paneKey: 'tab:leaf', tabId: 'tab' },
          executionState: 'running'
        })
      },
      collapsedIssueIds: new Set(),
      expandedUnassignedKeys: new Set(),
      filter: 'all',
      searchQuery: '',
      unassignedKey: 'unassigned:local'
    })

    expect(rows.filter((row) => row.kind === 'conversation').map((row) => row.key)).toEqual([
      'conversation:live',
      'conversation:attention',
      'conversation:stopped'
    ])
  })

  it('hides only unassigned shells after an exact title lookup proves they have no title', () => {
    const noIdentity = conversation('no-identity', null, 0, { title: null })
    const resolving = conversation('resolving', null, 0, {
      title: null,
      resumability: 'resumable',
      navigation: {
        paneKey: null,
        providerSession: { key: 'session_id', id: 'resolving-session' },
        resumeLocator: null
      }
    })
    const titled = conversation('titled', null, 0, {
      title: null,
      resumability: 'resumable',
      navigation: {
        paneKey: null,
        providerSession: { key: 'session_id', id: 'titled-session' },
        resumeLocator: null
      }
    })
    const titles = new Map([
      [conversationSessionTitleKey(resolving)!, ''],
      [conversationSessionTitleKey(titled)!, 'Recovered title']
    ])
    const rows = buildIssueRows({
      issueIds: [],
      issuesById: {},
      conversationsById: { noIdentity, resolving, titled },
      collapsedIssueIds: new Set(),
      expandedUnassignedKeys: new Set(['unassigned:local']),
      conversationTitles: titles,
      filter: 'all',
      searchQuery: '',
      unassignedKey: 'unassigned:local'
    })

    expect(rows.filter((row) => row.kind === 'conversation').map((row) => row.key)).toEqual([
      'conversation:titled'
    ])
    expect(rows.find((row) => row.kind === 'unassigned')).toMatchObject({ count: 1 })
  })

  it('hides unresolved empty history while keeping failed launches visible', () => {
    const resolving = conversation('resolving', null, 0, {
      title: null,
      resumability: 'resumable',
      navigation: {
        paneKey: null,
        providerSession: { key: 'session_id', id: 'resolving-session' },
        resumeLocator: null
      }
    })
    const failed = conversation('failed', null, 0, {
      title: null,
      executionState: 'failed'
    })
    const rows = buildIssueRows({
      issueIds: [],
      issuesById: {},
      conversationsById: { resolving, failed },
      collapsedIssueIds: new Set(),
      expandedUnassignedKeys: new Set(['unassigned:local']),
      conversationTitles: new Map(),
      filter: 'all',
      searchQuery: '',
      unassignedKey: 'unassigned:local'
    })

    expect(rows.filter((row) => row.kind === 'conversation').map((row) => row.key)).toEqual([
      'conversation:failed'
    ])
  })

  it('hides Codex hidden title-generation threads without hiding real round history', () => {
    const generatedTitlePrompt =
      'Generate a concise, single-line task title of at most 36 characters and under five words where possible. Start with an imperative verb.'
    const utility = conversation('utility', null, 1, {
      title: null,
      resumability: 'resumable',
      navigation: {
        paneKey: null,
        providerSession: { key: 'session_id', id: 'utility-session' },
        resumeLocator: null
      },
      latestRound: round('utility', generatedTitlePrompt, '{"title":"Investigate issue"}')
    })
    const real = conversation('real', null, 1, {
      title: null,
      resumability: 'resumable',
      navigation: {
        paneKey: null,
        providerSession: { key: 'session_id', id: 'real-session' },
        resumeLocator: null
      },
      latestRound: round('real', 'Investigate the issue', 'Done')
    })
    const rows = buildIssueRows({
      issueIds: [],
      issuesById: {},
      conversationsById: { utility, real },
      collapsedIssueIds: new Set(),
      expandedUnassignedKeys: new Set(['unassigned:local']),
      conversationTitles: new Map(),
      filter: 'all',
      searchQuery: '',
      unassignedKey: 'unassigned:local'
    })

    expect(rows.filter((row) => row.kind === 'conversation').map((row) => row.key)).toEqual([
      'conversation:real'
    ])
    expect(rows.find((row) => row.kind === 'unassigned')).toMatchObject({ count: 1 })
  })
})

function round(conversationId: string, userInput: string, agentOutput: string) {
  return {
    id: `round-${conversationId}`,
    conversationId,
    kind: 'completion' as const,
    waitingReason: null,
    stateSource: 'hook' as const,
    occurredAt: 1,
    userInput: { text: userInput, completeness: 'runtime-preview' as const },
    agentOutput: { text: agentOutput, completeness: 'runtime-preview' as const },
    pendingQuestion: { text: null, completeness: 'not-captured' as const },
    readAt: null,
    resolvedAt: null,
    resolution: null,
    createdAt: 1
  }
}

function issue(id: string, parentId: string | null, ownUnresolvedCount: number): IssueSummary {
  return {
    id,
    hostPartitionKey: 'local',
    executionHostId: 'local',
    source: { kind: 'local', number: 1 },
    localTitle: id,
    typeLabel: null,
    note: null,
    state: 'active',
    parentId,
    siblingOrder: 0,
    recordRevision: 0,
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    ownUnresolvedCount,
    descendantAttentionCount: ownUnresolvedCount,
    directConversationCount: 1,
    runningConversationCount: 0
  }
}

function conversation(
  id: string,
  issueId: string | null,
  unresolvedRoundCount: number,
  overrides: Partial<ConversationSummary> = {}
): ConversationSummary {
  return {
    id,
    hostPartitionKey: 'local',
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex',
    title: id,
    issueId,
    recordRevision: 0,
    launchFailure: null,
    createdAt: 1,
    updatedAt: 1,
    effectiveProjectRef: null,
    attachment: { kind: 'detached' },
    resumability: 'unavailable',
    executionState: 'stopped',
    workspaceAvailability: 'available',
    unresolvedRoundCount,
    latestRound: null,
    ...overrides
  }
}
