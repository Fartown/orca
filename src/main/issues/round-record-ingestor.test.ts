import { afterEach, describe, expect, it } from 'vitest'
import { ConversationHookIdentityIngestor } from './conversation-hook-identity-ingestor'
import { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { bumpIssueHostRevisions, getIssueHostRevisions } from './issue-host-state'
import { IssueRepository, issueMutationIdentity } from './issue-repository'
import { RoundRecordIngestor, type RoundRecordHookEvent } from './round-record-ingestor'

afterEach(removeIssueTestDirectories)

describe('RoundRecordIngestor', () => {
  it('merges one provider turn, keeps different turns, and separates read from resolve', async () => {
    const setup = createSetup('dedupe')
    const first = await setup.ingestor.ingest(
      event({ launchToken: setup.launchToken, providerTurnId: 'turn-1' })
    )
    const duplicate = await setup.ingestor.ingest(
      event({ providerTurnId: 'turn-1', lastAssistantMessage: 'stronger runtime preview' })
    )
    const second = await setup.ingestor.ingest(
      event({ providerTurnId: 'turn-2', stateStartedAt: 20, receivedAt: 21 })
    )

    expect(duplicate).toMatchObject({ roundId: (first as { roundId: string }).roundId })
    expect(second).not.toMatchObject({ roundId: (first as { roundId: string }).roundId })
    const rounds = setup.repository.rounds.list(setup.conversationId)
    expect(rounds).toHaveLength(2)
    expect(rounds[0].agentOutput).toEqual({
      text: 'stronger runtime preview',
      completeness: 'runtime-preview'
    })
    const marked = setup.repository.rounds.markRead({
      identity: issueMutationIdentity('caller-a', 'mark-read'),
      input: { id: rounds[0].id, readAt: 30 }
    })
    expect(marked).toMatchObject({ readAt: 30, resolvedAt: null, resolution: null })
    setup.repository.close()
  })

  it('does not resolve waiting on pane clear, but authoritative working does', async () => {
    const setup = createSetup('waiting')
    const waiting = await setup.ingestor.ingest(
      event({
        launchToken: setup.launchToken,
        providerTurnId: 'waiting-turn',
        state: 'waiting',
        interactivePrompt: 'Approve?',
        stateStartedAt: 10
      })
    )
    setup.attachments.clearPane({ paneKey: 'pane-1' })
    expect(setup.repository.rounds.get((waiting as { roundId: string }).roundId)).toMatchObject({
      resolvedAt: null,
      waitingReason: 'question'
    })

    await setup.ingestor.ingest(
      event({
        providerTurnId: 'working-turn',
        state: 'working',
        stateStartedAt: 20,
        receivedAt: 20
      })
    )
    expect(setup.repository.rounds.get((waiting as { roundId: string }).roundId)).toMatchObject({
      resolvedAt: 20,
      resolution: 'resumed'
    })
    setup.repository.close()
  })

  it('writes Round and authoritative waiting auto-reopen in one facts revision', async () => {
    const repository = openRepository('auto-reopen')
    const issue = repository.issues.createLocal({
      identity: issueMutationIdentity('caller-a', 'issue'),
      input: { executionHostId: 'local', title: 'Archived issue' }
    }).issue
    const launchToken = token('auto-reopen')
    const prepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'prepare'),
      input: { ...conversationInput(issue.id), launchToken, now: 1, claimTtlMs: 1_000 }
    })
    repository.database.transaction(() => {
      repository.database
        .prepare(
          `UPDATE issues SET state = 'archived', archived_at = 100,
             record_revision = record_revision + 1, updated_at = 100 WHERE id = ?`
        )
        .run(issue.id)
      bumpIssueHostRevisions(repository.database, 'local', { tree: false }, 100)
    })
    const before = getIssueHostRevisions(repository.database, 'local').factsRevision
    const ingestor = createIngestor(repository).ingestor

    await ingestor.ingest(
      event({
        launchToken,
        providerTurnId: 'late-completion',
        state: 'done',
        stateStartedAt: 50,
        receivedAt: 105
      })
    )
    expect(repository.issues.get(issue.id)).toMatchObject({
      state: 'archived',
      archivedAt: 100,
      recordRevision: 1
    })
    // Why: first trusted evidence now also mints the canonical title inside
    // the attach transaction — one extra facts bump on first attach only.
    expect(getIssueHostRevisions(repository.database, 'local').factsRevision).toBe(before + 2)

    await ingestor.ingest(
      event({
        providerTurnId: 'late-current-waiting',
        state: 'blocked',
        stateStartedAt: 50,
        receivedAt: 110
      })
    )

    expect(repository.issues.get(issue.id)).toMatchObject({
      state: 'active',
      archivedAt: null,
      recordRevision: 2
    })
    expect(getIssueHostRevisions(repository.database, 'local').factsRevision).toBe(before + 3)
    expect(repository.rounds.list(prepared.conversation.id)).toHaveLength(2)
    repository.close()
  })

  it('rejects Codex title-generation utility threads before allocating a Conversation', async () => {
    const repository = openRepository('codex-title-utility')
    const { ingestor } = createIngestor(repository)
    const sessionStart = await ingestor.ingest(
      event({
        hookEventName: 'SessionStart',
        providerTurnId: 'session-start',
        state: 'working',
        prompt: ''
      })
    )
    const utility = await ingestor.ingest(
      event({
        hookEventName: 'UserPromptSubmit',
        providerTurnId: 'title-turn',
        state: 'working',
        prompt:
          'Generate a concise, single-line task title of at most 36 characters. Start with an imperative verb.'
      })
    )

    expect(sessionStart).toEqual({ disposition: 'ignored', reason: 'non-turn-status' })
    expect(utility).toEqual({ disposition: 'ignored', reason: 'internal-utility' })
    expect(repository.conversations.list()).toHaveLength(0)

    const real = await ingestor.ingest(
      event({ providerTurnId: 'real-turn', prompt: 'Investigate the issue' })
    )
    expect(real).toMatchObject({ disposition: 'persisted' })
    expect(repository.conversations.list()).toHaveLength(1)
    repository.close()
  })
})

