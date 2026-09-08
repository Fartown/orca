// 整体模式裁判端到端:一条验收项都没有时,裁判对目标正文整体判定。
//
// 全部围绕同一条规矩:只有裁判明确说 PASS 才是通过;说 FAIL 是未通过;其余一切
// (散文、PASSED、裁判起不来、超时、读不到输入)都是「没判成」,退 3,绝不退 1 ——
// 退 1 会被上游记成 agent 假报完成。
import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { runAcceptance } from './acceptance-gate.mjs'
import { quoteForShell } from './goal-record-projection.mjs'
import { ITEMS_MARKER } from './judge-item-verdicts.mjs'
import { GOAL_WHOLE_VERDICT_ID } from './judge-whole-verdict.mjs'

const run = promisify(execFile)
const JUDGE = new URL('./acceptance-judge.mjs', import.meta.url).pathname
const DIR = await mkdtemp(path.join(tmpdir(), 'goal-judge-whole-'))
after(() => rm(DIR, { recursive: true, force: true }))

const CRITERIA = path.join(DIR, 'judge-criteria.md')
await writeFile(CRITERIA, '做完 X\n\n整体说明\n')

/** 假裁判:把固定判词写进 --output-last-message 指向的文件。 */
async function fakeAgent(name, verdictText) {
  const file = path.join(DIR, name)
  await writeFile(
    file,
    `#!/usr/bin/env node\nconst i = process.argv.indexOf('--output-last-message')\nrequire('node:fs').writeFileSync(process.argv[i + 1], ${JSON.stringify(verdictText)})\n`
  )
  await chmod(file, 0o755)
  return file
}

/** @returns {{code: number, stdout: string, marker: object[] | null}} */
async function judge(argv, agentPath) {
  const result = await run(process.execPath, [JUDGE, ...argv], {
    env: { ...process.env, ...(agentPath ? { ORCA_GOAL_JUDGE_TEST_AGENT: agentPath } : {}) }
  }).catch((error) => error)
  const stdout = result.stdout ?? ''
  const first = stdout.split('\n')[0] ?? ''
  return {
    code: result.code ?? 0,
    stdout,
    stderr: result.stderr ?? '',
    marker: first.startsWith(ITEMS_MARKER)
      ? JSON.parse(first.slice(ITEMS_MARKER.length)).verdicts
      : null
  }
}

const base = (agentPath) => [
  '--agent',
  agentPath,
  '--criteria-file',
  CRITERIA,
  '--cwd',
  DIR,
  '--timeout',
  '30'
]

test('PASS:退 0,判词行挂在保留 id 上,原文跟在后面', async () => {
  const agent = await fakeAgent('judge-pass', 'PASS')
  const { code, stdout, marker } = await judge(base(agent), agent)
  assert.equal(code, 0)
  assert.deepEqual(marker, [{ id: GOAL_WHOLE_VERDICT_ID, status: 'passed', reason: 'PASS' }])
  assert.equal(stdout.split('\n')[1], 'PASS')
})

test('FAIL:退 1,判词原文完整保留给面板', async () => {
  const verdict = 'FAIL: docs/usage.md 里没有用法一节\n证据: rg 未命中'
  const agent = await fakeAgent('judge-fail', verdict)
  const { code, marker } = await judge(base(agent), agent)
  assert.equal(code, 1)
  assert.equal(marker[0].status, 'failed')
  assert.equal(marker[0].reason, verdict)
})

test('没表态的散文:退 3 不退 1 —— 这才不会被记成 agent 假报完成', async () => {
  const agent = await fakeAgent('judge-prose', '我没法核实,仓库里看不到构建产物')
  const { code, marker } = await judge(base(agent), agent)
  assert.equal(code, 3)
  assert.equal(marker[0].status, 'inconclusive')
  assert.match(marker[0].reason, /^裁判没有以 PASS 或 FAIL 开头表态/)
})

test('INCONCLUSIVE 是裁判的正当答案,原因照抄', async () => {
  const agent = await fakeAgent('judge-inconclusive', 'INCONCLUSIVE 只读沙箱挡住了 pnpm build')
  const { code, marker } = await judge(base(agent), agent)
  assert.equal(code, 3)
  assert.equal(marker[0].status, 'inconclusive')
  assert.match(marker[0].reason, /只读沙箱/)
})

test('PASSED 不是 PASS —— 词边界之外的东西一律不算通过', async () => {
  const agent = await fakeAgent('judge-passed', 'PASSED 了')
  const { code, marker } = await judge(base(agent), agent)
  assert.equal(code, 3)
  assert.equal(marker[0].status, 'inconclusive')
})

