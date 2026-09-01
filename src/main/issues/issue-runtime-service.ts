import type {
  AuthorityExecutionHostId,
  ConversationLaunchPreparation,
  IssueAuthorityDescriptor,
  IssueMutationIdentity
} from '../../shared/issues/types'
import { ConversationForgetService } from './conversation-forget-service'
import type { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'
import { issueAuthorityDescriptor, type ManagedSshTargetResolver } from './issue-authority-route'
import type { IssueRuntimeServiceContract } from './issue-feature-readiness'
import { IssueQueryService } from './issue-query-service'
import type { IssueRepository } from './issue-repository'
import type {
  BindConversationRuntimeParams,
  CreateIssueRuntimeParams,
  DeleteConversationRuntimeParams,
  DeleteIssueRuntimeParams,
  IssueLifecycleRuntimeParams,
  PrepareDeleteConversationRuntimeParams,
  PrepareDeleteIssueRuntimeParams,
  PrepareLaunchRuntimeParams,
  PrepareRetryRuntimeParams,
  RecordLaunchFailureRuntimeParams,
  ReparentIssueRuntimeParams,
  RoundMutationRuntimeParams,
  UpdateConversationRuntimeParams,
  UpdateIssueRuntimeParams
} from './issue-runtime-mutation-params'
import { IssueRuntimeRouteGuard } from './issue-runtime-route-guard'

export type IssueRuntimeServiceOptions = {
  profileLabel?: string
  managedSshTargets?: ManagedSshTargetResolver
  attachments: ConversationRuntimeAttachmentRegistry
}

export class IssueRuntimeService implements IssueRuntimeServiceContract {
  readonly query: IssueQueryService
  readonly forget: ConversationForgetService
  private readonly routes: IssueRuntimeRouteGuard

  constructor(
    readonly repository: IssueRepository,
    private readonly options: IssueRuntimeServiceOptions
  ) {
    this.query = new IssueQueryService(repository, options.profileLabel, options.attachments)
    this.routes = new IssueRuntimeRouteGuard(repository, options.managedSshTargets)
    this.forget = new ConversationForgetService(
      repository.database,
      repository.conversations,
      repository.conversationLaunchClaims,
      options.attachments
    )
  }

  authorityDescriptor(executionHostId: AuthorityExecutionHostId): IssueAuthorityDescriptor {
    return issueAuthorityDescriptor(
      this.repository.database,
      this.routes.resolve(executionHostId),
      this.options.profileLabel
    )
  }

  listIssues(params: Parameters<IssueQueryService['listIssues']>[1]) {
    return this.query.listIssues(this.routes.resolve(params.authorityExecutionHostId), params)
  }

  listConversations(params: Parameters<IssueQueryService['listConversations']>[1]) {
    return this.query.listConversations(
      this.routes.resolve(params.authorityExecutionHostId),
      params
    )
  }

  listRounds(params: Parameters<IssueQueryService['listRounds']>[1]) {
    return this.query.listRounds(this.routes.resolve(params.authorityExecutionHostId), params)
  }

  getIssue(params: { authorityExecutionHostId: AuthorityExecutionHostId; issueId: string }) {
    return this.query.getIssue(this.routes.resolve(params.authorityExecutionHostId), params.issueId)
  }

  getConversation(params: {
    authorityExecutionHostId: AuthorityExecutionHostId
    conversationId: string
  }) {
    return this.routes.requireConversation(params.authorityExecutionHostId, params.conversationId)
  }

  createIssue(callerFingerprint: string, params: CreateIssueRuntimeParams) {
    const identity = mutationIdentity(callerFingerprint, params.mutationId)
    const common = {
      executionHostId: this.routes.resolve(params.authorityExecutionHostId)
        .authorityExecutionHostId,
      parentId: params.parentId,
      index: params.index,
      typeLabel: params.typeLabel,
      note: params.note
    }
    return params.source.kind === 'local'
      ? this.repository.issues.createLocal({
          identity,
          input: { ...common, title: params.source.title }
        })
      : this.repository.issues.trackExternal({
          identity,
          input: {
            ...common,
            provider: params.source.provider,
            identifier: params.source.identifier,
            url: params.source.url,
            titleSnapshot: params.source.titleSnapshot
          }
        })
  }

  updateIssue(callerFingerprint: string, params: UpdateIssueRuntimeParams) {
    this.routes.requireIssue(params.authorityExecutionHostId, params.issueId)
    return this.repository.issues.update({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: {
        id: params.issueId,
        expectedRecordRevision: params.expectedRecordRevision,
        title: params.title,
        typeLabel: params.typeLabel,
        note: params.note
      }
    })
  }

  archiveIssue(callerFingerprint: string, params: IssueLifecycleRuntimeParams) {
    this.routes.requireIssue(params.authorityExecutionHostId, params.issueId)
    return this.repository.issueLifecycle.archive({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: { id: params.issueId, expectedRecordRevision: params.expectedRecordRevision }
    })
  }

  reopenIssue(callerFingerprint: string, params: IssueLifecycleRuntimeParams) {
    this.routes.requireIssue(params.authorityExecutionHostId, params.issueId)
    return this.repository.issueLifecycle.reopen({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: { id: params.issueId, expectedRecordRevision: params.expectedRecordRevision }
    })
  }

  reparentIssue(callerFingerprint: string, params: ReparentIssueRuntimeParams) {
    this.routes.requireIssue(params.authorityExecutionHostId, params.issueId)
    if (params.parentId) {
      this.routes.requireIssue(params.authorityExecutionHostId, params.parentId)
    }
    return this.repository.issueHierarchy.reparent({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: params
    })
  }

  prepareDeleteIssue(params: PrepareDeleteIssueRuntimeParams) {
    this.routes.requireIssue(params.authorityExecutionHostId, params.issueId)
    return this.repository.issueDeletion.prepare(params.issueId)
  }

  deleteIssue(callerFingerprint: string, params: DeleteIssueRuntimeParams) {
    this.routes.requireIssue(params.authorityExecutionHostId, params.plan.issueId)
    return this.repository.issueDeletion.commit({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: params.plan
    })
  }

  updateConversation(callerFingerprint: string, params: UpdateConversationRuntimeParams) {
    this.routes.requireConversation(params.authorityExecutionHostId, params.conversationId)
    return this.repository.conversations.updateTitle({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: {
        id: params.conversationId,
        expectedRecordRevision: params.expectedRecordRevision,
        title: params.title
      }
    })
  }

  bindConversation(callerFingerprint: string, params: BindConversationRuntimeParams) {
    this.routes.requireConversation(params.authorityExecutionHostId, params.conversationId)
    if (params.issueId) {
      this.routes.requireIssue(params.authorityExecutionHostId, params.issueId)
    }
    return this.repository.conversations.bindIssue({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: {
        id: params.conversationId,
        expectedRecordRevision: params.expectedRecordRevision,
        issueId: params.issueId
      }
    })
  }

  prepareLaunch(
    callerFingerprint: string,
    params: PrepareLaunchRuntimeParams
  ): ConversationLaunchPreparation {
    const input = {
      executionHostId: this.routes.resolve(params.authorityExecutionHostId)
        .authorityExecutionHostId,
      launchToken: params.launchToken,
      workspaceRef: params.workspaceRef,
      workspaceSnapshot: params.workspaceSnapshot,
      agent: params.agent,
      issueId: params.issueId
    }
    return this.repository.conversationAllocator.prepareLaunch({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      // Why: a caller-supplied initial title is a user-declared name — it
      // freezes automatic renaming just like a manual rename would.
      input: params.title ? { ...input, title: params.title, titleSource: 'user' as const } : input
    })
  }

  prepareRetry(
    callerFingerprint: string,
    params: PrepareRetryRuntimeParams
  ): ConversationLaunchPreparation {
    this.routes.requireConversation(params.authorityExecutionHostId, params.conversationId)
    return this.repository.conversationAllocator.prepareRetry({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: {
        conversationId: params.conversationId,
        expectedRecordRevision: params.expectedRecordRevision,
        launchToken: params.launchToken
      }
    })
  }

  recordLaunchFailure(callerFingerprint: string, params: RecordLaunchFailureRuntimeParams) {
    this.routes.requireConversation(params.authorityExecutionHostId, params.conversationId)
    return this.repository.conversationAllocator.recordLaunchFailure({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: {
        conversationId: params.conversationId,
        claimId: params.claimId,
        expectedRecordRevision: params.expectedRecordRevision,
        failure: params.failure
      }
    })
  }

  prepareDeleteConversation(params: PrepareDeleteConversationRuntimeParams) {
    this.routes.requireConversation(params.authorityExecutionHostId, params.conversationId)
    return this.forget.prepare(params.conversationId)
  }

  deleteConversation(callerFingerprint: string, params: DeleteConversationRuntimeParams) {
    this.routes.requireConversation(params.authorityExecutionHostId, params.conversationId)
    return this.forget.forget({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      conversationId: params.conversationId,
      expectedRecordRevision: params.expectedRecordRevision,
      preflightToken: params.preflightToken
    })
  }

  markRead(callerFingerprint: string, params: RoundMutationRuntimeParams) {
    this.routes.requireRound(params.authorityExecutionHostId, params.roundId)
    return this.repository.rounds.markRead({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: { id: params.roundId, readAt: Date.now() },
      idempotencyPayload: { id: params.roundId }
    })
  }

  resolveRound(callerFingerprint: string, params: RoundMutationRuntimeParams) {
    this.routes.requireRound(params.authorityExecutionHostId, params.roundId)
    return this.repository.rounds.resolve({
      identity: mutationIdentity(callerFingerprint, params.mutationId),
      input: { id: params.roundId, resolvedAt: Date.now(), resolution: 'explicit' },
      idempotencyPayload: { id: params.roundId, resolution: 'explicit' }
    })
  }
}

function mutationIdentity(callerFingerprint: string, mutationId: string): IssueMutationIdentity {
  return { callerFingerprint, mutationId }
}
