import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type {
  GoalControlParams,
  GoalCreateParams,
  GoalDriverVerdict
} from '../../shared/goals/goal-control-contract'
import { legacyGoalRecordPath, legacyLockPath } from '../../shared/goals/goal-store-layout'
import { goalWorkspaceKey } from '../../shared/goals/goal-workspace-key'
import type { RuntimeTerminalShow } from '../../shared/runtime-terminal-contracts'
import { GoalControlService } from './goal-control-service'
import type { GoalDriverLaunchRequest } from './goal-driver-launch'
import { GoalStore } from './goal-store'

const FP = 'a'.repeat(64)
const WORKTREE = '/tmp/goal-service-test-worktree'
const TERMINAL = 'term_bound'

let goalHome: string
let ids: string[]
let launches: GoalDriverLaunchRequest[]
let launchOutcome: 'ready' | 'fail'
let driverVerdict: GoalDriverVerdict
let terminal: Partial<RuntimeTerminalShow> | Error
let hookRows: AgentStatusIpcPayload[]
let clock: number

beforeEach(async () => {
  goalHome = await mkdtemp(join(tmpdir(), 'goal-home-'))
  // goal id, first run id, relaunch run id
  ids = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003'
  ]
  launches = []
  launchOutcome = 'ready'
  driverVerdict = { status: 'exited' }
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
      showTerminal: async () => {
        if (terminal instanceof Error) {
          throw terminal
        }
        return terminal as RuntimeTerminalShow
      }
    },
    hooks: { getStatusSnapshotForPane: () => hookRows },
    launcher: {
      entryPath: '/bundle/goal-driver.js',
      launch: async (request) => {
        launches.push(request)
        if (launchOutcome === 'fail') {
          throw new Error('spawn failed')
        }
        return { pid: 4242, key: goalWorkspaceKey(WORKTREE) }
      }
    },
    userDataPath: '/tmp/user-data',
    inspectDriver: async () => driverVerdict,
    now: () => clock++,
    newId: () => ids.shift() ?? 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  })
}

function createParams(overrides: Partial<GoalCreateParams> = {}): GoalCreateParams {
  return {
    authorityExecutionHostId: 'local',
    clientOperationId: 'op-create',
    payloadFingerprint: FP,
    binding: { worktree: WORKTREE, terminal: TERMINAL, expectedIncarnationId: 'inc-1' },
    spec: {
      objective: 'Make the tests pass',
      criteria: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          description: 'unit tests',
          command: 'pnpm test'
        }
      ],
      acceptanceText: '',
      extraChecks: [],
      checkAll: false,
      onBlocked: 'ask'
    },
    budget: { maxTurns: 5, maxMinutes: 30, checkTimeoutSeconds: 60 },
    acknowledgeUnverifiedCompletion: true,
    ...overrides
  }
}

function controlParams(overrides: Partial<GoalControlParams>): GoalControlParams {
  return {
    authorityExecutionHostId: 'local',
    clientOperationId: 'op-control',
    payloadFingerprint: FP,
    goalId: ids[0] ?? '',
    expectedRuntimeFence: 0,
    expectedRunId: null,
    action: 'pause',
    ...overrides
  }
}

