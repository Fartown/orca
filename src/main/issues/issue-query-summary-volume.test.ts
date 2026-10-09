import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConversationsListParams, IssuesListParams } from '../../shared/issues/query-rpc-schemas'
import type { AuthorityExecutionHostId } from '../../shared/issues/types'
import { resolveIssueAuthorityRoute } from './issue-authority-route'
import { IssueDatabase } from './issue-database'
import { IssueQueryService } from './issue-query-service'
import { IssueRepository, issueMutationIdentity } from './issue-repository'

const repositories: IssueRepository[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const repository of repositories.splice(0)) {
    repository.close()
  }
})

describe('Issue summary reads with retained history', () => {
  it('reads only one round per displayed conversation across pages of a large history', () => {
    const repository = openRepository()
    const conversations = Array.from({ length: 384 }, (_, index) =>
      createConversation(repository, `conversation-${index}`, 'local')
    )
    repository.database.transaction(() => {
      for (const conversation of conversations) {
        seedRounds(repository, conversation.id, 67)
      }
    })
    const query = new IssueQueryService(repository)
    const route = resolveIssueAuthorityRoute('local')
    const fullHistory = vi.spyOn(repository.rounds, 'list').mockImplementation(() => {
      throw new Error('A summary must not materialize retained round history.')
    })
    const readRound = vi.spyOn(repository.rounds, 'get')
    const first = query.listConversations(
      route,
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' },
        limit: 2
      })
    )
    expect(first.status).toBe('snapshot-page')
    if (first.status !== 'snapshot-page') {
      throw new Error('Expected snapshot')
    }
    expect(first.conversations).toHaveLength(2)
    expect(first.conversations.map((item) => item.id)).toEqual(
      repository.conversations
        .list()
        .slice(0, 2)
        .map((item) => item.id)
    )
    for (const conversation of first.conversations) {
      expect(conversation.unresolvedRoundCount).toBe(34)
      expect(conversation.latestRound).toMatchObject({
        id: `${conversation.id}-0066`,
        agentOutput: { text: 'x'.repeat(4096) }
      })
    }
    expect(readRound).toHaveBeenCalledTimes(2)
    const second = query.listConversations(
      route,
      ConversationsListParams.parse({
        mode: 'continue',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' },
        snapshotFactsRevision: first.snapshotFactsRevision,
        cursor: first.nextCursor,
        limit: 2
      })
    )
    expect(second.status).toBe('snapshot-page')
    if (second.status !== 'snapshot-page') {
      throw new Error('Expected snapshot')
    }
    expect(second.conversations.map((item) => item.id)).toEqual(
      repository.conversations
        .list()
        .slice(2, 4)
        .map((item) => item.id)
    )
    expect(readRound).toHaveBeenCalledTimes(4)
    const issues = query.listIssues(
      route,
      IssuesListParams.parse({ mode: 'start', authorityExecutionHostId: 'local', filter: 'all' })
    )
    expect(issues).toMatchObject({
      status: 'snapshot-page',
      unassigned: { conversationCount: 384, unresolvedCount: 384 * 34 }
    })
    expect(readRound).toHaveBeenCalledTimes(4)
    expect(fullHistory).not.toHaveBeenCalled()
  })

  it('preserves host, folder scope, equal-time ordering, and resolved/read counts', () => {
    const repository = openRepository()
    const local = createConversation(repository, 'local', 'local')
    const remote = createConversation(repository, 'remote', 'ssh:mini')
    const other = createConversation(repository, 'other', 'ssh:mini')
    seedRounds(repository, local.id, 7)
    seedRounds(repository, remote.id, 4)
    seedRounds(repository, other.id, 5)
    repository.database
      .prepare('UPDATE round_records SET occurred_at = 1 WHERE conversation_id = ?')
      .run(remote.id)
    repository.database
      .prepare('UPDATE round_records SET read_at = 2 WHERE conversation_id = ?')
      .run(remote.id)
    const query = new IssueQueryService(repository)
    const page = query.listConversations(
      resolveIssueAuthorityRoute('ssh:mini'),
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'ssh:mini',
        scope: { kind: 'workspace', workspaceRef: remote.workspaceRef }
      })
    )
    expect(page).toMatchObject({
      status: 'snapshot-page',
      nextCursor: null,
      conversations: [
        {
          id: remote.id,
          unresolvedRoundCount: 2,
          latestRound: { id: `${remote.id}-0003`, resolvedAt: 100, readAt: 2 }
        }
      ]
    })
    if (page.status !== 'snapshot-page') {
      throw new Error('Expected snapshot')
    }
    expect(page.conversations).toHaveLength(1)
    expect(
      query.listIssues(
        resolveIssueAuthorityRoute('local'),
        IssuesListParams.parse({
          mode: 'start',
          authorityExecutionHostId: 'local',
          filter: 'all'
        })
      )
    ).toMatchObject({ unassigned: { conversationCount: 1, unresolvedCount: 4 } })
    expect(
      query.listIssues(
        resolveIssueAuthorityRoute('ssh:mini'),
        IssuesListParams.parse({
          mode: 'start',
          authorityExecutionHostId: 'ssh:mini',
          filter: 'all'
        })
      )
    ).toMatchObject({ unassigned: { conversationCount: 2, unresolvedCount: 5 } })
  })

  it('counts only active identities in Issue summaries and keeps empty histories', () => {
    const repository = openRepository()
    const issue = repository.issues.createLocal({
      identity: issueMutationIdentity('volume', 'issue'),
      input: { executionHostId: 'local', title: 'Issue' }
    }).issue
    const visible = createConversation(repository, 'visible', 'local', issue.id)
    const prepared = createConversation(repository, 'prepared', 'local', issue.id)
    const empty = createConversation(repository, 'empty', 'local', issue.id)
    repository.conversationIdentities.attach({
      conversationId: visible.id,
      agent: 'codex',
      providerSession: { key: 'session_id', id: 'session' },
      observedAt: 1
    })
    seedRounds(repository, visible.id, 4)
    seedRounds(repository, prepared.id, 9)
    const query = new IssueQueryService(repository)
    const detail = query.getIssue(resolveIssueAuthorityRoute('local'), issue.id)
    expect(detail.issue).toMatchObject({ ownUnresolvedCount: 2, directConversationCount: 1 })
    expect(detail.directConversations.find((item) => item.id === empty.id)).toMatchObject({
      latestRound: null,
      unresolvedRoundCount: 0
    })
    expect(detail.directConversations).toHaveLength(3)
  })
})

