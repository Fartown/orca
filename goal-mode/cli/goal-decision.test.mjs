import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_THRESHOLDS, decide } from './goal-decision.mjs'

const T0 = 1_700_000_000_000
const tree = (t, h = 'head1') => ({ kind: 'git', tree: t, head: h })

function makeGoal(over = {}) {
  return {
    key: 'k',
    objective: 'o',
    acceptance: { commands: ['pnpm test'] },
    budget: { maxTurns: 20, maxMinutes: 180 },
    state: 'active',
    turns: 1,
    falseClaims: 0,
    blockedClaims: 0,
    stallCount: 0,
    startedAt: T0,
    lastSnapshot: tree('a'),
    ...over
  }
}
const obs = (over = {}) => ({
  now: T0 + 60_000,
  sentinel: null,
  snapshot: tree('b'),
  acceptance: null,
  ...over
})

test('普通一轮继续跑,并记下新快照', () => {
  const { action, goal } = decide(makeGoal(), obs())
  assert.equal(action.type, 'continue')
  assert.equal(action.prompt, 'continuation')
  assert.equal(goal.lastSnapshot.tree, 'b')
})

test('声称完成且配了验收 → 先要求验收,不直接结束', () => {
  const { action } = decide(makeGoal(), obs({ sentinel: { kind: 'complete', summary: 's' } }))
  assert.equal(action.type, 'verify')
})

test('验收通过 → 完成', () => {
  const { action, goal } = decide(
    makeGoal(),
    obs({ sentinel: { kind: 'complete', summary: 's' }, acceptance: { passed: true, results: [] } })
  )
  assert.equal(action.type, 'finish')
  assert.equal(action.state, 'complete')
  assert.equal(action.verified, true)
  assert.equal(goal.state, 'complete')
})

test('验收未通过 → 回灌驳回提示词,假完成计数 +1', () => {
  const { action, goal } = decide(
    makeGoal(),
    obs({
      sentinel: { kind: 'complete', summary: 's' },
      acceptance: { passed: false, results: [] }
    })
  )
  assert.equal(action.type, 'continue')
  assert.equal(action.prompt, 'rejected-completion')
  assert.equal(goal.falseClaims, 1)
})

test('连续假完成到阈值 → 判定受阻', () => {
  const { action } = decide(
    makeGoal({ falseClaims: DEFAULT_THRESHOLDS.maxFalseClaims - 1 }),
    obs({
      sentinel: { kind: 'complete', summary: 's' },
      acceptance: { passed: false, results: [] }
    })
  )
  assert.equal(action.type, 'finish')
  assert.equal(action.state, 'blocked')
})

test('没配验收命令时采信完成声明,但标记为未经验证', () => {
  const { action } = decide(
    makeGoal({ acceptance: { commands: [] } }),
    obs({ sentinel: { kind: 'complete', summary: 's' } })
  )
  assert.equal(action.state, 'complete')
  assert.equal(action.verified, false)
})

test('完成声明优先于预算判定 —— 最后一轮做完不该被记成预算耗尽', () => {
  const { action } = decide(
    makeGoal({ turns: 20 }),
    obs({ sentinel: { kind: 'complete', summary: 's' }, acceptance: { passed: true, results: [] } })
  )
  assert.equal(action.state, 'complete')
})

test('工作区连续无变化到阈值 → 判定空转', () => {
  const g = makeGoal({ stallCount: DEFAULT_THRESHOLDS.maxStallRounds - 1, lastSnapshot: tree('a') })
  const { action } = decide(g, obs({ snapshot: tree('a') }))
  assert.equal(action.type, 'finish')
  assert.equal(action.state, 'stalled')
})

test('只提交不改内容也算有进展(head 变了)', () => {
  const g = makeGoal({ stallCount: 2, lastSnapshot: tree('a', 'h1') })
  const { goal } = decide(g, obs({ snapshot: tree('a', 'h2') }))
  assert.equal(goal.stallCount, 0)
})

test('快照拿不到时不做空转判定 —— 未知不等于没变', () => {
  const g = makeGoal({ stallCount: 99, lastSnapshot: { kind: 'unavailable', reason: 'x' } })
  const { action, goal } = decide(g, obs({ snapshot: { kind: 'unavailable', reason: 'x' } }))
  assert.equal(action.type, 'continue')
  assert.equal(goal.stallCount, 99)
})

