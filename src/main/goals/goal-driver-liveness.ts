import { inspectProcessLiveness, readProcessCommandLine } from '../daemon/daemon-process-inspection'
import { readWindowsProcessTable } from '../windows/windows-process-table'
import type { GoalDriverVerdict } from '../../shared/goals/goal-control-contract'

export type GoalDriverLivenessInput = {
  pid: number | null
  goalId: string
  /** The v1 workspace key, so a legacy `orca-goal` CLI driver also reads as live. */
  legacyKey: string | null
  platform?: NodeJS.Platform
}

export type GoalDriverLivenessDependencies = {
  inspectLiveness?: typeof inspectProcessLiveness
  readCommandLine?: (pid: number, platform: NodeJS.Platform) => Promise<string | undefined>
}

/**
 * A pid alone is not a driver: the lock file survives SIGKILL and pid reuse
 * would otherwise turn an unrelated process into "the driver is running". The
 * command line must name this goal (host-launched) or the legacy CLI key.
 */
export async function inspectGoalDriver(
  input: GoalDriverLivenessInput,
  dependencies: GoalDriverLivenessDependencies = {}
): Promise<GoalDriverVerdict> {
  const pid = input.pid
  if (pid === null) {
    return { status: 'exited' }
  }
  const platform = input.platform ?? process.platform
  const liveness = (dependencies.inspectLiveness ?? inspectProcessLiveness)(pid)
  if (liveness.status !== 'live') {
    return liveness
  }
  const commandLine = await (dependencies.readCommandLine ?? readCommandLineForPlatform)(
    pid,
    platform
  )
  if (commandLine === undefined) {
    return { status: 'unverifiable', reason: 'the driver command line could not be read' }
  }
  // Why: an empty goalId (legacy-only checks) must not match every command line.
  if (input.goalId && commandLine.includes(input.goalId)) {
    return { status: 'live' }
  }
  if (
    input.legacyKey &&
    commandLine.includes('orca-goal') &&
    commandLine.includes(input.legacyKey)
  ) {
    return { status: 'live' }
  }
  return { status: 'exited' }
}

const COMMAND_LINE_CACHE_MS = 2_000
const commandLineCache = new Map<number, { at: number; value: Promise<string | undefined> }>()

/** One `ps`/process-table read per pid per couple of seconds: every goal in every list poll asks for it. */
function readCommandLineForPlatform(
  pid: number,
  platform: NodeJS.Platform
): Promise<string | undefined> {
  const now = Date.now()
  const cached = commandLineCache.get(pid)
  if (cached && now - cached.at < COMMAND_LINE_CACHE_MS) {
    return cached.value
  }
  const value = readCommandLineUncached(pid, platform)
  commandLineCache.set(pid, { at: now, value })
  value.catch(() => commandLineCache.delete(pid))
  return value
}

async function readCommandLineUncached(
  pid: number,
  platform: NodeJS.Platform
): Promise<string | undefined> {
  if (platform !== 'win32') {
    return readProcessCommandLine(pid, platform)
  }
  const rows = await readWindowsProcessTable()
  const row = rows.find((candidate) => candidate.pid === pid)
  return row && row.command.length > 0 ? row.command : undefined
}
