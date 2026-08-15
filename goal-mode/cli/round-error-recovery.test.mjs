// 轮次里出错不该终结目标。
//
// 需要 `node --test --experimental-test-module-mocks`:这些用例要真驱动 runLoop,
// 就得把它依赖的 git / 终端 / 验收替换掉,而那正是 mock.module 的用途。
// 事故背景:提示词模板被一次目录搬迁挪走,驱动在「验收驳回后要注入重试」的那一刻
// 读不到文件,异常抛到顶层 catch,print 一行就 process.exit(1) —— 跑了两小时的目标没了,
// 记录还停在 active。当时 137 个测试全绿,因为没有一个真的驱动过 runLoop。
import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

async function loadLoop({ renderFails }) {
  mock.reset() // mock 会跨用例残留,不清就报「already mocked」
  let calls = 0
  mock.module('./orca-terminal.mjs', { namedExports: { sendText: async () => {} } })
  mock.module('./terminal-activity.mjs', {
    namedExports: { observeAgent: async () => ({}), classifyRound: () => 'finished' }
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
      renderPrompt: async () => {
        calls++
        if (calls <= renderFails) {
          throw new Error('ENOENT: no such file or directory, open rejected-completion.md')
        }
        return '提示词'
      },
      writePromptFile: async () => '/tmp/p',
      promptPointerLine: () => 'x'
    }
  })
  const mod = await import(`./goal-loop.mjs?t=${calls}-${renderFails}-${Math.random()}`)
  return { mod, renders: () => calls }
}

// goal-state 的 ROOT 是模块加载时读的环境变量,而动态导入只会让 goal-loop 重新加载、
// goal-state 仍走缓存 —— 所以整个文件必须共用一个 HOME,分用例各设各的会写到第一个那里去。
const HOME = await mkdtemp(path.join(tmpdir(), 'goal-loop-'))
process.env.ORCA_GOAL_HOME = HOME
process.env.ORCA_GOAL_POLL_MS = '5'
process.env.ORCA_GOAL_SETTLE_MS = '10'
after(() => rm(HOME, { recursive: true, force: true }))

const goal = (over = {}) => ({
  key: 'k',
  objective: 'o',
  worktreePath: '/tmp/wt',
  terminalHandle: 'term_x',
  acceptance: null,
  budget: { maxTurns: 2, maxMinutes: 0 },
  state: 'active',
  turns: 0,
  falseClaims: 0,
  blockedClaims: 0,
  stallCount: 0,
  tamperFindings: [],
  tamperChallenges: 0,
  startedAt: Date.now(),
  updatedAt: Date.now(),
  lastSnapshot: { kind: 'git', tree: 't0', head: 'h0' },
  ...over
})

const report = new Proxy({}, { get: () => () => {} })

test('注入时读不到模板 —— 重试,不终结目标', async () => {
  const { mod, renders } = await loadLoop({ renderFails: 3 })
  const final = await mod.runLoop(goal(), {
    report,
    thresholds: { maxBlockedClaims: 2, maxStallRounds: 9, maxFalseClaims: 9 }
  })

  assert.ok(renders() > 3, `应该重试过:实际只调了 ${renders()} 次`)
  // 跑到轮数预算才停,而不是死在 ENOENT 上
  assert.equal(final.state, 'budget_exhausted')
})

test('错误一直不好,认输也要留下死因和可接回的状态', async (t) => {
  process.env.ORCA_GOAL_ROUND_ERROR_GRACE_MS = '80'
  t.after(() => delete process.env.ORCA_GOAL_ROUND_ERROR_GRACE_MS)

  const { mod } = await loadLoop({ renderFails: Infinity })
  const final = await mod.runLoop(goal(), {
    report,
    thresholds: { maxBlockedClaims: 2, maxStallRounds: 9, maxFalseClaims: 9 }
  })

  assert.equal(final.state, 'blocked', '要停在可接回的状态,不是静默消失')
  assert.match(final.finishReason, /ENOENT/, '死因要写清楚是什么错')
  assert.ok(final.driverError, '记录里要留下 driverError 供面板显示')
})

