import { z } from 'zod'
import { GoalBindingSchema, GoalBudgetSchema, GoalSpecSchema } from './goal-control-contract'

// Renderer-side validation of what the host returns. Lenient on unknown keys so
// a newer host can add fields without breaking an older client.
const LivenessVerdictSchema = z.union([
  z.object({ status: z.literal('exited') }),
  z.object({ status: z.literal('live'), ptyIds: z.array(z.string()) }),
  z.object({ status: z.literal('unverifiable'), reason: z.string() })
])

const DriverVerdictSchema = z.union([
  z.object({ status: z.literal('live') }),
  z.object({ status: z.literal('unverifiable'), reason: z.string() }),
  z.object({ status: z.literal('exited') })
])

export const GoalOperationResult = z
  .object({
    clientOperationId: z.string(),
    goalId: z.string().nullable(),
    status: z.enum(['accepted', 'applying', 'applied', 'rejected']),
    code: z.enum([
      'ok',
      'conflict',
      'target_changed',
      'unsupported',
      'budget_exhausted',
      'confirmation_pending',
      'driver_error'
    ]),
    message: z.string(),
    runtimeFence: z.number().nullable(),
    runId: z.string().nullable(),
    continuationPaused: z.boolean().nullable(),
    turnStopped: z.boolean().nullable(),
    acceptanceStopped: z.boolean().nullable()
  })
  .passthrough()

export const GoalStatusResult = z
  .object({
    status: z.enum(['ready', 'degraded', 'unavailable']),
    reason: z.string().nullable(),
    supports: z
      .object({
        localTerminal: z.boolean(),
        structured: z.boolean(),
        ssh: z.boolean(),
        wsl: z.boolean()
      })
      .passthrough()
  })
  .passthrough()

export const GoalSummaryResult = z
  .object({
    goalId: z.string(),
    objectivePreview: z.string(),
    workspace: z.object({ selector: z.string(), path: z.string(), executionHostId: z.string() }),
    binding: GoalBindingSchema,
    runtimeFence: z.number(),
    specRevision: z.number(),
    runId: z.string().nullable(),
    continuation: z.enum(['enabled', 'paused']),
    phase: z.enum([
      'starting',
      'executing',
      'verifying',
      'waiting_user',
      'idle',
      'complete',
      'budget_exhausted',
      'interrupted'
    ]),
    reason: z.string().nullable(),
    completion: z.enum(['not_complete', 'claimed', 'verified', 'unverified']),
    stopSupport: z.enum(['request_only', 'confirmable', 'unsupported']),
    driver: DriverVerdictSchema,
    terminal: LivenessVerdictSchema,
    agentStatus: z.enum(['working', 'blocked', 'waiting', 'done']).nullable(),
    turn: z.enum(['running', 'finished', 'unknown']),
    archived: z.boolean(),
    turns: z.number(),
    activeMs: z.number(),
    observedAt: z.number(),
    legacy: z.object({ key: z.string() }).optional()
  })
  .passthrough()

export const GoalEvidenceResult = z
  .object({
    id: z.string(),
    runId: z.string(),
    specRevision: z.number(),
    turn: z.number(),
    criterionId: z.string().nullable(),
    status: z.enum(['passed', 'failed', 'inconclusive', 'not_run', 'stale']),
    source: z.enum(['command', 'judge', 'legacy']),
    scope: z.literal('goal').optional(),
    artifactId: z.string().nullable(),
    snapshotTree: z.string().nullable(),
    summary: z.string()
  })
  .passthrough()

export const GoalDetailResult = GoalSummaryResult.extend({
  spec: GoalSpecSchema,
  budget: GoalBudgetSchema,
  evidence: z.array(GoalEvidenceResult),
  latestOperation: GoalOperationResult.nullable()
}).passthrough()

export const GoalListResult = z
  .object({ items: z.array(GoalSummaryResult), observedAt: z.number() })
  .passthrough()

export const GoalVersionsResult = z
  .object({
    items: z.array(
      z
        .object({
          specRevision: z.number(),
          savedAt: z.number(),
          spec: GoalSpecSchema
        })
        .passthrough()
    )
  })
  .passthrough()
