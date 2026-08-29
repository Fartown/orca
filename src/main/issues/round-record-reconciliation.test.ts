import { afterEach, describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { IssueRepository, issueMutationIdentity } from './issue-repository'
import { createProviderTurnRefValue } from './round-record-provider-turn-ref'
import { RoundRecordReconciler } from './round-record-reconciliation'

afterEach(removeIssueTestDirectories)

describe('RoundRecordReconciler', () => {
  it('upgrades the same provider turn and never supersedes a different turn', async () => {
    const repository = IssueRepository.open({
      profileId: 'profile-a',
      userDataPath: createIssueTestUserDataPath('orca-round-reconcile')
    })
    const managed = repository.conversationAllocator.resolveObservedIdentityOrAllocate({
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
      workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
      agent: 'codex',
      issueId: null,
      providerSession: { key: 'session_id', id: 'session-1' },
      observedAt: 1
    })
    const providerTurnRef = createProviderTurnRefValue(
      managed.identity.identityFingerprint,
      'turn-1'
    )
    const hookRound = repository.rounds.create({
      identity: issueMutationIdentity('hook', 'hook-turn-1'),
      input: {
        conversationId: managed.conversation.id,
        kind: 'completion',
        stateSource: 'hook',
        occurredAt: 10,
        dedupeKey: 'hook-turn-1',
        agentOutput: { text: 'runtime output' },
        refs: [{ kind: 'provider-turn', value: providerTurnRef, reachable: true }]
      }
    })

    let messages = transcriptMessages(['turn-1'])
    const reconciler = new RoundRecordReconciler(repository, {
      readTranscript: async () => ({ messages })
    })
    const first = await reconciler.reconcile(managed.conversation.id)
    expect(first).toMatchObject({ upgradedRoundIds: [hookRound.id], createdRoundIds: [] })
    expect(repository.rounds.get(hookRound.id)).toMatchObject({
      stateSource: 'reconciled',
      agentOutput: { text: 'reconciled turn-1', completeness: 'reconciled-preview' }
    })

    messages = transcriptMessages(['turn-1', 'turn-2'])
    const second = await reconciler.reconcile(managed.conversation.id)
    expect(second).toMatchObject({ createdRoundIds: [expect.any(String)] })
    const rounds = repository.rounds.list(managed.conversation.id)
    expect(rounds).toHaveLength(2)
    for (const round of rounds) {
      expect(round).not.toHaveProperty('executionChainId')
      expect(round).not.toHaveProperty('supersedesRoundId')
    }
    expect(rounds[0]).toMatchObject({ resolvedAt: 20, resolution: 'new-input' })
    expect(rounds[1]).toMatchObject({ resolvedAt: null, resolution: null })
    repository.close()
  })

  it('resolves the last completion when the transcript contains a later unanswered prompt', async () => {
    const repository = IssueRepository.open({
      profileId: 'profile-a',
      userDataPath: createIssueTestUserDataPath('orca-round-reconcile-later-prompt')
    })
    const managed = repository.conversationAllocator.resolveObservedIdentityOrAllocate({
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
      workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
      agent: 'codex',
      issueId: null,
      providerSession: { key: 'session_id', id: 'session-later-prompt' },
      observedAt: 1
    })
    const messages = [
      ...transcriptMessages(['turn-1']),
      {
        id: 'user-turn-2',
        role: 'user' as const,
        turnId: 'turn-2',
        blocks: [{ type: 'text' as const, text: 'follow-up' }],
        timestamp: 20,
        source: 'transcript' as const
      }
    ]
    const reconciler = new RoundRecordReconciler(repository, {
      readTranscript: async () => ({ messages })
    })

    await reconciler.reconcile(managed.conversation.id)

    expect(repository.rounds.list(managed.conversation.id)).toMatchObject([
      { resolvedAt: 20, resolution: 'new-input' }
    ])
    repository.close()
  })

  it('promotes a waiting hook Round when the same provider turn reconciles to completion', async () => {
    const repository = IssueRepository.open({
      profileId: 'profile-a',
      userDataPath: createIssueTestUserDataPath('orca-round-reconcile-waiting')
    })
    const managed = repository.conversationAllocator.resolveObservedIdentityOrAllocate({
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
      workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
      agent: 'codex',
      issueId: null,
      providerSession: { key: 'session_id', id: 'session-waiting' },
      observedAt: 1
    })
    const providerTurnRef = createProviderTurnRefValue(
      managed.identity.identityFingerprint,
      'turn-waiting'
    )
    const waiting = repository.rounds.create({
      identity: issueMutationIdentity('hook', 'hook-waiting'),
      input: {
        conversationId: managed.conversation.id,
        kind: 'waiting',
        waitingReason: 'question',
        stateSource: 'hook',
        occurredAt: 10,
        dedupeKey: 'hook-waiting',
        pendingQuestion: { text: 'Approve?' },
        refs: [{ kind: 'provider-turn', value: providerTurnRef, reachable: true }]
      }
    })
    const reconciler = new RoundRecordReconciler(repository, {
      readTranscript: async () => ({ messages: transcriptMessages(['turn-waiting']) })
    })

    await expect(reconciler.reconcile(managed.conversation.id)).resolves.toMatchObject({
      upgradedRoundIds: [waiting.id],
      createdRoundIds: []
    })
    expect(repository.rounds.list(managed.conversation.id)).toMatchObject([
      {
        id: waiting.id,
        kind: 'completion',
        waitingReason: null,
        stateSource: 'reconciled',
        agentOutput: {
          text: 'reconciled turn-waiting',
          completeness: 'reconciled-preview'
        }
      }
    ])
    repository.close()
  })
})

function transcriptMessages(turnIds: string[]): NativeChatMessage[] {
  return turnIds.flatMap((turnId, index) => [
    {
      id: `user-${turnId}`,
      role: 'user' as const,
      turnId,
      blocks: [{ type: 'text' as const, text: `prompt ${turnId}` }],
      timestamp: 10 + index * 10,
      source: 'transcript' as const
    },
    {
      id: `assistant-${turnId}`,
      role: 'assistant' as const,
      turnId,
      blocks: [{ type: 'text' as const, text: `reconciled ${turnId}` }],
      timestamp: 11 + index * 10,
      source: 'transcript' as const
    }
  ])
}
