import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GoalCreateParams, GoalDriverVerdict } from '../../shared/goals/goal-control-contract'
import type { GoalRecord } from '../../shared/goals/goal-store-records'
import { legacyGoalRecordPath } from '../../shared/goals/goal-store-layout'
import { goalWorkspaceKey } from '../../shared/goals/goal-workspace-key'
import { GoalControlService } from './goal-control-service'
import { GOAL_RECOVERY_WINDOW_MS, GoalDriverRecovery } from './goal-driver-recovery'
import { GoalStore } from './goal-store'

const FP = 'a'.repeat(64)
const WORKTREE = '/tmp/goal-recovery-test-worktree'
const TERMINAL = 'term_bound'
const GOAL_ID = '00000000-0000-4000-8000-000000000001'

let goalHome: string
let launches: number
let driverVerdict: GoalDriverVerdict
let clock: number
let nextId: number

beforeEach(async () => {
  goalHome = await mkdtemp(join(tmpdir(), 'goal-recovery-'))
  launches = 0
  driverVerdict = { status: 'exited' }
  clock = 1_000_000
  nextId = 1
})

afterEach(async () => {
  await rm(goalHome, { recursive: true, force: true })
})

function service(): GoalControlService {
  return new GoalControlService({
    store: new GoalStore(goalHome),
    terminals: {
      showTerminal: async () => ({
        handle: TERMINAL,
        ptyId: 'pty-1',
        incarnationId: 'inc-1',
        worktreeId: 'wt-1',
        worktreePath: WORKTREE,
        tabId: 'tab',
        leafId: 'leaf',
        connected: true,
        writable: true
      })
    },
    hooks: { getStatusSnapshotForPane: () => [] },
    launcher: {
      entryPath: '/bundle/goal-driver.js',
      launch: async () => {
        launches += 1
        return { pid: 4242, key: goalWorkspaceKey(WORKTREE) }
      }
    },
    userDataPath: '/tmp/user-data',
    inspectDriver: async () => driverVerdict,
    now: () => clock,
    newId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`
  })
}

function createParams(judge: 'none' | 'codex' = 'codex'): GoalCreateParams {
  return {
    authorityExecutionHostId: 'local',
    clientOperationId: 'op-create',
    payloadFingerprint: FP,
    binding: { worktree: WORKTREE, terminal: TERMINAL, expectedIncarnationId: 'inc-1' },
    spec: {
      objective: 'Ship it',
      criteria: [],
      acceptanceText: '',
      extraChecks: [],
      checkAll: false,
      onBlocked: 'ask',
      judge
    },
    budget: { maxTurns: 5, maxMinutes: 30, checkTimeoutSeconds: 60 },
    acknowledgeUnverifiedCompletion: false
  }
}

async function writeLegacy(record: Record<string, unknown>): Promise<void> {
  const key = goalWorkspaceKey(WORKTREE)
  await mkdir(join(goalHome, 'goals'), { recursive: true })
  await writeFile(
    legacyGoalRecordPath(goalHome, key),
    JSON.stringify({
      key,
      goalId: GOAL_ID,
      objective: 'Ship it',
      worktreePath: WORKTREE,
      terminalHandle: TERMINAL,
      state: 'active',
      turns: 3,
      activeMs: 120_000,
      startedAt: 1,
      updatedAt: 2,
      ...record
    })
  )
}

async function startedGoal(svc: GoalControlService): Promise<GoalRecord> {
  await svc.create(createParams())
  await writeLegacy({})
  const record = await new GoalStore(goalHome).readRecord(GOAL_ID)
  return record!
}

describe('every run is driven by its guard', () => {
  it('refuses to create a goal without a guard and launches nothing', async () => {
    const result = await service().create(createParams('none'))
    expect(result).toMatchObject({ status: 'rejected', code: 'unsupported' })
    expect(launches).toBe(0)
  })

  it('refuses to resume an old guardless goal and to save a spec that drops the guard', async () => {
    const svc = service()
    const record = await startedGoal(svc)
    const store = new GoalStore(goalHome)
    await store.writeRecord({ ...record, spec: { ...record.spec, judge: 'none' } })
    const resume = await svc.control({
      authorityExecutionHostId: 'local',
      clientOperationId: 'op-resume',
      payloadFingerprint: FP,
      goalId: GOAL_ID,
      expectedRuntimeFence: record.runtimeFence,
      expectedRunId: record.currentRun!.runId,
      action: 'resume'
    })
    expect(resume).toMatchObject({ status: 'rejected', code: 'unsupported' })
    await store.writeRecord(record)
    const amend = await svc.amend({
      authorityExecutionHostId: 'local',
      clientOperationId: 'op-amend',
      payloadFingerprint: FP,
      goalId: GOAL_ID,
      expectedRuntimeFence: record.runtimeFence,
      expectedRunId: record.currentRun!.runId,
      spec: { ...record.spec, judge: 'none' },
      resumeAfterSave: false
    })
    expect(amend).toMatchObject({ status: 'rejected', code: 'unsupported' })
    expect(launches).toBe(1)
  })
})

describe('GoalDriverRecovery', () => {
  it('re-attaches a goal whose driver exited and records where the run came from', async () => {
    const svc = service()
    const record = await startedGoal(svc)
    expect(await svc.recovery.recover(record)).toBe('relaunched')
    expect(launches).toBe(2)
    const next = await new GoalStore(goalHome).readRecord(GOAL_ID)
    expect(next!.lastOperationId).toMatch(/^recovery-/)
    expect((await new GoalStore(goalHome).readRecovery(GOAL_ID)).relaunches).toEqual([clock])
  })

  it('leaves live, unverifiable, paused, finished and guardless goals alone', async () => {
    const svc = service()
    const record = await startedGoal(svc)
    for (const verdict of [
      { status: 'live' },
      { status: 'unverifiable', reason: 'ps failed' }
    ] as const) {
      driverVerdict = verdict
      expect(await svc.recovery.recover(record)).toBe('skipped')
    }
    driverVerdict = { status: 'exited' }
    expect(await svc.recovery.recover({ ...record, continuation: 'paused' })).toBe('skipped')
    expect(await svc.recovery.recover({ ...record, archived: true })).toBe('skipped')
    expect(await svc.recovery.recover({ ...record, spec: { ...record.spec, judge: 'none' } })).toBe(
      'skipped'
    )
    await writeLegacy({ state: 'complete' })
    expect(await svc.recovery.recover(record)).toBe('skipped')
    expect(launches).toBe(1)
  })

  it('stops after three relaunches an hour, tells the user once, and clears it when live again', async () => {
    const svc = service()
    const record = await startedGoal(svc)
    for (let i = 0; i < 3; i += 1) {
      clock += 60_000
      expect(await svc.recovery.recover(record)).toBe('relaunched')
    }
    clock += 60_000
    expect(await svc.recovery.recover(record)).toBe('limited')
    expect(await svc.recovery.recover(record)).toBe('limited')
    const store = new GoalStore(goalHome)
    const limited = await store.readRecovery(GOAL_ID)
    expect(limited.notices).toHaveLength(1)
    expect(limited.notices[0]).toMatchObject({ kind: 'driver-relaunch-limit', resolvedAt: null })

    const [summary] = (await svc.list({ authorityExecutionHostId: 'local', filter: 'all' })).items
    expect(summary.notices?.map((notice) => notice.kind)).toEqual(['driver-relaunch-limit'])

    driverVerdict = { status: 'live' }
    await svc.recovery.recover(record)
    expect((await store.readRecovery(GOAL_ID)).notices[0].resolvedAt).toBe(clock)

    driverVerdict = { status: 'exited' }
    clock += GOAL_RECOVERY_WINDOW_MS
    expect(await svc.recovery.recover(record)).toBe('relaunched')
    expect(launches).toBe(5)
  })

  it('skips a whole pass while no host context can resolve terminals', async () => {
    const store = new GoalStore(goalHome)
    const svc = service()
    const record = await startedGoal(svc)
    let relaunched = 0
    const recovery = new GoalDriverRecovery({
      store,
      inspectRecordDriver: async () => ({ status: 'exited' }),
      relaunch: async () => {
        relaunched += 1
        return {
          clientOperationId: 'x',
          goalId: record.goalId,
          status: 'applied',
          code: 'ok',
          message: '',
          runtimeFence: 1,
          runId: null,
          continuationPaused: false,
          turnStopped: null,
          acceptanceStopped: null
        }
      },
      now: () => clock,
      withHostContext: async () => false
    })
    await recovery.scan()
    expect(relaunched).toBe(0)
  })
})

describe('guard facts on the summary', () => {
  it('shows the guard time, its latest observation, and only fresh unresolved notices', async () => {
    const svc = service()
    await startedGoal(svc)
    driverVerdict = { status: 'live' }
    const fresh = { id: 'question:1', kind: 'question', text: '需要验证码', at: clock - 1_000 }
    await writeLegacy({
      guardMs: 90_000,
      guardObservation: '在跑 e2e',
      notices: [
        { ...fresh, resolvedAt: null },
        {
          id: 'budget:0',
          kind: 'budget',
          text: '旧的',
          at: clock - 25 * 60 * 60_000,
          resolvedAt: null
        },
        {
          id: 'question:0',
          kind: 'question',
          text: '答过了',
          at: clock - 5_000,
          resolvedAt: clock - 2_000
        }
      ]
    })
    const [summary] = (await svc.list({ authorityExecutionHostId: 'local', filter: 'all' })).items
    expect(summary.guardMs).toBe(90_000)
    expect(summary.reason).toBe('在跑 e2e')
    expect(summary.notices).toEqual([fresh])
  })
})
