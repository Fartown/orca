import type { AgentSessionIdentityPathAccess } from '../runtime/agent-session-claim-identity'
import {
  ConversationHookIdentityIngestor,
  type ConversationHookIdentityContext
} from './conversation-hook-identity-ingestor'
import { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'
import type { IssueFeatureReadinessRegistry } from './issue-feature-readiness'
import { issueFeatureReadinessRegistry } from './issue-feature-readiness'
import type { IssueHookSnapshotLiveCoordinator } from './issue-hook-snapshot-live-coordinator'
import { IssueRepository } from './issue-repository'
import { IssueRuntimeService } from './issue-runtime-service'
import { RoundRecordIngestor } from './round-record-ingestor'
import { RoundRecordReconciler } from './round-record-reconciliation'
import type { ManagedSshTargetResolver } from './issue-authority-route'
import type { IssueDatabaseMigrationHooks } from './issue-database-migrations'
import {
  IssueHookEvidenceReconciler,
  type IssueHookEvidenceSnapshot
} from './issue-hook-evidence-reconciliation'
import {
  createIssueHookCoordinator,
  currentEvidencePaneKeys,
  readIssueHookSnapshot,
  type BufferedHookEvent,
  type IssueAgentHookSource
} from './issue-hook-coordinator'

export type { IssueAgentHookSource } from './issue-hook-coordinator'

export type IssueWorkspaceResolver = {
  resolve(input: {
    paneKey: string
    worktreeId?: string
    connectionId: string | null
  }): Promise<ConversationHookIdentityContext | null>
  pathAccess?(context: ConversationHookIdentityContext): AgentSessionIdentityPathAccess | null
}

export type IssueFeatureBootstrapOptions = {
  profileId: string
  profileLabel: string
  userDataPath: string
  workspaceResolver: IssueWorkspaceResolver
  hookSource: IssueAgentHookSource | null
  hookEvidenceStatus: 'ready' | 'disabled' | 'failed'
  managedSshTargets?: ManagedSshTargetResolver
  migrationHooks?: IssueDatabaseMigrationHooks
  readinessRegistry?: IssueFeatureReadinessRegistry
}

export class IssueFeatureBootstrap {
  readonly service: IssueRuntimeService
  readonly attachments: ConversationRuntimeAttachmentRegistry
  private readonly repository: IssueRepository
  private readonly unregisterReadiness: () => void
  private readonly stopProviderSubscription: (() => void) | null
  private readonly stopStatusSubscription: (() => void) | null
  private readonly stopPaneClearSubscription: (() => void) | null
  private readonly coordinator: IssueHookSnapshotLiveCoordinator<
    IssueHookEvidenceSnapshot,
    BufferedHookEvent
  > | null
  private readonly drainEvidenceReconciliation: () => Promise<void>
  private disposed = false

  private constructor(params: {
    service: IssueRuntimeService
    attachments: ConversationRuntimeAttachmentRegistry
    repository: IssueRepository
    unregisterReadiness: () => void
    stopProviderSubscription: (() => void) | null
    stopStatusSubscription: (() => void) | null
    stopPaneClearSubscription: (() => void) | null
    coordinator: IssueHookSnapshotLiveCoordinator<
      IssueHookEvidenceSnapshot,
      BufferedHookEvent
    > | null
    drainEvidenceReconciliation: () => Promise<void>
  }) {
    Object.assign(this, params)
    this.service = params.service
    this.attachments = params.attachments
    this.repository = params.repository
    this.unregisterReadiness = params.unregisterReadiness
    this.stopProviderSubscription = params.stopProviderSubscription
    this.stopStatusSubscription = params.stopStatusSubscription
    this.stopPaneClearSubscription = params.stopPaneClearSubscription
    this.coordinator = params.coordinator
    this.drainEvidenceReconciliation = params.drainEvidenceReconciliation
  }

  static async create(options: IssueFeatureBootstrapOptions): Promise<IssueFeatureBootstrap> {
    const readinessRegistry = options.readinessRegistry ?? issueFeatureReadinessRegistry
    let repository: IssueRepository
    try {
      repository = IssueRepository.open({
        profileId: options.profileId,
        userDataPath: options.userDataPath,
        migrationHooks: options.migrationHooks
      })
    } catch (error) {
      const reason = String(error).includes('migration')
        ? 'storage-migration-failed'
        : 'storage-open-failed'
      readinessRegistry.setUnavailable(reason, options.hookEvidenceStatus)
      throw error
    }
    const attachments = new ConversationRuntimeAttachmentRegistry()
    const service = new IssueRuntimeService(repository, {
      profileLabel: options.profileLabel,
      managedSshTargets: options.managedSshTargets,
      attachments
    })
    const unregisterReadiness = readinessRegistry.register(service, options.hookEvidenceStatus)
    let coordinator: IssueHookSnapshotLiveCoordinator<
      IssueHookEvidenceSnapshot,
      BufferedHookEvent
    > | null = null
    let stopProviderSubscription: (() => void) | null = null
    let stopStatusSubscription: (() => void) | null = null
    let stopPaneClearSubscription: (() => void) | null = null
    let evidenceChain = Promise.resolve()
    try {
      if (options.hookSource && options.hookEvidenceStatus === 'ready') {
        const identityIngestor = new ConversationHookIdentityIngestor(repository, {
          resolveContext: (paneKey, worktreeId, connectionId) =>
            options.workspaceResolver.resolve({
              paneKey,
              worktreeId,
              connectionId: connectionId ?? null
            }),
          resolvePathAccess: (context) => options.workspaceResolver.pathAccess?.(context) ?? null,
          attachments
        })
        const reconciler = new RoundRecordReconciler(repository)
        const roundIngestor = new RoundRecordIngestor(repository, identityIngestor, {
          scheduleReconciliation: (conversationId) => {
            void reconciler.schedule(conversationId).catch((error) => {
              console.error('[issues] Round reconciliation failed:', error)
            })
          }
        })
        const evidenceReconciler = new IssueHookEvidenceReconciler(identityIngestor)
        const scheduleEvidenceReconciliation = (): void => {
          evidenceChain = evidenceChain
            .then(() => evidenceReconciler.reconcile(readIssueHookSnapshot(options.hookSource!)))
            .catch((error) => {
              console.error('[issues] hook evidence reconciliation failed:', error)
            })
        }
        coordinator = createIssueHookCoordinator(
          options.hookSource,
          roundIngestor,
          evidenceReconciler
        )
        stopProviderSubscription = options.hookSource.subscribeProviderSessionChanges(() => {
          scheduleEvidenceReconciliation()
        })
        stopStatusSubscription = options.hookSource.subscribeStatusChanges(() => {
          attachments.retainEvidencePanes(currentEvidencePaneKeys(options.hookSource!))
          scheduleEvidenceReconciliation()
        })
        stopPaneClearSubscription = options.hookSource.subscribePaneStatusClear((clear) => {
          if ('transient' in clear) {
            attachments.clearConnection(clear.connectionId)
          } else {
            attachments.clearPane({ paneKey: clear.paneKey })
          }
        })
        await coordinator.start()
      }
      return new IssueFeatureBootstrap({
        service,
        attachments,
        repository,
        unregisterReadiness,
        stopProviderSubscription,
        stopStatusSubscription,
        stopPaneClearSubscription,
        coordinator,
        drainEvidenceReconciliation: () => evidenceChain
      })
    } catch (error) {
      coordinator?.dispose()
      stopProviderSubscription?.()
      stopStatusSubscription?.()
      stopPaneClearSubscription?.()
      unregisterReadiness()
      repository.close()
      throw error
    }
  }

  async drainHookEvents(): Promise<void> {
    await this.coordinator?.drain()
    await this.drainEvidenceReconciliation()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.coordinator?.dispose()
    this.stopProviderSubscription?.()
    this.stopStatusSubscription?.()
    this.stopPaneClearSubscription?.()
    this.unregisterReadiness()
    this.repository.close()
  }
}
