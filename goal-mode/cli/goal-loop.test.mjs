// 主循环的端到端路径:唤醒 → 守卫 → 执行结论。终端和守卫都是替身,时间压到毫秒级。
//
// 需要 `node --test --experimental-test-module-mocks`。
import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const HOME = await mkdtemp(path.join(tmpdir(), 'goal-loop-'))
process.env.ORCA_GOAL_HOME = HOME
process.env.ORCA_GOAL_POLL_MS = '5'
process.env.ORCA_GOAL_STOP_GRACE_MS = '100'
process.env.ORCA_GOAL_GUARD_RETRY_MS = '10,10'
after(() => rm(HOME, { recursive: true, force: true }))

const { describeActivity } = await import('./terminal-activity.mjs')

/** 一个假的执行 agent:收到消息就干 turnMs 毫秒,然后状态存储报 done。 */
function makeWorld(over = {}) {
  const w = {
    row: { state: 'done', stateStartedAt: 1, prompt: '', workingMode: null },
    draft: '',
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

async function loadLoop(w, { checks, env = {} } = {}) {
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
      readTerminal: async () => ({ draft: w.draft })
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
function scriptedGuard(steps) {
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
const goal = (over = {}) => ({
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

const report = new Proxy({}, { get: () => () => {} })

function control({ checkpoint = () => 'run', takeReload = () => null } = {}) {
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

const done = { decision: 'done', observation: '全部核实通过' }
const instruct = (instruction, over = {}) => ({ decision: 'instruct', instruction, ...over })

test('新目标:发首轮,本轮结束叫守卫,指示发出去,判完成后结束', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  const guard = scriptedGuard([instruct('去改 a.ts', { observation: '还缺 a' }), done])
  const final = await runLoop(goal(), { report, callGuard: guard })

  assert.equal(final.state, 'complete')
  assert.equal(w.sent.length, 2)
  assert.ok(w.sent[0].startsWith('【Goal 自动消息】'))
  assert.match(w.sent[0], /做完 X/)
  assert.match(w.sent[0], /\/tmp\/checklist\.md/)
  assert.match(w.sent[1], /还缺 a/)
  assert.match(w.sent[1], /去改 a\.ts/)
  assert.doesNotMatch(w.sent[1], /做完 X/, '续跑消息不重发目标原文')
  assert.match(w.sent[1], /objective\.md/, '只给原文文件路径')
  assert.equal(final.turns, 2)
  assert.equal(guard.calls[0].vars.wakeReason, '执行 agent 这一轮结束了')
  assert.equal(guard.calls[0].vars.objective, '做完 X', '守卫拿到的是目标原文')
  assert.equal(final.lastAcceptance.result.passed, true)
  assert.equal(final.lastAcceptance.result.results.at(-1).command, '守卫验收')
  assert.ok(final.notices.some((n) => n.kind === 'complete'))
  assert.ok(final.guardMs >= 0 && final.guardCalls === 2)
})

test('守卫说等一等:什么都不发;同一个结束事件不会马上再叫,定时才叫', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_GUARD_INTERVAL_MS: '60' } })
  const guard = scriptedGuard([{ decision: 'wait' }, done])
  const final = await runLoop(goal(), { report, callGuard: guard })

  assert.equal(final.state, 'complete')
  assert.equal(w.sent.length, 1, '只有首轮')
  assert.equal(guard.calls.length, 2)
  assert.match(guard.calls[1].vars.wakeReason, /定时巡检/)
})

test('Stop hook 丢了、状态一直是 working:定时叫守卫,它给了指示就照发', async () => {
  const w = makeWorld()
  w.onSend = (text) => {
    w.row = { ...w.row, state: 'working', stateStartedAt: Date.now() + 1, prompt: text }
  }
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_GUARD_INTERVAL_MS: '40' } })
  const guard = scriptedGuard([instruct('接着改 b.ts'), done])
  const final = await runLoop(goal(), { report, callGuard: guard })

  assert.equal(final.state, 'complete')
  assert.equal(w.sent.length, 2, '守卫的指示意味着本轮已结束')
  assert.match(w.sent[1], /接着改 b\.ts/)
})

test('agent 在等确认(权限框)时不发', async () => {
  const w = makeWorld()
  w.onSend = () => {
    w.row = { ...w.row, state: 'waiting', stateStartedAt: Date.now() + 1 }
  }
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_GUARD_INTERVAL_MS: '40' } })
  const guard = scriptedGuard([
    instruct('x'),
    () => {
      assert.equal(w.sent.length, 1, '权限框期间指示不能打进去')
      return done
    }
  ])
  assert.equal((await runLoop(goal(), { report, callGuard: guard })).state, 'complete')
})

