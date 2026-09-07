import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  goalRecordPath,
  legacyDriverLogPath,
  legacyGoalRecordPath,
  legacyLockPath
} from '../../shared/goals/goal-store-layout'
import type { GoalRecord } from '../../shared/goals/goal-store-records'
import { goalWorkspaceKey } from '../../shared/goals/goal-workspace-key'
import { createGoalDriverLauncher, resolveGoalDriverEntry } from './goal-driver-launch'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const BUNDLE = resolveGoalDriverEntry({ env: {}, resourcesPath: undefined, appPath: REPO_ROOT })

let goalHome: string | null = null
let driverPid: number | null = null

afterEach(async () => {
  if (driverPid !== null) {
    try {
      process.kill(driverPid, 'SIGKILL')
    } catch {
      // already gone
    }
    driverPid = null
  }
  if (goalHome) {
    await rm(goalHome, { recursive: true, force: true })
    goalHome = null
  }
})

describe('resolveGoalDriverEntry', () => {
  it('prefers the env override, then resources, then the dev out directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'goal-entry-'))
    try {
      await mkdir(join(dir, 'override'), { recursive: true })
      await writeFile(join(dir, 'override', 'goal-driver.js'), '')
      expect(
        resolveGoalDriverEntry({
          env: { ORCA_GOAL_DRIVER_PATH: join(dir, 'override') },
          resourcesPath: join(dir, 'resources'),
          appPath: dir
        })
      ).toBe(join(dir, 'override', 'goal-driver.js'))
      expect(resolveGoalDriverEntry({ env: {}, resourcesPath: dir, appPath: dir })).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

// Why: exercises the real bundle end to end (fork, ELECTRON_RUN_AS_NODE under plain
// node, ready handshake, v1 record and lock) without a runtime: the loop only
// contacts the runtime after ready, and the test stops the driver right after.
describe.skipIf(!BUNDLE)('launchGoalDriver with the built bundle', () => {
  it('reports ready with the workspace key and owns the v1 record and lock', async () => {
    goalHome = await mkdtemp(join(tmpdir(), 'goal-launch-'))
    const worktree = await mkdtemp(join(tmpdir(), 'goal-launch-wt-'))
    const goalId = '00000000-0000-4000-8000-00000000abcd'
    const runId = '00000000-0000-4000-8000-00000000ef01'
    const record: GoalRecord = {
      version: 1,
      goalId,
      authorityExecutionHostId: 'local',
      createdAt: 1,
      updatedAt: 1,
      binding: { worktree, terminal: 'term_missing', expectedIncarnationId: 'inc' },
      workspace: { selector: worktree, path: worktree, worktreeId: null },
      spec: {
        objective: 'smoke',
        criteria: [],
        acceptanceText: '',
        extraChecks: [],
        checkAll: false,
        onBlocked: 'ask',
        judge: 'none'
      },
      budget: { maxTurns: 1, maxMinutes: 1, checkTimeoutSeconds: 1 },
      specRevision: 1,
      runtimeFence: 0,
      continuation: 'enabled',
      archived: false,
      legacyKey: null,
      currentRun: null,
      lastOperationId: null
    }
    await mkdir(join(goalHome, 'v2', 'goals', goalId), { recursive: true })
    await writeFile(goalRecordPath(goalHome, goalId), JSON.stringify(record))

    const launcher = createGoalDriverLauncher({ entryPath: BUNDLE, execPath: process.execPath })
    const launched = await launcher.launch({
      goalHome,
      goalId,
      runId,
      mode: 'start',
      userDataPath: join(goalHome, 'no-runtime')
    })
    driverPid = launched.pid
    const key = goalWorkspaceKey(worktree)
    expect(launched.key).toBe(key)
    expect(existsSync(legacyLockPath(goalHome, key))).toBe(true)
    const v1 = JSON.parse(await readFile(legacyGoalRecordPath(goalHome, key), 'utf8'))
    expect(v1).toMatchObject({ goalId, runId, state: 'active', terminalHandle: 'term_missing' })
    expect(await readFile(legacyDriverLogPath(goalHome, key), 'utf8')).toContain('驱动启动 start')
    await rm(worktree, { recursive: true, force: true })
  })
})
