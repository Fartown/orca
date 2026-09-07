import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type {
  GoalCreateParams,
  GoalDriverVerdict,
  GoalSpec
} from '../../shared/goals/goal-control-contract'
import { legacyGoalRecordPath } from '../../shared/goals/goal-store-layout'
import { goalWorkspaceKey } from '../../shared/goals/goal-workspace-key'
import type { RuntimeTerminalShow } from '../../shared/runtime-terminal-contracts'
import { GoalControlService } from './goal-control-service'
import type { GoalDriverLaunchRequest } from './goal-driver-launch'
import { GoalStore } from './goal-store'

const FP = 'a'.repeat(64)
const WORKTREE = '/tmp/goal-revision-test-worktree'
const TERMINAL = 'term_bound'
const GOAL_ID = '00000000-0000-4000-8000-000000000001'
const RUN_ID = '00000000-0000-4000-8000-000000000002'

let goalHome: string
let ids: string[]
let launches: GoalDriverLaunchRequest[]
let driverVerdict: GoalDriverVerdict
let terminal: Partial<RuntimeTerminalShow> | Error
let hookRows: AgentStatusIpcPayload[]
let clock: number

beforeEach(async () => {
  goalHome = await mkdtemp(join(tmpdir(), 'goal-revision-'))
  ids = [GOAL_ID, RUN_ID, '00000000-0000-4000-8000-000000000003']
  launches = []
  driverVerdict = { status: 'live' }
  terminal = {
    handle: TERMINAL,
    ptyId: 'pty-1',
    incarnationId: 'inc-1',
    worktreeId: 'wt-1',
    worktreePath: WORKTREE,
    tabId: 'tab',
    leafId: 'leaf',
    connected: true,
    writable: true
  }
  hookRows = []
  clock = 1_000
})

afterEach(async () => {
  await rm(goalHome, { recursive: true, force: true })
})

function service(): GoalControlService {
  return new GoalControlService({
    store: new GoalStore(goalHome),
    terminals: {
      showTerminal: async (handle) => {
        if (terminal instanceof Error) {
          throw terminal
        }
        return { ...terminal, handle } as RuntimeTerminalShow
      }
    },
    hooks: { getStatusSnapshotForPane: () => hookRows },
    launcher: {
      entryPath: '/bundle/goal-driver.js',
      launch: async (request) => {
        launches.push(request)
        return { pid: 4242, key: goalWorkspaceKey(WORKTREE) }
      }
    },
    userDataPath: '/tmp/user-data',
    // Why: a null pid is never a running driver; only the goal's own run reads the scripted verdict.
    inspectDriver: async ({ pid }) => (pid === null ? { status: 'exited' } : driverVerdict),
    now: () => clock++,
    newId: () => ids.shift() ?? 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  })
}

const spec: GoalSpec = {
  objective: 'Make the tests pass',
  criteria: [
    { id: '22222222-2222-4222-8222-222222222222', description: 'unit tests', command: 'pnpm test' }
  ],
  acceptanceText: '',
  extraChecks: [],
  checkAll: false,
  onBlocked: 'ask'
}

function createParams(): GoalCreateParams {
  return {
    authorityExecutionHostId: 'local',
    clientOperationId: 'op-create',
    payloadFingerprint: FP,
    binding: { worktree: WORKTREE, terminal: TERMINAL, expectedIncarnationId: 'inc-1' },
    spec,
    budget: { maxTurns: 5, maxMinutes: 30, checkTimeoutSeconds: 60 },
    acknowledgeUnverifiedCompletion: true
  }
}

function envelope(clientOperationId: string, expectedRuntimeFence: number) {
  return {
    authorityExecutionHostId: 'local' as const,
    clientOperationId,
    payloadFingerprint: FP,
    goalId: GOAL_ID,
    expectedRuntimeFence,
    expectedRunId: RUN_ID
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
      runId: RUN_ID,
      objective: 'x',
      worktreePath: WORKTREE,
      terminalHandle: TERMINAL,
      state: 'active',
      turns: 2,
      activeMs: 1000,
      startedAt: 1,
      updatedAt: 2,
      ...record
    })
  )
}