test('输入框里有文字也照发:Claude 一轮结束后的暗色建议会被读成草稿', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  const guard = scriptedGuard([
    () => {
      w.draft = '继续第二步'
      return instruct('做第二步')
    },
    () => {
      assert.equal(w.sent.length, 2, '续跑消息照常发出')
      return done
    }
  ])
  assert.equal((await runLoop(goal(), { report, callGuard: guard })).state, 'complete')
})

test('问用户:问题在 wait 时保留、只通知一次,答完置空后通知失效;能做的照常安排', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_GUARD_INTERVAL_MS: '40' } })
  const question = '需要一次性验证码:仓库和历史会话里都没有,只能你给'
  const guard = scriptedGuard([
    { decision: 'ask_user', question, instruction: '先做不依赖登录的 B' },
    (input) => {
      assert.equal(input.vars.openQuestion, question, '下一次调用拿到仍待回答的问题')
      return { decision: 'wait', question }
    },
    (input) => {
      assert.equal(input.vars.openQuestion, question)
      return instruct('用户给了验证码,继续登录', { question: '' })
    },
    done
  ])
  const final = await runLoop(goal(), { report, callGuard: guard })

  assert.equal(final.state, 'complete')
  assert.match(w.sent[1], /先做不依赖登录的 B/)
  const questions = final.notices.filter((n) => n.kind === 'question')
  assert.equal(questions.length, 1, '同一个问题只通知一次')
  assert.ok(questions[0].resolvedAt, '答完后通知失效')
  assert.equal(final.awaitingUser, null)
})

test('问用户时没有能并行的事:不发消息,agent 停着等', async () => {
  // 真机里守卫曾写「等待用户提供口令」当指示,驱动照发还算一轮;用户不回就来回空转。
  const w = makeWorld()
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_GUARD_INTERVAL_MS: '40' } })
  const question = '需要这次发布的口令:只有你知道'
  const guard = scriptedGuard([
    { decision: 'ask_user', question, instruction: '' },
    () => {
      assert.equal(w.sent.length, 1, '问用户时没有指示就不发')
      return instruct('用户给了口令,写进 secret.txt', { question: '' })
    },
    done
  ])
  const final = await runLoop(goal(), { report, callGuard: guard })
  assert.equal(final.state, 'complete')
  assert.equal(final.turns, 2)
})

test('守卫读驱动整理的对话摘要:发出的消息交给摘要辨认,结论生效后才记下读到的位置', async () => {
  const w = makeWorld()
  w.row = { ...w.row, agentType: 'codex', transcriptPath: '/tmp/rollout.jsonl' }
  const { runLoop } = await loadLoop(w)
  const logDir = path.join(HOME, 'digest-calls')
  const inputs = []
  const digestTranscript = async (input) => {
    inputs.push(structuredClone(input))
    const line = inputs.length * 10
    return { text: `摘要 ${inputs.length}`, cursor: { path: input.path, offset: line * 100, line } }
  }
  const fail = { ok: false, reason: '守卫起不来' }
  const guard = scriptedGuard([
    (input) => {
      assert.match(input.vars.digestPath, /1-transcript\.md$/)
      return fail
    },
    instruct('接着做 b'),
    done
  ])
  const final = await runLoop(goal({ guard: { agent: 'codex', timeoutMs: 1000, logDir } }), {
    report,
    callGuard: guard,
    digestTranscript
  })

  assert.equal(final.state, 'complete')
  assert.equal(inputs[0].family, 'codex')
  assert.equal(inputs[0].cursor, null)
  assert.equal(inputs[1].cursor, null, '守卫没给出结论,下次从同一处再读')
  assert.deepEqual(inputs[2].cursor, { path: '/tmp/rollout.jsonl', offset: 2000, line: 20 })
  assert.equal(inputs[1].sent.length, 1, '首轮消息交给摘要辨认')
  assert.equal(inputs[2].sent.length, 2)
  assert.equal(inputs[2].sent[1].text, w.sent[1])
  assert.equal(await readFile(path.join(logDir, '2-transcript.md'), 'utf8'), '摘要 2')
  assert.deepEqual(final.transcriptCursor, { path: '/tmp/rollout.jsonl', offset: 3000, line: 30 })
})

test('执行 agent 的对话记录格式不支持时,如实告诉守卫看终端画面', async () => {
  const w = makeWorld()
  w.row = { ...w.row, agentType: 'kimi', transcriptPath: '/tmp/wire.jsonl' }
  const { runLoop } = await loadLoop(w)
  const guard = scriptedGuard([done])
  await runLoop(goal(), { report, callGuard: guard, digestTranscript: async () => assert.fail() })
  assert.match(guard.calls[0].vars.digestPath, /不支持 kimi 的对话记录格式/)
})

