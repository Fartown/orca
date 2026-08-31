import { z } from 'zod'
import { ALL_TUI_AGENTS } from '../tui-agent-display-names'
import type { TuiAgent } from '../tui-agent'
import { isUtf8ByteLengthWithinLimit } from '../utf8-byte-limits'
import {
  AuthorityExecutionHostIdSchema,
  IssueAuthorityDescriptorSchema,
  IssueHostPartitionKeySchema
} from './authority-schemas'
import {
  ISSUE_NOTE_MAX_BYTES,
  ISSUE_STATES,
  ISSUE_TITLE_MAX_BYTES,
  ROUND_RECORD_KINDS,
  ROUND_RECORD_STATE_SOURCES,
  ROUND_RESOLUTIONS,
  ROUND_TEXT_COMPLETENESS,
  ROUND_TEXT_PREVIEW_MAX_BYTES,
  ROUND_WAITING_REASONS
} from './constants'

export const IssueEntityIdSchema = z.string().uuid()
export const IssueTimestampSchema = z.number().int().nonnegative()
export const IssueRecordRevisionSchema = z.number().int().nonnegative()
export const IssueFactsRevisionSchema = z.number().int().nonnegative()
export const IssueTreeRevisionSchema = z.number().int().nonnegative()

export const IssuePreviewTextSchema = z
  .string()
  .refine(
    (value) => isUtf8ByteLengthWithinLimit(value, ROUND_TEXT_PREVIEW_MAX_BYTES),
    'Preview text exceeds the UTF-8 byte limit'
  )

export const IssueWorkspaceRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('worktree'), worktreeId: z.string().min(1).max(4_096) }),
  z.object({ type: z.literal('folder'), folderWorkspaceId: z.string().min(1).max(4_096) })
])

export const IssueWorkspaceSnapshotSchema = z.object({
  name: z.string().min(1).max(512),
  path: z.string().min(1).max(32_768)
})

export const IssueTuiAgentSchema = z.custom<TuiAgent>(
  (value) => typeof value === 'string' && ALL_TUI_AGENTS.includes(value as TuiAgent),
  'Unknown agent preset'
)

export const IssueSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local'), number: z.number().int().positive() }),
  z.object({
    kind: z.literal('external'),
    provider: z.enum(['github', 'gitlab', 'linear', 'jira', 'other']),
    identifier: z.string().trim().min(1).max(1_024),
    url: z.string().url().max(32_768),
    titleSnapshot: z.string().trim().min(1).max(ISSUE_TITLE_MAX_BYTES)
  })
])

export const IssueRecordSchema = z.object({
  id: IssueEntityIdSchema,
  hostPartitionKey: IssueHostPartitionKeySchema,
  executionHostId: AuthorityExecutionHostIdSchema,
  source: IssueSourceSchema,
  localTitle: z.string().trim().min(1).max(ISSUE_TITLE_MAX_BYTES).nullable(),
  typeLabel: z.string().trim().max(128).nullable(),
  note: z.string().max(ISSUE_NOTE_MAX_BYTES).nullable(),
  state: z.enum(ISSUE_STATES),
  parentId: IssueEntityIdSchema.nullable(),
  siblingOrder: z.number().int().nonnegative(),
  recordRevision: IssueRecordRevisionSchema,
  createdAt: IssueTimestampSchema,
  updatedAt: IssueTimestampSchema,
  archivedAt: IssueTimestampSchema.nullable()
})

export const ConversationLaunchFailureSchema = z.object({
  message: z.string().min(1).max(2_048),
  failedAt: IssueTimestampSchema
})

export const ConversationRecordSchema = z.object({
  id: IssueEntityIdSchema,
  hostPartitionKey: IssueHostPartitionKeySchema,
  executionHostId: AuthorityExecutionHostIdSchema,
  workspaceRef: IssueWorkspaceRefSchema,
  workspaceSnapshot: IssueWorkspaceSnapshotSchema,
  agent: IssueTuiAgentSchema,
  title: z.string().trim().min(1).max(ISSUE_TITLE_MAX_BYTES).nullable(),
  issueId: IssueEntityIdSchema.nullable(),
  recordRevision: IssueRecordRevisionSchema,
  launchFailure: ConversationLaunchFailureSchema.nullable(),
  createdAt: IssueTimestampSchema,
  updatedAt: IssueTimestampSchema
})

export const ConversationProviderIdentitySchema = z.object({
  id: IssueEntityIdSchema,
  conversationId: IssueEntityIdSchema,
  hostPartitionKey: IssueHostPartitionKeySchema,
  agent: IssueTuiAgentSchema,
  session: z.object({
    key: z.enum(['session_id', 'conversation_id']),
    id: z.string().trim().min(1).max(512),
    transcriptPath: z.string().min(1).max(32_768).optional()
  }),
  identityFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  resumeLocator: z.string().min(1).max(32_768).nullable(),
  observedAt: IssueTimestampSchema,
  retiredAt: IssueTimestampSchema.nullable()
})

