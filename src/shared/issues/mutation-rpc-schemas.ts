import { z } from 'zod'
import { AuthorityExecutionHostIdSchema } from './authority-schemas'
import {
  ISSUE_NOTE_MAX_BYTES,
  ISSUE_TITLE_MAX_BYTES,
  LAUNCH_TOKEN_MAX_LENGTH,
  LAUNCH_TOKEN_MIN_LENGTH
} from './constants'
import {
  ConversationRecordSchema,
  IssueEntityIdSchema,
  IssueFactsRevisionSchema,
  IssueRecordRevisionSchema,
  IssueRecordSchema,
  IssueSourceSchema,
  IssueTreeRevisionSchema,
  IssueTuiAgentSchema,
  IssueWorkspaceRefSchema
} from './record-schemas'

export const IssueMutationIdSchema = z.string().min(1).max(128)
export const IssueLaunchTokenSchema = z
  .string()
  .min(LAUNCH_TOKEN_MIN_LENGTH)
  .max(LAUNCH_TOKEN_MAX_LENGTH)
  .regex(/^[A-Za-z0-9._:-]+$/)

const MutationEnvelope = {
  authorityExecutionHostId: AuthorityExecutionHostIdSchema,
  mutationId: IssueMutationIdSchema
} as const

export const IssuesCreateParams = z.object({
  ...MutationEnvelope,
  source: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('local'),
      title: z.string().trim().min(1).max(ISSUE_TITLE_MAX_BYTES)
    }),
    IssueSourceSchema.options[1]
  ]),
  parentId: IssueEntityIdSchema.nullable().optional(),
  index: z.number().int().nonnegative().optional(),
  typeLabel: z.string().trim().max(128).nullable().optional(),
  note: z.string().max(ISSUE_NOTE_MAX_BYTES).nullable().optional()
})

export const IssuesUpdateParams = z.object({
  ...MutationEnvelope,
  issueId: IssueEntityIdSchema,
  expectedRecordRevision: IssueRecordRevisionSchema,
  title: z.string().trim().min(1).max(ISSUE_TITLE_MAX_BYTES).optional(),
  typeLabel: z.string().trim().max(128).nullable().optional(),
  note: z.string().max(ISSUE_NOTE_MAX_BYTES).nullable().optional()
})

export const IssuesLifecycleParams = z.object({
  ...MutationEnvelope,
  issueId: IssueEntityIdSchema,
  expectedRecordRevision: IssueRecordRevisionSchema
})

export const IssuesReparentParams = z.object({
  ...MutationEnvelope,
  issueId: IssueEntityIdSchema,
  parentId: IssueEntityIdSchema.nullable(),
  index: z.number().int().nonnegative(),
  expectedTreeRevision: IssueTreeRevisionSchema
})

const DeleteIssueDestinationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('root') }),
  z.object({ kind: z.literal('parent'), parentId: IssueEntityIdSchema })
])

export const DeleteIssuePlanSchema = z.object({
  issueId: IssueEntityIdSchema,
  snapshotFactsRevision: IssueFactsRevisionSchema,
  snapshotTreeRevision: IssueTreeRevisionSchema,
  children: z
    .array(
      z.object({
        issueId: IssueEntityIdSchema,
        destination: DeleteIssueDestinationSchema,
        index: z.number().int().nonnegative()
      })
    )
    .max(10_000),
  conversations: z
    .array(
      z.object({
        conversationId: IssueEntityIdSchema,
        destinationIssueId: IssueEntityIdSchema.nullable()
      })
    )
    .max(10_000)
})

export const IssuesPrepareDeleteParams = z.object({
  authorityExecutionHostId: AuthorityExecutionHostIdSchema,
  issueId: IssueEntityIdSchema
})

export const IssuesDeleteParams = z.object({
  ...MutationEnvelope,
  plan: DeleteIssuePlanSchema
})

export const ConversationsUpdateParams = z.object({
  ...MutationEnvelope,
  conversationId: IssueEntityIdSchema,
  expectedRecordRevision: IssueRecordRevisionSchema,
  title: z.string().trim().min(1).max(ISSUE_TITLE_MAX_BYTES).nullable()
})

export const ConversationsBindIssueParams = z.object({
  ...MutationEnvelope,
  conversationId: IssueEntityIdSchema,
  issueId: IssueEntityIdSchema.nullable(),
  expectedRecordRevision: IssueRecordRevisionSchema
})

export const ConversationsPrepareLaunchParams = z.object({
  ...MutationEnvelope,
  launchToken: IssueLaunchTokenSchema,
  workspaceRef: IssueWorkspaceRefSchema,
  workspaceSnapshot: z.object({
    name: z.string().min(1).max(512),
    path: z.string().min(1).max(32_768)
  }),
  agent: IssueTuiAgentSchema,
  issueId: IssueEntityIdSchema.nullable(),
  title: z.string().trim().max(ISSUE_TITLE_MAX_BYTES).nullable().optional()
})

export const ConversationsPrepareRetryParams = z.object({
  ...MutationEnvelope,
  launchToken: IssueLaunchTokenSchema,
  conversationId: IssueEntityIdSchema,
  expectedRecordRevision: IssueRecordRevisionSchema
})

export const ConversationsRecordLaunchFailureParams = z.object({
  ...MutationEnvelope,
  conversationId: IssueEntityIdSchema,
  claimId: IssueEntityIdSchema,
  expectedRecordRevision: IssueRecordRevisionSchema,
  failure: z.string().trim().min(1).max(2_048)
})

export const ConversationsPrepareDeleteParams = z.object({
  authorityExecutionHostId: AuthorityExecutionHostIdSchema,
  conversationId: IssueEntityIdSchema
})

export const ConversationsDeleteParams = z.object({
  ...MutationEnvelope,
  conversationId: IssueEntityIdSchema,
  expectedRecordRevision: IssueRecordRevisionSchema,
  preflightToken: z.string().min(1).max(256)
})

export const IssuesMarkReadParams = z.object({
  ...MutationEnvelope,
  roundId: IssueEntityIdSchema
})

export const IssuesResolveRoundParams = z.object({
  ...MutationEnvelope,
  roundId: IssueEntityIdSchema
})

export const ConversationLaunchPreparationSchema = z.object({
  conversation: ConversationRecordSchema,
  claimId: IssueEntityIdSchema,
  disposition: z.enum(['created', 'replayed', 'retried'])
})

export const IssueRecordMutationResultSchema = z.object({
  issue: IssueRecordSchema,
  factsRevision: IssueFactsRevisionSchema,
  treeRevision: IssueTreeRevisionSchema
})