test('轮数预算耗尽 → 停', () => {
  const { action } = decide(makeGoal({ turns: 20 }), obs())
  assert.equal(action.state, 'budget_exhausted')
})

test('时长预算耗尽 → 停', () => {
  const { action } = decide(makeGoal(), obs({ now: T0 + 181 * 60_000 }))
  assert.equal(action.state, 'budget_exhausted')
})

test('声称受阻一次不停,到阈值才停下等人', () => {
  // 到阈值的出口从「终结目标」改成了「停下叫人」:守卫核实不了受阻声明,
  // 而真受阻的场景本来就必须人介入 —— 自动终结把这个需要人处理的信号变成了终点。
  const first = decide(makeGoal(), obs({ sentinel: { kind: 'blocked', summary: '缺凭证' } }))
  assert.equal(first.action.type, 'continue')
  assert.equal(first.goal.blockedClaims, 1)

  const second = decide(first.goal, obs({ sentinel: { kind: 'blocked', summary: '缺凭证' } }))
  assert.equal(second.action.type, 'await-user')
  assert.equal(second.goal.state, 'active', '不终结,等人')
})

test('受阻计数不连续就清零', () => {
  const g = decide(makeGoal({ blockedClaims: 1 }), obs()).goal
  assert.equal(g.blockedClaims, 0)
})

// —— 认领文件解析 ——

const CLAIM_HOME = new URL('./.test-claim-home/', import.meta.url).pathname
process.env.ORCA_GOAL_HOME = CLAIM_HOME
const { claimPath, clearClaim, readClaim } = await import('./goal-claim.mjs')
const { mkdir, writeFile, rm } = await import('node:fs/promises')
const { dirname } = await import('node:path')

async function putClaim(body) {
  await mkdir(dirname(claimPath('k')), { recursive: true })
  await writeFile(claimPath('k'), body, 'utf8')
}
test.after(() => rm(CLAIM_HOME, { recursive: true, force: true }))

test('没有认领文件 → null', async () => {
  await clearClaim('k')
  assert.equal(await readClaim('k'), null)
})

test('标准的 complete 行', async () => {
  await putClaim('complete: 把 add 改回加法\n')
  assert.deepEqual(await readClaim('k'), { kind: 'complete', summary: '把 add 改回加法' })
})

test('全角冒号、markdown 强调、前置空行都能容忍', async () => {
  await putClaim('\n  **blocked**:缺少测试环境 token\n')
  assert.deepEqual(await readClaim('k'), { kind: 'blocked', summary: '缺少测试环境 token' })
})

test('agent 写了散文而不是规定格式 → malformed,不当成完成', async () => {
  await putClaim('I think the goal is done now.')
  assert.equal((await readClaim('k')).kind, 'malformed')
})

test('malformed 不会被 decide 当成完成声明', () => {
  const { action } = decide(makeGoal(), obs({ sentinel: null }))
  assert.equal(action.type, 'continue')
})

test('清空后再读为 null —— 上一轮的声明不会串到这一轮', async () => {
  await putClaim('complete: x')
  await clearClaim('k')
  assert.equal(await readClaim('k'), null)
})

// —— 篡改扫描 ——

const { scanTestDiff, scanRound } = await import('./tamper-scan.mjs')

const diffOf = (file, lines) =>
  [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, ...lines].join('\n')

test('净删断言 → 报削弱', () => {
  const d = diffOf('src/x.test.js', [
    '-  assert.equal(a, 1)',
    '-  expect(b).toBe(2)',
    '+  assert.ok(a)'
  ])
  const f = scanTestDiff(d)
  assert.equal(f.length, 1)
  assert.equal(f[0].kind, 'assertions-removed')
  assert.equal(f[0].challenge, true)
})

test('只加断言不报 —— 补测试是正当行为', () => {
  const d = diffOf('src/x.test.js', ['+  assert.equal(a, 1)', '+  it("new case", () => {})'])
  assert.deepEqual(scanTestDiff(d), [])
})

