import { afterEach, describe, expect, it } from 'vitest'
import { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { IssueRepository } from './issue-repository'
import { IssueRuntimeService } from './issue-runtime-service'

afterEach(removeIssueTestDirectories)

describe('IssueRuntimeService', () => {
  it('exposes only core methods and applies authority-scoped mutations', () => {
    const repository = openRepository('core')
    const service = new IssueRuntimeService(repository, {
      profileLabel: 'Profile A',
      attachments: new ConversationRuntimeAttachmentRegistry()
    })
    const created = service.createIssue('caller-a', {
      authorityExecutionHostId: 'local',
      mutationId: 'issue-create',
      source: { kind: 'local', title: 'Core issue' }
    })
    const launchToken = token('service')
    const prepared = service.prepareLaunch('caller-a', {
      authorityExecutionHostId: 'local',
      mutationId: 'launch',
      launchToken,
      workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
      workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
      agent: 'codex',
      issueId: created.issue.id
    })
    repository.rounds.create({
      identity: { callerFingerprint: 'hook', mutationId: 'round' },
      input: {
        conversationId: prepared.conversation.id,
        kind: 'completion',
        stateSource: 'hook',
        occurredAt: 1,
        dedupeKey: 'service-round',
        agentOutput: { text: 'done' }
      }
    })
    const persistedRound = repository.rounds.list(prepared.conversation.id)[0]
    const read = service.markRead('caller-a', {
      authorityExecutionHostId: 'local',
      mutationId: 'read',
      roundId: persistedRound.id
    })
    const readReplay = service.markRead('caller-a', {
      authorityExecutionHostId: 'local',
      mutationId: 'read',
      roundId: persistedRound.id
    })
    expect(readReplay).toEqual(read)
    expect(read).toMatchObject({ readAt: expect.any(Number), resolvedAt: null })
    const resolved = service.resolveRound('caller-a', {
      authorityExecutionHostId: 'local',
      mutationId: 'resolve',
      roundId: persistedRound.id
    })
    const resolvedReplay = service.resolveRound('caller-a', {
      authorityExecutionHostId: 'local',
      mutationId: 'resolve',
      roundId: persistedRound.id
    })
    expect(resolvedReplay).toEqual(resolved)
    expect(resolved).toMatchObject({
      readAt: read.readAt,
      resolvedAt: expect.any(Number),
      resolution: 'explicit'
    })
    expect(JSON.stringify(prepared)).not.toContain(launchToken)
    expect(service.authorityDescriptor('local')).toMatchObject({
      authorityExecutionHostId: 'local',
      profileLabel: 'Profile A'
    })
    const methodNames = Object.getOwnPropertyNames(IssueRuntimeService.prototype)
    expect(methodNames).not.toEqual(
      expect.arrayContaining(['search', 'listActivity', 'projectDashboardPanes', 'prepareDigest'])
    )
    repository.close()
  })

  it('admits only managed direct SSH selectors', () => {
    const repository = openRepository('ssh')
    const service = new IssueRuntimeService(repository, {
      attachments: new ConversationRuntimeAttachmentRegistry(),
      managedSshTargets: { hasTarget: (targetId) => targetId === 'known' }
    })

    expect(service.authorityDescriptor('ssh:known')).toMatchObject({
      hostPartitionKey: 'ssh:known',
      authorityExecutionHostId: 'ssh:known'
    })
    expect(() => service.authorityDescriptor('ssh:unknown')).toThrow(/not managed/)
    repository.close()
  })

  it('rolls back every persisted side effect when Issue launch validation fails', () => {
    const repository = openRepository('prepare-validation')
    const service = new IssueRuntimeService(repository, {
      attachments: new ConversationRuntimeAttachmentRegistry()
    })
    const remoteIssue = repository.issues.createLocal({
      identity: { callerFingerprint: 'caller-a', mutationId: 'remote-issue' },
      input: { executionHostId: 'ssh:remote', title: 'Remote issue' }
    }).issue
    const before = persistedPrepareState(repository)
    const factsChanges: unknown[] = []
    const dispose = repository.database.onFactsChanged((change) => factsChanges.push(change))

    expect(() =>
      service.prepareLaunch('caller-a', {
        authorityExecutionHostId: 'local',
        mutationId: 'invalid-launch',
        launchToken: token('invalid-launch'),
        workspaceRef: { type: 'worktree', worktreeId: 'local-worktree' },
        workspaceSnapshot: { name: 'Local Workspace', path: '/workspace/local' },
        agent: 'codex',
        issueId: remoteIssue.id
      })
    ).toThrow(/conversation_issue_host_mismatch/)

    const after = persistedPrepareState(repository)
    expect(after).toEqual(before)
    expect(after.tables.conversations).toHaveLength(0)
    expect(after.tables.conversation_launch_claims).toHaveLength(0)
    expect(
      repository.database
        .prepare('SELECT 1 FROM issue_mutation_receipts WHERE mutation_id = ?')
        .get('invalid-launch')
    ).toBeUndefined()
    expect(after.tables.issue_host_state).toEqual(before.tables.issue_host_state)
    expect(after.issueRevisions).toEqual(before.issueRevisions)
    expect(factsChanges).toEqual([])
    dispose()
    repository.close()
  })
})

function openRepository(suffix: string): IssueRepository {
  return IssueRepository.open({
    profileId: 'profile-a',
    userDataPath: createIssueTestUserDataPath(`orca-runtime-service-${suffix}`)
  })
}

function token(label: string): string {
  return `token-${label}-0123456789-abcdefghijklmnopqrstuvwxyz`
}

function persistedPrepareState(repository: IssueRepository) {
  const tables = [
    'conversations',
    'conversation_launch_claims',
    'issue_mutation_receipts',
    'issue_host_state'
  ] as const
  return {
    tables: Object.fromEntries(
      tables.map((table) => [
        table,
        repository.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
      ])
    ),
    issueRevisions: repository.database
      .prepare('SELECT id, record_revision FROM issues ORDER BY id')
      .all()
  }
}
