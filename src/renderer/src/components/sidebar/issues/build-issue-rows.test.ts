import { describe, expect, it } from 'vitest'
import type { ConversationSummary, IssueSummary } from '../../../../../shared/issues/types'
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
      searchQuery: '',
      unassignedKey: 'unassigned:local'
    }
    for (const filter of ['all', 'needs-me', 'archived'] as const) {
      expect(
        buildIssueRows({ ...base, filter }).filter((row) => row.kind === 'conversation')
      ).toHaveLength(1)
    }
  })
})

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
  unresolvedRoundCount: number
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
    latestRound: null
  }
}
