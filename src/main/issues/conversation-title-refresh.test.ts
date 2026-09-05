import { afterEach, describe, expect, it, vi } from 'vitest'
import { mintAgentSessionFallbackTitle } from '../../shared/agent-session-fallback-title'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { IssueRepository, issueMutationIdentity } from './issue-repository'
import { ConversationTitleRefresh } from './conversation-title-refresh'

afterEach(removeIssueTestDirectories)

describe('ConversationTitleRefresh', () => {
  it('refreshes the Provider snapshot through the owning host without replacing Rename', async () => {
    const repository = openRepository('provider')
    const conversation = createIdentifiedConversation(repository)
    repository.conversations.updateTitle({
      identity: issueMutationIdentity('caller-a', 'rename'),
      input: {
        id: conversation.id,
        expectedRecordRevision: conversation.recordRevision,
        title: 'Named by user'
      }
    })
    const resolveSessionTitles = vi.fn(async () => ({
      titles: [{ agent: 'codex' as const, sessionId: 'session-1', title: 'Provider name' }]
    }))

    new ConversationTitleRefresh(repository, resolveSessionTitles).schedule(conversation.id)

    await vi.waitFor(() =>
      expect(repository.conversations.get(conversation.id)).toMatchObject({
        title: 'Named by user',
        titleSource: 'user',
        providerTitle: 'Provider name'
      })
    )
    expect(resolveSessionTitles).toHaveBeenCalledWith({
      executionHostScope: 'ssh:dev-box',
      requests: [
        {
          agent: 'codex',
          sessionId: 'session-1',
          transcriptPath: '/remote/session-1.jsonl'
        }
      ]
    })
    repository.close()
  })

  it('ignores the native identity fallback instead of snapshotting it', async () => {
    const repository = openRepository('fallback')
    const conversation = createIdentifiedConversation(repository)
    const resolveSessionTitles = vi.fn(async () => ({
      titles: [
        {
          agent: 'codex' as const,
          sessionId: 'session-1',
          title: mintAgentSessionFallbackTitle('codex', 'session-1')
        }
      ]
    }))

    new ConversationTitleRefresh(repository, resolveSessionTitles).schedule(conversation.id)

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledOnce())
    expect(repository.conversations.get(conversation.id)?.providerTitle).toBeNull()
    repository.close()
  })

  it('runs one pending refresh when another settled round arrives in flight', async () => {
    const repository = openRepository('pending')
    const conversation = createIdentifiedConversation(repository)
    let finishFirst!: () => void
    const first = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    const resolveSessionTitles = vi
      .fn()
      .mockImplementationOnce(async () => {
        await first
        return {
          titles: [{ agent: 'codex', sessionId: 'session-1', title: 'Old Provider name' }]
        }
      })
      .mockResolvedValueOnce({
        titles: [{ agent: 'codex', sessionId: 'session-1', title: 'New Provider name' }]
      })
    const refresh = new ConversationTitleRefresh(repository, resolveSessionTitles)

    refresh.schedule(conversation.id)
    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledOnce())
    refresh.schedule(conversation.id)
    finishFirst()

    await vi.waitFor(() =>
      expect(repository.conversations.get(conversation.id)?.providerTitle).toBe('New Provider name')
    )
    expect(resolveSessionTitles).toHaveBeenCalledTimes(2)
    repository.close()
  })

  it('backfills missing snapshots in one host batch without replacing a saved snapshot', async () => {
    const repository = openRepository('backfill')
    const first = createIdentifiedConversation(repository, 'session-1')
    const second = createIdentifiedConversation(repository, 'session-2')
    const saved = createIdentifiedConversation(repository, 'session-3')
    repository.database.transaction(() =>
      repository.conversations.applyProviderTitleWithinTransaction({
        id: saved.id,
        expectedRecordRevision: saved.recordRevision,
        title: 'Saved Provider name'
      })
    )
    const resolveSessionTitles = vi.fn(async () => ({
      titles: [
        { agent: 'codex' as const, sessionId: 'session-1', title: 'First Provider name' },
        {
          agent: 'codex' as const,
          sessionId: 'session-2',
          title: mintAgentSessionFallbackTitle('codex', 'session-2')
        }
      ]
    }))

    await new ConversationTitleRefresh(repository, resolveSessionTitles).backfillMissingSnapshots()

    expect(resolveSessionTitles).toHaveBeenCalledOnce()
    expect(resolveSessionTitles).toHaveBeenCalledWith({
      executionHostScope: 'ssh:dev-box',
      requests: [
        {
          agent: 'codex',
          sessionId: 'session-1',
          transcriptPath: '/remote/session-1.jsonl'
        },
        {
          agent: 'codex',
          sessionId: 'session-2',
          transcriptPath: '/remote/session-2.jsonl'
        }
      ]
    })
    expect(repository.conversations.get(first.id)?.providerTitle).toBe('First Provider name')
    expect(repository.conversations.get(second.id)?.providerTitle).toBeNull()
    expect(repository.conversations.get(saved.id)?.providerTitle).toBe('Saved Provider name')
    repository.close()
  })

  it('does not snapshot a conversation override as a Provider title', async () => {
    const repository = openRepository('override')
    const conversation = createIdentifiedConversation(repository)
    const resolveSessionTitles = vi.fn(async () => ({
      titles: [
        {
          agent: 'codex' as const,
          sessionId: 'session-1',
          title: 'Issue Rename',
          source: 'conversation-override' as const
        }
      ]
    }))

    await new ConversationTitleRefresh(repository, resolveSessionTitles).backfillMissingSnapshots()

    expect(repository.conversations.get(conversation.id)?.providerTitle).toBeNull()
    repository.close()
  })

  it('keeps an unverifiable SSH snapshot empty without blocking another host', async () => {
    const repository = openRepository('backfill-host-failure')
    const local = createIdentifiedConversation(repository, 'local-session', 'local')
    const remote = createIdentifiedConversation(repository, 'remote-session', 'ssh:dev-box')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const resolveSessionTitles = vi.fn(async (args: { executionHostScope?: string }) => {
      if (args.executionHostScope === 'ssh:dev-box') {
        throw new Error('SSH unavailable')
      }
      return {
        titles: [
          { agent: 'codex' as const, sessionId: 'local-session', title: 'Local Provider name' }
        ]
      }
    })

    await new ConversationTitleRefresh(repository, resolveSessionTitles).backfillMissingSnapshots()

    expect(repository.conversations.get(local.id)?.providerTitle).toBe('Local Provider name')
    expect(repository.conversations.get(remote.id)?.providerTitle).toBeNull()
    expect(resolveSessionTitles).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledWith(
      '[issues] conversation title backfill failed:',
      expect.any(Error)
    )
    log.mockRestore()
    repository.close()
  })
})

function openRepository(suffix: string): IssueRepository {
  return IssueRepository.open({
    profileId: 'profile-a',
    userDataPath: createIssueTestUserDataPath(`orca-title-refresh-${suffix}`)
  })
}

function createIdentifiedConversation(
  repository: IssueRepository,
  sessionId = 'session-1',
  executionHostId: 'local' | 'ssh:dev-box' = 'ssh:dev-box'
) {
  return repository.conversationAllocator.resolveObservedIdentityOrAllocate({
    executionHostId,
    workspaceRef: { type: 'folder', folderWorkspaceId: 'folder-1' },
    workspaceSnapshot: { name: 'Remote folder', path: '/remote/workspace' },
    agent: 'codex',
    providerSession: {
      key: 'session_id',
      id: sessionId,
      transcriptPath: `/remote/${sessionId}.jsonl`
    },
    observedAt: 1
  }).conversation
}
