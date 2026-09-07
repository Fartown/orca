import type { GoalControlIntent, GoalRecord } from '../../shared/goals/goal-store-records'
import type { GoalDriverLauncher } from './goal-driver-launch'
import type { GoalStore } from './goal-store'

export type GoalRunCommitDependencies = {
  store: GoalStore
  launcher: GoalDriverLauncher
  userDataPath: string
  now: () => number
}

/** The fence a run launch commits: a first start keeps the record's, a re-attach bumps it. */
export function runFenceFor(record: GoalRecord, mode: 'start' | 'resume'): number {
  return mode === 'start' ? record.runtimeFence : record.runtimeFence + 1
}

/**
 * The two writes that change what the driver is allowed to do: starting a run
 * and flipping the continuation gate. Both bump the runtime fence so a client
 * holding an older view is refused instead of racing the driver. Callers write
 * the receipt between the record and the intent: the driver rewrites that
 * receipt at its checkpoint, and a later host write would clobber its answer.
 */
export class GoalRunCommitter {
  constructor(private readonly deps: GoalRunCommitDependencies) {}

  /** Launches a driver run, then commits the run identity and workspace key to the record. */
  async launchRun(
    record: GoalRecord,
    runId: string,
    mode: 'start' | 'resume'
  ): Promise<{ runtimeFence: number }> {
    const launched = await this.deps.launcher.launch({
      goalHome: this.deps.store.goalHome,
      goalId: record.goalId,
      runId,
      mode,
      userDataPath: this.deps.userDataPath
    })
    const runtimeFence = runFenceFor(record, mode)
    await this.deps.store.writeRecord({
      ...record,
      updatedAt: this.deps.now(),
      runtimeFence,
      legacyKey: launched.key,
      currentRun: {
        runId,
        mode,
        pid: launched.pid,
        startedAt: this.deps.now(),
        driverEntry: this.deps.launcher.entryPath ?? ''
      }
    })
    return { runtimeFence }
  }

  /** Records the new gate on the record; the intent for the driver is written separately, after the receipt. */
  async commitContinuation(
    record: GoalRecord,
    continuation: GoalRecord['continuation'],
    clientOperationId: string
  ): Promise<number> {
    const runtimeFence = record.runtimeFence + 1
    await this.deps.store.writeRecord({
      ...record,
      updatedAt: this.deps.now(),
      continuation,
      runtimeFence,
      lastOperationId: clientOperationId
    })
    return runtimeFence
  }

  writeIntent(
    goalId: string,
    runtimeFence: number,
    continuation: GoalRecord['continuation'],
    action: GoalControlIntent['action'],
    clientOperationId: string
  ): Promise<void> {
    return this.deps.store.writeControl(goalId, {
      runtimeFence,
      continuation,
      action,
      clientOperationId,
      requestedAt: this.deps.now()
    })
  }
}