async function writeLegacy(record: Record<string, unknown>): Promise<void> {
  const key = goalWorkspaceKey(WORKTREE)
  const file = legacyGoalRecordPath(goalHome, key)
  await mkdir(join(goalHome, 'goals'), { recursive: true })
  await writeFile(
    file,
    JSON.stringify({
      key,
      objective: 'Make the tests pass',
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

describe('GoalControlService.create', () => {
  it('launches a driver, commits the run, and replays the same operation', async () => {
    const svc = service()
    const goalId = ids[0]
    const first = await svc.create(createParams())
    expect(first).toMatchObject({ status: 'applied', code: 'ok', goalId, runtimeFence: 0 })
    expect(launches).toHaveLength(1)
    expect(launches[0]).toMatchObject({
      goalId,
      mode: 'start',
      goalHome,
      userDataPath: '/tmp/user-data'
    })

    const replay = await svc.create(createParams())
    expect(replay).toEqual(first)
    expect(launches).toHaveLength(1)

    const detail = await svc.get(goalId)
    expect(detail).toMatchObject({
      goalId,
      phase: 'starting',
      continuation: 'enabled',
      driver: { status: 'exited' },
      terminal: { status: 'live', ptyIds: ['pty-1'] },
      latestOperation: { clientOperationId: 'op-create', status: 'applied' }
    })
  })

  it('refuses the same operation id with a different payload without touching the receipt', async () => {
    const svc = service()
    await svc.create(createParams())
    const other = await svc.create(createParams({ payloadFingerprint: 'b'.repeat(64) }))
    expect(other).toMatchObject({ status: 'rejected', code: 'conflict' })
    expect(await svc.operation('op-create')).toMatchObject({ status: 'applied', code: 'ok' })
  })

  it('rejects a terminal whose PTY incarnation changed', async () => {
    const svc = service()
    const result = await svc.create(
      createParams({
        binding: { worktree: WORKTREE, terminal: TERMINAL, expectedIncarnationId: 'inc-old' }
      })
    )
    expect(result).toMatchObject({ status: 'rejected', code: 'target_changed' })
    expect(launches).toHaveLength(0)
  })

  it('rejects a workspace another live driver already owns', async () => {
    const svc = service()
    await svc.create(createParams())
    driverVerdict = { status: 'live' }
    const second = await svc.create(createParams({ clientOperationId: 'op-create-2' }))
    expect(second).toMatchObject({ status: 'rejected', code: 'conflict' })
    expect(launches).toHaveLength(1)
  })

  it('rejects a workspace held by a legacy orca-goal lock', async () => {
    await mkdir(join(goalHome, 'lock'), { recursive: true })
    await writeFile(
      legacyLockPath(goalHome, goalWorkspaceKey(WORKTREE)),
      JSON.stringify({ pid: 777 })
    )
    driverVerdict = { status: 'unverifiable', reason: 'cannot read' }
    const result = await service().create(createParams())
    expect(result).toMatchObject({ status: 'rejected', code: 'conflict' })
  })

  it('records a launch failure and leaves no goal behind', async () => {
    launchOutcome = 'fail'
    const svc = service()
    const result = await svc.create(createParams())
    expect(result).toMatchObject({ status: 'rejected', code: 'driver_error', goalId: null })
    expect((await svc.list({ authorityExecutionHostId: 'local', filter: 'all' })).items).toEqual([])
    expect(await svc.operation('op-create')).toMatchObject({ code: 'driver_error' })
  })
})

describe('GoalControlService.control', () => {
  it('hands a pause to a live driver and settles it from the record once the driver is gone', async () => {
    const svc = service()
    const goalId = ids[0]
    const runId = ids[1]
    await svc.create(createParams())
    driverVerdict = { status: 'live' }
    const pause = await svc.control(controlParams({ goalId, expectedRunId: runId }))
    expect(pause).toMatchObject({
      status: 'accepted',
      code: 'ok',
      runtimeFence: 1,
      continuationPaused: null
    })
    expect(await new GoalStore(goalHome).readControl(goalId)).toMatchObject({
      continuation: 'paused',
      runtimeFence: 1,
      clientOperationId: 'op-control'
    })

    driverVerdict = { status: 'exited' }
    expect(await svc.operation('op-control')).toMatchObject({
      status: 'applied',
      continuationPaused: true
    })
  })

  it('applies a pause immediately when no driver is running', async () => {
    const svc = service()
    const goalId = ids[0]
    const runId = ids[1]
    await svc.create(createParams())
    const pause = await svc.control(controlParams({ goalId, expectedRunId: runId }))
    expect(pause).toMatchObject({ status: 'applied', continuationPaused: true, runtimeFence: 1 })
  })

  it('refuses a stale fence or run id', async () => {
    const svc = service()
    const goalId = ids[0]
    await svc.create(createParams())
    expect(
      await svc.control(
        controlParams({ goalId, expectedRunId: null, clientOperationId: 'op-stale' })
      )
    ).toMatchObject({ status: 'rejected', code: 'target_changed' })
    expect(
      await svc.control(
        controlParams({
          goalId,
          expectedRunId: ids[0],
          expectedRuntimeFence: 9,
          clientOperationId: 'op-stale-2'
        })
      )
    ).toMatchObject({ status: 'rejected', code: 'target_changed' })
  })

  it('relaunches the driver on resume when the previous run positively exited', async () => {
    const svc = service()
    const goalId = ids[0]
    const runId = ids[1]
    await svc.create(createParams())
    await writeLegacy({ goalId, runId })
    await svc.control(
      controlParams({ goalId, expectedRunId: runId, clientOperationId: 'op-pause' })
    )
    const resume = await svc.control(
      controlParams({
        goalId,
        expectedRunId: runId,
        expectedRuntimeFence: 1,
        action: 'resume',
        clientOperationId: 'op-resume'
      })
    )
    expect(resume).toMatchObject({
      status: 'applied',
      code: 'ok',
      runtimeFence: 2,
      continuationPaused: false
    })
    expect(launches.map((launch) => launch.mode)).toEqual(['start', 'resume'])
    expect(resume.runId).not.toBe(runId)
  })

  it('refuses to resume while the driver fate is unverifiable or the budget is spent', async () => {
    const svc = service()
    const goalId = ids[0]
    const runId = ids[1]
    await svc.create(createParams())
    driverVerdict = { status: 'unverifiable', reason: 'ps unavailable' }
    expect(
      await svc.control(
        controlParams({
          goalId,
          expectedRunId: runId,
          action: 'resume',
          clientOperationId: 'op-r1'
        })
      )
    ).toMatchObject({ status: 'rejected', code: 'confirmation_pending' })

    driverVerdict = { status: 'exited' }
    await writeLegacy({
      goalId,
      runId,
      state: 'budget_exhausted',
      finishReason: 'out of turns',
      turns: 5
    })
    expect(
      await svc.control(
        controlParams({
          goalId,
          expectedRunId: runId,
          action: 'resume',
          clientOperationId: 'op-r2'
        })
      )
    ).toMatchObject({ status: 'rejected', code: 'budget_exhausted', message: 'out of turns' })
  })
})

describe('GoalControlService.list', () => {
  it('projects the driver record, hook evidence, and filters', async () => {
    const svc = service()
    const goalId = ids[0]
    const runId = ids[1]
    await svc.create(createParams())
    await writeLegacy({
      goalId,
      runId,
      lastAcceptance: {
        tree: 'abc',
        result: { passed: false, results: [{ command: 'pnpm test', ok: false, output: 'boom' }] }
      }
    })
    driverVerdict = { status: 'live' }
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
    const running = await svc.list({ authorityExecutionHostId: 'local', filter: 'running' })
    expect(running.items).toHaveLength(1)
    expect(running.items[0]).toMatchObject({
      goalId,
      phase: 'executing',
      turns: 3,
      activeMs: 120_000,
      agentStatus: 'working',
      turn: 'running',
      driver: { status: 'live' }
    })
    expect(
      (await svc.list({ authorityExecutionHostId: 'local', filter: 'history' })).items
    ).toEqual([])
    expect(
      (await svc.list({ authorityExecutionHostId: 'local', filter: 'all', worktree: '/elsewhere' }))
        .items
    ).toEqual([])

    const detail = await svc.get(goalId)
    expect(detail?.evidence).toEqual([
      expect.objectContaining({
        criterionId: '22222222-2222-4222-8222-222222222222',
        status: 'failed',
        snapshotTree: 'abc',
        source: 'command'
      })
    ])
  })

  it('refuses a second unarchived goal on the same workspace until the first is archived', async () => {
    const svc = service()
    const goalId = ids[0]
    await svc.create(createParams())
    // The driver of the first goal is gone, but its run record still owns the workspace.
    expect(await svc.create(createParams({ clientOperationId: 'op-create-2' }))).toMatchObject({
      status: 'rejected',
      code: 'conflict',
      message: expect.stringContaining('archive it')
    })
    const detail = await svc.get(goalId)
    expect(
      await svc.archive({
        authorityExecutionHostId: 'local',
        clientOperationId: 'op-archive',
        payloadFingerprint: FP,
        goalId,
        expectedRuntimeFence: detail!.runtimeFence,
        expectedRunId: detail!.runId,
        archived: true
      })
    ).toMatchObject({ status: 'applied' })
    expect(await svc.create(createParams({ clientOperationId: 'op-create-3' }))).toMatchObject({
      status: 'applied'
    })
  })

  it('reads an unresolved terminal handle as unverifiable and a driver exit as an interruption', async () => {
    const svc = service()
    const goalId = ids[0]
    await svc.create(createParams())
    await writeLegacy({
      goalId,
      driverError: { kind: 'uncaughtException', message: 'crashed', at: 3 }
    })
    terminal = new Error('terminal_handle_stale')
    const items = (await svc.list({ authorityExecutionHostId: 'local', filter: 'attention' })).items
    expect(items[0]).toMatchObject({
      phase: 'interrupted',
      reason: 'crashed',
      terminal: { status: 'unverifiable' },
      agentStatus: null,
      turn: 'unknown'
    })
  })
})
