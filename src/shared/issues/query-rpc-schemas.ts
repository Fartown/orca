import { z } from 'zod'
import { AuthorityExecutionHostIdSchema, IssueAuthorityDescriptorSchema } from './authority-schemas'
import { ISSUE_CURSOR_MAX_BYTES, ISSUE_LIST_PAGE_MAX_RECORDS } from './constants'
import {
  ConversationRecordSchema,
  ConversationSummarySchema,
  IssueDetailSchema,
  IssueEntityIdSchema,
  IssueFactsRevisionSchema,
  IssueFeatureReadinessSchema,
  IssueSummarySchema,
  IssueTreeRevisionSchema,
  IssueWorkspaceRefSchema,
  RoundRecordPreviewSchema,
  UnassignedConversationSummarySchema
} from './record-schemas'

const PageLimitSchema = z.number().int().min(1).max(ISSUE_LIST_PAGE_MAX_RECORDS).default(200)
const CursorSchema = z.string().min(1).max(ISSUE_CURSOR_MAX_BYTES)
const RuntimeProjectionRevisionSchema = z.number().int().nonnegative()

const SnapshotStartSchema = z.object({
  mode: z.literal('start'),
  sinceFactsRevision: IssueFactsRevisionSchema.optional(),
  limit: PageLimitSchema
})

const SnapshotContinueSchema = z.object({
  mode: z.literal('continue'),
  snapshotFactsRevision: IssueFactsRevisionSchema,
  snapshotTreeRevision: IssueTreeRevisionSchema,
  cursor: CursorSchema,
  limit: PageLimitSchema
})

const FactsSnapshotContinueSchema = z.object({
  mode: z.literal('continue'),
  snapshotFactsRevision: IssueFactsRevisionSchema,
  cursor: CursorSchema,
  limit: PageLimitSchema
})

const RuntimeSnapshotStartSchema = SnapshotStartSchema.extend({
  sinceRuntimeRevision: RuntimeProjectionRevisionSchema.optional()
})

const RuntimeSnapshotContinueSchema = SnapshotContinueSchema.extend({
  snapshotRuntimeRevision: RuntimeProjectionRevisionSchema.optional()
})

const RuntimeFactsSnapshotContinueSchema = FactsSnapshotContinueSchema.extend({
  snapshotRuntimeRevision: RuntimeProjectionRevisionSchema.optional()
})

export const IssuesStatusParams = z.object({
  authorityExecutionHostId: AuthorityExecutionHostIdSchema
})

export const IssueFeatureStatusResult = IssueFeatureReadinessSchema.extend({
  authority: IssueAuthorityDescriptorSchema.nullable()
})

export const IssuesListParams = z.discriminatedUnion('mode', [
  RuntimeSnapshotStartSchema.extend({
    authorityExecutionHostId: AuthorityExecutionHostIdSchema,
    filter: z.enum(['all', 'needs-me', 'archived'])
  }),
  RuntimeSnapshotContinueSchema.extend({
    authorityExecutionHostId: AuthorityExecutionHostIdSchema,
    filter: z.enum(['all', 'needs-me', 'archived'])
  })
])

export const IssuesListResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('not-modified'),
    authority: IssueAuthorityDescriptorSchema,
    factsRevision: IssueFactsRevisionSchema,
    treeRevision: IssueTreeRevisionSchema,
    runtimeRevision: RuntimeProjectionRevisionSchema.optional()
  }),
  z.object({
    status: z.literal('stale'),
    authority: IssueAuthorityDescriptorSchema,
    factsRevision: IssueFactsRevisionSchema,
    treeRevision: IssueTreeRevisionSchema,
    runtimeRevision: RuntimeProjectionRevisionSchema.optional()
  }),
  z.object({
    status: z.literal('snapshot-page'),
    authority: IssueAuthorityDescriptorSchema,
    snapshotFactsRevision: IssueFactsRevisionSchema,
    snapshotTreeRevision: IssueTreeRevisionSchema,
    snapshotRuntimeRevision: RuntimeProjectionRevisionSchema.optional(),
    issues: z.array(IssueSummarySchema).max(ISSUE_LIST_PAGE_MAX_RECORDS),
    unassigned: UnassignedConversationSummarySchema.optional(),
    nextCursor: CursorSchema.nullable()
  })
])