describe('stop', () => {
  it('hands the stop to a live driver and settles an unconfirmed interrupt from its absence', async () => {
    const svc = service()
    await svc.create(createParams())
    const stop = await svc.control({ ...envelope('op-stop', 0), action: 'stop' })
    expect(stop).toMatchObject({ status: 'accepted', code: 'ok', runtimeFence: 1 })
    expect(await new GoalStore(goalHome).readControl(GOAL_ID)).toMatchObject({
      action: 'stop',
      continuation: 'paused'
    })

    // The driver acknowledged (applying) and then died before the turn ended.
    const store = new GoalStore(goalHome)
    const receipt = await store.readReceipt('op-stop')
    await store.writeReceipt({ ...receipt!, status: 'applying' })
    driverVerdict = { status: 'exited' }
    expect(await svc.operation('op-stop')).toMatchObject({
      status: 'applied',
      code: 'confirmation_pending',
      turnStopped: false,
      continuationPaused: true
    })
  })

  it('marks the v1 record stopped itself when no driver is running', async () => {
    const svc = service()
    await svc.create(createParams())
    await writeLegacy({})
    driverVerdict = { status: 'exited' }
    const stop = await svc.control({ ...envelope('op-stop', 0), action: 'stop' })
    expect(stop).toMatchObject({ status: 'applied', code: 'ok', continuationPaused: true })
    const legacy = JSON.parse(
      await readFile(legacyGoalRecordPath(goalHome, goalWorkspaceKey(WORKTREE)), 'utf8')
    )
    expect(legacy).toMatchObject({ state: 'aborted', finishReason: 'Stopped from Orca' })
  })
})

describe('amend', () => {
  it('refuses while continuation is enabled or the turn still runs', async () => {
    const svc = service()
    await svc.create(createParams())
    expect(
      await svc.amend({
        ...envelope('op-a1', 0),
        budget: { maxTurns: 9, maxMinutes: 9, checkTimeoutSeconds: 9 },
        resumeAfterSave: false
      })
    ).toMatchObject({ status: 'rejected', code: 'conflict' })

    await svc.control({ ...envelope('op-pause', 0), action: 'pause' })
    hookRows = [
      {
        paneKey: 'tab:leaf',
        connectionId: null,
        receivedAt: 5,
        stateStartedAt: 5,
        state: 'working',
        prompt: '',
        updatedAt: 5
      } as AgentStatusIpcPayload
    ]
    expect(
      await svc.amend({
        ...envelope('op-a2', 1),
        budget: { maxTurns: 9, maxMinutes: 9, checkTimeoutSeconds: 9 },
        resumeAfterSave: false
      })
    ).toMatchObject({ status: 'rejected', code: 'conflict' })
  })

  it('bumps the revision only for a spec change and asks a live driver to reload', async () => {
    const svc = service()
    await svc.create(createParams())
    await svc.control({ ...envelope('op-pause', 0), action: 'pause' })
    hookRows = [
      {
        paneKey: 'tab:leaf',
        connectionId: null,
        receivedAt: 5,
        stateStartedAt: 5,
        state: 'done',
        prompt: '',
        updatedAt: 5
      } as AgentStatusIpcPayload
    ]
    const budgetOnly = await svc.amend({
      ...envelope('op-a1', 1),
      budget: { maxTurns: 9, maxMinutes: 9, checkTimeoutSeconds: 9 },
      resumeAfterSave: false
    })
    expect(budgetOnly).toMatchObject({ status: 'accepted', runtimeFence: 2 })
    let detail = await svc.get(GOAL_ID)
    expect(detail).toMatchObject({ specRevision: 1, budget: { maxTurns: 9 } })

    const specChange = await svc.amend({
      ...envelope('op-a2', 2),
      spec: { ...spec, objective: 'Ship it' },
      resumeAfterSave: false
    })
    expect(specChange).toMatchObject({ status: 'accepted', runtimeFence: 3 })
    detail = await svc.get(GOAL_ID)
    expect(detail?.specRevision).toBe(2)
    expect(
      (await svc.versions(GOAL_ID)).items.map((v) => [v.specRevision, v.spec.objective])
    ).toEqual([
      [1, 'Make the tests pass'],
      [2, 'Ship it']
    ])
    expect(await new GoalStore(goalHome).readControl(GOAL_ID)).toMatchObject({ action: 'reload' })
  })

  it('marks old acceptance evidence stale after a spec change', async () => {
    const svc = service()
    await svc.create(createParams())
    await writeLegacy({
      specRevision: 1,
      lastAcceptance: {
        tree: 't',
        result: { passed: true, results: [{ command: 'pnpm test', ok: true }] }
      }
    })
    driverVerdict = { status: 'exited' }
    await svc.amend({
      ...envelope('op-a', 0),
      spec: { ...spec, objective: 'Changed' },
      resumeAfterSave: false
    })
    const detail = await svc.get(GOAL_ID)
    expect(detail?.evidence[0]).toMatchObject({ status: 'stale', specRevision: 1 })
  })

  it('relaunches on save-and-resume when the driver is gone, even past an exhausted budget it just raised', async () => {
    const svc = service()
    await svc.create(createParams())
    await writeLegacy({ state: 'budget_exhausted', turns: 5, finishReason: 'out of turns' })
    driverVerdict = { status: 'exited' }
    const saved = await svc.amend({
      ...envelope('op-a', 0),
      budget: { maxTurns: 20, maxMinutes: 30, checkTimeoutSeconds: 60 },
      resumeAfterSave: true
    })
    expect(saved).toMatchObject({ status: 'applied', code: 'ok', continuationPaused: false })
    expect(launches.map((l) => l.mode)).toEqual(['start', 'resume'])
  })
})