test('验收判词立刻落盘 —— 后面哪一步挂了都不该把它赔进去', async (t) => {
  process.env.ORCA_GOAL_ROUND_ERROR_GRACE_MS = '80'
  t.after(() => delete process.env.ORCA_GOAL_ROUND_ERROR_GRACE_MS)

  mock.reset()
  mock.module('./orca-terminal.mjs', { namedExports: { sendText: async () => {} } })
  mock.module('./terminal-activity.mjs', {
    namedExports: { observeAgent: async () => ({}), classifyRound: () => 'finished' }
  })
  mock.module('./git-snapshot.mjs', {
    namedExports: {
      snapshotWorktree: async () => ({ kind: 'git', tree: 't', head: 'h' }),
      diffTrees: async () => ({ source: ['a.ts'], test: [] }),
      diffText: async () => ''
    }
  })
  mock.module('./tamper-scan.mjs', {
    namedExports: { scanRound: async () => [], describeFindings: () => '' }
  })
  mock.module('./goal-claim.mjs', {
    namedExports: {
      readClaim: async () => ({ kind: 'complete', summary: '做完了' }),
      clearClaim: async () => {},
      claimPath: () => '/tmp/c'
    }
  })
  mock.module('./acceptance-gate.mjs', {
    namedExports: {
      runAcceptance: async () => ({
        passed: false,
        results: [{ command: 'judge-1', ok: false, code: 1, ms: 720_000, output: 'FAIL 少了圆角' }]
      }),
      describeFailures: () => ({ list: '- `judge-1` 退出码 1', output: 'FAIL 少了圆角' })
    }
  })
  // 首轮注入正常,验收驳回后的那次注入才挂 —— 正是事故发生的位置
  let renders = 0
  mock.module('./continuation-prompt.mjs', {
    namedExports: {
      renderPrompt: async () => {
        if (++renders > 1) {
          throw new Error('ENOENT: rejected-completion.md')
        }
        return '首轮提示词'
      },
      writePromptFile: async () => '/tmp/p',
      promptPointerLine: () => 'x'
    }
  })
  const mod = await import(`./goal-loop.mjs?verdict=${Math.random()}`)
  await mod.runLoop(goal({ acceptance: { commands: ['judge-1'], timeoutMs: 1000, cwd: '/tmp' } }), {
    report,
    thresholds: { maxBlockedClaims: 2, maxStallRounds: 9, maxFalseClaims: 9 }
  })

  const saved = await readFile(path.join(HOME, 'verdict', 'k-turn1.md'), 'utf8')
  assert.match(saved, /FAIL 少了圆角/, '判词全文要留在 verdict/ 里')
  const log = await readFile(path.join(HOME, 'log', 'k.jsonl'), 'utf8')
  assert.match(log, /acceptanceFailed/, '逐轮日志要记下驳回摘要,面板才说得出为什么')
})

