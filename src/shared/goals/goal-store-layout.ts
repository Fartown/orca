import { join } from 'node:path'

/**
 * On-disk layout shared by the host control service and the bundled driver.
 *
 * The v1 CLI already owns `GOAL_HOME/{goals,log,lock,claims}` keyed by workspace.
 * Everything the host owns lives under `GOAL_HOME/v2/goals/GOAL_ID/` so the two
 * writers never touch the same file: the host writes the record, the control
 * intent and the accepted receipt; the driver only rewrites a receipt to
 * `applied` and never writes the record.
 */
export const GOAL_HOME_ENV = 'ORCA_GOAL_HOME'
export const GOAL_DRIVER_ENTRY_FILENAME = 'goal-driver.js'
export const GOAL_DRIVER_VERSION_FILENAME = '.version'

export function resolveGoalHome(env: NodeJS.ProcessEnv, homeDir: string): string {
  const configured = env[GOAL_HOME_ENV]?.trim()
  return configured ? configured : join(homeDir, '.orca-goal')
}

export function goalsV2Dir(goalHome: string): string {
  return join(goalHome, 'v2', 'goals')
}

export function goalDir(goalHome: string, goalId: string): string {
  return join(goalsV2Dir(goalHome), goalId)
}

export function goalRecordPath(goalHome: string, goalId: string): string {
  return join(goalDir(goalHome, goalId), 'record.json')
}

export function goalControlPath(goalHome: string, goalId: string): string {
  return join(goalDir(goalHome, goalId), 'control.json')
}

export function goalVersionsPath(goalHome: string, goalId: string): string {
  return join(goalDir(goalHome, goalId), 'versions.jsonl')
}

/**
 * One flat receipt directory keyed by clientOperationId: the host creates the
 * receipt as `accepted`, the driver rewrites the same file as `applied`, and
 * `goals.operation` reads it back without knowing the goal.
 */
export function goalOperationsDir(goalHome: string): string {
  return join(goalHome, 'v2', 'operations')
}

export function goalOperationPath(goalHome: string, clientOperationId: string): string {
  return join(goalOperationsDir(goalHome), `${clientOperationId}.json`)
}

// v1 driver-owned files, keyed by the workspace key the driver reports on ready.
export function legacyGoalRecordPath(goalHome: string, key: string): string {
  return join(goalHome, 'goals', `${key}.json`)
}

export function legacyLockPath(goalHome: string, key: string): string {
  return join(goalHome, 'lock', `${key}.lock`)
}

export function legacyDriverLogPath(goalHome: string, key: string): string {
  return join(goalHome, 'log', `${key}.out`)
}
