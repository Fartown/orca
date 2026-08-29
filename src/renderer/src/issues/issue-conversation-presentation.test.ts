import { describe, expect, it } from 'vitest'
import type { ConversationSummary } from '../../../shared/issues/types'
import {
  canResumeIssueConversation,
  canRetryIssueConversation,
  conversationSessionTitleKey,
  issueConversationDisplayName,
  issueConversationStatus,
  shouldShowIssueConversation,
  shouldShowIssueConversationResume,
  sortIssueConversations
} from './issue-conversation-presentation'

describe('Issue Conversation presentation', () => {
  it('keeps automatic titles isolated by execution host and agent', () => {
    const local = conversation()
    const remote = conversation({ executionHostId: 'ssh:build' })
    const titles = new Map([
      [conversationSessionTitleKey(local)!, 'Local title'],
      [conversationSessionTitleKey(remote)!, 'Remote title']
    ])

    expect(issueConversationDisplayName(local, titles)).toBe('Local title')
    expect(issueConversationDisplayName(remote, titles)).toBe('Remote title')
  })

  it('uses the routed runtime host instead of the remote authority id for titles', () => {
    const item = conversation()
    const titles = new Map([
      [conversationSessionTitleKey(item, 'runtime:paired')!, 'Paired runtime title']
    ])

    expect(issueConversationDisplayName(item, titles, null, 'runtime:paired')).toBe(
      'Paired runtime title'
    )
  })

  it('prefers an explicit rename, then the live tab name, then session history', () => {
    const item = conversation()
    const titles = new Map([[conversationSessionTitleKey(item)!, 'History title']])

    expect(issueConversationDisplayName(item, titles, 'Live title')).toBe('Live title')
    expect(issueConversationDisplayName({ ...item, title: 'My title' }, titles, 'Live title')).toBe(
      'My title'
    )
  })

  it('presents real execution states without coercing running to idle', () => {
    expect(issueConversationStatus(conversation({ executionState: 'running' }))).toEqual({
      dotState: 'working',
      label: 'Live'
    })
    expect(issueConversationStatus(conversation({ executionState: 'waiting' }))).toEqual({
      dotState: 'waiting',
      label: 'Waiting for input'
    })
    expect(issueConversationStatus(conversation())).toEqual({
      dotState: 'idle',
      label: null
    })
    expect(
      issueConversationStatus(
        conversation({
          attachment: { kind: 'attached', paneKey: 'tab:leaf', tabId: 'tab' }
        })
      )
    ).toEqual({ dotState: 'done', label: 'Live' })
  })

  it('only offers Resume for a stopped, detached, resumable Conversation', () => {
    expect(canResumeIssueConversation(conversation())).toBe(true)
    expect(
      canResumeIssueConversation(
        conversation({
          attachment: { kind: 'attached', paneKey: 'tab:leaf', tabId: 'tab' },
          executionState: 'running'
        })
      )
    ).toBe(false)
    expect(shouldShowIssueConversationResume(conversation(), false)).toBe(true)
    expect(shouldShowIssueConversationResume(conversation(), true)).toBe(false)
  })

  it('does not offer Resume or a synthetic status while remote liveness is unverifiable', () => {
    const item = conversation({ livenessVerdict: 'unverifiable' })

    expect(issueConversationStatus(item)).toEqual({ dotState: 'idle', label: null })
    expect(canResumeIssueConversation(item)).toBe(false)
  })

  it('lets newer attached runtime evidence override a historical launch failure', () => {
    const item = conversation({
      attachment: { kind: 'attached', paneKey: 'tab:leaf', tabId: 'tab' },
      executionState: 'running',
      launchFailure: { message: 'confirmation timed out', failedAt: 20 }
    })

    expect(issueConversationStatus(item)).toEqual({ dotState: 'working', label: 'Live' })
  })

  it('offers Retry only for a failed launch without runtime or persisted session evidence', () => {
    const failed = conversation({
      resumability: 'unavailable',
      executionState: 'failed',
      navigation: { paneKey: null, providerSession: null, resumeLocator: null }
    })

    expect(canRetryIssueConversation(failed)).toBe(true)
    expect(canRetryIssueConversation({ ...failed, executionState: 'stopped' })).toBe(true)
    expect(canRetryIssueConversation({ ...failed, executionState: 'launching' })).toBe(false)
    expect(canRetryIssueConversation({ ...failed, unresolvedRoundCount: 1 })).toBe(false)
    expect(
      canRetryIssueConversation({
        ...failed,
        resumability: 'resumable',
        navigation: conversation().navigation
      })
    ).toBe(false)
    expect(canRetryIssueConversation({ ...failed, livenessVerdict: 'unverifiable' })).toBe(false)
  })

  it('keeps attached and Issue-owned Conversations visible without inventing Untitled history rows', () => {
    const emptyDetached = conversation({ issueId: null })
    const key = conversationSessionTitleKey(emptyDetached)!

    expect(shouldShowIssueConversation(emptyDetached)).toBe(false)
    expect(shouldShowIssueConversation(emptyDetached, new Map())).toBe(false)
    expect(shouldShowIssueConversation(emptyDetached, new Map([[key, '']]))).toBe(false)
    expect(shouldShowIssueConversation(emptyDetached, new Map([[key, 'History title']]))).toBe(true)
    expect(
      shouldShowIssueConversation(
        conversation({
          issueId: null,
          attachment: { kind: 'attached', paneKey: 'tab:leaf', tabId: 'tab' }
        }),
        new Map()
      )
    ).toBe(true)
    expect(shouldShowIssueConversation(conversation({ title: null }), new Map([[key, '']]))).toBe(
      true
    )
  })

  it('orders live work first, then attention, then recent stopped history', () => {
    const stoppedOld = conversation({ id: 'stopped-old', updatedAt: 10 })
    const attention = conversation({ id: 'attention', unresolvedRoundCount: 1, updatedAt: 5 })
    const live = conversation({ id: 'live', executionState: 'running', updatedAt: 1 })
    const stoppedNew = conversation({ id: 'stopped-new', updatedAt: 20 })

    expect(
      sortIssueConversations([stoppedOld, attention, live, stoppedNew]).map((item) => item.id)
    ).toEqual(['live', 'attention', 'stopped-new', 'stopped-old'])
  })

  it('hides internal Codex title-generation threads from user-facing lists', () => {
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
