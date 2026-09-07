import type {
  GoalAmendParams,
  GoalArchiveParams,
  GoalOperation,
  GoalRebindParams,
  GoalSpecRevision
} from '../../shared/goals/goal-control-contract'
import type { GoalRecord } from '../../shared/goals/goal-store-records'
import type { GoalBindingAdmission } from './goal-binding-admission'
import type { GoalContinuationControl } from './goal-continuation-control'
import type { GoalOperationReceipts, GoalRejection } from './goal-operation-receipts'
import type { GoalRunCommitter } from './goal-run-commit'
import type { GoalStore } from './goal-store'
import { observeTurn, type GoalProjectionSources } from './goal-summary-projection'

export type GoalRevisionControlDependencies = {
  store: GoalStore
  admission: GoalBindingAdmission
  receipts: GoalOperationReceipts
  runs: GoalRunCommitter
  continuation: GoalContinuationControl
  projection: () => GoalProjectionSources
  now: () => number
}

type Quiescence = { ok: true; driverLive: boolean } | { ok: false; rejection: GoalRejection }

/**
 * Changes that rewrite what the driver is doing: definition, budget, binding,
 * archive flag. All of them require the goal to be quiescent first, so a
 * running turn is never edited underneath.
 */
export class GoalRevisionControl {
  constructor(private readonly deps: GoalRevisionControlDependencies) {}

  async amend(params: GoalAmendParams, record: GoalRecord): Promise<GoalOperation> {
    const { receipts, store, runs } = this.deps
    if (!params.spec && !params.budget) {
      return receipts.reject(params, record.goalId, {
        code: 'conflict',
        message: 'Nothing to change.'
      })
    }
    const quiet = await this.quiescence(record)
    if (!quiet.ok) {
      return receipts.reject(params, record.goalId, quiet.rejection)
    }
    const specChanged = params.spec !== undefined && !sameJson(params.spec, record.spec)
    const next: GoalRecord = {
      ...record,
      updatedAt: this.deps.now(),
      runtimeFence: record.runtimeFence + 1,
      lastOperationId: params.clientOperationId,
      ...(params.spec && specChanged
        ? { spec: params.spec, specRevision: record.specRevision + 1 }
        : {}),
      ...(params.budget ? { budget: params.budget } : {}),
      ...(params.resumeAfterSave ? { continuation: 'enabled' as const } : {})
    }
    await store.writeRecord(next)
    if (specChanged) {
      await store.appendVersion(record.goalId, {
        specRevision: next.specRevision,
        savedAt: next.updatedAt,
        spec: next.spec
      })
    }
    const runId = record.currentRun?.runId ?? null
    if (quiet.driverLive) {
      const accepted = await receipts.persist(
        receipts.build(
          params,
          record.goalId,
          'accepted',
          'ok',
          'Saved; the driver reloads the definition at its next checkpoint.',
          { runtimeFence: next.runtimeFence, runId }
        )
      )
      await runs.writeIntent(
        record.goalId,
        next.runtimeFence,
        next.continuation,
        'reload',
        params.clientOperationId
      )
      return accepted
    }
    if (params.resumeAfterSave) {
      return this.deps.continuation.resume(params, next)
    }
    return receipts.persist(
      receipts.build(
        params,
        record.goalId,
        'applied',
        'ok',
        specChanged
          ? 'Saved as a new definition revision; earlier evidence no longer counts.'
          : 'Saved.',
        { runtimeFence: next.runtimeFence, runId },
        { continuationPaused: next.continuation === 'paused' }
      )
    )
  }

