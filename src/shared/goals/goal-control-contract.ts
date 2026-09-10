import type { GoalAcceptanceDraft } from './goal-acceptance-draft-contract'
import { z } from 'zod'
import type { AgentStatusState } from '../agent-status-types'
import type { PtyLivenessVerdict } from '../pty-liveness-verdict'

// Same shape as worktree-schemas.ts WorktreeSelector plus terminal/unary-schemas.ts
// TerminalHandle. The PTY incarnation is mandatory here: a goal bound to a handle
// must not survive that PTY being restarted underneath it.
export const GoalBindingSchema = z.object({
  worktree: z.string().min(1).max(4_096),
  terminal: z.string().min(1).max(256),
  expectedIncarnationId: z.string().min(1).max(256),
  providerSessionId: z.string().min(1).max(256).optional()
})

export const GoalCriterionSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1).max(8_000),
  command: z.string().min(1).max(16_000).optional()
})

// spec bumps specRevision; budget alone only bumps the runtime fence.
export const GoalSpecSchema = z.object({
  objective: z.string().min(1).max(32_000),
  criteria: z.array(GoalCriterionSchema).max(100),
  acceptanceText: z.string().max(32_000),
  acceptanceDocument: z
    .string()
    .min(1)
    .max(32_000)
    .refine((value) => value.trim().length > 0)
    .optional(),
  extraChecks: z.array(z.string().min(1).max(16_000)).max(20),
  // Why default 'none': records written before item-mode judging must keep parsing.
  judge: z.enum(['none', 'claude', 'codex']).default('none'),
  checkAll: z.boolean(),
  onBlocked: z.enum(['ask', 'verify'])
})

export const GoalBudgetSchema = z.object({
  maxTurns: z.number().int().nonnegative(),
  maxMinutes: z.number().finite().nonnegative(),
  checkTimeoutSeconds: z.number().finite().positive()
})

const ClientOperationId = z.string().min(1).max(128)
const PayloadFingerprint = z.string().regex(/^[0-9a-f]{64}$/)

// Field-for-field the MutationEnvelope of structured-agent-session-schemas.ts with
// sessionId replaced by goalId and the run generation added.
export const GoalMutationEnvelopeSchema = z.object({
  goalId: z.string().uuid(),
  clientOperationId: ClientOperationId,
  expectedRuntimeFence: z.number().int().nonnegative(),
  expectedRunId: z.string().uuid().nullable(),
  payloadFingerprint: PayloadFingerprint
})

// Same admission parameter as issues.*; handlers apply the same second-hop rule.
export const GoalExecutionHostSchema = z.object({
  authorityExecutionHostId: z.union([
    z.literal('local'),
    z
      .string()
      .regex(/^ssh:[^\s]+$/)
      .max(4_096)
  ])
})

export const GoalListFilterSchema = z.enum(['running', 'attention', 'history', 'all'])

export const GoalRpcParams = {
  'goals.status': GoalExecutionHostSchema,
  'goals.draftAcceptance': GoalExecutionHostSchema.extend({
    draftId: z.string().uuid(),
    binding: GoalBindingSchema,
    objective: z.string().trim().min(1).max(32_000),
    judge: z.enum(['claude', 'codex']),
    acceptanceContext: z.string().max(64_000).optional()
  }),
  'goals.getAcceptanceDraft': GoalExecutionHostSchema.extend({ draftId: z.string().uuid() }),
  'goals.cancelAcceptanceDraft': GoalExecutionHostSchema.extend({ draftId: z.string().uuid() }),
  'goals.list': GoalExecutionHostSchema.extend({
    worktree: z.string().min(1).max(4_096).optional(),
    filter: GoalListFilterSchema,
    query: z.string().max(200).optional()
  }),
  'goals.get': GoalExecutionHostSchema.extend({ goalId: z.string().uuid() }),
  'goals.create': GoalExecutionHostSchema.extend({
    clientOperationId: ClientOperationId,
    payloadFingerprint: PayloadFingerprint,
    binding: GoalBindingSchema,
    spec: GoalSpecSchema,
    budget: GoalBudgetSchema,
    acknowledgeUnverifiedCompletion: z.boolean()
  }),
  // stop closes the gate, then interrupts the round in flight; the receipt says which parts were confirmed.
  'goals.control': GoalExecutionHostSchema.merge(GoalMutationEnvelopeSchema).extend({
    action: z.enum(['pause', 'resume', 'stop'])
  }),
  // spec alone bumps specRevision and invalidates evidence; budget alone only bumps the fence.
  'goals.amend': GoalExecutionHostSchema.merge(GoalMutationEnvelopeSchema).extend({
    spec: GoalSpecSchema.optional(),
    budget: GoalBudgetSchema.optional(),
    resumeAfterSave: z.boolean()
  }),
  'goals.rebind': GoalExecutionHostSchema.merge(GoalMutationEnvelopeSchema).extend({
    binding: GoalBindingSchema
  }),
  'goals.archive': GoalExecutionHostSchema.merge(GoalMutationEnvelopeSchema).extend({
    archived: z.boolean()
  }),
  'goals.versions': GoalExecutionHostSchema.extend({ goalId: z.string().uuid() }),
  // A v1 CLI goal becomes a managed goal only on request, and only while nothing drives it.
  'goals.adoptLegacy': GoalExecutionHostSchema.extend({
    clientOperationId: ClientOperationId,
    payloadFingerprint: PayloadFingerprint,
    legacyKey: z.string().min(1).max(256)
  }),
  'goals.operation': GoalExecutionHostSchema.extend({ clientOperationId: ClientOperationId })
} as const

export const GOAL_METHOD_NAMES = Object.keys(
  GoalRpcParams
) as readonly (keyof typeof GoalRpcParams)[]

