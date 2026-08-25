import type { z } from 'zod'
import { buildAttentionPreservingIssueRows } from '../../shared/issues/attention'
import type { ConversationPage, IssueDetail, IssueListResult } from '../../shared/issues/types'
import type {
  ConversationsListParams,
  IssuesListParams
} from '../../shared/issues/query-rpc-schemas'
import type { ConversationRuntimeAttachmentRegistry } from './conversation-runtime-attachment-registry'
import type { IssueAuthorityRoute } from './issue-authority-route'
import { issueAuthorityDescriptor } from './issue-authority-route'
import type { IssueRepository } from './issue-repository'
import { IssueRepositoryError } from './issue-repository-error'
import { getIssueHostRevisions } from './issue-host-state'
import {
  decodeIssueQueryCursor,
  issueQueryScopeHash,
  type IssueQueryCursor
} from './issue-query-cursor'
import { sliceIssueSnapshotPage } from './issue-list-snapshot'
import {
  readConversationSummaries,
  readIssueSummaries,
  type IssueWorkspaceProjectionResolver
} from './issue-query-projections'
import { listIssueRoundPage } from './issue-round-query'

type IssueListParams = z.infer<typeof IssuesListParams>
type ConversationListParams = z.infer<typeof ConversationsListParams>

export class IssueQueryService {
  constructor(
    private readonly repository: IssueRepository,
    private readonly profileLabel?: string,
    private readonly attachments?: ConversationRuntimeAttachmentRegistry,
    private readonly workspaceResolver?: IssueWorkspaceProjectionResolver
  ) {}

  listIssues(route: IssueAuthorityRoute, params: IssueListParams): IssueListResult {
    const revisions = this.revisions(route)
    const runtimeRevision = this.runtimeRevision()
    const authority = issueAuthorityDescriptor(this.repository.database, route, this.profileLabel)
    if (
      params.mode === 'start' &&
      params.sinceFactsRevision !== undefined &&
      params.sinceFactsRevision === revisions.factsRevision &&
      this.runtimeProjectionUnchanged(params.sinceRuntimeRevision, runtimeRevision)
    ) {
      return { status: 'not-modified', authority, ...revisions, runtimeRevision }
    }
    if (
      params.mode === 'continue' &&
      (params.snapshotFactsRevision !== revisions.factsRevision ||
        params.snapshotTreeRevision !== revisions.treeRevision ||
        this.runtimeContinuationChanged(params.snapshotRuntimeRevision, runtimeRevision))
    ) {
      return { status: 'stale', authority, ...revisions, runtimeRevision }
    }
    const scopeHash = issueQueryScopeHash([route.hostPartitionKey, params.filter])
    const cursorBase = {
      kind: 'issues' as const,
      scopeHash,
      factsRevision: revisions.factsRevision,
      treeRevision: revisions.treeRevision,
      runtimeRevision
    }
    const offset = params.mode === 'continue' ? cursorOffset(params.cursor, cursorBase) : 0
    const summaries = readIssueSummaries(this.repository, route, this.attachments)
    const projection = buildAttentionPreservingIssueRows(summaries, params.filter)
    const records = projection.rows.map((row) => ({
      ...row.issue,
      descendantAttentionCount: row.descendantAttentionCount
    }))
    const page = sliceIssueSnapshotPage({
      records,
      offset,
      limit: params.limit,
      cursor: cursorBase
    })
    const unassigned = this.unassignedSummary(route)
    return {
      status: 'snapshot-page',
      authority,
      snapshotFactsRevision: revisions.factsRevision,
      snapshotTreeRevision: revisions.treeRevision,
      snapshotRuntimeRevision: runtimeRevision,
      issues: page.records,
      ...(unassigned.conversationCount > 0 ? { unassigned } : {}),
      nextCursor: page.nextCursor
    }
  }

  listConversations(route: IssueAuthorityRoute, params: ConversationListParams): ConversationPage {
    const revisions = this.revisions(route)
    const runtimeRevision = this.runtimeRevision()
    const authority = issueAuthorityDescriptor(this.repository.database, route, this.profileLabel)
    if (
      params.mode === 'start' &&
      params.sinceFactsRevision !== undefined &&
      params.sinceFactsRevision === revisions.factsRevision &&
      this.runtimeProjectionUnchanged(params.sinceRuntimeRevision, runtimeRevision)
    ) {
      return {
        status: 'not-modified',
        authority,
        factsRevision: revisions.factsRevision,
        runtimeRevision
      }
    }
    if (
      params.mode === 'continue' &&
      (params.snapshotFactsRevision !== revisions.factsRevision ||
        this.runtimeContinuationChanged(params.snapshotRuntimeRevision, runtimeRevision))
    ) {
      return {
        status: 'stale',
        authority,
        factsRevision: revisions.factsRevision,
        runtimeRevision
      }
    }
    const scopeHash = issueQueryScopeHash([route.hostPartitionKey, params.scope])
    const cursorBase = {
      kind: 'conversations' as const,
      scopeHash,
      factsRevision: revisions.factsRevision,
      runtimeRevision
    }
    const offset = params.mode === 'continue' ? cursorOffset(params.cursor, cursorBase) : 0
    const ids = this.conversationIdsForScope(route, params.scope)
    const records = readConversationSummaries({
      repository: this.repository,
      route,
      conversationIds: ids,
      attachments: this.attachments,
      workspaceResolver: this.workspaceResolver
    })
    const page = sliceIssueSnapshotPage({
      records,
      offset,
      limit: params.limit,
      cursor: cursorBase
    })
    return {
      status: 'snapshot-page',
      authority,
      snapshotFactsRevision: revisions.factsRevision,
      snapshotRuntimeRevision: runtimeRevision,
      conversations: page.records,
      nextCursor: page.nextCursor
    }
  }

