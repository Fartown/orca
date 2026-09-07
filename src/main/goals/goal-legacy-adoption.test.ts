import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GoalDriverVerdict } from '../../shared/goals/goal-control-contract'
import { legacyGoalRecordPath } from '../../shared/goals/goal-store-layout'
import type { RuntimeTerminalShow } from '../../shared/runtime-terminal-contracts'
import { GoalControlService } from './goal-control-service'
import { GoalStore } from './goal-store'

const WORKTREE = '/tmp/goal-legacy-test-worktree'
const KEY = 'goal-legacy-test-worktree-abcdef0123'
const FP = 'b'.repeat(64)

let goalHome: string
let driverVerdict: GoalDriverVerdict
let terminalOpen: boolean

beforeEach(async () => {
  goalHome = await mkdtemp(join(tmpdir(), 'goal-legacy-'))
  driverVerdict = { status: 'exited' }
  terminalOpen = true
  await mkdir(join(goalHome, 'goals'), { recursive: true })
  await writeFile(
    legacyGoalRecordPath(goalHome, KEY),
    JSON.stringify({
      key: KEY,
      objective: 'Old CLI goal',
      worktreePath: WORKTREE,
      terminalHandle: 'term_old',
      acceptance: { commands: ['pnpm test'], timeoutMs: 60_000, cwd: WORKTREE, all: true },
      budget: { maxTurns: 7, maxMinutes: 45 },
      onBlocked: 'verify',
      state: 'aborted',
      finishReason: '人为停止',
      turns: 4,
      activeMs: 90_000,
      startedAt: 1,
      updatedAt: 2
    })
  )
})

afterEach(async () => {
  await rm(goalHome, { recursive: true, force: true })
})

function service(): GoalControlService {
  return new GoalControlService({
    store: new GoalStore(goalHome),
    terminals: {
      showTerminal: async (handle) => {
        if (!terminalOpen) {
          throw new Error('terminal_handle_stale')
        }
        return {
          handle,
          ptyId: 'pty',
          incarnationId: 'inc-9',
          worktreeId: 'wt-9',
          worktreePath: WORKTREE,
          connected: true,
          writable: true
        } as RuntimeTerminalShow
      }
    },
    hooks: { getStatusSnapshotForPane: () => [] },
    launcher: { entryPath: '/bundle/goal-driver.js', launch: async () => ({ pid: 1, key: KEY }) },
    userDataPath: '/tmp/user-data',
    inspectDriver: async ({ pid }) => (pid === null ? { status: 'exited' } : driverVerdict),
    now: () => 5_000,
    newId: () => '00000000-0000-4000-8000-00000000aaaa'
  })
}

describe('legacy CLI goals', () => {
  it('lists an unadopted v1 record read-only with its CLI state', async () => {
    const list = await service().list({ authorityExecutionHostId: 'local', filter: 'all' })
    expect(list.items).toHaveLength(1)
    expect(list.items[0]).toMatchObject({
      goalId: `legacy:${KEY}`,
      legacy: { key: KEY },
      phase: 'interrupted',
      turns: 4,
      stopSupport: 'unsupported'
    })
  })

  it('adopts it into a paused managed goal and stamps the v1 record', async () => {
    const svc = service()
    const adopted = await svc.adoptLegacy({
      authorityExecutionHostId: 'local',
      clientOperationId: 'op-adopt',
      payloadFingerprint: FP,
      legacyKey: KEY
    })
    expect(adopted).toMatchObject({ status: 'applied', code: 'ok', continuationPaused: true })
    const goalId = adopted.goalId as string
    const detail = await svc.get(goalId)
    expect(detail).toMatchObject({
      continuation: 'paused',
      spec: {
        objective: 'Old CLI goal',
        extraChecks: ['pnpm test'],
        checkAll: true,
        onBlocked: 'verify'
      },
      budget: { maxTurns: 7, maxMinutes: 45, checkTimeoutSeconds: 60 },
      binding: { terminal: 'term_old', expectedIncarnationId: 'inc-9' },
      turns: 4
    })
    const v1 = JSON.parse(await readFile(legacyGoalRecordPath(goalHome, KEY), 'utf8'))
    expect(v1.goalId).toBe(goalId)
    // Adopted records no longer show up as legacy rows.
    const list = await svc.list({ authorityExecutionHostId: 'local', filter: 'all' })
    expect(list.items.map((item) => item.goalId)).toEqual([goalId])
    expect(
      await svc.adoptLegacy({
        authorityExecutionHostId: 'local',
        clientOperationId: 'op-adopt',
        payloadFingerprint: FP,
        legacyKey: KEY
      })
    ).toEqual(adopted)
  })

  it('refuses an import the managed record schema cannot hold, leaving the v1 record untouched', async () => {
    await writeFile(
      legacyGoalRecordPath(goalHome, KEY),
      JSON.stringify({
        key: KEY,
        objective: 'Too many checks',
        worktreePath: WORKTREE,
        terminalHandle: 'term_old',
        acceptance: {
          commands: Array.from({ length: 25 }, (_, index) => `check-${index}`),
          timeoutMs: 1_000,
          cwd: WORKTREE,
          all: true
        },
        state: 'aborted',
        turns: 1,
        startedAt: 1,
        updatedAt: 2
      })
    )
    const svc = service()
    expect(
      await svc.adoptLegacy({
        authorityExecutionHostId: 'local',
        clientOperationId: 'op-bad',
        payloadFingerprint: FP,
        legacyKey: KEY
      })
    ).toMatchObject({ status: 'rejected', code: 'unsupported' })
    const v1 = JSON.parse(await readFile(legacyGoalRecordPath(goalHome, KEY), 'utf8'))
    expect(v1.goalId).toBeUndefined()
    const list = await svc.list({ authorityExecutionHostId: 'local', filter: 'all' })
    expect(list.items.map((item) => item.goalId)).toEqual([`legacy:${KEY}`])
  })

  it('refuses while the CLI driver still runs or the terminal is gone', async () => {
    driverVerdict = { status: 'live' }
    await mkdir(join(goalHome, 'lock'), { recursive: true })
    await writeFile(join(goalHome, 'lock', `${KEY}.lock`), JSON.stringify({ pid: 4321 }))
    expect(
      await service().adoptLegacy({
        authorityExecutionHostId: 'local',
        clientOperationId: 'op-1',
        payloadFingerprint: FP,
        legacyKey: KEY
      })
    ).toMatchObject({ status: 'rejected', code: 'conflict' })
    await rm(join(goalHome, 'lock'), { recursive: true, force: true })
    terminalOpen = false
    expect(
      await service().adoptLegacy({
        authorityExecutionHostId: 'local',
        clientOperationId: 'op-2',
        payloadFingerprint: FP,
        legacyKey: KEY
      })
    ).toMatchObject({ status: 'rejected', code: 'target_changed' })
  })
})