test('+++/--- 文件头不能被当成增删行', () => {
  assert.deepEqual(scanTestDiff(diffOf('a.test.js', [])), [])
})

test('新增 skip / only 标记 → 报跳过', () => {
  const d = diffOf('a.test.js', ['+  it.skip("x", () => {})', '+  describe.only("y", () => {})'])
  const kinds = scanTestDiff(d).map((f) => f.kind)
  assert.ok(kinds.includes('tests-skipped'))
})

test('删掉整个用例 → 报削弱', () => {
  const d = diffOf('a_test.go', ['-func TestFoo(t *testing.T) {', '-  t.Error("boom")', '-}'])
  assert.equal(scanTestDiff(d)[0].kind, 'assertions-removed')
})

test('改门禁配置 → 挡板级发现', async () => {
  const f = await scanRound('/nonexistent', null, null, {
    source: ['package.json', 'src/a.ts'],
    test: []
  })
  assert.equal(f[0].kind, 'gate-config-edited')
  assert.equal(f[0].challenge, true)
})

test('改 .gitignore 与 .git/info/exclude 都要报', async () => {
  const f = await scanRound(
    '/nonexistent',
    { kind: 'git', tree: 't1', head: 'h', excludeHash: 'aaa' },
    { kind: 'git', tree: 't2', head: 'h', excludeHash: 'bbb' },
    { source: ['.gitignore'], test: [] }
  )
  assert.equal(f.filter((x) => x.kind === 'ignore-rules-edited').length, 2)
})

test('普通源码改动不报任何东西', async () => {
  assert.deepEqual(
    await scanRound('/nonexistent', null, null, { source: ['src/a.ts'], test: [] }),
    []
  )
})

// —— 篡改挡住完成判定 ——

const tamper = (over = {}) => ({
  kind: 'assertions-removed',
  label: 'L',
  detail: 'D',
  challenge: true,
  ...over
})
const claimOk = {
  sentinel: { kind: 'complete', summary: 's' },
  acceptance: { passed: true, results: [] }
}

// 篡改扫描的定位是「让改动可见」,不是替人下判决。
// 断言、门禁、ignore 规则本身就可能是错的 —— 人发现写错了也会直接删掉它,那是正当修复。
// 静态规则区分不了「为蒙混而改松」和「因为它本来就错而改掉」,差别在于有没有正当理由,
// 而能判断理由的只有裁判。所以改动的 diff 随验收一起交给裁判(见 goal-loop 的 writeGateChanges),
// 裁判按原始意图判过之后仍说通过,守卫就没有理由再挡。
test('改了验证方式但裁判仍判通过 → 放行,不再自己挡一轮', () => {
  const { action, goal } = decide(makeGoal(), obs({ ...claimOk, findings: [tamper()] }))
  assert.equal(action.state, 'complete')
  assert.equal(goal.tamperChallenges, 1, '仍然记账,只是不挡')
})

test('反复在改验证方式的同时通过验收 → 叫人来看,而不是判 agent 受阻', () => {
  const g = makeGoal({ tamperChallenges: DEFAULT_THRESHOLDS.maxTamperChallenges })
  const { action, goal } = decide(g, obs({ ...claimOk, findings: [tamper()] }))
  assert.equal(action.type, 'await-user')
  assert.match(action.reason, /削弱验收/)
  assert.equal(goal.state, 'active', '不终结,等人')
})

test('只改测试没削弱(challenge=false)不触发任何记账', () => {
  const g = makeGoal()
  const { action, goal } = decide(
    g,
    obs({ ...claimOk, findings: [tamper({ kind: 'test-only-edit', challenge: false })] })
  )
  assert.equal(action.state, 'complete')
  assert.equal(goal.tamperChallenges || 0, 0)
})

// 循环每轮调两次 decide(先判要不要验收,再带验收结果判),两次都从本轮起点出发。
test('两次调用不会重复累加本轮的发现', () => {
  const goal = makeGoal()
  const findings = [tamper()]
  const first = decide(goal, obs({ sentinel: { kind: 'complete', summary: 's' }, findings }))
  assert.equal(first.action.type, 'verify')
  const second = decide(goal, obs({ ...claimOk, findings }))
  assert.equal(second.goal.tamperFindings.length, 1)
})

