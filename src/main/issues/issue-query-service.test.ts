import { afterEach, describe, expect, it } from 'vitest'
import {
  IssuesListParams,
  ConversationsListParams,
  IssuesListRoundsParams
} from '../../shared/issues/query-rpc-schemas'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { resolveIssueAuthorityRoute } from './issue-authority-route'
import { IssueQueryService } from './issue-query-service'
import { IssueRepository, issueMutationIdentity } from './issue-repository'
import { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'

afterEach(removeIssueTestDirectories)

describe('IssueQueryService snapshots', () => {
  it('returns an authority descriptor for an empty page', () => {
    const repository = openRepository('empty')
    const query = new IssueQueryService(repository, 'Profile A')
    const result = query.listIssues(
      resolveIssueAuthorityRoute('local'),
      IssuesListParams.parse({ mode: 'start', authorityExecutionHostId: 'local', filter: 'all' })
    )

    expect(result).toMatchObject({
      status: 'snapshot-page',
      authority: {
        authorityId: repository.database.getAuthorityId(),
        hostPartitionKey: 'local',
        authorityExecutionHostId: 'local',
        profileLabel: 'Profile A'
      },
      issues: []
    })
    repository.close()
  })

  it('excludes prepared identity-less Conversations from Issue counts', () => {
    const repository = openRepository('visible-counts')
    const issue = createIssue(repository, 'visible-counts')
    const prepared = createConversation(repository, 'prepared', issue.id, 'worktree-a')
    const visible = createConversation(repository, 'visible', issue.id, 'worktree-a')
    repository.conversationIdentities.attach({
      conversationId: visible.id,
      agent: 'codex',
      providerSession: { key: 'session_id', id: 'visible-session' },
      observedAt: 1
    })
    createRound(repository, prepared.id, 'prepared-round', 1)
    createRound(repository, visible.id, 'visible-round', 2)
    const attachments = new ConversationRuntimeAttachmentRegistry()
    for (const conversation of [prepared, visible]) {
      attachments.upsert({
        conversationId: conversation.id,
        paneKey: `${conversation.id}:leaf`,
        tabId: `${conversation.id}:tab`,
        worktreeId: 'worktree-a',
        connectionId: null,
        providerIdentityFingerprint: null,
        executionState: 'running',
        observedAt: 3
      })
    }
    const query = new IssueQueryService(repository, undefined, attachments)
    const result = query.listIssues(
      resolveIssueAuthorityRoute('local'),
      IssuesListParams.parse({ mode: 'start', authorityExecutionHostId: 'local', filter: 'all' })
    )

    expect(result).toMatchObject({
      status: 'snapshot-page',
      issues: [
        {
          id: issue.id,
          directConversationCount: 1,
          runningConversationCount: 1,
          ownUnresolvedCount: 1
        }
      ]
    })
    repository.close()
  })

  it('pins Issue pages to facts/tree revisions and returns stale after mutation', () => {
    const repository = openRepository('issue-pages')
    createIssue(repository, 'one')
    createIssue(repository, 'two')
    createIssue(repository, 'three')
    const query = new IssueQueryService(repository)
    const route = resolveIssueAuthorityRoute('local')
    const first = query.listIssues(
      route,
      IssuesListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        filter: 'all',
        limit: 1
      })
    )
    expect(first).toMatchObject({ status: 'snapshot-page', issues: [{ localTitle: 'one' }] })
    const page = expectSnapshotPage(first)
    expect(page.nextCursor).toEqual(expect.any(String))

    const second = query.listIssues(
      route,
      IssuesListParams.parse({
        mode: 'continue',
        authorityExecutionHostId: 'local',
        filter: 'all',
        snapshotFactsRevision: page.snapshotFactsRevision,
        snapshotTreeRevision: page.snapshotTreeRevision,
        cursor: page.nextCursor,
        limit: 1
      })
    )
    expect(second).toMatchObject({ status: 'snapshot-page', issues: [{ localTitle: 'two' }] })

    createIssue(repository, 'four')
    const stale = query.listIssues(
      route,
      IssuesListParams.parse({
        mode: 'continue',
        authorityExecutionHostId: 'local',
        filter: 'all',
        snapshotFactsRevision: page.snapshotFactsRevision,
        snapshotTreeRevision: page.snapshotTreeRevision,
        cursor: page.nextCursor,
        limit: 1
      })
    )
    expect(stale.status).toBe('stale')
    repository.close()
  })

  it('returns not-modified for revision-aware Issue and Conversation starts', () => {
    const repository = openRepository('not-modified')
    const issue = createIssue(repository, 'issue')
    createConversation(repository, 'conversation', issue.id, 'worktree-a')
    const query = new IssueQueryService(repository)
    const route = resolveIssueAuthorityRoute('local')
    const issueSnapshot = query.listIssues(
      route,
      IssuesListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        filter: 'all'
      })
    )
    const conversationSnapshot = query.listConversations(
      route,
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' }
      })
    )
    if (
      issueSnapshot.status !== 'snapshot-page' ||
      conversationSnapshot.status !== 'snapshot-page'
    ) {
      throw new Error('Expected initial snapshots.')
    }

    expect(
      query.listIssues(
        route,
        IssuesListParams.parse({
          mode: 'start',
          authorityExecutionHostId: 'local',
          filter: 'all',
          sinceFactsRevision: issueSnapshot.snapshotFactsRevision
        })
      )
    ).toMatchObject({
      status: 'not-modified',
      factsRevision: issueSnapshot.snapshotFactsRevision,
      treeRevision: issueSnapshot.snapshotTreeRevision
    })
    expect(
      query.listConversations(
        route,
        ConversationsListParams.parse({
          mode: 'start',
          authorityExecutionHostId: 'local',
          scope: { kind: 'authority' },
          sinceFactsRevision: conversationSnapshot.snapshotFactsRevision
        })
      )
    ).toMatchObject({
      status: 'not-modified',
      factsRevision: conversationSnapshot.snapshotFactsRevision
    })
    repository.close()
  })

  it('refreshes runtime attachment projections without changing persisted facts revision', () => {
    const repository = openRepository('runtime-revision')
    const conversation = createConversation(repository, 'conversation', null, 'worktree-a')
    const attachments = new ConversationRuntimeAttachmentRegistry()
    attachments.upsert({
      conversationId: conversation.id,
      paneKey: 'pane-1',
      tabId: 'tab-1',
      worktreeId: 'worktree-a',
      connectionId: null,
      providerIdentityFingerprint: null,
      executionState: 'running',
      observedAt: 10
    })
    const query = new IssueQueryService(repository, undefined, attachments)
    const route = resolveIssueAuthorityRoute('local')
    const attached = query.listConversations(
      route,
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' }
      })
    )
    if (attached.status !== 'snapshot-page') {
      throw new Error('Expected attached snapshot.')
    }
    attachments.clearPane({ paneKey: 'pane-1' })

    const detached = query.listConversations(
      route,
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' },
        sinceFactsRevision: attached.snapshotFactsRevision,
        sinceRuntimeRevision: attached.snapshotRuntimeRevision
      })
    )
    expect(detached).toMatchObject({
      status: 'snapshot-page',
      snapshotFactsRevision: attached.snapshotFactsRevision,
      snapshotRuntimeRevision: 2,
      conversations: [{ id: conversation.id, attachment: { kind: 'detached' } }]
    })
    repository.close()
  })

  it('projects active and expired unconfirmed launch claims as Starting and Failed', () => {
    const repository = openRepository('launch-claim-state')
    const now = Date.now()
    const active = createConversation(repository, 'active-claim', null, 'worktree-a')
    const expired = createConversation(repository, 'expired-claim', null, 'worktree-b')
    const settledExpired = createConversation(
      repository,
      'settled-expired-claim',
      null,
      'worktree-c'
    )
    const resuming = repository.conversationAllocator.resolveObservedIdentityOrAllocate({
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: 'worktree-resume' },
      workspaceSnapshot: { name: 'worktree-resume', path: '/workspace/worktree-resume' },
      agent: 'codex',
      providerSession: { key: 'session_id', id: 'resume-session' },
      observedAt: now - 10_000
    }).conversation
    createRound(repository, resuming.id, 'historical-round', now - 9_000)
    repository.conversationLaunchClaims.create({
      conversationId: active.id,
      launchToken: '11111111-1111-4111-8111-111111111111',
      createdAt: now - 1_000,
      expiresAt: now + 60_000
    })
    repository.conversationLaunchClaims.create({
      conversationId: expired.id,
      launchToken: '22222222-2222-4222-8222-222222222222',
      createdAt: now - 60_000,
      expiresAt: now - 1_000
    })
    repository.conversationLaunchClaims.create({
      conversationId: resuming.id,
      launchToken: '44444444-4444-4444-8444-444444444444',
      createdAt: now - 1_000,
      expiresAt: now + 60_000
    })
    repository.conversationLaunchClaims.create({
      conversationId: settledExpired.id,
      launchToken: '33333333-3333-4333-8333-333333333333',
      createdAt: now - 60_000,
      expiresAt: now - 1_000
    })
    repository.conversationLaunchClaims.expirePendingWithinTransaction(settledExpired.id, now)
    const result = new IssueQueryService(
      repository,
      undefined,
      new ConversationRuntimeAttachmentRegistry()
    ).listConversations(
      resolveIssueAuthorityRoute('local'),
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' }
      })
    )

    expect(result).toMatchObject({
      status: 'snapshot-page',
      conversations: expect.arrayContaining([
        expect.objectContaining({ id: active.id, executionState: 'launching' }),
        expect.objectContaining({ id: expired.id, executionState: 'failed' }),
        expect.objectContaining({ id: settledExpired.id, executionState: 'failed' }),
        expect.objectContaining({ id: resuming.id, executionState: 'launching' })
      ])
    })
    repository.close()
  })

  it('binds paged cursors to runtime revision and fails closed when it is omitted', () => {
    const repository = openRepository('runtime-cursor')
    const firstConversation = createConversation(repository, 'first', null, 'worktree-a')
    createConversation(repository, 'second', null, 'worktree-b')
    const attachments = new ConversationRuntimeAttachmentRegistry()
    attachments.upsert({
      conversationId: firstConversation.id,
      paneKey: 'pane-1',
      tabId: 'tab-1',
      worktreeId: 'worktree-a',
      connectionId: null,
      providerIdentityFingerprint: null,
      executionState: 'running',
      observedAt: 10
    })
    const query = new IssueQueryService(repository, undefined, attachments)
    const route = resolveIssueAuthorityRoute('local')
    const firstPage = query.listConversations(
      route,
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' },
        limit: 1
      })
    )
    if (firstPage.status !== 'snapshot-page' || !firstPage.nextCursor) {
      throw new Error('Expected paged runtime snapshot.')
    }
    attachments.clearPane({ paneKey: 'pane-1' })
    const continuation = {
      mode: 'continue' as const,
      authorityExecutionHostId: 'local' as const,
      scope: { kind: 'authority' as const },
      snapshotFactsRevision: firstPage.snapshotFactsRevision,
      cursor: firstPage.nextCursor,
      limit: 1
    }

    expect(
      query.listConversations(route, ConversationsListParams.parse(continuation))
    ).toMatchObject({ status: 'stale', runtimeRevision: 2 })
    expect(() =>
      query.listConversations(
        route,
        ConversationsListParams.parse({ ...continuation, snapshotRuntimeRevision: 2 })
      )
    ).toThrow(/issue_cursor_invalid/)
    repository.close()
  })

  it('pages canonical Conversations independently by scope', () => {
    const repository = openRepository('conversation-scopes')
    const issue = createIssue(repository, 'issue')
    const assigned = createConversation(repository, 'assigned', issue.id, 'worktree-a')
    const unassigned = createConversation(repository, 'unassigned', null, 'worktree-b')
    const query = new IssueQueryService(repository)
    const route = resolveIssueAuthorityRoute('local')

    const issuePage = query.listConversations(
      route,
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'issue', issueId: issue.id }
      })
    )
    const unassignedPage = query.listConversations(
      route,
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'unassigned' }
      })
    )

    expect(issuePage).toMatchObject({
      status: 'snapshot-page',
      conversations: [{ id: assigned.id }]
    })
    expect(unassignedPage).toMatchObject({
      status: 'snapshot-page',
      conversations: [{ id: unassigned.id }]
    })
    repository.close()
  })

  it('pins Round pagination without exposing dedupe keys', () => {
    const repository = openRepository('round-pages')
    const conversation = createConversation(repository, 'conversation', null, 'worktree-a')
    createRound(repository, conversation.id, 'round-1', 1)
    createRound(repository, conversation.id, 'round-2', 2)
    const query = new IssueQueryService(repository)
    const result = query.listRounds(
      resolveIssueAuthorityRoute('local'),
      IssuesListRoundsParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'conversation', conversationId: conversation.id },
        limit: 1
      })
    )

    expect(result).toMatchObject({ status: 'snapshot-page', rounds: [{ id: 'round-1' }] })
    if (result.status !== 'snapshot-page') {
      throw new Error('expected snapshot page')
    }
    expect(result.rounds[0]).not.toHaveProperty('dedupeKey')
    expect(result.nextCursor).toEqual(expect.any(String))
    repository.close()
  })
})