  async rebind(params: GoalRebindParams, record: GoalRecord): Promise<GoalOperation> {
    const { receipts, store, runs, admission } = this.deps
    const quiet = await this.quiescence(record)
    if (!quiet.ok) {
      return receipts.reject(params, record.goalId, quiet.rejection)
    }
    const target = await admission.validate(params.binding)
    if ('code' in target) {
      return receipts.reject(params, record.goalId, target)
    }
    if (target.worktreePath !== record.workspace.path) {
      return receipts.reject(params, record.goalId, {
        code: 'conflict',
        message: 'The new session belongs to another workspace; evidence would not carry over.'
      })
    }
    const next: GoalRecord = {
      ...record,
      updatedAt: this.deps.now(),
      binding: params.binding,
      runtimeFence: record.runtimeFence + 1,
      lastOperationId: params.clientOperationId
    }
    await store.writeRecord(next)
    const runId = record.currentRun?.runId ?? null
    if (quiet.driverLive) {
      const accepted = await receipts.persist(
        receipts.build(
          params,
          record.goalId,
          'accepted',
          'ok',
          'Session changed; the driver switches at its next checkpoint.',
          { runtimeFence: next.runtimeFence, runId }
        )
      )
      await runs.writeIntent(
        record.goalId,
        next.runtimeFence,
        next.continuation,
        'reload',
        params.clientOperationId
      )
      return accepted
    }
    const legacy = await store.readOwnedLegacyRecord(record)
    if (record.legacyKey && legacy) {
      await store.writeLegacyRecord(record.legacyKey, {
        ...legacy,
        terminalHandle: params.binding.terminal
      })
    }
    return receipts.persist(
      receipts.build(params, record.goalId, 'applied', 'ok', 'Session changed.', {
        runtimeFence: next.runtimeFence,
        runId
      })
    )
  }

  async archive(params: GoalArchiveParams, record: GoalRecord): Promise<GoalOperation> {
    const { receipts, store, admission } = this.deps
    const driver = await admission.inspectRecordDriver(record)
    if (driver.status === 'live' && params.archived) {
      return receipts.reject(params, record.goalId, {
        code: 'conflict',
        message: 'Stop the goal before archiving it.'
      })
    }
    if (driver.status === 'unverifiable' && params.archived) {
      return receipts.reject(params, record.goalId, {
        code: 'confirmation_pending',
        message: `The driver could not be verified: ${driver.reason}`
      })
    }
    const next: GoalRecord = {
      ...record,
      updatedAt: this.deps.now(),
      archived: params.archived,
      runtimeFence: record.runtimeFence + 1,
      lastOperationId: params.clientOperationId
    }
    await store.writeRecord(next)
    return receipts.persist(
      receipts.build(
        params,
        record.goalId,
        'applied',
        'ok',
        params.archived ? 'Archived; runs and verdicts are kept.' : 'Restored from the archive.',
        { runtimeFence: next.runtimeFence, runId: record.currentRun?.runId ?? null }
      )
    )
  }

  /** Every saved definition, oldest first; the first revision is the one the goal was created with. */
  async versions(record: GoalRecord): Promise<GoalSpecRevision[]> {
    const saved = await this.deps.store.readVersions(record.goalId)
    if (saved.some((line) => line.specRevision === record.specRevision)) {
      return saved
    }
    return [
      ...saved,
      { specRevision: record.specRevision, savedAt: record.updatedAt, spec: record.spec }
    ]
  }

  private async quiescence(record: GoalRecord): Promise<Quiescence> {
    const driver = await this.deps.admission.inspectRecordDriver(record)
    if (driver.status === 'unverifiable') {
      return {
        ok: false,
        rejection: {
          code: 'confirmation_pending',
          message: `The driver could not be verified: ${driver.reason}`
        }
      }
    }
    if (driver.status === 'exited') {
      return { ok: true, driverLive: false }
    }
    if (record.continuation !== 'paused') {
      return {
        ok: false,
        rejection: { code: 'conflict', message: 'Pause continuation before changing the goal.' }
      }
    }
    const turn = await observeTurn(record, this.deps.projection())
    if (turn.turn === 'running') {
      return {
        ok: false,
        rejection: {
          code: 'conflict',
          message: 'The current turn is still running; wait for it to finish or stop the goal.'
        }
      }
    }
    return { ok: true, driverLive: true }
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