// 预算写 0 = 不限,和 Codex 默认的 unbounded 对齐。
test('轮数预算为 0 时不因轮数停止', () => {
  const { action } = decide(
    makeGoal({ turns: 9999, budget: { maxTurns: 0, maxMinutes: 0 } }),
    obs()
  )
  assert.equal(action.type, 'continue')
})

test('时长预算为 0 时不因时长停止', () => {
  const g = makeGoal({ budget: { maxTurns: 0, maxMinutes: 0 } })
  const { action } = decide(g, obs({ now: T0 + 100 * 3600_000 }))
  assert.equal(action.type, 'continue')
})

test('时长预算按活跃时长算,目标停着的时间不扣预算', () => {
  // 这就是「resume 接回来预算就没了」的根因:原来用 now - startedAt,
  // 目标 aborted 躺一晚上,第二天接回来直接判 budget_exhausted,而它一分钟活都没干。
  const g = makeGoal({
    budget: { maxTurns: 0, maxMinutes: 60 },
    startedAt: T0 - 48 * 60 * 60_000, // 两天前起的
    activeMs: 10 * 60_000 // 但只真跑了 10 分钟
  })
  const { action } = decide(g, obs({ now: T0 }))
  assert.notEqual(action.state, 'budget_exhausted', '躺着的时间不该扣预算')
})

test('活跃时长真的用满了才算预算耗尽', () => {
  const g = makeGoal({ budget: { maxTurns: 0, maxMinutes: 60 }, activeMs: 61 * 60_000 })
  const { action } = decide(g, obs({ now: T0 + 60_000 }))
  assert.equal(action.state, 'budget_exhausted')
})

test('老记录没有 activeMs 时退回墙钟,不因字段缺失就变成不限', () => {
  const g = makeGoal({ budget: { maxTurns: 0, maxMinutes: 60 } })
  assert.equal(g.activeMs, undefined)
  const { action } = decide(g, obs({ now: T0 + 61 * 60_000 }))
  assert.equal(action.state, 'budget_exhausted')
})

test('完成声明被驳回后,工作区基线也要更新 —— 否则下一轮的取证会算上这一轮', () => {
  // 实况 bug:lastSnapshot 原来写在函数末尾,而「声称完成」那一块的 return 全在它之前。
  // 结果第 4 轮声称完成被驳回,基线停在第 3 轮,第 5 轮的「本轮改了什么」把第 4 轮也算了进去。
  const g = makeGoal({ acceptance: { commands: ['judge'] }, lastSnapshot: tree('old') })
  const { goal } = decide(
    g,
    obs({
      sentinel: { kind: 'complete', summary: '做完了' },
      snapshot: tree('new'),
      acceptance: {
        passed: false,
        results: [{ command: 'judge', ok: false, code: 1, output: 'x' }]
      }
    })
  )
  assert.equal(goal.lastSnapshot.tree, 'new')
})

test('反复声称完成也躲不开空转判定', () => {
  // 基线不更新的次生危害:每次声称完成都绕过基线更新,空转计数就永远起不来。
  let g = makeGoal({
    acceptance: { commands: ['judge'] },
    lastSnapshot: tree('same'),
    budget: { maxTurns: 0, maxMinutes: 0 }
  })
  const claim = {
    sentinel: { kind: 'complete', summary: '做完了' },
    snapshot: tree('same'),
    acceptance: { passed: false, results: [{ command: 'judge', ok: false, code: 1, output: 'x' }] }
  }
  for (let i = 0; i < 3; i++) {
    g = decide(g, obs(claim)).goal
  }
  // 三轮一个字没改,基线必须一直跟着走,后面普通轮次才判得出空转
  assert.equal(g.lastSnapshot.tree, 'same')
})

test('声称完成被驳回的那一轮改了一大片,空转计数要清零', () => {
  // 原来空转计数只在普通轮次里更新,于是「大改一片 + 声称完成 + 验收没过」那一轮
  // 既不清零也不累加,前后两个空轮就凑够阈值,判词却说「连续 3 轮零变化」。
  const g = makeGoal({
    stallCount: 2,
    acceptance: { commands: ['judge'] },
    lastSnapshot: tree('a')
  })
  const { goal } = decide(
    g,
    obs({
      sentinel: { kind: 'complete', summary: '做完了' },
      snapshot: tree('b'), // 工作区确实变了
      acceptance: {
        passed: false,
        results: [{ command: 'judge', ok: false, code: 1, output: 'x' }]
      }
    })
  )
  assert.equal(goal.stallCount, 0)
})

