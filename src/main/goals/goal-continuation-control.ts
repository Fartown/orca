import type { GoalOperation } from '../../shared/goals/goal-control-contract'
import type { GoalRecord } from '../../shared/goals/goal-store-records'
import type { GoalBindingAdmission } from './goal-binding-admission'
import type { GoalOperationIdentity, GoalOperationReceipts } from './goal-operation-receipts'
import { runFenceFor, type GoalRunCommitter } from './goal-run-commit'
import type { GoalStore } from './goal-store'

export type GoalContinuationControlDependencies = {
  store: GoalStore
  admission: GoalBindingAdmission
  receipts: GoalOperationReceipts
  runs: GoalRunCommitter
  newId: () => string
  now: () => number
}

/**
 * Pause and resume of the continuation gate. Pause never touches the round in
 * flight; resume re-attaches a driver when the previous one is positively gone
 * and refuses while its fate is unverifiable.
 */
export class GoalContinuationControl {
  constructor(private readonly deps: GoalContinuationControlDependencies) {}

  async pause(params: GoalOperationIdentity, record: GoalRecord): Promise<GoalOperation> {
    const { receipts } = this.deps
    const runId = record.currentRun?.runId ?? null
    if (record.continuation === 'paused') {
      return receipts.persist(
        receipts.build(
          params,
          record.goalId,
          'applied',
          'ok',
          'Continuation was already paused.',
          { runtimeFence: record.runtimeFence, runId },
          { continuationPaused: true }
        )
      )
    }
    const driver = await this.deps.admission.inspectRecordDriver(record)
    const { runs } = this.deps
    const runtimeFence = await runs.commitContinuation(record, 'paused', params.clientOperationId)
    if (driver.status === 'live') {
      const accepted = await receipts.persist(
        receipts.build(
          params,
          record.goalId,
          'accepted',
          'ok',
          'Pause requested; the driver confirms it at its next checkpoint.',
          { runtimeFence, runId }
        )
      )
      await runs.writeIntent(
        record.goalId,
        runtimeFence,
        'paused',
        'pause',
        params.clientOperationId
      )
      return accepted
    }
    await runs.writeIntent(record.goalId, runtimeFence, 'paused', 'pause', params.clientOperationId)
    const message =
      driver.status === 'exited'
        ? 'No driver is running; nothing will be injected.'
        : `Continuation is paused, but the driver could not be verified: ${driver.reason}`
    return receipts.persist(
      receipts.build(
        params,
        record.goalId,
        'applied',
        'ok',
        message,
        { runtimeFence, runId },
        { continuationPaused: true }
      )
    )
  }

  /**
   * Stop closes the gate and, when a driver runs, asks it to interrupt the round
   * in flight; only the driver's receipt can say the turn actually ended. With
   * no driver there is nothing to interrupt, so the record is settled here.
   */
  async stop(params: GoalOperationIdentity, record: GoalRecord): Promise<GoalOperation> {
    const { receipts, store, admission, runs } = this.deps
    const runId = record.currentRun?.runId ?? null
    const driver = await admission.inspectRecordDriver(record)
    if (driver.status === 'unverifiable') {
      return receipts.reject(params, record.goalId, {
        code: 'confirmation_pending',
        message: `The driver could not be verified: ${driver.reason}`
      })
    }
    if (driver.status === 'live') {
      const runtimeFence = await runs.commitContinuation(record, 'paused', params.clientOperationId)
      const accepted = await receipts.persist(
        receipts.build(
          params,
          record.goalId,
          'accepted',
          'ok',
          'Stop requested; the driver interrupts the current turn and confirms.',
          { runtimeFence, runId }
        )
      )
      await runs.writeIntent(
        record.goalId,
        runtimeFence,
        'paused',
        'stop',
        params.clientOperationId
      )
      return accepted
    }
    const legacy = await store.readOwnedLegacyRecord(record)
    if (record.legacyKey && legacy?.state === 'active') {
      await store.writeLegacyRecord(record.legacyKey, {
        ...legacy,
        state: 'aborted',
        finishReason: 'Stopped from Orca',
        finishedAt: this.deps.now()
      })
    }
    const runtimeFence = await runs.commitContinuation(record, 'paused', params.clientOperationId)
    await runs.writeIntent(record.goalId, runtimeFence, 'paused', 'stop', params.clientOperationId)
    return receipts.persist(
      receipts.build(
        params,
        record.goalId,
        'applied',
        'ok',
        'No driver was running; the goal is marked stopped.',
        { runtimeFence, runId },
        { continuationPaused: true }
      )
    )
  }