function openRepository() {
  const repository = new IssueRepository(
    IssueDatabase.openTransient({ logicalPath: 'volume-test' })
  )
  repositories.push(repository)
  return repository
}

function createConversation(
  repository: IssueRepository,
  name: string,
  executionHostId: AuthorityExecutionHostId,
  issueId: string | null = null
) {
  return repository.conversations.create({
    identity: issueMutationIdentity('volume', name),
    input: {
      executionHostId,
      workspaceRef: { type: 'folder', folderWorkspaceId: name },
      workspaceSnapshot: { name, path: `/workspace/${name}` },
      agent: 'codex',
      issueId
    }
  }).conversation
}

function seedRounds(repository: IssueRepository, conversationId: string, count: number) {
  const insert = repository.database.prepare(`INSERT INTO round_records (
    id, conversation_id, kind, state_source, occurred_at, dedupe_key,
    user_input_completeness, agent_output_preview, output_completeness,
    question_completeness, resolved_at, resolution, created_at
  ) VALUES (?, ?, 'completion', 'hook', ?, ?, 'not-captured', ?, 'runtime-preview',
    'not-captured', ?, ?, 1)`)
  for (let i = 0; i < count; i++) {
    const id = `${conversationId}-${String(i).padStart(4, '0')}`
    insert.run(
      id,
      conversationId,
      i,
      id,
      'x'.repeat(4096),
      i % 2 ? 100 : null,
      i % 2 ? 'explicit' : null
    )
  }
}