function createSetup(suffix: string) {
  const repository = openRepository(suffix)
  const launchToken = token(suffix)
  const prepared = repository.conversationAllocator.prepareLaunch({
    identity: issueMutationIdentity('caller-a', `prepare-${suffix}`),
    input: { ...conversationInput(null), launchToken, now: 1, claimTtlMs: 1_000 }
  })
  return {
    repository,
    launchToken,
    conversationId: prepared.conversation.id,
    ...createIngestor(repository)
  }
}

function createIngestor(repository: IssueRepository) {
  const attachments = new ConversationRuntimeAttachmentRegistry()
  const identityIngestor = new ConversationHookIdentityIngestor(repository, {
    resolveContext: async () => ({
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
      workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
      processIncarnation: 'process-1',
      connectionId: null
    }),
    attachments
  })
  return {
    attachments,
    ingestor: new RoundRecordIngestor(repository, identityIngestor)
  }
}

function openRepository(suffix: string): IssueRepository {
  return IssueRepository.open({
    profileId: 'profile-a',
    userDataPath: createIssueTestUserDataPath(`orca-round-ingestor-${suffix}`)
  })
}

function conversationInput(issueId: string | null) {
  return {
    executionHostId: 'local' as const,
    workspaceRef: { type: 'worktree' as const, worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex' as const,
    issueId
  }
}

function event(input: {
  launchToken?: string
  providerTurnId: string
  hookEventName?: string
  state?: 'done' | 'working' | 'waiting' | 'blocked'
  stateStartedAt?: number
  receivedAt?: number
  lastAssistantMessage?: string
  interactivePrompt?: string
  prompt?: string
}): RoundRecordHookEvent {
  return {
    paneKey: 'pane-1',
    tabId: 'tab-1',
    worktreeId: 'worktree-1',
    connectionId: null,
    launchToken: input.launchToken,
    providerSession: { key: 'session_id', id: 'session-1' },
    providerTurnId: input.providerTurnId,
    hookEventName: input.hookEventName,
    stateStartedAt: input.stateStartedAt ?? 10,
    payload: {
      state: input.state ?? 'done',
      agentType: 'codex',
      prompt: input.prompt ?? 'Do the task',
      lastAssistantMessage: input.lastAssistantMessage ?? 'Done',
      interactivePrompt: input.interactivePrompt
    },
    receivedAt: input.receivedAt ?? 11
  }
}

function token(label: string): string {
  return `token-${label}-0123456789-abcdefghijklmnopqrstuvwxyz`
}
