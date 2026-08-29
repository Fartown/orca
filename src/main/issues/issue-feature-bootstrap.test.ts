import { afterEach, describe, expect, it } from 'vitest'
import { ConversationsListParams } from '../../shared/issues/query-rpc-schemas'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import {
  createIssueTestUserDataPath,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { IssueFeatureBootstrap, type IssueAgentHookSource } from './issue-feature-bootstrap'
import { IssueFeatureReadinessRegistry } from './issue-feature-readiness'
import { IssueRepository } from './issue-repository'

afterEach(removeIssueTestDirectories)

describe('IssueFeatureBootstrap', () => {
  it('keeps CRUD available in degraded mode without materializing ordinary launches', async () => {
    const readiness = new IssueFeatureReadinessRegistry()
    const bootstrap = await IssueFeatureBootstrap.create({
      profileId: 'profile-a',
      profileLabel: 'Profile A',
      userDataPath: createIssueTestUserDataPath('orca-bootstrap-degraded'),
      workspaceResolver: resolver(),
      hookSource: null,
      hookEvidenceStatus: 'disabled',
      readinessRegistry: readiness
    })

    expect(readiness.status('local')).toMatchObject({
      status: 'degraded',
      storage: 'ready',
      hookEvidence: 'disabled'
    })
    bootstrap.service.createIssue('caller-a', {
      authorityExecutionHostId: 'local',
      mutationId: 'create',
      source: { kind: 'local', title: 'Still writable' }
    })
    const conversations = bootstrap.service.listConversations(
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' }
      })
    )
    expect(conversations).toMatchObject({ status: 'snapshot-page', conversations: [] })
    bootstrap.dispose()
    expect(readiness.status('local').status).toBe('unavailable')
  })

  it('subscribes before snapshot and ingests a live hook emitted in the seed window', async () => {
    const readiness = new IssueFeatureReadinessRegistry()
    const source = new FakeHookSource()
    source.emitDuringSnapshot = liveEvent('session-live')
    const bootstrap = await IssueFeatureBootstrap.create({
      profileId: 'profile-a',
      profileLabel: 'Profile A',
      userDataPath: createIssueTestUserDataPath('orca-bootstrap-live'),
      workspaceResolver: resolver(),
      hookSource: source.asSource(),
      hookEvidenceStatus: 'ready',
      readinessRegistry: readiness
    })
    await bootstrap.drainHookEvents()

    const conversations = bootstrap.service.listConversations(
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' }
      })
    )
    expect(conversations).toMatchObject({
      status: 'snapshot-page',
      conversations: [{ issueId: null, workspaceRef: { worktreeId: 'worktree-1' } }]
    })
    expect(source.subscriptions).toMatchObject({ enriched: 1, provider: 1, status: 1, clear: 1 })
    bootstrap.dispose()
    expect(source.unsubscriptions).toMatchObject({ enriched: 1, provider: 1, status: 1, clear: 1 })
  })

  it('detaches when teardown removes every trusted pane evidence snapshot', async () => {
    const source = new FakeHookSource()
    source.emitDuringSnapshot = liveEvent('session-detach')
    const bootstrap = await IssueFeatureBootstrap.create({
      profileId: 'profile-a',
      profileLabel: 'Profile A',
      userDataPath: createIssueTestUserDataPath('orca-bootstrap-detach'),
      workspaceResolver: resolver(),
      hookSource: source.asSource(),
      hookEvidenceStatus: 'ready'
    })
    await bootstrap.drainHookEvents()
    let conversations = bootstrap.service.listConversations(
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' }
      })
    )
    expect(conversations).toMatchObject({
      status: 'snapshot-page',
      conversations: [{ attachment: { kind: 'attached' } }]
    })

    source.emitDuringSnapshot = null
    source.providerSessionPaneKeys = ['pane-1']
    source.emitStatusChange()
    conversations = bootstrap.service.listConversations(
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' }
      })
    )
    expect(conversations).toMatchObject({
      status: 'snapshot-page',
      conversations: [{ attachment: { kind: 'attached' } }]
    })

    source.providerSessionPaneKeys = []
    source.emitStatusChange()

    conversations = bootstrap.service.listConversations(
      ConversationsListParams.parse({
        mode: 'start',
        authorityExecutionHostId: 'local',
        scope: { kind: 'authority' }
      })
    )
    expect(conversations).toMatchObject({
      status: 'snapshot-page',
      conversations: [{ attachment: { kind: 'detached' } }]
    })
    bootstrap.dispose()
  })

  it('keeps hydrated-only evidence detached and unverifiable for an existing identity', async () => {
    const userDataPath = createIssueTestUserDataPath('orca-bootstrap-hydrated')
    const existingConversationId = seedManagedConversation(userDataPath, 'session-restored')
    const source = new FakeHookSource()
    source.setRestoredEvidence('session-restored')
    const bootstrap = await IssueFeatureBootstrap.create({
      profileId: 'profile-a',
      profileLabel: 'Profile A',
      userDataPath,
      workspaceResolver: resolver(),
      hookSource: source.asSource(),
      hookEvidenceStatus: 'ready'
    })
    await bootstrap.drainHookEvents()

    const conversations = listConversations(bootstrap)
    expect(conversations).toMatchObject({
      status: 'snapshot-page',
      conversations: [
        {
          id: existingConversationId,
          attachment: { kind: 'detached' },
          livenessVerdict: 'unverifiable'
        }
      ]
    })
    bootstrap.dispose()

    const emptySource = new FakeHookSource()
    emptySource.setRestoredEvidence('session-without-db-identity')
    const emptyBootstrap = await IssueFeatureBootstrap.create({
      profileId: 'profile-empty',
      profileLabel: 'Empty',
      userDataPath,
      workspaceResolver: resolver(),
      hookSource: emptySource.asSource(),
      hookEvidenceStatus: 'ready'
    })
    expect(listConversations(emptyBootstrap)).toMatchObject({
      status: 'snapshot-page',
      conversations: []
    })
    emptyBootstrap.dispose()
  })

  it('does not persist Codex title-generation utility snapshot evidence', async () => {
    const source = new FakeHookSource()
    source.statusSnapshot = [
      {
        paneKey: 'pane-title-generation',
        tabId: 'tab-title-generation',
        worktreeId: 'worktree-1',
        connectionId: null,
        receivedAt: 20,
        stateStartedAt: 10,
        state: 'done',
        prompt:
          'Generate a concise, single-line task title of at most 36 characters. Start with an imperative verb.',
        lastAssistantMessage: '{"title":"Investigate issue"}',
        agentType: 'codex',
        providerSession: { key: 'session_id', id: 'utility-session' }
      }
    ]
    source.providerIdentities = [
      {
        paneKey: 'pane-title-generation',
        sessionId: 'utility-session',
        worktreeId: 'worktree-1'
      }
    ]
    source.currentAuthorities = [
      {
        paneKey: 'pane-title-generation',
        launchTokenHash: 'a'.repeat(64),
        connectionId: null,
        tabId: 'tab-title-generation',
        worktreeId: 'worktree-1',
        observedAt: 20
      }
    ]
    const bootstrap = await IssueFeatureBootstrap.create({
      profileId: 'profile-a',
      profileLabel: 'Profile A',
      userDataPath: createIssueTestUserDataPath('orca-bootstrap-title-generation'),
      workspaceResolver: resolver(),
      hookSource: source.asSource(),
      hookEvidenceStatus: 'ready'
    })
    await bootstrap.drainHookEvents()

    expect(listConversations(bootstrap)).toMatchObject({
      status: 'snapshot-page',
      conversations: []
    })
    bootstrap.dispose()
  })

  it('waits for current authority before attaching hydrated provider-session evidence', async () => {
    const userDataPath = createIssueTestUserDataPath('orca-bootstrap-provider-live')
    const conversationId = seedManagedConversation(userDataPath, 'session-provider-live')
    const source = new FakeHookSource()
    const bootstrap = await IssueFeatureBootstrap.create({
      profileId: 'profile-a',
      profileLabel: 'Profile A',
      userDataPath,
      workspaceResolver: resolver(),
      hookSource: source.asSource(),
      hookEvidenceStatus: 'ready'
    })
    expect(listConversations(bootstrap)).toMatchObject({
      conversations: [{ id: conversationId, attachment: { kind: 'detached' } }]
    })

    source.setRestoredEvidence('session-provider-live')
    source.emitProviderSessionChange()
    await bootstrap.drainHookEvents()

    expect(listConversations(bootstrap)).toMatchObject({
      conversations: [
        {
          id: conversationId,
          attachment: { kind: 'detached' },
          livenessVerdict: 'unverifiable'
        }
      ]
    })

    source.confirmRestoredEvidence()
    source.emitProviderSessionChange()
    await bootstrap.drainHookEvents()

    expect(listConversations(bootstrap)).toMatchObject({
      conversations: [{ id: conversationId, attachment: { kind: 'attached' } }]
    })
    bootstrap.dispose()
  })

  it('leaves status readable when migration fails before service construction', async () => {
    const readiness = new IssueFeatureReadinessRegistry()
    await expect(
      IssueFeatureBootstrap.create({
        profileId: 'profile-a',
        profileLabel: 'Profile A',
        userDataPath: createIssueTestUserDataPath('orca-bootstrap-failed'),
        workspaceResolver: resolver(),
        hookSource: null,
        hookEvidenceStatus: 'ready',
        readinessRegistry: readiness,
        migrationHooks: {
          beforeVersionBump: () => {
            throw new Error('injected migration failure')
          }
        }
      })
    ).rejects.toThrow('injected migration failure')
    expect(readiness.status('local')).toEqual({
      status: 'unavailable',
      storage: 'failed',
      hookEvidence: 'ready',
      reason: 'storage-migration-failed',
      authority: null
    })
  })
})

