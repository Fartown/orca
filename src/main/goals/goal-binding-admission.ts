import type { GoalBinding, GoalDriverVerdict } from '../../shared/goals/goal-control-contract'
import type { GoalRecord } from '../../shared/goals/goal-store-records'
import { goalWorkspaceKey } from '../../shared/goals/goal-workspace-key'
import type { RuntimeTerminalShow } from '../../shared/runtime-terminal-contracts'
import type { GoalDriverLivenessInput } from './goal-driver-liveness'
import type { GoalRejection } from './goal-operation-receipts'
import type { GoalStore } from './goal-store'
import type { GoalTerminalFacts } from './goal-summary-projection'

export type GoalBindingAdmissionDependencies = {
  store: GoalStore
  terminals: GoalTerminalFacts
  inspectDriver: (input: GoalDriverLivenessInput) => Promise<GoalDriverVerdict>
}

/**
 * The client's handle and path are claims, not authority: the host re-resolves
 * the terminal, pins the PTY incarnation, and refuses a workspace another
 * driver still owns.
 */
export class GoalBindingAdmission {
  constructor(private readonly deps: GoalBindingAdmissionDependencies) {}

  async validate(binding: GoalBinding): Promise<RuntimeTerminalShow | GoalRejection> {
    let show: RuntimeTerminalShow
    try {
      show = await this.deps.terminals.showTerminal(binding.terminal)
    } catch (error) {
      return {
        code: 'target_changed',
        message: `The bound terminal is unavailable: ${errorMessage(error)}`
      }
    }
    if (show.executionHostId && show.executionHostId !== 'local') {
      return {
        code: 'unsupported',
        message: 'Goals are only supported on the local execution host.'
      }
    }
    if (show.incarnationId && show.incarnationId !== binding.expectedIncarnationId) {
      return {
        code: 'target_changed',
        message: 'The bound terminal was restarted; pick the session again.'
      }
    }
    if (!show.connected || !show.writable) {
      return { code: 'target_changed', message: 'The bound terminal is not writable.' }
    }
    if (show.worktreePath !== binding.worktree && show.worktreeId !== binding.worktree) {
      return { code: 'target_changed', message: 'The terminal belongs to another workspace.' }
    }
    return show
  }

  /**
   * One driver per workspace, whether a goal record or a legacy CLI run owns it.
   * Creation is stricter: the driver keeps a single v1 run record per workspace,
   * so a second unarchived goal there would overwrite the first one's history.
   */
  async findWorkspaceConflict(
    workspacePath: string,
    exceptGoalId: string | null
  ): Promise<GoalRejection | null> {
    for (const other of await this.deps.store.listRecords()) {
      if (
        other.goalId === exceptGoalId ||
        other.archived ||
        other.workspace.path !== workspacePath
      ) {
        continue
      }
      if (exceptGoalId === null) {
        return {
          code: 'conflict',
          message: `The workspace already has goal ${other.goalId}; archive it before creating another.`
        }
      }
      if (!other.currentRun) {
        continue
      }
      const driver = await this.inspectRecordDriver(other)
      if (driver.status !== 'exited') {
        return {
          code: 'conflict',
          message: `The workspace already has a driver for goal ${other.goalId}.`
        }
      }
    }
    const key = goalWorkspaceKey(workspacePath)
    const legacyDriver = await this.deps.inspectDriver({
      pid: await this.deps.store.readLegacyLockPid(key),
      goalId: exceptGoalId ?? '',
      legacyKey: key
    })
    if (legacyDriver.status !== 'exited') {
      return { code: 'conflict', message: 'A legacy orca-goal driver still holds this workspace.' }
    }
    return null
  }

  inspectRecordDriver(record: GoalRecord): Promise<GoalDriverVerdict> {
    return this.deps.inspectDriver({
      pid: record.currentRun?.pid ?? null,
      goalId: record.goalId,
      legacyKey: record.legacyKey
    })
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