test('调用期间出现被 Claude 包住的驱动消息,不算用户说话', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  const guard = scriptedGuard([
    () => {
      w.row = {
        ...w.row,
        prompt: '<pasted_content id="a1">【Goal 自动消息】守卫看到的:…</pasted_content id="a1">'
      }
      return instruct('去改 a.ts')
    },
    done
  ])
  await runLoop(goal(), { report, callGuard: guard })
  assert.equal(w.sent.length, 2, '结论照常执行')
})

test('判完成但用户配置的检查没过:不结束,把失败输出交给下一次守卫', async () => {
  const w = makeWorld()
  const checks = [
    {
      passed: false,
      inconclusive: false,
      results: [{ command: 'pnpm test', ok: false, output: 'FAIL a.test.ts' }]
    },
    { passed: true, inconclusive: false, results: [{ command: 'pnpm test', ok: true, output: '' }] }
  ]
  const { runLoop } = await loadLoop(w, { checks })
  const guard = scriptedGuard([
    done,
    (input) => {
      assert.match(input.vars.wakeReason, /检查命令没有通过/)
      assert.match(input.vars.checkFailures, /FAIL a\.test\.ts/)
      return done
    }
  ])
  const final = await runLoop(goal({ acceptance: { commands: ['pnpm test'] } }), {
    report,
    callGuard: guard
  })
  assert.equal(final.state, 'complete')
  assert.deepEqual(
    final.lastAcceptance.result.results.map((r) => r.command),
    ['pnpm test', '守卫验收']
  )
})

test('轮数用完:守卫再给指示就结束,收尾消息不算一轮', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  const guard = scriptedGuard([instruct('还有 C')])
  const final = await runLoop(goal({ budget: { maxTurns: 1, maxMinutes: 0 } }), {
    report,
    callGuard: guard
  })
  assert.equal(final.state, 'budget_exhausted')
  assert.equal(final.turns, 1)
  assert.match(w.sent.at(-1), /预算已用完/)
  assert.ok(final.notices.some((n) => n.kind === 'budget'))
})

test('轮数用完后守卫仍能判完成', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  const final = await runLoop(goal({ budget: { maxTurns: 1, maxMinutes: 0 } }), {
    report,
    callGuard: scriptedGuard([done])
  })
  assert.equal(final.state, 'complete')
})

test('时长在守卫调用期间用完:判完成照样结束,其余结论按预算收尾', async () => {
  for (const [verdict, state] of [
    [done, 'complete'],
    [instruct('x'), 'budget_exhausted']
  ]) {
    const w = makeWorld()
    const { runLoop } = await loadLoop(w)
    const slow = scriptedGuard([
      async () => {
        await new Promise((r) => setTimeout(r, 30))
        return verdict
      }
    ])
    const final = await runLoop(
      goal({ budget: { maxTurns: 0, maxMinutes: 1 }, activeMs: 60_000 - 25 }),
      { report, callGuard: slow }
    )
    assert.equal(final.state, state)
  }
})

test('守卫调用失败:按间隔重试,用完了通知用户,之后跟着定时再试,成功即恢复', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_GUARD_INTERVAL_MS: '40' } })
  const fail = { ok: false, reason: 'codex: command not found' }
  const guard = scriptedGuard([fail, fail, fail, done])
  const final = await runLoop(goal(), { report, callGuard: guard })

  assert.equal(final.state, 'complete')
  assert.equal(guard.calls.length, 4)
  const unavailable = final.notices.filter((n) => n.kind === 'guard-unavailable')
  assert.equal(unavailable.length, 1)
  assert.match(unavailable[0].text, /command not found/)
  assert.ok(unavailable[0].resolvedAt, '守卫恢复后通知失效')
})

test('守卫调用期间用户亲自发了话:这次结论作废,那一轮结束后再看', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  const guard = scriptedGuard([
    () => {
      w.runTurn('先别动 a.ts,我在改')
      return instruct('去改 a.ts')
    },
    done
  ])
  const final = await runLoop(goal(), { report, callGuard: guard })
  assert.equal(final.state, 'complete')
  assert.equal(w.sent.length, 1, '作废的指示没有发出去')
  assert.equal(guard.calls.length, 2)
})