class FakeHookSource {
  emitDuringSnapshot: unknown = null
  providerSessionPaneKeys: string[] = []
  statusSnapshot: AgentStatusIpcPayload[] = []
  providerIdentities: ReturnType<IssueAgentHookSource['getProviderSessionIdentities']> = []
  hydratedAuthorities: ReturnType<IssueAgentHookSource['getHydratedAuthorityCommitments']> = []
  currentAuthorities: ReturnType<IssueAgentHookSource['getCurrentAuthorityObservations']> = []
  subscriptions = { enriched: 0, provider: 0, status: 0, clear: 0 }
  unsubscriptions = { enriched: 0, provider: 0, status: 0, clear: 0 }
  private enrichedListener: ((event: unknown) => void) | null = null
  private statusListener: (() => void) | null = null
  private providerListener:
    | Parameters<IssueAgentHookSource['subscribeProviderSessionChanges']>[0]
    | null = null

  asSource(): IssueAgentHookSource {
    return this as unknown as IssueAgentHookSource
  }

  getStatusSnapshot(): AgentStatusIpcPayload[] {
    if (this.emitDuringSnapshot) {
      this.enrichedListener?.(this.emitDuringSnapshot)
    }
    return this.statusSnapshot
  }

  getProviderSessionIdentities() {
    return this.providerIdentities.length > 0
      ? this.providerIdentities
      : this.providerSessionPaneKeys.map((paneKey) => ({
          paneKey,
          sessionId: `session-${paneKey}`
        }))
  }

