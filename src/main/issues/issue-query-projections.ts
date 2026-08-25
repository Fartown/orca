import type {
  ConversationSummary,
  EffectiveConversationProject,
  IssueSummary,
  RoundRecordPreview
} from '../../shared/issues/types'
import type { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'
import type { IssueRepository } from './issue-repository'
import type { IssueAuthorityRoute } from './issue-authority-route'

export type IssueWorkspaceProjectionResolver = {
  effectiveProject(conversationId: string): EffectiveConversationProject
  workspaceAvailable(conversationId: string): boolean
}

const DEFAULT_WORKSPACE_RESOLVER: IssueWorkspaceProjectionResolver = {
  effectiveProject: () => null,
  workspaceAvailable: () => true
}

export function readIssueSummaries(
  repository: IssueRepository,
  route: IssueAuthorityRoute,
  attachments?: ConversationRuntimeAttachmentRegistry
): IssueSummary[] {
  const issues = repository.issues
    .list()
    .filter((issue) => issue.hostPartitionKey === route.hostPartitionKey)
  return issues.map((issue) => {
    const conversations = repository.conversations
      .list()
      .filter((conversation) => conversation.issueId === issue.id)
    const ownUnresolvedCount = conversations.reduce(
      (count, conversation) =>
        count +
        repository.rounds.list(conversation.id).filter((round) => round.resolvedAt === null).length,
      0
    )
    return {
      ...issue,
      ownUnresolvedCount,
      descendantAttentionCount: 0,
      directConversationCount: conversations.length,
      runningConversationCount: conversations.filter((conversation) => {
        const state = attachments?.getDeleteState(conversation.id).executionState
        return state === 'running' || state === 'launching'
      }).length
    }
  })
}

export function readConversationSummaries(params: {
  repository: IssueRepository
  route: IssueAuthorityRoute
  conversationIds?: ReadonlySet<string>
  attachments?: ConversationRuntimeAttachmentRegistry
  workspaceResolver?: IssueWorkspaceProjectionResolver
}): ConversationSummary[] {
  const workspaceResolver = params.workspaceResolver ?? DEFAULT_WORKSPACE_RESOLVER
  return params.repository.conversations
    .list()
    .filter(
      (conversation) =>
        conversation.hostPartitionKey === params.route.hostPartitionKey &&
        (!params.conversationIds || params.conversationIds.has(conversation.id))
    )
    .map((conversation) => {
      const rounds = params.repository.rounds.list(conversation.id)
      const latestRound = rounds.at(-1)
      const attachments = params.attachments?.listForConversation(conversation.id) ?? []
      const latestAttachment = attachments[0]
      const runtimeState = params.attachments?.getDeleteState(conversation.id).executionState
      const identity = params.repository.conversationIdentities
        .listForConversation(conversation.id)
        .find((candidate) => candidate.retiredAt === null)
      return {
        ...conversation,
        effectiveProjectRef: workspaceResolver.effectiveProject(conversation.id),
        attachment: latestAttachment
          ? {
              kind: 'attached' as const,
              paneKey: latestAttachment.paneKey,
              tabId: latestAttachment.tabId
            }
          : { kind: 'detached' as const },
        resumability: identity ? 'resumable' : 'unavailable',
        executionState: runtimeState ?? (conversation.launchFailure ? 'failed' : 'stopped'),
        workspaceAvailability: workspaceResolver.workspaceAvailable(conversation.id)
          ? 'available'
          : 'unavailable',
        unresolvedRoundCount: rounds.filter((round) => round.resolvedAt === null).length,
        latestRound: latestRound ? toRoundPreview(latestRound) : null,
        navigation: {
          paneKey: latestAttachment?.paneKey ?? null,
          providerSession: identity?.session ?? null,
          resumeLocator: identity?.resumeLocator ?? null
        }
      }
    })
}

export function toRoundPreview(
  round: ReturnType<IssueRepository['rounds']['list']>[number]
): RoundRecordPreview {
  const { dedupeKey: _dedupeKey, ...preview } = round
  return preview
}
