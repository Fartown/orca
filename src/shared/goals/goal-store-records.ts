import { z } from 'zod'
import {
  GoalBindingSchema,
  GoalBudgetSchema,
  GoalSpecSchema,
  type GoalOperation
} from './goal-control-contract'

// Host-owned record.json. The driver reads it and never writes it.
export const GoalRunSchema = z.object({
  runId: z.string().uuid(),
  mode: z.enum(['start', 'resume']),
  pid: z.number().int().positive().nullable(),
  startedAt: z.number(),
  driverEntry: z.string()
})

export const GoalRecordSchema = z.object({
  version: z.literal(1),
  goalId: z.string().uuid(),
  authorityExecutionHostId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  binding: GoalBindingSchema,
  workspace: z.object({
    selector: z.string(),
    path: z.string(),
    worktreeId: z.string().nullable()
  }),
  spec: GoalSpecSchema,
  budget: GoalBudgetSchema,
  specRevision: z.number().int().positive(),
  runtimeFence: z.number().int().nonnegative(),
  continuation: z.enum(['enabled', 'paused']),
  archived: z.boolean(),
  /** Workspace key the driver reports on ready; null until the first run started. */
  legacyKey: z.string().nullable(),
  currentRun: GoalRunSchema.nullable(),
  lastOperationId: z.string().nullable()
})

export type GoalRecord = z.infer<typeof GoalRecordSchema>
export type GoalRun = z.infer<typeof GoalRunSchema>

// Host-written intent the driver polls at its cooperative checkpoints.
// `reload` means the record changed underneath (amend/rebind): re-read it at the next safe point.
export const GoalControlIntentSchema = z.object({
  runtimeFence: z.number().int().nonnegative(),
  continuation: z.enum(['enabled', 'paused']),
  action: z.enum(['pause', 'resume', 'stop', 'reload']).optional(),
  clientOperationId: z.string().min(1).max(128),
  requestedAt: z.number()
})

// One line per saved definition, appended by the host; the current spec lives on the record.
export const GoalVersionLineSchema = z.object({
  specRevision: z.number().int().positive(),
  savedAt: z.number(),
  spec: GoalSpecSchema
})

export type GoalVersionLine = z.infer<typeof GoalVersionLineSchema>

export type GoalControlIntent = z.infer<typeof GoalControlIntentSchema>

// Receipt on disk: the wire GoalOperation plus dedupe and timing fields.
export const GoalOperationReceiptSchema = z.object({
  clientOperationId: z.string().min(1).max(128),
  goalId: z.string().uuid().nullable(),
  payloadFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
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
  runtimeFence: z.number().int().nonnegative().nullable(),
  runId: z.string().uuid().nullable(),
  continuationPaused: z.boolean().nullable(),
  turnStopped: z.boolean().nullable(),
  acceptanceStopped: z.boolean().nullable(),
  acceptedAt: z.number(),
  appliedAt: z.number().nullable()
})

export type GoalOperationReceipt = z.infer<typeof GoalOperationReceiptSchema>

export function toGoalOperation(receipt: GoalOperationReceipt): GoalOperation {
  return {
    clientOperationId: receipt.clientOperationId,
    goalId: receipt.goalId,
    status: receipt.status,
    code: receipt.code,
    message: receipt.message,
    runtimeFence: receipt.runtimeFence,
    runId: receipt.runId,
    continuationPaused: receipt.continuationPaused,
    turnStopped: receipt.turnStopped,
    acceptanceStopped: receipt.acceptanceStopped
  }
}

/**
 * The driver-owned v1 record (goal-mode/cli/goal-state.mjs `newGoal`), read
 * defensively: the host projects it and never trusts unknown JSON on the wire.
 */
export const LegacyGoalRecordSchema = z
  .object({
    key: z.string(),
    goalId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    specRevision: z.number().int().positive().optional(),
    objective: z.string(),
    worktreePath: z.string(),
    terminalHandle: z.string(),
    state: z.enum(['active', 'complete', 'blocked', 'budget_exhausted', 'stalled', 'aborted']),
    turns: z.number().int().nonnegative(),
    activeMs: z.number().nonnegative().optional(),
    startedAt: z.number(),
    updatedAt: z.number(),
    finishedAt: z.number().nullable().optional(),
    finishReason: z.string().nullable().optional(),
    roundStartedAt: z.number().nullable().optional(),
    awaitingUser: z.object({ reason: z.string(), since: z.number() }).nullable().optional(),
    driverError: z
      .object({ kind: z.string(), message: z.string(), at: z.number() })
      .nullable()
      .optional(),
    lastAcceptance: z
      .object({
        tree: z.string().nullable(),
        result: z.object({
          passed: z.boolean(),
          inconclusive: z.boolean().optional(),
          results: z
            .array(
              z.object({
                command: z.string(),
                ok: z.boolean(),
                inconclusive: z.boolean().optional(),
                output: z.string().optional()
              })
            )
            .optional()
        })
      })
      .nullable()
      .optional()
  })
  .passthrough()

/**
 * The driver keeps one v1 run record per workspace, so the record only speaks
 * for a managed goal while it names that goal; another goal's run replaces it.
 */
export function ownedLegacyRecord(
  record: Pick<GoalRecord, 'goalId'>,
  legacy: LegacyGoalRecord | null
): LegacyGoalRecord | null {
  return legacy && legacy.goalId === record.goalId ? legacy : null
}

export type LegacyGoalRecord = z.infer<typeof LegacyGoalRecordSchema>
