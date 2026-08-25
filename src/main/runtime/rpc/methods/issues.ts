import {
  ConversationsBindIssueParams,
  ConversationsDeleteParams,
  ConversationsGetParams,
  ConversationsListParams,
  ConversationsPrepareDeleteParams,
  ConversationsPrepareLaunchParams,
  ConversationsRecordLaunchFailureParams,
  ConversationsPrepareResumeParams,
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
  IssuesUpdateParams
} from '../../../../shared/issues/schemas'
import type { IssueRuntimeService } from '../../../issues/issue-runtime-service'
import { issueFeatureReadinessRegistry } from '../../../issues/issue-feature-readiness'
import { defineMethod, InvalidArgumentError, type RpcContext } from '../core'

function service(): IssueRuntimeService {
  return issueFeatureReadinessRegistry.requireService() as IssueRuntimeService
}

function admitSelector(
  authorityExecutionHostId: 'local' | `ssh:${string}`,
  context: RpcContext
): void {
  if (context.clientKind === 'runtime' && authorityExecutionHostId !== 'local') {
    throw new InvalidArgumentError('Paired runtimes cannot route Issues through a second SSH hop.')
  }
}

function callerFingerprint(context: RpcContext): string {
  return context.authenticatedCallerFingerprint ?? context.pairedDeviceId ?? 'local-runtime'
}

export const ISSUE_METHODS = [
  defineMethod({
    name: 'issues.status',
    params: IssuesStatusParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return issueFeatureReadinessRegistry.status(params.authorityExecutionHostId)
    }
  }),
  defineMethod({
    name: 'issues.list',
    params: IssuesListParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().listIssues(params)
    }
  }),
  defineMethod({
    name: 'issues.get',
    params: IssuesGetParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().getIssue(params)
    }
  }),
  defineMethod({
    name: 'issues.create',
    params: IssuesCreateParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().createIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'issues.update',
    params: IssuesUpdateParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().updateIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'issues.archive',
    params: IssuesLifecycleParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().archiveIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'issues.reopen',
    params: IssuesLifecycleParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().reopenIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'issues.reparent',
    params: IssuesReparentParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().reparentIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
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
    name: 'issues.delete',
    params: IssuesDeleteParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().deleteIssue(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'issues.markRead',
    params: IssuesMarkReadParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().markRead(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'issues.resolveRound',
    params: IssuesResolveRoundParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().resolveRound(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'issues.listRounds',
    params: IssuesListRoundsParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().listRounds(params)
    }
  }),
  defineMethod({
    name: 'conversations.list',
    params: ConversationsListParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().listConversations(params)
    }
  }),
  defineMethod({
    name: 'conversations.get',
    params: ConversationsGetParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().getConversation(params)
    }
  }),
  defineMethod({
    name: 'conversations.update',
    params: ConversationsUpdateParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().updateConversation(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'conversations.bindIssue',
    params: ConversationsBindIssueParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().bindConversation(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'conversations.prepareLaunch',
    params: ConversationsPrepareLaunchParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().prepareLaunch(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'conversations.recordLaunchFailure',
    params: ConversationsRecordLaunchFailureParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().recordLaunchFailure(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'conversations.prepareRetry',
    params: ConversationsPrepareRetryParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().prepareRetry(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'conversations.prepareResume',
    params: ConversationsPrepareResumeParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().prepareResume(callerFingerprint(context), params)
    }
  }),
  defineMethod({
    name: 'conversations.prepareDelete',
    params: ConversationsPrepareDeleteParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().prepareDeleteConversation(params)
    }
  }),
  defineMethod({
    name: 'conversations.delete',
    params: ConversationsDeleteParams,
    handler: (params, context) => {
      admitSelector(params.authorityExecutionHostId, context)
      return service().deleteConversation(callerFingerprint(context), params)
    }
  })
] as const
