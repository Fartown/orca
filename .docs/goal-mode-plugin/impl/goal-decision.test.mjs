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

test('声称受阻一次不停,到阈值才停', () => {
  const first = decide(makeGoal(), obs({ sentinel: { kind: 'blocked', summary: '缺凭证' } }))
  assert.equal(first.action.type, 'continue')
  assert.equal(first.goal.blockedClaims, 1)

  const second = decide(first.goal, obs({ sentinel: { kind: 'blocked', summary: '缺凭证' } }))
  assert.equal(second.action.type, 'finish')
  assert.equal(second.action.state, 'blocked')
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

test('验收绿了但有未质证的削弱痕迹 → 不结束,先挡回去问一轮', () => {
  const { action, goal } = decide(makeGoal({ tamperFindings: [tamper()] }), obs(claimOk))
  assert.equal(action.type, 'continue')
  assert.equal(action.prompt, 'tamper-challenge')
  assert.equal(goal.tamperChallenges, 1)
  assert.ok(goal.tamperFindings.every((f) => f.acknowledged))
})

test('质证过一轮后再声称完成 → 放行', () => {
  const g = makeGoal({ tamperFindings: [tamper({ acknowledged: true })], tamperChallenges: 1 })
  assert.equal(decide(g, obs(claimOk)).action.state, 'complete')
})

test('被挡回后仍在削弱,超过上限 → 判定受阻', () => {
  const g = makeGoal({
    tamperFindings: [tamper({ acknowledged: true }), tamper()],
    tamperChallenges: DEFAULT_THRESHOLDS.maxTamperChallenges
  })
  const { action } = decide(g, obs(claimOk))
  assert.equal(action.type, 'finish')
  assert.equal(action.state, 'blocked')
})

test('只改测试没削弱(challenge=false)不挡完成', () => {
  const g = makeGoal({ tamperFindings: [tamper({ kind: 'test-only-edit', challenge: false })] })
  assert.equal(decide(g, obs(claimOk)).action.state, 'complete')
})

// 循环每轮调两次 decide,两次都从本轮起点的 goal 出发(先判要不要验收,再带验收结果判)。
// 曾经在这里漏掉本轮发现,导致挡板对「同一轮里既削弱又声称完成」完全失效。
test('同一轮里既留下削弱痕迹又声称完成 → 挡板必须生效', () => {
  const goal = makeGoal()
  const findings = [tamper()]
  const first = decide(goal, obs({ sentinel: { kind: 'complete', summary: 's' }, findings }))
  assert.equal(first.action.type, 'verify')

  const second = decide(goal, obs({ ...claimOk, findings }))
  assert.equal(second.action.type, 'continue')
  assert.equal(second.action.prompt, 'tamper-challenge')
  assert.equal(second.goal.tamperFindings.length, 1, '两次调用不应重复累加')
})

test('回应质证时又碰到同一处 → 不重复质证(否则质证套质证会误判受阻)', () => {
  const f = tamper({ key: 'gate-config-edited:package.json' })
  const round1 = decide(makeGoal(), obs({ ...claimOk, findings: [f] }))
  assert.equal(round1.action.prompt, 'tamper-challenge')
  assert.deepEqual(round1.goal.suppressedKeys, [f.key])

  const round2 = decide(round1.goal, obs({ ...claimOk, findings: [f] }))
  assert.equal(round2.action.state, 'complete', '同一处发现紧接着再出现不应再挡')
})

test('压制只管一轮 —— 隔一轮同一处又被削弱,仍然要质证', () => {
  const f = tamper({ key: 'assertions-removed:a.test.js' })
  const r1 = decide(makeGoal(), obs({ ...claimOk, findings: [f] }))
  const r2 = decide(r1.goal, obs({ ...claimOk, findings: [f] })) // 被压制,放行
  assert.deepEqual(r2.goal.suppressedKeys, [])
  const r3 = decide(r2.goal, obs({ ...claimOk, findings: [f] }))
  assert.equal(r3.action.prompt, 'tamper-challenge')
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
