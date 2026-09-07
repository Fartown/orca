import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ChildProcessHandle } from '../../shared/child-process/process-spec'
import { spawnProcess } from '../../shared/child-process/run-process'
import { GOAL_DRIVER_ENTRY_FILENAME, GOAL_HOME_ENV } from '../../shared/goals/goal-store-layout'

const READY_TIMEOUT_MS = 20_000
const STARTUP_STDERR_MAX_BYTES = 8_192

export type GoalDriverLaunchRequest = {
  goalHome: string
  goalId: string
  runId: string
  mode: 'start' | 'resume'
  userDataPath: string
}

export type GoalDriverLaunchResult = { pid: number; key: string }

export type GoalDriverLauncher = {
  entryPath: string | null
  launch(request: GoalDriverLaunchRequest): Promise<GoalDriverLaunchResult>
}

/**
 * Same candidate order as the relay bundles: env override, packaged
 * extraResources, then the dev checkout's out/ directory. The driver is a
 * self-contained esbuild bundle (config/scripts/build-goal-driver.mjs), so it
 * never depends on PATH, the checkout, or files inside app.asar.
 */
export function resolveGoalDriverEntry(input: {
  env: NodeJS.ProcessEnv
  resourcesPath: string | undefined
  appPath: string | null
}): string | null {
  const candidates: string[] = []
  const override = input.env.ORCA_GOAL_DRIVER_PATH?.trim()
  if (override) {
    candidates.push(override)
  }
  if (input.resourcesPath) {
    candidates.push(join(input.resourcesPath, 'goal-driver'))
  }
  if (input.appPath) {
    candidates.push(join(input.appPath, 'out', 'goal-driver'))
  }
  for (const dir of candidates) {
    const entry = join(dir, GOAL_DRIVER_ENTRY_FILENAME)
    if (existsSync(entry)) {
      return entry
    }
  }
  return null
}

export function createGoalDriverLauncher(input: {
  entryPath: string | null
  execPath?: string
}): GoalDriverLauncher {
  return {
    entryPath: input.entryPath,
    launch: (request) => {
      if (!input.entryPath) {
        return Promise.reject(new Error('The goal driver bundle is missing.'))
      }
      return launchGoalDriverChild(input.entryPath, request, input.execPath ?? process.execPath)
    }
  }
}

type DriverMessage =
  | { type: 'ready'; key: string }
  | { type: 'failed'; reason: string }
  | { type?: string }

/**
 * Detached plain-Node child with an IPC channel only for the ready handshake,
 * after which the host lets go: the driver outlives windows and quits.
 */
async function launchGoalDriverChild(
  entryPath: string,
  request: GoalDriverLaunchRequest,
  execPath: string
): Promise<GoalDriverLaunchResult> {
  // Why spawnProcess, not fork: the shared runner owns windowsHide and .cmd handling; the ipc slot gives the same handshake channel.
  const child = spawnProcess({
    program: execPath,
    args: [
      entryPath,
      '--goal-id',
      request.goalId,
      '--run-id',
      request.runId,
      '--mode',
      request.mode,
      '--goal-home',
      request.goalHome
    ],
    // Why: the state directory is the only path the driver truly depends on; a deleted worktree must not kill it via uv_cwd.
    cwd: request.goalHome,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ORCA_USER_DATA_PATH: request.userDataPath,
      [GOAL_HOME_ENV]: request.goalHome,
      ORCA_GOAL_DETACHED: '1'
    }
  })
  let stderrTail = ''
  const onStderr = (chunk: Buffer): void => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STARTUP_STDERR_MAX_BYTES)
  }
  child.stderr?.on('data', onStderr)
  const release = (): void => {
    child.stderr?.off('data', onStderr)
    child.stderr?.destroy()
    if (child.connected) {
      child.disconnect()
    }
    child.unref()
  }
  try {
    const key = await waitForReady(child, () => stderrTail)
    const pid = child.pid
    if (!Number.isSafeInteger(pid) || (pid as number) <= 0) {
      throw new Error('The goal driver reported ready without a pid.')
    }
    return { pid: pid as number, key }
  } finally {
    release()
  }
}

function waitForReady(child: ChildProcessHandle, stderrTail: () => string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false
    const finish = (outcome: { key: string } | { error: Error }): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('error', onError)
      child.off('exit', onExit)
      if ('key' in outcome) {
        resolve(outcome.key)
        return
      }
      const tail = stderrTail().trim()
      reject(
        tail ? new Error(`${outcome.error.message}\nDriver stderr (tail):\n${tail}`) : outcome.error
      )
    }
    const onMessage = (message: unknown): void => {
      const parsed = message as DriverMessage
      if (parsed?.type === 'ready' && typeof (parsed as { key?: unknown }).key === 'string') {
        finish({ key: (parsed as { key: string }).key })
      } else if (parsed?.type === 'failed') {
        finish({ error: new Error((parsed as { reason?: string }).reason ?? 'driver failed') })
      }
    }
    const onError = (error: Error): void => finish({ error })
    const onExit = (code: number | null): void =>
      finish({ error: new Error(`The goal driver exited during startup with code ${code}`) })
    const timer = setTimeout(
      () => finish({ error: new Error('The goal driver did not report ready in time.') }),
      READY_TIMEOUT_MS
    )
    child.on('message', onMessage)
    child.on('error', onError)
    child.on('exit', onExit)
  })
}