describe('rebind and archive', () => {
  it('moves a quiescent goal to another session of the same workspace', async () => {
    const svc = service()
    await svc.create(createParams())
    await writeLegacy({})
    driverVerdict = { status: 'exited' }
    const moved = await svc.rebind({
      ...envelope('op-r', 0),
      binding: { worktree: WORKTREE, terminal: 'term_other', expectedIncarnationId: 'inc-1' }
    })
    expect(moved).toMatchObject({ status: 'applied', code: 'ok' })
    expect((await svc.get(GOAL_ID))?.binding.terminal).toBe('term_other')
    const legacy = JSON.parse(
      await readFile(legacyGoalRecordPath(goalHome, goalWorkspaceKey(WORKTREE)), 'utf8')
    )
    expect(legacy.terminalHandle).toBe('term_other')
  })

  it('refuses a session from another workspace', async () => {
    const svc = service()
    await svc.create(createParams())
    driverVerdict = { status: 'exited' }
    terminal = {
      ...(terminal as Partial<RuntimeTerminalShow>),
      worktreePath: '/elsewhere',
      worktreeId: 'wt-2'
    }
    const moved = await svc.rebind({
      ...envelope('op-r', 0),
      binding: { worktree: WORKTREE, terminal: 'term_other', expectedIncarnationId: 'inc-1' }
    })
    expect(moved).toMatchObject({ status: 'rejected', code: 'target_changed' })
  })

  it('archives only once the driver is gone and keeps the goal readable', async () => {
    const svc = service()
    await svc.create(createParams())
    expect(await svc.archive({ ...envelope('op-x', 0), archived: true })).toMatchObject({
      status: 'rejected',
      code: 'conflict'
    })
    driverVerdict = { status: 'exited' }
    expect(await svc.archive({ ...envelope('op-y', 0), archived: true })).toMatchObject({
      status: 'applied'
    })
    const history = await svc.list({ authorityExecutionHostId: 'local', filter: 'history' })
    expect(history.items.map((i) => i.archived)).toEqual([true])
  })
})