export const ConversationLaunchClaimSchema = z.object({
  claimId: IssueEntityIdSchema,
  conversationId: IssueEntityIdSchema,
  hostPartitionKey: IssueHostPartitionKeySchema,
  launchTokenFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  paneKey: z.string().min(1).max(4_096).nullable(),
  processIncarnation: z.string().min(1).max(4_096).nullable(),
  connectionId: z.string().min(1).max(4_096).nullable(),
  createdAt: IssueTimestampSchema,
  expiresAt: IssueTimestampSchema,
  settledAt: IssueTimestampSchema.nullable(),
  settlement: z.enum(['attached', 'failed', 'expired', 'retired']).nullable()
})

export const RoundTextPreviewSchema = z.object({
  text: IssuePreviewTextSchema.nullable(),
  completeness: z.enum(ROUND_TEXT_COMPLETENESS)
})

export const RoundRecordSchema = z.object({
  id: IssueEntityIdSchema,
  conversationId: IssueEntityIdSchema,
  kind: z.enum(ROUND_RECORD_KINDS),
  waitingReason: z.enum(ROUND_WAITING_REASONS).nullable(),
  stateSource: z.enum(ROUND_RECORD_STATE_SOURCES),
  occurredAt: IssueTimestampSchema,
  dedupeKey: z.string().min(1).max(4_096),
  userInput: RoundTextPreviewSchema,
  agentOutput: RoundTextPreviewSchema,
  pendingQuestion: RoundTextPreviewSchema,
  readAt: IssueTimestampSchema.nullable(),
  resolvedAt: IssueTimestampSchema.nullable(),
  resolution: z.enum(ROUND_RESOLUTIONS).nullable(),
  createdAt: IssueTimestampSchema
})

export const RoundRecordPreviewSchema = RoundRecordSchema.omit({ dedupeKey: true })

export const ConversationSummarySchema = ConversationRecordSchema.extend({
  effectiveProjectRef: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('project'),
        projectId: z.string().min(1).max(4_096),
        projectHostSetupId: z.string().min(1).max(4_096).optional(),
        repoId: z.string().min(1).max(4_096).optional()
      }),
      z.object({ kind: z.literal('legacy-repo'), repoId: z.string().min(1).max(4_096) })
    ])
    .nullable(),
  attachment: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('attached'),
      paneKey: z.string().min(1).max(4_096),
      tabId: z.string().min(1).max(4_096).nullable()
    }),
    z.object({ kind: z.literal('detached') })
  ]),
  resumability: z.enum(['resumable', 'unavailable']),
  executionState: z.enum(['launching', 'running', 'waiting', 'stopped', 'failed']),
  workspaceAvailability: z.enum(['available', 'unavailable']),
  unresolvedRoundCount: z.number().int().nonnegative(),
  latestRound: RoundRecordPreviewSchema.nullable(),
  navigation: z
    .object({
      paneKey: z.string().min(1).max(4_096).nullable(),
      providerSession: z
        .object({
          key: z.enum(['session_id', 'conversation_id']),
          id: z.string().min(1).max(512),
          transcriptPath: z.string().min(1).max(32_768).optional()
        })
        .nullable(),
      resumeLocator: z.string().min(1).max(32_768).nullable()
    })
    .optional()
})

export const IssueSummarySchema = IssueRecordSchema.extend({
  ownUnresolvedCount: z.number().int().nonnegative(),
  descendantAttentionCount: z.number().int().nonnegative(),
  directConversationCount: z.number().int().nonnegative(),
  runningConversationCount: z.number().int().nonnegative()
})

export const UnassignedConversationSummarySchema = z.object({
  conversationCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative()
})

export const IssueDetailSchema = z.object({
  authority: IssueAuthorityDescriptorSchema,
  issue: IssueSummarySchema,
  directChildren: z.array(IssueSummarySchema).max(10_000),
  directConversations: z.array(ConversationSummarySchema).max(10_000),
  workspaceSnapshots: z.array(IssueWorkspaceSnapshotSchema).max(10_000)
})

export const IssueFeatureReadinessSchema = z.object({
  status: z.enum(['ready', 'degraded', 'unavailable']),
  storage: z.enum(['ready', 'failed']),
  hookEvidence: z.enum(['ready', 'disabled', 'failed']),
  reason: z
    .enum(['storage-open-failed', 'storage-migration-failed', 'hook-disabled', 'hook-start-failed'])
    .nullable()
})