  async resume(params: GoalOperationIdentity, record: GoalRecord): Promise<GoalOperation> {
    const { receipts, store, admission, runs } = this.deps
    const legacy = await store.readOwnedLegacyRecord(record)
    if (legacy?.state === 'budget_exhausted' && !budgetLeaves(record, legacy)) {
      return receipts.reject(params, record.goalId, {
        code: 'budget_exhausted',
        message: legacy.finishReason ?? 'The budget is exhausted; raise it before resuming.'
      })
    }
    if (legacy?.state === 'complete') {
      return receipts.reject(params, record.goalId, {
        code: 'conflict',
        message: 'The goal is already complete.'
      })
    }
    const driver = await admission.inspectRecordDriver(record)
    if (driver.status === 'unverifiable') {
      return receipts.reject(params, record.goalId, {
        code: 'confirmation_pending',
        message: `The driver could not be verified: ${driver.reason}`
      })
    }
    if (driver.status === 'live') {
      const runtimeFence = await runs.commitContinuation(
        record,
        'enabled',
        params.clientOperationId
      )
      const accepted = await receipts.persist(
        receipts.build(
          params,
          record.goalId,
          'accepted',
          'ok',
          'Resume requested; the driver confirms it at its next checkpoint.',
          { runtimeFence, runId: record.currentRun?.runId ?? null }
        )
      )
      await runs.writeIntent(
        record.goalId,
        runtimeFence,
        'enabled',
        'resume',
        params.clientOperationId
      )
      return accepted
    }
    return this.relaunch(params, record)
  }

  private async relaunch(
    params: GoalOperationIdentity,
    record: GoalRecord
  ): Promise<GoalOperation> {
    const { receipts, admission, runs } = this.deps
    if (!record.legacyKey) {
      return receipts.reject(params, record.goalId, {
        code: 'driver_error',
        message: 'The goal never started; create it again.'
      })
    }
    const target = await admission.validate(record.binding)
    if ('code' in target) {
      return receipts.reject(params, record.goalId, target)
    }
    const conflict = await admission.findWorkspaceConflict(record.workspace.path, record.goalId)
    if (conflict) {
      return receipts.reject(params, record.goalId, conflict)
    }
    const runId = this.deps.newId()
    const next: GoalRecord = {
      ...record,
      continuation: 'enabled',
      lastOperationId: params.clientOperationId
    }
    try {
      // Why intent before launch: the new driver reads control.json at its first checkpoint and
      // must find this resume there, not the previous run's stop.
      await runs.writeIntent(
        record.goalId,
        runFenceFor(next, 'resume'),
        'enabled',
        'resume',
        params.clientOperationId
      )
      const launched = await runs.launchRun(next, runId, 'resume')
      return receipts.persist(
        receipts.build(
          params,
          record.goalId,
          'applied',
          'ok',
          'A new driver run attached to the goal.',
          { runtimeFence: launched.runtimeFence, runId },
          { continuationPaused: false }
        )
      )
    } catch (error) {
      return receipts.reject(params, record.goalId, {
        code: 'driver_error',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

/** A raised budget reopens an exhausted goal; the driver re-reads the record on resume. */
function budgetLeaves(record: GoalRecord, legacy: { turns: number; activeMs?: number }): boolean {
  const turnsLeft = record.budget.maxTurns === 0 || legacy.turns < record.budget.maxTurns
  const minutesLeft =
    record.budget.maxMinutes === 0 || (legacy.activeMs ?? 0) < record.budget.maxMinutes * 60_000
  return turnsLeft && minutesLeft
}
