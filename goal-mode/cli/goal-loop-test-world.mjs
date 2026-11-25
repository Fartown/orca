// goal-loop 测试共用的替身世界:假的执行 agent、终端、守卫与目标记录。
//
// 需要 `node --test --experimental-test-module-mocks`。
import { after, mock } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const HOME = await mkdtemp(path.join(tmpdir(), 'goal-loop-'))
process.env.ORCA_GOAL_HOME = HOME
process.env.ORCA_GOAL_POLL_MS = '5'
process.env.ORCA_GOAL_STOP_GRACE_MS = '100'
process.env.ORCA_GOAL_GUARD_RETRY_MS = '10,10'
after(() => rm(HOME, { recursive: true, force: true }))

const { describeActivity } = await import('./terminal-activity.mjs')

/** 一个假的执行 agent:收到消息就干 turnMs 毫秒,然后状态存储报 done。 */
export function makeWorld(over = {}) {
  const w = {
    row: { state: 'done', stateStartedAt: 1, prompt: '', workingMode: null },
    draft: '',
    screen: null,
    keys: [],
    sent: [],
    interrupts: [],
    turnMs: 15,
    onSend: null,
    ...over
  }
  w.runTurn = (text) => {
    w.row = { ...w.row, state: 'working', stateStartedAt: Date.now() + 1, prompt: text }
    setTimeout(() => {
      w.row = { ...w.row, state: 'done', stateStartedAt: Date.now() + 1 }
    }, w.turnMs)
  }
  w.end = () => {
    w.row = { ...w.row, state: 'done', stateStartedAt: Date.now() + 1 }
  }
  return w
}

export async function loadLoop(w, { checks, env = {} } = {}) {
  mock.reset()
  for (const [name, value] of Object.entries(env)) {
    process.env[name] = value
  }
  mock.module('./orca-terminal.mjs', {
    namedExports: {
      sendText: async (_handle, text) => {
        w.sent.push(text)
        ;(w.onSend ?? w.runTurn)(text)
      },
      sendInterrupt: async (handle) => {
        w.interrupts.push(handle)
        w.onInterrupt?.()
      },
      readTerminal: async () => ({ draft: w.draft }),
      readScreen: async () => (w.screen ? { lines: w.screen } : null),
      sendKeys: async (_handle, keys) => {
        w.keys.push(keys)
        w.onKeys?.(keys)
      }
    }
  })
  mock.module('./terminal-activity.mjs', {
    namedExports: {
      observeAgent: async () => ({ connected: true, row: w.row, silentMs: null, spinning: false }),
      describeActivity
    }
  })
  mock.module('./git-snapshot.mjs', {
    namedExports: {
      snapshotWorktree: async () => ({ kind: 'git', tree: 't', head: 'h' }),
      diffTrees: async () => ({ source: [], test: [] })
    }
  })
  if (checks) {
    mock.module('./acceptance-gate.mjs', {
      namedExports: {
        runAcceptance: async () => checks.shift(),
        describeFailures: (result) => ({
          list: '- `pnpm test` 退出码 1',
          output: result.results.map((r) => r.output ?? '').join('\n')
        })
      }
    })
  }
  const loop = await import(`./goal-loop.mjs?t=${Math.random()}`)
  for (const name of Object.keys(env)) {
    delete process.env[name]
  }
  return loop
}

/** 守卫替身:按顺序给出结论;给函数时由它决定(可以断言输入、改动现场)。 */
export function scriptedGuard(steps) {
  const calls = []
  const guard = async (input) => {
    calls.push(input)
    const step = steps.shift() ?? { decision: 'done', observation: '收尾' }
    const value = typeof step === 'function' ? await step(input, calls.length) : step
    if (value?.ok === false) {
      return { prompt: 'p', attempts: [], ...value }
    }
    return {
      ok: true,
      prompt: 'p',
      attempts: [],
      verdict: {
        decision: 'wait',
        observation: '看到的',
        instruction: '',
        question: '',
        note: '笔记',
        ...value
      }
    }
  }
  guard.calls = calls
  return guard
}

let seq = 0
export const goal = (over = {}) => ({
  key: `k-${++seq}`,
  objective: '做完 X',
  worktreePath: '/tmp/wt',
  terminalHandle: 'term_1',
  acceptance: { commands: [], timeoutMs: 1000, cwd: '/tmp/wt' },
  budget: { maxTurns: 0, maxMinutes: 0 },
  guard: { agent: 'codex', timeoutMs: 1000, logDir: null },
  checklistPath: '/tmp/checklist.md',
  specRevision: 1,
  state: 'active',
  turns: 0,
  activeMs: 0,
  startedAt: Date.now(),
  updatedAt: Date.now(),
  lastSnapshot: null,
  ...over
})

export const report = new Proxy({}, { get: () => () => {} })

export function control({ checkpoint = () => 'run', takeReload = () => null } = {}) {
  const confirmations = []
  return {
    confirmations,
    checkpoint: async (phase) => checkpoint(phase),
    takeReload,
    confirmReload: async () => {},
    confirmStop: async (confirmation) => {
      confirmations.push(confirmation)
    }
  }
}

export const done = { decision: 'done', observation: '全部核实通过' }
export const instruct = (instruction, over = {}) => ({ decision: 'instruct', instruction, ...over })
