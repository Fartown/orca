import type {
  ConversationSummary,
  EffectiveConversationProject,
  IssueSummary,
  RoundRecordPreview
} from '../../shared/issues/types'
import type { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'
import type { IssueRepository } from './issue-repository'
import type { IssueAuthorityRoute } from './issue-authority-route'
import { readLatestConversationRound, readUnresolvedRoundCounts } from './issue-round-summaries'

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
  const conversations = repository.conversations
    .list()
    .filter((conversation) => conversation.hostPartitionKey === route.hostPartitionKey)
  const unresolvedCounts = readUnresolvedRoundCounts(
    repository.database,
    conversations.map((conversation) => conversation.id)
  )
  return issues.map((issue) => {
    const issueConversations = conversations.filter(
      (conversation) => conversation.issueId === issue.id
    )
    const visibleConversations = issueConversations.filter((conversation) =>
      repository.conversationIdentities
        .listForConversation(conversation.id)
        .some((identity) => identity.retiredAt === null)
    )
    const ownUnresolvedCount = visibleConversations.reduce(
      (count, conversation) => count + (unresolvedCounts.get(conversation.id) ?? 0),
      0
    )
    return {
      ...issue,
      ownUnresolvedCount,
      descendantAttentionCount: 0,
      directConversationCount: visibleConversations.length,
      runningConversationCount: visibleConversations.filter((conversation) => {
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
  const now = Date.now()
  const conversations = params.repository.conversations
    .list()
    .filter(
      (conversation) =>
        conversation.hostPartitionKey === params.route.hostPartitionKey &&
        (!params.conversationIds || params.conversationIds.has(conversation.id))
    )
  const unresolvedCounts = readUnresolvedRoundCounts(
    params.repository.database,
    conversations.map((conversation) => conversation.id)
  )
  return conversations.map((conversation) => {
    const latestRound = readLatestConversationRound(params.repository, conversation.id)
    const attachments = params.attachments?.listForConversation(conversation.id) ?? []
    const latestAttachment = attachments[0]
    const runtimeState = params.attachments?.getDeleteState(conversation.id)
    const hasRuntimeProjection = Boolean(runtimeState?.attached)
    const identity = params.repository.conversationIdentities
      .listForConversation(conversation.id)
      .find((candidate) => candidate.retiredAt === null)
    const latestClaim = params.repository.conversationLaunchClaims.listForConversation(
      conversation.id
    )[0]
    const launchClaimState =
      !hasRuntimeProjection && (identity || !latestRound) && latestClaim
        ? latestClaim.settlement === 'failed' || latestClaim.settlement === 'expired'
          ? 'failed'
          : latestClaim.settlement === null
            ? latestClaim.expiresAt > now
              ? 'launching'
              : 'failed'
            : null
        : null
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
      executionState:
        (hasRuntimeProjection ? runtimeState?.executionState : undefined) ??
        (conversation.launchFailure ? 'failed' : (launchClaimState ?? 'stopped')),
      workspaceAvailability: workspaceResolver.workspaceAvailable(conversation.id)
        ? 'available'
        : 'unavailable',
      unresolvedRoundCount: unresolvedCounts.get(conversation.id) ?? 0,
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