test('守卫调用期间用户改了目标:这次调用终止,按新目标重看,下一条消息说明目标改了', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  let inFlight = false
  let reloaded = false
  const record = {
    specRevision: 2,
    spec: {
      objective: '做完 Y',
      criteria: [],
      acceptanceText: '',
      extraChecks: [],
      checkAll: false,
      judge: 'codex'
    },
    budget: { maxTurns: 0, maxMinutes: 0, checkTimeoutSeconds: 60 },
    binding: { terminal: 'term_1' },
    workspace: { path: '/tmp/wt' }
  }
  const ctl = control({
    takeReload: () => {
      if (inFlight && !reloaded) {
        reloaded = true
        return record
      }
      return null
    }
  })
  const guard = scriptedGuard([
    async (input) => {
      inFlight = true
      await new Promise((resolve) => input.signal.addEventListener('abort', resolve))
      inFlight = false
      return { ok: false, reason: '守卫调用已取消' }
    },
    (input) => {
      assert.equal(input.vars.wakeReason, '用户修改了目标')
      assert.equal(input.vars.objective, '做完 Y')
      return instruct('按新目标改')
    },
    done
  ])
  const final = await runLoop(goal(), { report, callGuard: guard, control: ctl })
  assert.equal(final.state, 'complete')
  assert.match(w.sent[1], /^【Goal 自动消息】用户修改了目标/)
  assert.match(w.sent[1], /做完 Y/)
  assert.equal(final.guardNote, '笔记')
})

test('守卫调用期间用户停止:调用终止,目标标为人为停止', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  let inFlight = false
  const ctl = control({ checkpoint: () => (inFlight ? 'stop' : 'run') })
  const guard = scriptedGuard([
    async (input) => {
      inFlight = true
      await new Promise((resolve) => input.signal.addEventListener('abort', resolve))
      return { ok: false, reason: '守卫调用已取消' }
    }
  ])
  const final = await runLoop(goal(), { report, callGuard: guard, control: ctl })
  assert.equal(final.state, 'aborted')
  assert.deepEqual(ctl.confirmations, [{ turnStopped: null, acceptanceStopped: null }])
})

test('agent 正在干活时停止:发一次中断,等到结束证据后确认', async () => {
  for (const [ends, turnStopped] of [
    [true, true],
    [false, false]
  ]) {
    const w = makeWorld()
    w.onSend = (text) => {
      w.row = { ...w.row, state: 'working', stateStartedAt: Date.now() + 1, prompt: text }
    }
    w.onInterrupt = () => ends && w.end()
    const { runLoop } = await loadLoop(w)
    let calls = 0
    const ctl = control({ checkpoint: () => (++calls > 3 ? 'stop' : 'run') })
    const final = await runLoop(goal(), { report, callGuard: scriptedGuard([]), control: ctl })
    assert.equal(final.state, 'aborted')
    assert.equal(w.interrupts.length, 1)
    assert.deepEqual(ctl.confirmations, [{ turnStopped, acceptanceStopped: null }])
  }
})

test('接回:不发首轮,先叫守卫弄清现状', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  const guard = scriptedGuard([done])
  const final = await runLoop(goal({ turns: 4 }), { report, callGuard: guard, attach: true })
  assert.equal(final.state, 'complete')
  assert.equal(w.sent.length, 0)
  assert.equal(guard.calls[0].vars.wakeReason, '驱动刚接回这个目标，先弄清现在的情况')
})

test('驱动自己出错不终结目标:持续出错就记通知,恢复后通知失效', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_ROUND_ERROR_GRACE_MS: '20' } })
  const failUntil = Date.now() + 60
  const ctl = control({
    checkpoint: () => {
      if (Date.now() < failUntil) {
        throw new Error('control.json 读不出来')
      }
      return 'run'
    }
  })
  const final = await runLoop(goal(), {
    report,
    callGuard: scriptedGuard([done]),
    control: ctl,
    attach: true
  })
  assert.equal(final.state, 'complete')
  const faults = final.notices.filter((n) => n.kind === 'driver-fault')
  assert.equal(faults.length, 1)
  assert.ok(faults[0].resolvedAt)
  assert.equal(final.driverError, null)
})

test('没有守卫的目标拒绝启动', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  await assert.rejects(
    () => runLoop(goal({ guard: { agent: null } }), { report, callGuard: scriptedGuard([]) }),
    /没有守卫/
  )
})

test('每次守卫调用的全文留档', async () => {
  const w = makeWorld()
  const { runLoop } = await loadLoop(w)
  const logDir = path.join(HOME, 'guard-calls')
  await runLoop(goal({ guard: { agent: 'codex', timeoutMs: 1000, logDir } }), {
    report,
    callGuard: scriptedGuard([instruct('x'), done])
  })
  const files = await readdir(logDir)
  assert.deepEqual(files.filter((f) => f.endsWith('.json')).sort(), ['1.json', '2.json'])
  // 续跑消息指向的目标原文就写在这里
  assert.equal(await readFile(path.join(logDir, 'objective.md'), 'utf8'), '做完 X\n')
})
