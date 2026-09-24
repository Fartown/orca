import type { GoalDriverVerdict, GoalOperation } from '../../shared/goals/goal-control-contract'
import type { GoalNotice, GoalRecord } from '../../shared/goals/goal-store-records'
import type { GoalStore } from './goal-store'

export const GOAL_RECOVERY_SCAN_MS = 5 * 60_000
// C15: at most three automatic relaunches an hour, then the user hears about it instead.
export const GOAL_RECOVERY_WINDOW_MS = 60 * 60_000
export const GOAL_RECOVERY_LIMIT = 3
export const GOAL_RELAUNCH_LIMIT_NOTICE = 'driver-relaunch-limit'

export type GoalDriverRecoveryDependencies = {
  store: GoalStore
  inspectRecordDriver: (record: GoalRecord) => Promise<GoalDriverVerdict>
  relaunch: (record: GoalRecord) => Promise<GoalOperation>
  now: () => number
  log?: (message: string) => void
  /**
   * Wraps a pass in whatever context resolving terminal handles needs. The SSH relay resolves
   * them through a connected client and returns false while none is, skipping the pass.
   */
  withHostContext?: (pass: () => Promise<void>) => Promise<boolean>
}

export type GoalRecoveryOutcome = 'relaunched' | 'limited' | 'failed' | 'skipped'

/**
 * Runs on the execution host, so a driver that exits while nobody has the panel open (or the
 * workspace is not the selected one) still comes back. The panel summary only reads.
 */
export class GoalDriverRecovery {
  private timer: ReturnType<typeof setInterval> | null = null
  private scanning: Promise<void> | null = null

  constructor(private readonly deps: GoalDriverRecoveryDependencies) {}

  private log(message: string): void {
    ;(this.deps.log ?? console.warn)(message)
  }

  // Why the env override: real-app validation kills a driver and should not wait five minutes.
  start(
    intervalMs = Number(process.env.ORCA_GOAL_RECOVERY_SCAN_MS) || GOAL_RECOVERY_SCAN_MS
  ): void {
    this.stop()
    void this.scan()
    this.timer = setInterval(() => void this.scan(), intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** One pass over every goal; overlapping ticks share the pass in flight. */
  scan(): Promise<void> {
    const pass = (): Promise<void> => this.scanAll()
    this.scanning ??= (
      this.deps.withHostContext ? this.deps.withHostContext(pass).then(() => {}) : pass()
    ).finally(() => {
      this.scanning = null
    })
    return this.scanning
  }

  private async scanAll(): Promise<void> {
    for (const record of await this.deps.store.listRecords().catch(() => [])) {
      try {
        await this.recover(record)
      } catch (error) {
        this.log(
          `[goals] recovery of ${record.goalId} failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  async recover(record: GoalRecord): Promise<GoalRecoveryOutcome> {
    const { store } = this.deps
    // Paused, archived, never-started and guardless goals are the user's to restart.
    if (
      record.archived ||
      record.continuation !== 'enabled' ||
      !record.legacyKey ||
      !record.currentRun ||
      (record.spec.judge ?? 'none') === 'none'
    ) {
      return 'skipped'
    }
    const legacy = await store.readOwnedLegacyRecord(record)
    if (legacy?.state !== 'active') {
      return 'skipped'
    }
    const driver = await this.deps.inspectRecordDriver(record)
    const recovery = await store.readRecovery(record.goalId)
    const now = this.deps.now()
    if (driver.status === 'live') {
      // A user resume brought it back; the limit notice no longer applies.
      if (openLimitNotice(recovery.notices)) {
        await store.writeRecovery(record.goalId, {
          ...recovery,
          notices: resolveLimitNotices(recovery.notices, now)
        })
      }
      return 'skipped'
    }
    // Lost contact is never evidence the driver died (docs/reference/ssh-execution-boundary.md).
    if (driver.status !== 'exited') {
      return 'skipped'
    }
    const recent = recovery.relaunches.filter((at) => now - at < GOAL_RECOVERY_WINDOW_MS)
    if (recent.length >= GOAL_RECOVERY_LIMIT) {
      if (!openLimitNotice(recovery.notices)) {
        const notice: GoalNotice = {
          id: `${GOAL_RELAUNCH_LIMIT_NOTICE}:${now}`,
          kind: GOAL_RELAUNCH_LIMIT_NOTICE,
          text: `The goal driver exited ${recent.length} times within an hour; automatic relaunch stopped. Open the goal and resume it once the cause is fixed.`,
          at: now,
          resolvedAt: null
        }
        await store.writeRecovery(record.goalId, {
          relaunches: recent,
          notices: [...recovery.notices, notice].slice(-20)
        })
      }
      return 'limited'
    }
    // Why record before launching: a relaunch that dies instantly must still count toward the limit.
    await store.writeRecovery(record.goalId, {
      relaunches: [...recent, now],
      notices: recovery.notices
    })
    const operation = await this.deps.relaunch(record)
    if (operation.status === 'rejected') {
      this.log(`[goals] recovery of ${record.goalId} was refused: ${operation.message}`)
      return 'failed'
    }
    return 'relaunched'
  }
}

function openLimitNotice(notices: readonly GoalNotice[]): boolean {
  return notices.some((notice) => notice.kind === GOAL_RELAUNCH_LIMIT_NOTICE && !notice.resolvedAt)
}

function resolveLimitNotices(notices: readonly GoalNotice[], now: number): GoalNotice[] {
  return notices.map((notice) =>
    notice.kind === GOAL_RELAUNCH_LIMIT_NOTICE && !notice.resolvedAt
      ? { ...notice, resolvedAt: now }
      : notice
  )
}