test('接管时 agent 已空闲 —— 要正常注入,不能干等一个不存在的轮次', async () => {
  // 真事故:上一轮声称完成后 agent 就闲着了,resume 的 attach 干等 300 秒被判「毫无动静」受阻。
  mock.reset()
  let sent = 0
  mock.module('./orca-terminal.mjs', {
    namedExports: {
      sendText: async () => {
        sent++
      }
    }
  })
  mock.module('./terminal-activity.mjs', {
    namedExports: { observeAgent: async () => ({}), classifyRound: () => 'finished' } // 一直空闲
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
  const mod = await import(`./goal-loop.mjs?idle=${Math.random()}`)
  const final = await mod.runLoop(goal({ key: 'idle', budget: { maxTurns: 1, maxMinutes: 0 } }), {
    report,
    thresholds: { maxBlockedClaims: 2, maxStallRounds: 9, maxFalseClaims: 9 },
    attach: true
  })
  assert.ok(sent > 0, 'attach 遇到空闲 agent 时必须注入,而不是干等')
  assert.notEqual(final.state, 'blocked', '不该被判成受阻')
})

test('终端一时断开不该终结目标 —— Orca 重启一下就死太脆了', async () => {
  mock.reset()
  let observations = 0
  mock.module('./orca-terminal.mjs', { namedExports: { sendText: async () => {} } })
  mock.module('./terminal-activity.mjs', {
    namedExports: {
      observeAgent: async () => ({}),
      // 前几次报断开,之后恢复正常
      classifyRound: () => (++observations <= 3 ? 'disconnected' : 'finished')
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
  const mod = await import(`./goal-loop.mjs?disc=${Math.random()}`)
  const final = await mod.runLoop(goal({ key: 'disc', budget: { maxTurns: 1, maxMinutes: 0 } }), {
    report,
    thresholds: { maxBlockedClaims: 2, maxStallRounds: 9, maxFalseClaims: 9 }
  })
  assert.notEqual(final.state, 'blocked', '断开恢复后应该继续跑,而不是判受阻结束')
  assert.ok(observations > 3, '应该重试过')
})

test('改了验证方式时,把 diff 通过环境变量交给裁判', async () => {
  // 守卫不替人判断这次改动是修错还是作弊 —— 它只负责把改动摆到裁判面前。
  mock.reset()
  let seenEnv = null
  mock.module('./orca-terminal.mjs', { namedExports: { sendText: async () => {} } })
  mock.module('./terminal-activity.mjs', {
    namedExports: { observeAgent: async () => ({}), classifyRound: () => 'finished' }
  })
  mock.module('./git-snapshot.mjs', {
    namedExports: {
      snapshotWorktree: async () => ({ kind: 'git', tree: 't', head: 'h' }),
      diffTrees: async () => ({ source: [], test: ['a.test.ts'] }),
      diffText: async () => 'diff --git a/a.test.ts b/a.test.ts\n-  expect(x).toBe(1)'
    }
  })
  mock.module('./tamper-scan.mjs', {
    namedExports: {
      scanRound: async () => [
        {
          kind: 'assertions-removed',
          key: 'k',
          label: '删掉了断言',
          detail: 'a.test.ts',
          challenge: true
        }
      ],
      describeFindings: () => 'x'
    }
  })
  mock.module('./goal-claim.mjs', {
    namedExports: {
      readClaim: async () => ({ kind: 'complete', summary: '做完了' }),
      clearClaim: async () => {},
      claimPath: () => '/tmp/c'
    }
  })
  mock.module('./acceptance-gate.mjs', {
    namedExports: {
      runAcceptance: async (_a, opts) => {
        seenEnv = opts && opts.env
        return { passed: true, results: [{ command: 'judge', ok: true, code: 0, output: 'PASS' }] }
      },
      describeFailures: () => ({ list: '', output: '' })
    }
  })
  mock.module('./continuation-prompt.mjs', {
    namedExports: {
      renderPrompt: async () => '提示词',
      writePromptFile: async () => '/tmp/p',
      promptPointerLine: () => 'x'
    }
  })
  const mod = await import(`./goal-loop.mjs?gate=${Math.random()}`)
  await mod.runLoop(
    goal({ key: 'gate', acceptance: { commands: ['judge'], timeoutMs: 1000, cwd: '/tmp' } }),
    {
      report,
      thresholds: {
        maxBlockedClaims: 2,
        maxStallRounds: 9,
        maxFalseClaims: 9,
        maxTamperChallenges: 9
      }
    }
  )
  assert.ok(seenEnv && seenEnv.ORCA_GOAL_GATE_CHANGES, '验收要拿到门禁改动文件')
  const body = await readFile(seenEnv.ORCA_GOAL_GATE_CHANGES, 'utf8')
  assert.match(body, /删掉了断言/)
  assert.match(body, /expect\(x\)\.toBe\(1\)/, 'diff 原文要在里面')
})

test('落盘失败重试时,不把几十分钟的验收重跑一遍', async () => {
  // 验收是整条链上最贵的一步。早先 appendLog 一抛,重试就把四批裁判从头再跑,
  // 而判词其实已经在盘上了。
  mock.reset()
  let judgeRuns = 0
  let logWrites = 0
  mock.module('./orca-terminal.mjs', { namedExports: { sendText: async () => {} } })
  mock.module('./terminal-activity.mjs', {
    namedExports: { observeAgent: async () => ({}), classifyRound: () => 'finished' }
  })
  mock.module('./git-snapshot.mjs', {
    namedExports: {
      snapshotWorktree: async () => ({ kind: 'git', tree: 'same-tree', head: 'h' }),
      diffTrees: async () => ({ source: [], test: [] }),
      diffText: async () => ''
    }
  })
  mock.module('./tamper-scan.mjs', {
    namedExports: { scanRound: async () => [], describeFindings: () => '' }
  })
  let claimReads = 0
  mock.module('./goal-claim.mjs', {
    namedExports: {
      // 第 1 轮(含它的两次重试)声称完成;之后不再声称,免得第 2 轮又合法地跑一次验收
      readClaim: async () => (++claimReads <= 3 ? { kind: 'complete', summary: '做完了' } : null),
      clearClaim: async () => {},
      claimPath: () => '/tmp/c'
    }
  })
  mock.module('./acceptance-gate.mjs', {
    namedExports: {
      runAcceptance: async () => {
        judgeRuns++
        return {
          passed: false,
          results: [{ command: 'judge', ok: false, code: 1, output: 'FAIL' }]
        }
      },
      describeFailures: () => ({ list: '- judge', output: 'FAIL' })
    }
  })
  mock.module('./goal-state.mjs', {
    namedExports: {
      ROOT: HOME,
      writeGoal: async () => {},
      appendLog: async () => {
        // 前两次写日志失败:重试必须复用验收结果,而不是重判
        if (++logWrites <= 2) {
          throw new Error('ENOSPC: no space left on device')
        }
      }
    }
  })
  mock.module('./continuation-prompt.mjs', {
    namedExports: {
      renderPrompt: async () => '提示词',
      writePromptFile: async () => '/tmp/p',
      promptPointerLine: () => 'x'
    }
  })
  const mod = await import(`./goal-loop.mjs?reuse=${Math.random()}`)
  await mod.runLoop(
    goal({
      key: 'reuse',
      budget: { maxTurns: 3, maxMinutes: 0 },
      acceptance: { commands: ['judge'], timeoutMs: 1000, cwd: '/tmp' }
    }),
    {
      report,
      thresholds: {
        maxBlockedClaims: 2,
        maxStallRounds: 9,
        maxFalseClaims: 9,
        maxTamperChallenges: 9
      }
    }
  )
  assert.ok(logWrites >= 3, '应该重试过')
  assert.equal(judgeRuns, 1, `裁判只该跑一次,实际跑了 ${judgeRuns} 次`)
})