function openRepository(suffix: string): IssueRepository {
  return IssueRepository.open({
    profileId: 'profile-a',
    userDataPath: createIssueTestUserDataPath(`orca-issue-query-${suffix}`)
  })
}

function createIssue(repository: IssueRepository, title: string) {
  return repository.issues.createLocal({
    identity: issueMutationIdentity('query-test', `issue-${title}`),
    input: { executionHostId: 'local', title }
  }).issue
}

function createConversation(
  repository: IssueRepository,
  mutationId: string,
  issueId: string | null,
  worktreeId: string
) {
  return repository.conversations.create({
    identity: issueMutationIdentity('query-test', mutationId),
    input: {
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId },
      workspaceSnapshot: { name: worktreeId, path: `/workspace/${worktreeId}` },
      agent: 'codex',
      issueId
    }
  }).conversation
}

function createRound(
  repository: IssueRepository,
  conversationId: string,
  id: string,
  occurredAt: number
): void {
  repository.database
    .prepare(
      `INSERT INTO round_records (
         id, conversation_id, kind, waiting_reason, state_source, occurred_at, dedupe_key,
         user_input_preview, user_input_completeness,
         agent_output_preview, output_completeness,
         pending_question_preview, question_completeness,
         read_at, resolved_at, resolution, created_at
       ) VALUES (?, ?, 'completion', NULL, 'hook', ?, ?, NULL, 'not-captured',
                 'done', 'runtime-preview', NULL, 'not-captured', NULL, NULL, NULL, ?)`
    )
    .run(id, conversationId, occurredAt, id, occurredAt)
}

function expectSnapshotPage(result: ReturnType<IssueQueryService['listIssues']>) {
  if (result.status !== 'snapshot-page' || !result.nextCursor) {
    throw new Error('Expected a paged Issue snapshot.')
  }
  return { ...result, nextCursor: result.nextCursor }
}
