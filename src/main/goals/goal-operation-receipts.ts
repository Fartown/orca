import type { GoalDriverVerdict, GoalOperation } from '../../shared/goals/goal-control-contract'
import {
  toGoalOperation,
  type GoalOperationReceipt,
  type GoalRecord
} from '../../shared/goals/goal-store-records'
import type { GoalStore } from './goal-store'

export type GoalRejection = { code: GoalOperation['code']; message: string }

export type GoalOperationIdentity = { clientOperationId: string; payloadFingerprint: string }

export type GoalOperationReceiptsDependencies = {
  store: GoalStore
  inspectRecordDriver: (record: GoalRecord) => Promise<GoalDriverVerdict>
  now: () => number
}

/** Builds, persists, replays and settles receipts; every mutation path ends in one of these. */
export class GoalOperationReceipts {
  constructor(private readonly deps: GoalOperationReceiptsDependencies) {}

  build(
    identity: GoalOperationIdentity,
    goalId: string | null,
    status: GoalOperationReceipt['status'],
    code: GoalOperationReceipt['code'],
    message: string,
    fence: { runtimeFence: number | null; runId: string | null },
    flags: { continuationPaused?: boolean | null } = {}
  ): GoalOperationReceipt {
    const now = this.deps.now()
    return {
      clientOperationId: identity.clientOperationId,
      goalId,
      payloadFingerprint: identity.payloadFingerprint,
      status,
      code,
      message,
      runtimeFence: fence.runtimeFence,
      runId: fence.runId,
      continuationPaused: flags.continuationPaused ?? null,
      turnStopped: null,
      acceptanceStopped: null,
      acceptedAt: now,
      appliedAt: status === 'applied' || status === 'rejected' ? now : null
    }
  }

  async persist(receipt: GoalOperationReceipt): Promise<GoalOperation> {
    await this.deps.store.writeReceipt(receipt)
    return toGoalOperation(receipt)
  }

  reject(
    identity: GoalOperationIdentity,
    goalId: string | null,
    rejection: GoalRejection
  ): Promise<GoalOperation> {
    return this.persist(
      this.build(identity, goalId, 'rejected', rejection.code, rejection.message, {
        runtimeFence: null,
        runId: null
      })
    )
  }

  /**
   * Same id with the same payload replays the stored receipt; a different
   * payload is refused without touching the stored one.
   */
  async replay(identity: GoalOperationIdentity): Promise<GoalOperation | null> {
    const existing = await this.deps.store.readReceipt(identity.clientOperationId)
    if (!existing) {
      return null
    }
    if (existing.payloadFingerprint === identity.payloadFingerprint) {
      return toGoalOperation(await this.settle(existing))
    }
    return {
      ...toGoalOperation(existing),
      status: 'rejected',
      code: 'conflict',
      message: 'This operation id was already used with a different payload.'
    }
  }

  async read(clientOperationId: string): Promise<GoalOperation | null> {
    const receipt = await this.deps.store.readReceipt(clientOperationId)
    return receipt ? toGoalOperation(await this.settle(receipt)) : null
  }

  /** A receipt the driver can no longer settle is settled here from the driver's absence. */
  async settle(receipt: GoalOperationReceipt): Promise<GoalOperationReceipt> {
    if ((receipt.status !== 'accepted' && receipt.status !== 'applying') || !receipt.goalId) {
      return receipt
    }
    const record = await this.deps.store.readRecord(receipt.goalId)
    if (!record) {
      return receipt
    }
    const driver = await this.deps.inspectRecordDriver(record)
    if (driver.status !== 'exited') {
      return receipt
    }
    const control = await this.deps.store.readControl(record.goalId)
    const owner =
      control && control.clientOperationId === receipt.clientOperationId ? control : null
    const settled = this.settleByAbsence(receipt, owner)
    await this.deps.store.writeReceipt(settled)
    return settled
  }

  /**
   * What a vanished driver leaves behind: a closed gate holds without it, a
   * saved definition applies on the next run, and a stop it never confirmed
   * stays "interrupt unconfirmed". Only a resume needs a driver to mean anything.
   */
  private settleByAbsence(
    receipt: GoalOperationReceipt,
    owner: { continuation: 'enabled' | 'paused'; action?: string } | null
  ): GoalOperationReceipt {
    const appliedAt = this.deps.now()
    if (owner?.action === 'stop') {
      return {
        ...receipt,
        status: 'applied',
        code: receipt.status === 'applying' ? 'confirmation_pending' : 'ok',
        message:
          receipt.status === 'applying'
            ? 'The driver exited before confirming the interrupted turn ended.'
            : 'The driver exited; nothing will be injected.',
        continuationPaused: true,
        turnStopped: receipt.status === 'applying' ? false : null,
        appliedAt
      }
    }
    if (owner?.action === 'reload') {
      return {
        ...receipt,
        status: 'applied',
        message: 'The driver exited; the saved definition applies on the next run.',
        continuationPaused: owner.continuation === 'paused',
        appliedAt
      }
    }
    if (owner?.continuation === 'paused') {
      return {
        ...receipt,
        status: 'applied',
        message: 'The driver exited; nothing will be injected.',
        continuationPaused: true,
        appliedAt
      }
    }
    return {
      ...receipt,
      status: 'rejected',
      code: 'driver_error',
      message: 'The driver exited before applying the request.',
      appliedAt
    }
  }
}
