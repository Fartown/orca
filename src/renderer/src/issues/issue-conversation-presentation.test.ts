import { describe, expect, it } from 'vitest'
import type { ConversationSummary } from '../../../shared/issues/types'
import {
  conversationSessionTitleKey,
  hasIssueConversationProviderIdentity,
  issueConversationDisplayName,
  shouldShowIssueConversation,
  sortIssueConversations
} from './issue-conversation-presentation'

describe('Issue Conversation presentation', () => {
  it('isolates resolved titles by routed execution host and agent', () => {
    const item = conversation()
    const titles = new Map([
      [conversationSessionTitleKey(item, 'local')!, 'Local title'],
      [conversationSessionTitleKey(item, 'runtime:paired')!, 'Paired title']
    ])

    expect(issueConversationDisplayName(item, titles)).toBe('Local title')
    expect(issueConversationDisplayName(item, titles, null, 'runtime:paired')).toBe('Paired title')
  })

  it('prefers an explicit Conversation title, then the native live title, then history', () => {
    const item = conversation()
    const titles = new Map([[conversationSessionTitleKey(item)!, 'History title']])

    expect(issueConversationDisplayName(item, titles, 'Live title')).toBe('Live title')
    expect(issueConversationDisplayName({ ...item, title: 'Named' }, titles, 'Live title')).toBe(
      'Named'
    )
  })

  it('hides every prepared record until an active provider identity exists', () => {
    const prepared = conversation({
      navigation: { paneKey: null, providerSession: null, resumeLocator: null },
      executionState: 'launching',
      attachment: { kind: 'attached', paneKey: 'tab:leaf', tabId: 'tab' },
      title: 'Prepared title'
    })

    expect(hasIssueConversationProviderIdentity(prepared)).toBe(false)
    expect(shouldShowIssueConversation(prepared)).toBe(false)
    expect(shouldShowIssueConversation(prepared, new Map([['anything', 'Resolved']]))).toBe(false)
    expect(hasIssueConversationProviderIdentity(conversation())).toBe(true)
    expect(shouldShowIssueConversation(conversation())).toBe(true)
  })

  it('orders native active work first, then attention, then recent stopped history', () => {
    const stoppedOld = conversation({ id: 'stopped-old', updatedAt: 10 })
    const attention = conversation({ id: 'attention', unresolvedRoundCount: 1, updatedAt: 5 })
    const live = conversation({
      id: 'live',
      attachment: { kind: 'attached', paneKey: 'tab:leaf', tabId: 'tab' },
      updatedAt: 1
    })
    const stoppedNew = conversation({ id: 'stopped-new', updatedAt: 20 })

    expect(
      sortIssueConversations([stoppedOld, attention, live, stoppedNew]).map((item) => item.id)
    ).toEqual(['live', 'attention', 'stopped-new', 'stopped-old'])
  })

  it('continues to hide internal Codex title-generation threads', () => {
    const internal = conversation({
      agent: 'codex',
      issueId: null,
      title: null,
      latestRound: {
        id: 'round-1',
        conversationId: 'conversation-1',
        kind: 'completion',
        waitingReason: null,
        stateSource: 'hook',
        occurredAt: 1,
        userInput: {
          text: 'Generate a concise, single-line task title of at most 80 characters. Start with an imperative verb.',
          completeness: 'runtime-preview'
        },
        agentOutput: { text: '{"title":"Fix binding"}', completeness: 'runtime-preview' },
        pendingQuestion: { text: null, completeness: 'not-captured' },
        readAt: null,
        resolvedAt: null,
        resolution: null,
        createdAt: 1
      }
    })

    expect(shouldShowIssueConversation(internal)).toBe(false)
  })
})

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'conversation-1',
    hostPartitionKey: 'local',
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'claude',
    title: null,
    issueId: 'issue-1',
    recordRevision: 0,
    launchFailure: null,
    createdAt: 1,
    updatedAt: 2,
    effectiveProjectRef: null,
    attachment: { kind: 'detached' },
    resumability: 'resumable',
    executionState: 'stopped',
    workspaceAvailability: 'available',
    unresolvedRoundCount: 0,
    latestRound: null,
    navigation: {
      paneKey: null,
      providerSession: { key: 'session_id', id: 'session-1' },
      resumeLocator: null
    },
    ...overrides
  }
}
