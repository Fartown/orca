import { afterEach, describe, expect, it } from 'vitest'
import {
  ConversationHookIdentityIngestor,
  type ConversationHookIdentityContext,
  type ConversationHookIdentityEvent
} from './conversation-hook-identity-ingestor'
import { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { IssueRepository, issueMutationIdentity } from './issue-repository'

afterEach(removeIssueTestDirectories)

describe('ConversationHookIdentityIngestor', () => {
  it('consumes a prepared claim and creates a runtime attachment', async () => {
    const repository = openRepository('prepared')
    const launchToken = token('prepared')
    const prepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'prepare-1'),
      input: { ...conversationInput(), launchToken, now: 1, claimTtlMs: 1_000 }
    })
    const attachments = new ConversationRuntimeAttachmentRegistry()
    const ingestor = new ConversationHookIdentityIngestor(repository, {
      resolveContext: async () => context(),
      attachments
    })

    await expect(ingestor.ingest(event({ launchToken }))).resolves.toEqual({
      disposition: 'attached',
      conversationId: prepared.conversation.id
    })
    expect(attachments.listForConversation(prepared.conversation.id)).toMatchObject([
      { paneKey: 'pane-1', executionState: 'running' }
    ])
    expect(
      repository.conversationLaunchClaims.listForConversation(prepared.conversation.id)[0]
    ).toMatchObject({ settlement: 'attached' })
    repository.close()
  })

  it('materializes an unassigned Conversation only for a live trusted identity', async () => {
    const repository = openRepository('ordinary')
    const ingestor = new ConversationHookIdentityIngestor(repository, {
      resolveContext: async () => context()
    })

    const live = await ingestor.ingest(event())
    expect(live).toMatchObject({ disposition: 'created' })
    expect(repository.conversations.list()).toMatchObject([
      { issueId: null, workspaceRef: { worktreeId: 'worktree-1' } }
    ])

    const replay = await ingestor.ingest(
      event({ providerSession: { key: 'session_id', id: 'unknown-replay' }, isReplay: true })
    )
    expect(replay).toEqual({ disposition: 'ignored', reason: 'identity-missing' })
    expect(repository.conversations.list()).toHaveLength(1)
    repository.close()
  })

  it('treats an unmatched host launch token as ordinary trusted evidence', async () => {
    const repository = openRepository('ordinary-host-token')
    const ingestor = new ConversationHookIdentityIngestor(repository, {
      resolveContext: async () => ({
        ...context(),
        workspaceRef: { type: 'folder', folderWorkspaceId: 'folder-1' },
        workspaceSnapshot: { name: 'Folder', path: '/folder' }
      })
    })

    const result = await ingestor.ingest(event({ launchToken: token('ordinary-host') }))

    expect(result).toMatchObject({ disposition: 'created' })
    expect(repository.conversations.list()).toMatchObject([
      { issueId: null, workspaceRef: { type: 'folder', folderWorkspaceId: 'folder-1' } }
    ])
    repository.close()
  })

  it('falls back to one unassigned Conversation when the Issue launch claim expired', async () => {
    const repository = openRepository('expired-claim-fallback')
    const issue = repository.issues.createLocal({
      identity: issueMutationIdentity('caller-a', 'expired-claim-issue'),
      input: { executionHostId: 'local', title: 'Expired launch' }
    }).issue
    const launchToken = token('expired-claim')
    const prepared = repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'expired-claim-prepare'),
      input: {
        ...conversationInput(),
        issueId: issue.id,
        launchToken,
        now: 1,
        claimTtlMs: 1
      }
    })
    const ingestor = new ConversationHookIdentityIngestor(repository, {
      resolveContext: async () => context()
    })

    const first = await ingestor.ingest(event({ launchToken, receivedAt: 3 }))
    const replay = await ingestor.ingest(event({ launchToken, receivedAt: 4 }))

    expect(first).toMatchObject({ disposition: 'created' })
    expect(replay).toEqual({
      disposition: 'attached',
      conversationId: (first as { conversationId: string }).conversationId
    })
    expect((first as { conversationId: string }).conversationId).not.toBe(prepared.conversation.id)
    expect(repository.conversations.list()).toMatchObject([
      { id: prepared.conversation.id, issueId: issue.id },
      { id: (first as { conversationId: string }).conversationId, issueId: null }
    ])
    repository.close()
  })

  it('does not reuse a consumed Issue claim token for a later provider session', async () => {
    const repository = openRepository('consumed-token')
    const launchToken = token('consumed')
    repository.conversationAllocator.prepareLaunch({
      identity: issueMutationIdentity('caller-a', 'prepare-consumed'),
      input: { ...conversationInput(), launchToken, now: 1, claimTtlMs: 1_000 }
    })
    const ingestor = new ConversationHookIdentityIngestor(repository, {
      resolveContext: async () => context()
    })
    await ingestor.ingest(event({ launchToken }))

    const later = await ingestor.ingest(
      event({
        launchToken,
        providerSession: { key: 'session_id', id: 'later-session' },
        receivedAt: 20
      })
    )

    expect(later).toEqual({ disposition: 'ignored', reason: 'claim-unresolved' })
    expect(repository.conversations.list()).toHaveLength(1)
    repository.close()
  })

  it('replays a known snapshot identity without creating a duplicate', async () => {
    const repository = openRepository('snapshot')
    const ingestor = new ConversationHookIdentityIngestor(repository, {
      resolveContext: async () => context()
    })
    const first = await ingestor.ingest(event())
    const replay = await ingestor.ingest(event({ isReplay: true, receivedAt: 20 }))

    expect(first).toMatchObject({ disposition: 'created' })
    expect(replay).toMatchObject({
      disposition: 'replayed',
      conversationId: (first as { conversationId: string }).conversationId
    })
    expect(repository.conversations.list()).toHaveLength(1)
    repository.close()
  })

  it('keeps restored-unconfirmed evidence detached without recording runtime state', async () => {
    const repository = openRepository('restored-unconfirmed')
    const attachments = new ConversationRuntimeAttachmentRegistry()
    const ingestor = new ConversationHookIdentityIngestor(repository, {
      resolveContext: async () => context(),
      attachments
    })
    const first = await ingestor.ingest(event())
    attachments.clearPane({ paneKey: 'pane-1' })

    const restored = await ingestor.ingest(event({ isReplay: true, restoredUnconfirmed: true }))

    expect(restored).toEqual({ disposition: 'ignored', reason: 'runtime-unverifiable' })
    expect(
      attachments.listForConversation((first as { conversationId: string }).conversationId)
    ).toEqual([])
    expect(
      attachments.getDeleteState((first as { conversationId: string }).conversationId)
    ).toMatchObject({ attached: false })
    repository.close()
  })

  it('does not allocate an empty Conversation from an identity-only session boundary', async () => {
    const repository = openRepository('identity-only')
    const ingestor = new ConversationHookIdentityIngestor(repository, {
      resolveContext: async () => context()
    })

    await expect(
      ingestor.ingest(event({ providerSessionOnly: true, payload: { agentType: 'codex' } }))
    ).resolves.toEqual({ disposition: 'ignored', reason: 'identity-missing' })
    expect(repository.conversations.list()).toEqual([])
    repository.close()
  })

  it('fails closed for remote Pi identity without main-native path access', async () => {
    const repository = openRepository('remote-pi')
    const ingestor = new ConversationHookIdentityIngestor(repository, {
      resolveContext: async () => ({
        ...context(),
        executionHostId: 'ssh:remote',
        connectionId: 'remote'
      })
    })
    const result = await ingestor.ingest(
      event({
        connectionId: 'remote',
        providerSession: {
          key: 'session_id',
          id: 'pi-session',
          transcriptPath: '/orca-remote-only/session.jsonl'
        },
        payload: { state: 'working', agentType: 'pi' }
      })
    )

    expect(result).toEqual({ disposition: 'ignored', reason: 'identity-invalid' })
    expect(repository.conversations.list()).toEqual([])
    repository.close()
  })
})

function openRepository(suffix: string): IssueRepository {
  return IssueRepository.open({
    profileId: 'profile-a',
    userDataPath: createIssueTestUserDataPath(`orca-hook-ingestor-${suffix}`)
  })
}

function conversationInput() {
  return {
    executionHostId: 'local' as const,
    workspaceRef: { type: 'worktree' as const, worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex' as const,
    issueId: null
  }
}

function context(): ConversationHookIdentityContext {
  return {
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    processIncarnation: 'process-1',
    connectionId: null
  }
}

function event(
  overrides: Partial<ConversationHookIdentityEvent> = {}
): ConversationHookIdentityEvent {
  return {
    paneKey: 'pane-1',
    tabId: 'tab-1',
    worktreeId: 'worktree-1',
    connectionId: null,
    providerSession: { key: 'session_id', id: 'session-1' },
    payload: { state: 'working', agentType: 'codex' },
    receivedAt: 10,
    ...overrides
  }
}

function token(label: string): string {
  return `token-${label}-0123456789-abcdefghijklmnopqrstuvwxyz`
}