test('门禁没判成时不记假完成 —— 那是守卫自己的故障,不是 agent 撒谎', () => {
  // 实测发生过:codex 配的模型不可用,验收秒失败,falseClaims 照涨到 2,
  // 再来一次就会以「连续 3 次声称完成但验收未通过」终结目标,把配置问题写成 agent 的诚信问题。
  const g = makeGoal({ acceptance: { commands: ['judge'] }, falseClaims: 2 })
  const { action, goal } = decide(
    g,
    obs({
      sentinel: { kind: 'complete', summary: '做完了' },
      acceptance: {
        passed: false,
        inconclusive: true,
        results: [
          { command: 'judge', ok: false, inconclusive: true, code: 3, output: '裁判没给出判词' }
        ]
      }
    })
  )
  assert.equal(goal.falseClaims, 2, '假完成计数不该涨')
  assert.equal(action.type, 'continue')
  assert.equal(action.prompt, 'gate-unavailable', '要用如实说明门禁坏了的提示词,不是驳回提示词')
})

test('门禁连续判不成就叫人,而且说清不是 agent 的问题', () => {
  const g = makeGoal({ acceptance: { commands: ['judge'] }, gateFailures: 1 })
  const { action } = decide(
    g,
    obs({
      sentinel: { kind: 'complete', summary: '做完了' },
      acceptance: {
        passed: false,
        inconclusive: true,
        results: [{ command: 'judge', ok: false, inconclusive: true, code: 3 }]
      }
    })
  )
  assert.equal(action.type, 'finish')
  assert.match(action.reason, /不是 agent 的问题/)
})

test('门禁恢复正常后,之前的失败计数要清零', () => {
  const g = makeGoal({ acceptance: { commands: ['judge'] }, gateFailures: 1 })
  const { goal } = decide(
    g,
    obs({
      sentinel: { kind: 'complete', summary: '做完了' },
      acceptance: {
        passed: false,
        results: [{ command: 'judge', ok: false, code: 1, output: 'FAIL 还差三条' }]
      }
    })
  )
  assert.equal(goal.gateFailures, 0)
  assert.equal(goal.falseClaims, 1, '这次是真判了没过,该计数')
})

test('默认(ask):声称受阻到阈值不终结目标,停下叫人', () => {
  // 说「完成」要过全部裁判,说「受阻」原来零核实、两轮就下班 —— 想收工的 agent 最省事的路径。
  const g = makeGoal({ blockedClaims: 1 })
  const { action, goal } = decide(
    g,
    obs({ sentinel: { kind: 'blocked', summary: '缺 Figma 权限' } })
  )
  assert.equal(action.type, 'await-user')
  assert.match(action.reason, /缺 Figma 权限/)
  assert.equal(goal.state, 'active', '不该被判成结束')
})

test('verify 模式:声称受阻先跑一次验收', () => {
  const g = makeGoal({ blockedClaims: 1, onBlocked: 'verify', acceptance: { commands: ['judge'] } })
  const { action } = decide(g, obs({ sentinel: { kind: 'blocked', summary: '卡住了' } }))
  assert.equal(action.type, 'verify')
  assert.equal(action.because, 'blocked-claim')
})

test('verify 模式:验收全绿就证伪了「受阻」,继续跑', () => {
  const g = makeGoal({ blockedClaims: 1, onBlocked: 'verify', acceptance: { commands: ['judge'] } })
  const { action, goal } = decide(
    g,
    obs({
      sentinel: { kind: 'blocked', summary: '卡住了' },
      acceptance: { passed: true, results: [{ command: 'judge', ok: true, code: 0 }] }
    })
  )
  assert.equal(action.type, 'continue')
  assert.equal(action.prompt, 'blocked-but-passing')
  assert.equal(goal.blockedClaims, 0, '被证伪了就该清零')
})
