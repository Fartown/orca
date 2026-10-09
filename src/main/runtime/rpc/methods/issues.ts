import {
  ConversationsBindIssueParams,
  ConversationsDeleteParams,
  ConversationsGetParams,
  ConversationsListParams,
  ConversationsPrepareDeleteParams,
  ConversationsPrepareLaunchParams,
  ConversationsRecordLaunchFailureParams,
  ConversationsPrepareRetryParams,
  ConversationsUpdateParams,
  IssuesCreateParams,
  IssuesDeleteParams,
  IssuesGetParams,
  IssuesLifecycleParams,
  IssuesListParams,
  IssuesListRoundsParams,
  IssuesMarkReadParams,
  IssuesPrepareDeleteParams,
  IssuesReparentParams,
  IssuesResolveRoundParams,
  IssuesStatusParams,
  IssuesUnsubscribeChangesParams,
  IssuesUpdateParams
} from '../../../../shared/issues/schemas'
import type { IssueRuntimeService } from '../../../issues/issue-runtime-service'
import { issueFeatureReadinessRegistry } from '../../../issues/issue-feature-readiness'
import { cancelIssueChanges, streamIssueChanges } from '../../../issues/issue-change-subscription'
import { defineMethod, defineStreamingMethod, InvalidArgumentError, type RpcContext } from '../core'

function service(): IssueRuntimeService {
  return issueFeatureReadinessRegistry.requireService() as IssueRuntimeService
}

function admitSelector(
  authorityExecutionHostId: 'local' | `ssh:${string}`,
  context: RpcContext
): void {
  // Desktop IPC is also clientKind=runtime; only a paired device is already one network hop away.
  if (
    context.clientKind === 'runtime' &&
    context.pairedDeviceId !== undefined &&
    authorityExecutionHostId !== 'local'
  ) {
    throw new InvalidArgumentError('Paired runtimes cannot route Issues through a second SSH hop.')
  }
}

function callerFingerprint(context: RpcContext): string {
  return context.authenticatedCallerFingerprint ?? context.pairedDeviceId ?? 'local-runtime'
}

export const ISSUE_METHODS = [
  defineStreamingMethod({
    permission: 'workspace',
    name: 'issues.subscribeChanges',
    params: null,
    handler: (_params, context, emit) => streamIssueChanges(context, emit)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.unsubscribeChanges',
    params: IssuesUnsubscribeChangesParams,
    handler: (params, context) => cancelIssueChanges(context, params.subscriptionId)
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.status',
    params: IssuesStatusParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return issueFeatureReadinessRegistry.status(params.authorityExecutionHostId)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.list',
    params: IssuesListParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().listIssues(params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.get',
    params: IssuesGetParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().getIssue(params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.create',
    params: IssuesCreateParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().createIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.update',
    params: IssuesUpdateParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().updateIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.archive',
    params: IssuesLifecycleParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().archiveIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.reopen',
    params: IssuesLifecycleParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().reopenIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.reparent',
    params: IssuesReparentParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().reparentIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.prepareDelete',
    params: IssuesPrepareDeleteParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return {
        authority: service().authorityDescriptor(params.authorityExecutionHostId),
        ...service().prepareDeleteIssue(params)
      }
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.delete',
    params: IssuesDeleteParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().deleteIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.markRead',
    params: IssuesMarkReadParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().markRead(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.resolveRound',
    params: IssuesResolveRoundParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().resolveRound(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'issues.listRounds',
    params: IssuesListRoundsParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().listRounds(params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'conversations.list',
    params: ConversationsListParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().listConversations(params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'conversations.get',
    params: ConversationsGetParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().getConversation(params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'conversations.update',
    params: ConversationsUpdateParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().updateConversation(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'conversations.bindIssue',
    params: ConversationsBindIssueParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().bindConversation(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'conversations.prepareLaunch',
    params: ConversationsPrepareLaunchParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().prepareLaunch(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'conversations.recordLaunchFailure',
    params: ConversationsRecordLaunchFailureParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().recordLaunchFailure(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'conversations.prepareRetry',
    params: ConversationsPrepareRetryParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().prepareRetry(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'conversations.prepareDelete',
    params: ConversationsPrepareDeleteParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().prepareDeleteConversation(params)
    }
  }),
  defineMethod({
    permission: 'workspace',
    name: 'conversations.delete',
    params: ConversationsDeleteParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().deleteConversation(callerFingerprint(context), params)
    }
  })
] as const