export const IssuesGetParams = z.object({
  authorityExecutionHostId: AuthorityExecutionHostIdSchema,
  issueId: IssueEntityIdSchema
})

export const IssuesGetResult = IssueDetailSchema

export const ConversationListScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('authority') }),
  z.object({ kind: z.literal('workspace'), workspaceRef: IssueWorkspaceRefSchema }),
  z.object({ kind: z.literal('issue'), issueId: IssueEntityIdSchema }),
  z.object({ kind: z.literal('unassigned') })
])

export const ConversationsListParams = z.discriminatedUnion('mode', [
  RuntimeSnapshotStartSchema.extend({
    authorityExecutionHostId: AuthorityExecutionHostIdSchema,
    scope: ConversationListScopeSchema
  }),
  RuntimeFactsSnapshotContinueSchema.extend({
    authorityExecutionHostId: AuthorityExecutionHostIdSchema,
    scope: ConversationListScopeSchema
  })
])

export const ConversationsListResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('not-modified'),
    authority: IssueAuthorityDescriptorSchema,
    factsRevision: IssueFactsRevisionSchema,
    runtimeRevision: RuntimeProjectionRevisionSchema.optional()
  }),
  z.object({
    status: z.literal('stale'),
    authority: IssueAuthorityDescriptorSchema,
    factsRevision: IssueFactsRevisionSchema,
    runtimeRevision: RuntimeProjectionRevisionSchema.optional()
  }),
  z.object({
    status: z.literal('snapshot-page'),
    authority: IssueAuthorityDescriptorSchema,
    snapshotFactsRevision: IssueFactsRevisionSchema,
    snapshotRuntimeRevision: RuntimeProjectionRevisionSchema.optional(),
    conversations: z.array(ConversationSummarySchema).max(ISSUE_LIST_PAGE_MAX_RECORDS),
    nextCursor: CursorSchema.nullable()
  })
])

export const ConversationsGetParams = z.object({
  authorityExecutionHostId: AuthorityExecutionHostIdSchema,
  conversationId: IssueEntityIdSchema
})

export const ConversationsGetResult = ConversationRecordSchema

export const IssuesListRoundsParams = z.discriminatedUnion('mode', [
  SnapshotStartSchema.extend({
    authorityExecutionHostId: AuthorityExecutionHostIdSchema,
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('issue'), issueId: IssueEntityIdSchema }),
      z.object({ kind: z.literal('conversation'), conversationId: IssueEntityIdSchema })
    ])
  }),
  FactsSnapshotContinueSchema.extend({
    authorityExecutionHostId: AuthorityExecutionHostIdSchema,
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('issue'), issueId: IssueEntityIdSchema }),
      z.object({ kind: z.literal('conversation'), conversationId: IssueEntityIdSchema })
    ])
  })
])

export const IssuesListRoundsResult = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('not-modified'),
    authority: IssueAuthorityDescriptorSchema,
    factsRevision: IssueFactsRevisionSchema
  }),
  z.object({
    status: z.literal('stale'),
    authority: IssueAuthorityDescriptorSchema,
    factsRevision: IssueFactsRevisionSchema
  }),
  z.object({
    status: z.literal('snapshot-page'),
    authority: IssueAuthorityDescriptorSchema,
    snapshotFactsRevision: IssueFactsRevisionSchema,
    rounds: z.array(RoundRecordPreviewSchema).max(ISSUE_LIST_PAGE_MAX_RECORDS),
    nextCursor: CursorSchema.nullable()
  })
])