test('裁判自己报错的那句话不能被读成「判定为否」', async () => {
  const agent = await fakeAgent('judge-error-text', '验收裁判报错:模型不可用')
  const { code, marker } = await judge(base(agent), agent)
  assert.equal(code, 3)
  assert.equal(marker[0].status, 'inconclusive')
})

test('裁判起不来:也要交出一条判词行,面板才知道是工具坏了', async () => {
  const missing = path.join(DIR, 'no-such-judge')
  const { code, marker } = await judge(base(missing), missing)
  assert.equal(code, 3)
  assert.equal(marker.length, 1)
  assert.equal(marker[0].id, GOAL_WHOLE_VERDICT_ID)
  assert.match(marker[0].reason, /无法执行/)
})

test('读不到或空的验收标准文件:退 3 并说清楚是哪个文件', async () => {
  const agent = await fakeAgent('judge-unused', 'PASS')
  const missing = await judge(
    ['--agent', agent, '--criteria-file', path.join(DIR, 'does-not-exist.md'), '--cwd', DIR],
    agent
  )
  assert.equal(missing.code, 3)
  assert.match(missing.marker[0].reason, /does-not-exist\.md/)
  const blank = path.join(DIR, 'blank.md')
  await writeFile(blank, '   \n')
  const empty = await judge(['--agent', agent, '--criteria-file', blank, '--cwd', DIR], agent)
  assert.equal(empty.code, 3)
  assert.equal(empty.marker[0].status, 'inconclusive')
})

test('条目清单是空的:当整体模式处理,不再退 2 被 gate 读成失败', async () => {
  const items = path.join(DIR, 'empty-items.json')
  await writeFile(items, JSON.stringify({ items: [], notes: '' }))
  const agent = await fakeAgent('judge-empty-items', 'PASS')
  const { code, marker } = await judge(
    ['--agent', agent, '--items-file', items, '--cwd', DIR],
    agent
  )
  assert.equal(code, 3)
  assert.equal(marker[0].id, GOAL_WHOLE_VERDICT_ID)
})

test('用法错误仍然退 2,而且不吐判词行', async () => {
  const noInput = await judge(['--cwd', DIR])
  assert.equal(noInput.code, 2)
  assert.equal(noInput.marker, null)
  const bogus = await judge(['--bogus', 'x'])
  assert.equal(bogus.code, 2)
  assert.equal(bogus.marker, null)
})

test('端到端:gate 摘出判词行,回灌文本里不留标记', async () => {
  const pass = await fakeAgent('judge-gate-pass', 'PASS')
  const command = [
    quoteForShell(process.execPath),
    quoteForShell(JUDGE),
    '--agent',
    quoteForShell(pass),
    '--criteria-file',
    quoteForShell(CRITERIA),
    '--cwd',
    quoteForShell(DIR),
    '--timeout',
    '30'
  ].join(' ')
  const accepted = await runAcceptance(
    { commands: [command], timeoutMs: 60_000, cwd: DIR, all: false },
    { env: { ORCA_GOAL_JUDGE_TEST_AGENT: pass } }
  )
  assert.equal(accepted.passed, true)
  assert.equal(accepted.inconclusive, false)
  assert.deepEqual(accepted.results[0].items, [
    { id: GOAL_WHOLE_VERDICT_ID, status: 'passed', reason: 'PASS' }
  ])
  assert.doesNotMatch(accepted.results[0].output, /ORCA_GOAL_JUDGE_ITEMS/)
  // 判词原文照样在回灌文本里。不断言它在第一行:gate 把 stderr 也并进 output,而源码模式下
  // Node 会为 .mjs 导入 .ts 先打一条 MODULE_TYPELESS_PACKAGE_JSON 警告(打包后的裁判没有)。
  assert.match(accepted.results[0].output, /(?:^|\n)PASS\s*$/)

  const prose = await fakeAgent('judge-gate-prose', '看不出来')
  const proseResult = await runAcceptance(
    {
      commands: [command.replace(quoteForShell(pass), quoteForShell(prose))],
      timeoutMs: 60_000,
      cwd: DIR,
      all: false
    },
    { env: { ORCA_GOAL_JUDGE_TEST_AGENT: prose } }
  )
  assert.equal(proseResult.passed, false)
  assert.equal(proseResult.inconclusive, true)
  assert.equal(proseResult.results[0].items[0].status, 'inconclusive')
})