  getHydratedAuthorityCommitments() {
    return this.hydratedAuthorities
  }

  getCurrentAuthorityObservations() {
    return this.currentAuthorities
  }

  subscribeEnrichedStatus(listener: (event: unknown) => void): () => void {
    this.subscriptions.enriched += 1
    this.enrichedListener = listener
    return () => {
      this.unsubscriptions.enriched += 1
      this.enrichedListener = null
    }
  }

  subscribeProviderSessionChanges(
    listener: Parameters<IssueAgentHookSource['subscribeProviderSessionChanges']>[0]
  ): () => void {
    this.subscriptions.provider += 1
    this.providerListener = listener
    return () => {
      this.unsubscriptions.provider += 1
      this.providerListener = null
    }
  }

  subscribeStatusChanges(listener: () => void): () => void {
    this.subscriptions.status += 1
    this.statusListener = listener
    return () => {
      this.unsubscriptions.status += 1
      this.statusListener = null
    }
  }

  emitStatusChange(): void {
    this.statusListener?.()
  }

  emitProviderSessionChange(): void {
    this.providerListener?.(this.getProviderSessionIdentities())
  }

  setRestoredEvidence(sessionId: string): void {
    this.statusSnapshot = [
      {
        paneKey: 'pane-restored',
        tabId: 'tab-restored',
        worktreeId: 'worktree-1',
        connectionId: null,
        receivedAt: 20,
        stateStartedAt: 10,
        state: 'working',
        prompt: 'Restored work',
        agentType: 'codex',
        providerSession: { key: 'session_id', id: sessionId },
        restoredUnconfirmed: true
      }
    ]
    this.providerIdentities = [{ paneKey: 'pane-restored', sessionId, worktreeId: 'worktree-1' }]
    this.hydratedAuthorities = [
      {
        paneKey: 'pane-restored',
        launchTokenHash: 'a'.repeat(64),
        connectionId: null,
        tabId: 'tab-restored',
        worktreeId: 'worktree-1',
        observedAt: 20
      }
    ]
  }