export type GoalBinding = z.infer<typeof GoalBindingSchema>
export type GoalCriterion = z.infer<typeof GoalCriterionSchema>
export type GoalSpec = z.infer<typeof GoalSpecSchema>
export type GoalBudget = z.infer<typeof GoalBudgetSchema>
export type GoalMutationEnvelope = z.infer<typeof GoalMutationEnvelopeSchema>
export type GoalListFilter = z.infer<typeof GoalListFilterSchema>
export type GoalAuthorityExecutionHostId = z.infer<
  typeof GoalExecutionHostSchema
>['authorityExecutionHostId']
export type GoalControlAction = z.infer<(typeof GoalRpcParams)['goals.control']>['action']
export type GoalCreateParams = z.infer<(typeof GoalRpcParams)['goals.create']>
export type GoalControlParams = z.infer<(typeof GoalRpcParams)['goals.control']>
export type GoalAmendParams = z.infer<(typeof GoalRpcParams)['goals.amend']>
export type GoalRebindParams = z.infer<(typeof GoalRpcParams)['goals.rebind']>
export type GoalArchiveParams = z.infer<(typeof GoalRpcParams)['goals.archive']>
export type GoalListParams = z.infer<(typeof GoalRpcParams)['goals.list']>
export type GoalAdoptLegacyParams = z.infer<(typeof GoalRpcParams)['goals.adoptLegacy']>

export type GoalOperationStatus = 'accepted' | 'applying' | 'applied' | 'rejected'
export type GoalOperationCode =
  | 'ok'
  | 'conflict'
  | 'target_changed'
  | 'unsupported'
  | 'budget_exhausted'
  | 'confirmation_pending'
  | 'driver_error'

export type GoalOperation = {
  clientOperationId: string
  goalId: string | null
  status: GoalOperationStatus
  code: GoalOperationCode
  message: string
  runtimeFence: number | null
  runId: string | null
  continuationPaused: boolean | null
  turnStopped: boolean | null
  acceptanceStopped: boolean | null
}

// Same three states as PtyLivenessVerdict; the driver is not a PTY so it has no ptyIds.
export type GoalDriverVerdict =
  | { status: 'live' }
  | { status: 'unverifiable'; reason: string }
  | { status: 'exited' }

export type GoalPhase =
  | 'starting'
  | 'executing'
  | 'verifying'
  | 'waiting_user'
  | 'idle'
  | 'complete'
  | 'budget_exhausted'
  | 'interrupted'

export type GoalCompletion = 'not_complete' | 'claimed' | 'verified' | 'unverified'
export type GoalTurnState = 'running' | 'finished' | 'unknown'

export type GoalSummary = {
  goalId: string
  objectivePreview: string
  workspace: { selector: string; path: string; executionHostId: string }
  binding: GoalBinding
  runtimeFence: number
  specRevision: number
  runId: string | null
  continuation: 'enabled' | 'paused'
  phase: GoalPhase
  reason: string | null
  completion: GoalCompletion
  stopSupport: 'request_only' | 'confirmable' | 'unsupported'
  driver: GoalDriverVerdict
  // Projections of existing terminal facts, never a second liveness verdict.
  terminal: PtyLivenessVerdict
  agentStatus: AgentStatusState | null
  turn: GoalTurnState
  archived: boolean
  turns: number
  activeMs: number
  observedAt: number
  /** Present for a v1 CLI goal that has no managed record yet; goalId is then `legacy:` + key. */
  legacy?: { key: string }
}

export type GoalEvidence = {
  id: string
  runId: string
  specRevision: number
  turn: number
  criterionId: string | null
  status: 'passed' | 'failed' | 'inconclusive' | 'not_run' | 'stale'
  source: 'command' | 'judge' | 'legacy'
  /** Present only on the whole-goal judge verdict; it is never one criterion's result. */
  scope?: 'goal'
  artifactId: string | null
  snapshotTree: string | null
  summary: string
}

export type GoalDetail = GoalSummary & {
  spec: GoalSpec
  budget: GoalBudget
  evidence: GoalEvidence[]
  latestOperation: GoalOperation | null
}

export type GoalSpecRevision = {
  specRevision: number
  savedAt: number
  spec: GoalSpec
}

export type GoalStatus = {
  status: 'ready' | 'degraded' | 'unavailable'
  reason: string | null
  supports: { localTerminal: boolean; structured: boolean; ssh: boolean; wsl: boolean }
}

export type GoalRpcResults = {
  'goals.status': GoalStatus
  'goals.draftAcceptance': GoalAcceptanceDraft
  'goals.getAcceptanceDraft': GoalAcceptanceDraft | null
  'goals.cancelAcceptanceDraft': GoalAcceptanceDraft | null
  'goals.list': { items: GoalSummary[]; observedAt: number }
  'goals.get': GoalDetail | null
  'goals.create': GoalOperation
  'goals.control': GoalOperation
  'goals.amend': GoalOperation
  'goals.rebind': GoalOperation
  'goals.archive': GoalOperation
  'goals.versions': { items: GoalSpecRevision[] }
  'goals.adoptLegacy': GoalOperation
  'goals.operation': GoalOperation | null
}

export const LEGACY_GOAL_ID_PREFIX = 'legacy:'

export function isLegacyGoalId(goalId: string): boolean {
  return goalId.startsWith(LEGACY_GOAL_ID_PREFIX)
}

/** Truncated for list rows; `goals.get` returns the full objective. */
export function goalObjectivePreview(objective: string): string {
  const collapsed = objective.replace(/\s+/g, ' ').trim()
  return collapsed.length > 200 ? `${collapsed.slice(0, 199)}…` : collapsed
}

export type GoalDraftAcceptanceParams = z.infer<(typeof GoalRpcParams)['goals.draftAcceptance']>