  listRounds(
    route: IssueAuthorityRoute,
    params: Parameters<typeof listIssueRoundPage>[0]['query']
  ) {
    return listIssueRoundPage({
      repository: this.repository,
      route,
      query: params,
      profileLabel: this.profileLabel
    })
  }

  getIssue(route: IssueAuthorityRoute, issueId: string): IssueDetail {
    const summaries = readIssueSummaries(this.repository, route, this.attachments)
    const issue = summaries.find((candidate) => candidate.id === issueId)
    if (!issue) {
      throw new IssueRepositoryError('issue_not_found', `Issue ${issueId} was not found.`)
    }
    const directChildren = summaries.filter((candidate) => candidate.parentId === issueId)
    const ids = new Set(
      this.repository.conversations
        .list()
        .filter((conversation) => conversation.issueId === issueId)
        .map((conversation) => conversation.id)
    )
    const directConversations = readConversationSummaries({
      repository: this.repository,
      route,
      conversationIds: ids,
      attachments: this.attachments,
      workspaceResolver: this.workspaceResolver
    })
    return {
      authority: issueAuthorityDescriptor(this.repository.database, route, this.profileLabel),
      issue,
      directChildren,
      directConversations,
      workspaceSnapshots: [
        ...new Map(
          directConversations.map((conversation) => [
            `${conversation.workspaceRef.type}:${workspaceId(conversation.workspaceRef)}`,
            conversation.workspaceSnapshot
          ])
        ).values()
      ]
    }
  }

  private revisions(route: IssueAuthorityRoute) {
    const existing = this.repository.database
      .prepare('SELECT 1 FROM issue_host_state WHERE host_partition_key = ?')
      .get(route.hostPartitionKey)
    return existing
      ? getIssueHostRevisions(this.repository.database, route.hostPartitionKey)
      : { factsRevision: 0, treeRevision: 0 }
  }

  private runtimeRevision(): number {
    return this.attachments?.revision ?? 0
  }

  private runtimeProjectionUnchanged(
    sinceRuntimeRevision: number | undefined,
    currentRuntimeRevision: number
  ): boolean {
    return !this.attachments || sinceRuntimeRevision === currentRuntimeRevision
  }

  private runtimeContinuationChanged(
    snapshotRuntimeRevision: number | undefined,
    currentRuntimeRevision: number
  ): boolean {
    return Boolean(this.attachments) && snapshotRuntimeRevision !== currentRuntimeRevision
  }

  private conversationIdsForScope(
    route: IssueAuthorityRoute,
    scope: ConversationListParams['scope']
  ): Set<string> {
    return new Set(
      this.repository.conversations
        .list()
        .filter((conversation) => {
          if (conversation.hostPartitionKey !== route.hostPartitionKey) {
            return false
          }
          if (scope.kind === 'authority') {
            return true
          }
          if (scope.kind === 'issue') {
            return conversation.issueId === scope.issueId
          }
          if (scope.kind === 'unassigned') {
            return conversation.issueId === null
          }
          return sameWorkspace(conversation.workspaceRef, scope.workspaceRef)
        })
        .map((conversation) => conversation.id)
    )
  }

  private unassignedSummary(route: IssueAuthorityRoute) {
    const conversations = this.repository.conversations
      .list()
      .filter(
        (conversation) =>
          conversation.hostPartitionKey === route.hostPartitionKey && conversation.issueId === null
      )
    return {
      conversationCount: conversations.length,
      unresolvedCount: conversations.reduce(
        (count, conversation) =>
          count +
          this.repository.rounds.list(conversation.id).filter((round) => round.resolvedAt === null)
            .length,
        0
      )
    }
  }
}

function cursorOffset(cursor: string, expected: Omit<IssueQueryCursor, 'offset'>): number {
  return decodeIssueQueryCursor(cursor, expected).offset
}

function sameWorkspace(
  left: { type: 'worktree'; worktreeId: string } | { type: 'folder'; folderWorkspaceId: string },
  right: { type: 'worktree'; worktreeId: string } | { type: 'folder'; folderWorkspaceId: string }
): boolean {
  return left.type === right.type && workspaceId(left) === workspaceId(right)
}

function workspaceId(
  workspace:
    | { type: 'worktree'; worktreeId: string }
    | { type: 'folder'; folderWorkspaceId: string }
): string {
  return workspace.type === 'worktree' ? workspace.worktreeId : workspace.folderWorkspaceId
}