  confirmRestoredEvidence(): void {
    this.statusSnapshot = this.statusSnapshot.map((status) => ({
      ...status,
      restoredUnconfirmed: undefined,
      receivedAt: status.receivedAt + 1
    }))
    this.currentAuthorities = this.hydratedAuthorities.map((authority) => ({
      ...authority,
      observedAt: authority.observedAt + 1
    }))
  }

  subscribePaneStatusClear(): () => void {
    this.subscriptions.clear += 1
    return () => {
      this.unsubscriptions.clear += 1
    }
  }
}

function resolver() {
  return {
    resolve: async () => ({
      executionHostId: 'local' as const,
      workspaceRef: { type: 'worktree' as const, worktreeId: 'worktree-1' },
      workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
      processIncarnation: 'process-1',
      connectionId: null,
      hostPlatform: 'darwin' as const
    })
  }
}

function liveEvent(sessionId: string) {
  return {
    paneKey: 'pane-1',
    tabId: 'tab-1',
    worktreeId: 'worktree-1',
    connectionId: null,
    providerSession: { key: 'session_id', id: sessionId },
    receivedAt: 10,
    stateStartedAt: 9,
    payload: {
      state: 'working',
      prompt: 'Do work',
      agentType: 'codex'
    }
  }
}

function seedManagedConversation(userDataPath: string, sessionId: string): string {
  const repository = IssueRepository.open({ profileId: 'profile-a', userDataPath })
  const result = repository.conversationAllocator.resolveObservedIdentityOrAllocate({
    executionHostId: 'local',
    workspaceRef: { type: 'worktree', worktreeId: 'worktree-1' },
    workspaceSnapshot: { name: 'Workspace', path: '/workspace' },
    agent: 'codex',
    issueId: null,
    providerSession: { key: 'session_id', id: sessionId },
    observedAt: 1
  })
  repository.close()
  return result.conversation.id
}

function listConversations(bootstrap: IssueFeatureBootstrap) {
  return bootstrap.service.listConversations(
    ConversationsListParams.parse({
      mode: 'start',
      authorityExecutionHostId: 'local',
      scope: { kind: 'authority' }
    })
  )
}
