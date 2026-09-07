// 宿主要求停止时,循环要:关闸、对在途的一轮发中断、等到本轮结束的证据、把记录标为人为停止。
//
// 需要 `node --test --experimental-test-module-mocks`,和 round-error-recovery 一样真驱动 runLoop。
import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const HOME = await mkdtemp(path.join(tmpdir(), 'goal-loop-stop-'))
process.env.ORCA_GOAL_HOME = HOME
process.env.ORCA_GOAL_POLL_MS = '5'
process.env.ORCA_GOAL_SETTLE_MS = '5'
process.env.ORCA_GOAL_STOP_GRACE_MS = '200'
after(() => rm(HOME, { recursive: true, force: true }))

async function loadLoop({ verdicts, interrupts }) {
  mock.reset()
  mock.module('./orca-terminal.mjs', {
    namedExports: {
      sendText: async () => {},
      sendInterrupt: async (handle) => {
        interrupts.push(handle)
      }
    }
  })
  mock.module('./terminal-activity.mjs', {
    namedExports: {
      observeAgent: async () => ({}),
      classifyRound: () => verdicts()
    }
  })
  mock.module('./git-snapshot.mjs', {
    namedExports: {
      snapshotWorktree: async () => ({ kind: 'git', tree: 't', head: 'h' }),
      diffTrees: async () => ({ source: [], test: [] }),
      diffText: async () => ''
    }
  })
  mock.module('./tamper-scan.mjs', {
    namedExports: { scanRound: async () => [], describeFindings: () => '' }
  })
  mock.module('./goal-claim.mjs', {
    namedExports: {
      readClaim: async () => null,
      clearClaim: async () => {},
      claimPath: () => '/tmp/c'
    }
  })
  mock.module('./continuation-prompt.mjs', {
    namedExports: {
      renderPrompt: async () => '提示词',
      writePromptFile: async () => '/tmp/p',
      promptPointerLine: () => 'x'
    }
  })
  return import(`./goal-loop.mjs?t=${Math.random()}`)
}

const goal = () => ({
  key: 'k-stop',
  objective: 'o',
  worktreePath: '/tmp/wt',
  terminalHandle: 'term_x',
  acceptance: null,
  budget: { maxTurns: 0, maxMinutes: 0 },
  state: 'active',
  turns: 0,
  falseClaims: 0,
  blockedClaims: 0,
  stallCount: 0,
  tamperFindings: [],
  tamperChallenges: 0,
  startedAt: Date.now(),
  updatedAt: Date.now(),
  lastSnapshot: { kind: 'git', tree: 't0', head: 'h0' }
})

const report = new Proxy({}, { get: () => () => {} })

function controlThat(sequence) {
  let calls = 0
  const confirmations = []
  return {
    confirmations,
    control: {
      checkpoint: async () => sequence(++calls),
      takeReload: () => null,
      confirmReload: async () => {},
      confirmStop: async (confirmation) => {
        confirmations.push(confirmation)
      }
    }
  }
}

test('等轮次期间收到停止:发一次中断,本轮结束后标为人为停止并确认 turnStopped', async () => {
  const interrupts = []
  // agent 一直 busy;中断发出后第三次观察才报 finished。
  let observed = 0
  const { runLoop } = await loadLoop({
    interrupts,
    verdicts: () => (interrupts.length > 0 && ++observed >= 3 ? 'finished' : 'busy')
  })
  // 第一个检查点(注入前)放行,之后的检查点都要求停止。
  const { control, confirmations } = controlThat((n) => (n === 1 ? 'run' : 'stop'))
  const final = await runLoop(goal(), { report, thresholds: {}, control })

  assert.equal(interrupts.length, 1, '中断只发一次')
  assert.equal(final.state, 'aborted')
  assert.equal(final.finishReason, '人为停止')
  assert.deepEqual(confirmations, [{ turnStopped: true, acceptanceStopped: null }])
})

test('中断后本轮迟迟不结束:超过宽限就报 turnStopped=false,不冒充停了', async () => {
  const interrupts = []
  const { runLoop } = await loadLoop({ interrupts, verdicts: () => 'busy' })
  const { control, confirmations } = controlThat((n) => (n === 1 ? 'run' : 'stop'))
  const final = await runLoop(goal(), { report, thresholds: {}, control })

  assert.equal(final.state, 'aborted')
  assert.deepEqual(confirmations, [{ turnStopped: false, acceptanceStopped: null }])
})

test('注入前就收到停止:不注入、不发中断,turnStopped 为 null', async () => {
  const interrupts = []
  const { runLoop } = await loadLoop({ interrupts, verdicts: () => 'busy' })
  const { control, confirmations } = controlThat(() => 'stop')
  const final = await runLoop(goal(), { report, thresholds: {}, control })

  assert.equal(interrupts.length, 0)
  assert.equal(final.state, 'aborted')
  assert.deepEqual(confirmations, [{ turnStopped: null, acceptanceStopped: null }])
})
