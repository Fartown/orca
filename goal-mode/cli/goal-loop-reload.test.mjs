// 暂停期间宿主改了定义:循环必须在暂停等待里就套用并确认,不能等到恢复才动。
//
// 需要 `node --test --experimental-test-module-mocks`,和 goal-loop-stop 一样真驱动 runLoop。
import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const HOME = await mkdtemp(path.join(tmpdir(), 'goal-loop-reload-'))
process.env.ORCA_GOAL_HOME = HOME
process.env.ORCA_GOAL_POLL_MS = '5'
process.env.ORCA_GOAL_SETTLE_MS = '5'
after(() => rm(HOME, { recursive: true, force: true }))

async function loadLoop() {
  mock.reset()
  mock.module('./orca-terminal.mjs', {
    namedExports: { sendText: async () => {}, sendInterrupt: async () => {} }
  })
  mock.module('./terminal-activity.mjs', {
    namedExports: { observeAgent: async () => ({}), classifyRound: () => 'busy' }
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

const record = {
  goalId: 'g-reload',
  specRevision: 2,
  spec: {
    objective: '新目标',
    criteria: [],
    acceptanceText: '',
    extraChecks: [],
    checkAll: false,
    onBlocked: 'ask'
  },
  budget: { maxTurns: 3, maxMinutes: 0, checkTimeoutSeconds: 10 },
  workspace: { path: '/tmp/wt' },
  binding: { terminal: 'term_new' }
}

test('暂停时收到 reload:立刻套用新定义并确认,随后停止时记录已是新版本', async () => {
  const { runLoop } = await loadLoop()
  let calls = 0
  let reloads = 0
  const confirmations = []
  const control = {
    // 第一次检查点:暂停;第二次:停止。reload 只在暂停那一次交出去。
    checkpoint: async () => (++calls === 1 ? 'paused' : 'stop'),
    takeReload: () => (reloads++ === 0 ? record : null),
    confirmReload: async () => confirmations.push('reload'),
    confirmStop: async () => confirmations.push('stop')
  }
  const final = await runLoop(
    {
      key: 'k-reload',
      objective: '旧目标',
      worktreePath: '/tmp/wt',
      terminalHandle: 'term_old',
      acceptance: null,
      budget: { maxTurns: 0, maxMinutes: 0 },
      state: 'active',
      turns: 0,
      falseClaims: 2,
      blockedClaims: 0,
      stallCount: 0,
      tamperFindings: [],
      tamperChallenges: 0,
      specRevision: 1,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      lastSnapshot: { kind: 'git', tree: 't0', head: 'h0' }
    },
    { report: new Proxy({}, { get: () => () => {} }), thresholds: {}, control }
  )
  assert.deepEqual(confirmations, ['reload', 'stop'], 'reload 在停止之前就已确认')
  assert.equal(final.state, 'aborted')
  assert.equal(final.objective, '新目标')
  assert.equal(final.terminalHandle, 'term_new')
  assert.equal(final.specRevision, 2)
  assert.equal(final.falseClaims, 0, '版本变了,旧的假完成计数清零')
})
