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
      executionState: 'stopped',
      livenessVerdict: 'exited'
    })
    expect(repository.conversations.get(conversation.id)).toEqual(conversation)
    repository.close()
  })

  it('keeps transiently disconnected remote work detached and unverifiable until live evidence returns', () => {
    const registry = new ConversationRuntimeAttachmentRegistry()
    registry.upsert(attachment('conversation-a', 'ssh-connection', 1, 'pane-a'))

    registry.clearConnection('ssh-connection')

    expect(registry.listForConversation('conversation-a')).toEqual([])
    expect(registry.getDeleteState('conversation-a')).toMatchObject({
      attached: false,
      executionState: 'stopped',
      livenessVerdict: 'unverifiable'
    })

    registry.upsert(attachment('conversation-a', 'ssh-reconnected', 2, 'pane-a'))
    expect(registry.getDeleteState('conversation-a')).toMatchObject({
      attached: true,
      livenessVerdict: 'live'
    })
  })

  it('removes panes absent from the current trusted evidence set', () => {
    const registry = new ConversationRuntimeAttachmentRegistry()
    registry.upsert(attachment('conversation-a', 'connection-a', 1, 'pane-a'))
    registry.upsert(attachment('conversation-b', 'connection-b', 2, 'pane-b'))

    registry.retainEvidencePanes(new Set(['pane-b']))

    expect(registry.getDeleteState('conversation-a')).toMatchObject({
      attached: false,
      livenessVerdict: 'unverifiable'
    })
    expect(registry.getDeleteState('conversation-b')).toMatchObject({ attached: true })
  })

  it('preserves unverifiable across the real SSH clear ordering, then exits only on pane close', () => {
    const registry = new ConversationRuntimeAttachmentRegistry()
    registry.upsert(attachment('conversation-a', 'ssh-connection', 1, 'pane-a'))

    registry.retainEvidencePanes(new Set())
    registry.clearConnection('ssh-connection')
    expect(registry.getDeleteState('conversation-a')).toMatchObject({
      attached: false,
      livenessVerdict: 'unverifiable'
    })

    registry.clearPane({ paneKey: 'pane-a' })
    expect(registry.getDeleteState('conversation-a')).toMatchObject({
      attached: false,
      livenessVerdict: 'exited'
    })
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
