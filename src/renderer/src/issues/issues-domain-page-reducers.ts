import type { z } from 'zod'
import type {
  ConversationSummary,
  IssueAuthorityDescriptor,
  IssueListFilter,
  IssueListResult,
  IssueSummary
} from '../../../shared/issues/types'
import type { ConversationsListResult } from '../../../shared/issues/query-rpc-schemas'

type ConversationListResult = z.infer<typeof ConversationsListResult>

export type IssuePartitionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'degraded'
  | 'unsupported'
  | 'unavailable'
  | 'offline'
  | 'error'

export type IssueViewCache = {
  issueIds: string[]
  snapshotFactsRevision: number | null
  snapshotTreeRevision: number | null
  snapshotRuntimeRevision: number | null
  nextCursor: string | null
}

export type ConversationScopeCache = {
  conversationIds: string[]
  snapshotFactsRevision: number | null
  snapshotRuntimeRevision: number | null
  nextCursor: string | null
}

export type IssuePartitionState = {
  status: IssuePartitionStatus
  authority: IssueAuthorityDescriptor | null
  factsRevision: number | null
  treeRevision: number | null
  runtimeRevision: number | null
  issuesById: Record<string, IssueSummary>
  conversationsById: Record<string, ConversationSummary>
  issueViewsByFilter: Record<IssueListFilter, IssueViewCache>
  conversationScopesByKey: Record<string, ConversationScopeCache>
  error: string | null
}

export function reduceIssuePage(
  previous: IssuePartitionState,
  filter: IssueListFilter,
  result: IssueListResult,
  append: boolean
): IssuePartitionState {
  const current = withAuthorityGeneration(previous, result.authority)
  if (result.status === 'not-modified') {
    return {
      ...current,
      status: readyStatus(current),
      factsRevision: result.factsRevision,
      treeRevision: result.treeRevision,
      runtimeRevision: result.runtimeRevision ?? current.runtimeRevision,
      error: retainedReadinessError(current)
    }
  }
  if (result.status === 'stale') {
    return {
      ...current,
      factsRevision: result.factsRevision,
      treeRevision: result.treeRevision,
      runtimeRevision: result.runtimeRevision ?? current.runtimeRevision,
      issueViewsByFilter: { ...current.issueViewsByFilter, [filter]: emptyIssueView() }
    }
  }
  const issuesById = { ...current.issuesById }
  for (const issue of result.issues) {
    issuesById[issue.id] = issue
  }
  const priorIds = append ? current.issueViewsByFilter[filter].issueIds : []
  return {
    ...current,
    status: readyStatus(current),
    authority: result.authority,
    factsRevision: result.snapshotFactsRevision,
    treeRevision: result.snapshotTreeRevision,
    runtimeRevision: result.snapshotRuntimeRevision ?? current.runtimeRevision,
    issuesById,
    issueViewsByFilter: {
      ...current.issueViewsByFilter,
      [filter]: {
        issueIds: unique([...priorIds, ...result.issues.map((issue) => issue.id)]),
        snapshotFactsRevision: result.snapshotFactsRevision,
        snapshotTreeRevision: result.snapshotTreeRevision,
        snapshotRuntimeRevision: result.snapshotRuntimeRevision ?? null,
        nextCursor: result.nextCursor
      }
    },
    error: retainedReadinessError(current)
  }
}

export function reduceConversationPage(
  previous: IssuePartitionState,
  scopeKey: string,
  result: ConversationListResult,
  append: boolean
): IssuePartitionState {
  const current = withAuthorityGeneration(previous, result.authority)
  if (result.status === 'not-modified') {
    return {
      ...current,
      factsRevision: result.factsRevision,
      runtimeRevision: result.runtimeRevision ?? current.runtimeRevision,
      error: retainedReadinessError(current)
    }
  }
  if (result.status === 'stale') {
    return {
      ...current,
      factsRevision: result.factsRevision,
      runtimeRevision: result.runtimeRevision ?? current.runtimeRevision,
      conversationScopesByKey: {
        ...current.conversationScopesByKey,
        [scopeKey]: emptyConversationScope()
      }
    }
  }
  const conversationsById = { ...current.conversationsById }
  for (const conversation of result.conversations) {
    conversationsById[conversation.id] = conversation
  }
  const priorIds = append ? (current.conversationScopesByKey[scopeKey]?.conversationIds ?? []) : []
  const conversationIds = unique([
    ...priorIds,
    ...result.conversations.map((conversation) => conversation.id)
  ])
  const completedConversations =
    scopeKey === 'authority' && result.nextCursor === null
      ? retainConversationIds(conversationsById, conversationIds)
      : conversationsById
  return {
    ...current,
    status: readyStatus(current),
    authority: result.authority,
    factsRevision: result.snapshotFactsRevision,
    runtimeRevision: result.snapshotRuntimeRevision ?? current.runtimeRevision,
    conversationsById: completedConversations,
    conversationScopesByKey: {
      ...current.conversationScopesByKey,
      [scopeKey]: {
        conversationIds,
        snapshotFactsRevision: result.snapshotFactsRevision,
        snapshotRuntimeRevision: result.snapshotRuntimeRevision ?? null,
        nextCursor: result.nextCursor
      }
    },
    error: retainedReadinessError(current)
  }
}

export function emptyIssuePartition(): IssuePartitionState {
  return {
    status: 'idle',
    authority: null,
    factsRevision: null,
    treeRevision: null,
    runtimeRevision: null,
    issuesById: {},
    conversationsById: {},
    issueViewsByFilter: {
      all: emptyIssueView(),
      'needs-me': emptyIssueView(),
      archived: emptyIssueView()
    },
    conversationScopesByKey: {},
    error: null
  }
}

function withAuthorityGeneration(
  partition: IssuePartitionState,
  authority: IssueAuthorityDescriptor
): IssuePartitionState {
  return !partition.authority || partition.authority.authorityId === authority.authorityId
    ? { ...partition, authority }
    : { ...emptyIssuePartition(), status: 'loading', authority }
}

function emptyIssueView(): IssueViewCache {
  return {
    issueIds: [],
    snapshotFactsRevision: null,
    snapshotTreeRevision: null,
    snapshotRuntimeRevision: null,
    nextCursor: null
  }
}

function emptyConversationScope(): ConversationScopeCache {
  return {
    conversationIds: [],
    snapshotFactsRevision: null,
    snapshotRuntimeRevision: null,
    nextCursor: null
  }
}

function readyStatus(partition: IssuePartitionState): 'ready' | 'degraded' {
  return partition.status === 'degraded' ? 'degraded' : 'ready'
}

function retainedReadinessError(partition: IssuePartitionState): string | null {
  return partition.status === 'degraded' ? partition.error : null
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}

function retainConversationIds(
  conversationsById: Record<string, ConversationSummary>,
  retainedIds: readonly string[]
): Record<string, ConversationSummary> {
  const retained = new Set(retainedIds)
  return Object.fromEntries(
    Object.entries(conversationsById).filter(([conversationId]) => retained.has(conversationId))
  )
}
