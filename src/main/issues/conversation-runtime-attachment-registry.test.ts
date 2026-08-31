import { afterEach, describe, expect, it } from 'vitest'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { IssueRepository, issueMutationIdentity } from './issue-repository'
import { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'

afterEach(removeIssueTestDirectories)

describe('ConversationRuntimeAttachmentRegistry', () => {
  it('clears only the matching attachment while the Conversation remains persisted', () => {
    const repository = IssueRepository.open({
      profileId: 'profile-a',
      userDataPath: createIssueTestUserDataPath('orca-issues-attachment')
    })
    const conversation = repository.conversations.create({
      identity: issueMutationIdentity('caller-a', 'conversation-1'),
      input: {
        executionHostId: 'local',
        workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
        workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
        agent: 'codex'
      }
    }).conversation
    const registry = new ConversationRuntimeAttachmentRegistry()
    registry.upsert(attachment(conversation.id, 'connection-a', 1))
    registry.upsert(attachment(conversation.id, 'connection-b', 2))
    expect(registry.revision).toBe(2)

    registry.clearPane({ paneKey: 'pane-1', connectionId: 'connection-a', transient: true })
    expect(registry.listForConversation(conversation.id)).toHaveLength(1)
    expect(repository.conversations.get(conversation.id)).toEqual(conversation)

    registry.clearPane({ paneKey: 'pane-1' })
    expect(registry.revision).toBe(4)
    expect(registry.getDeleteState(conversation.id)).toMatchObject({
      attached: false,
      executionState: 'stopped'
    })
    expect(repository.conversations.get(conversation.id)).toEqual(conversation)
    repository.close()
  })

  it('detaches remote work on connection loss and re-attaches on fresh evidence', () => {
    const registry = new ConversationRuntimeAttachmentRegistry()
    registry.upsert(attachment('conversation-a', 'ssh-connection', 1, 'pane-a'))

    registry.clearConnection('ssh-connection')

    expect(registry.listForConversation('conversation-a')).toEqual([])
    expect(registry.getDeleteState('conversation-a')).toMatchObject({
      attached: false,
      executionState: 'stopped'
    })

    registry.upsert(attachment('conversation-a', 'ssh-reconnected', 2, 'pane-a'))
    expect(registry.getDeleteState('conversation-a')).toMatchObject({ attached: true })
  })

  it('removes panes absent from the current trusted evidence set', () => {
    const registry = new ConversationRuntimeAttachmentRegistry()
    registry.upsert(attachment('conversation-a', 'connection-a', 1, 'pane-a'))
    registry.upsert(attachment('conversation-b', 'connection-b', 2, 'pane-b'))

    registry.retainEvidencePanes(new Set(['pane-b']))

    expect(registry.getDeleteState('conversation-a')).toMatchObject({ attached: false })
    expect(registry.getDeleteState('conversation-b')).toMatchObject({ attached: true })
  })

  it('stays detached across the real SSH clear ordering and the final pane close', () => {
    const registry = new ConversationRuntimeAttachmentRegistry()
    registry.upsert(attachment('conversation-a', 'ssh-connection', 1, 'pane-a'))

    registry.retainEvidencePanes(new Set())
    registry.clearConnection('ssh-connection')
    expect(registry.getDeleteState('conversation-a')).toMatchObject({ attached: false })

    registry.clearPane({ paneKey: 'pane-a' })
    expect(registry.getDeleteState('conversation-a')).toMatchObject({ attached: false })
  })
})

function attachment(
  conversationId: string,
  connectionId: string,
  observedAt: number,
  paneKey = 'pane-1'
) {
  return {
    conversationId,
    paneKey,
    tabId: 'tab-1',
    worktreeId: 'worktree-1',
    connectionId,
    providerIdentityFingerprint: null,
    executionState: 'running' as const,
    observedAt
  }
}
