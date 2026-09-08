// 条目模式裁判端到端:假裁判按 --output-last-message 写判词,真正的 acceptance-judge 解析后
// 以判词行 + 退出码交给 gate,gate 把每条结果挂到验收结果上。
import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { execFile } from 'node:child_process'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { runAcceptance } from './acceptance-gate.mjs'
import { quoteForShell } from './goal-record-projection.mjs'

const run = promisify(execFile)
const JUDGE = new URL('./acceptance-judge.mjs', import.meta.url).pathname
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DIR = await mkdtemp(path.join(tmpdir(), 'goal-judge-items-'))
after(() => rm(DIR, { recursive: true, force: true }))

/** 假裁判:忽略提示词,把固定判词写进 --output-last-message 指向的文件。 */
async function fakeAgent(name, verdictText) {
  const file = path.join(DIR, name)
  await writeFile(
    file,
    `#!/usr/bin/env node\nconst i = process.argv.indexOf('--output-last-message')\nrequire('node:fs').writeFileSync(process.argv[i + 1], ${JSON.stringify(verdictText)})\n`
  )
  await chmod(file, 0o755)
  return file
}

async function itemsFile(name) {
  const file = path.join(DIR, name)
  await writeFile(
    file,
    JSON.stringify({
      items: [
        { id: A, description: '首页返回 200' },
        { id: B, description: '文档写了用法' }
      ],
      notes: '整体说明'
    })
  )
  return file
}

test('条目模式:判词行在第一行,退出码按条目汇总,缺项记 inconclusive', async () => {
  const agent = await fakeAgent(
    'judge-partial',
    `看过了。\n\`\`\`json\n${JSON.stringify({ verdicts: [{ id: A, status: 'passed', reason: '/ 返回 200' }] })}\n\`\`\``
  )
  const items = await itemsFile('items-1.json')
  const result = await run(
    process.execPath,
    [JUDGE, '--agent', agent, '--items-file', items, '--cwd', DIR, '--timeout', '30'],
    { env: { ...process.env, ORCA_GOAL_JUDGE_TEST_AGENT: agent } }
  ).catch((error) => error)
  assert.equal(result.code, 3, 'B 没有判词,整体无法判定')
  const [marker, verdictLine] = result.stdout.split('\n')
  assert.match(marker, /^ORCA_GOAL_JUDGE_ITEMS \{/)
  assert.deepEqual(JSON.parse(marker.slice('ORCA_GOAL_JUDGE_ITEMS '.length)).verdicts, [
    { id: A, status: 'passed', reason: '/ 返回 200' },
    { id: B, status: 'inconclusive', reason: '裁判没有对这一条给出结果' }
  ])
  assert.equal(verdictLine, 'INCONCLUSIVE')
  // 条目模式必须逐字不变:整体模式的保留 id 不许漏进来。
  assert.deepEqual(
    JSON.parse(marker.slice('ORCA_GOAL_JUDGE_ITEMS '.length)).verdicts.map((v) => v.id),
    [A, B]
  )
  assert.match(result.stdout, /✓ 首页返回 200/)
  assert.match(result.stdout, /\? 文档写了用法/)
})

test('gate 把判词行摘成 items,回灌文本里不再有那一行;全过时命令 ok', async () => {
  const agent = await fakeAgent(
    'judge-all',
    JSON.stringify({
      verdicts: [
        { id: A, status: 'passed', reason: 'ok' },
        { id: B, status: 'passed', reason: 'README 有用法' }
      ]
    })
  )
  const items = await itemsFile('items-2.json')
  const command = [
    quoteForShell(process.execPath),
    quoteForShell(JUDGE),
    '--agent',
    quoteForShell(agent),
    '--items-file',
    quoteForShell(items),
    '--cwd',
    quoteForShell(DIR),
    '--timeout',
    '30'
  ].join(' ')
  const acceptance = await runAcceptance(
    { commands: [command], timeoutMs: 60_000, cwd: DIR, all: false },
    { env: { ORCA_GOAL_JUDGE_TEST_AGENT: agent } }
  )
  assert.equal(acceptance.passed, true)
  const [judged] = acceptance.results
  assert.deepEqual(judged.items, [
    { id: A, status: 'passed', reason: 'ok' },
    { id: B, status: 'passed', reason: 'README 有用法' }
  ])
  assert.doesNotMatch(judged.output, /ORCA_GOAL_JUDGE_ITEMS/)
  // 不断言 PASS 在第一行:gate 把 stderr 也并进 output,而源码模式下 Node 会为 .mjs 导入 .ts
  // 先打一条 MODULE_TYPELESS_PACKAGE_JSON 警告(打包后的裁判没有这条)。
  assert.match(judged.output, /(?:^|\n)PASS\n/)
})

test('裁判起不来:每一条都记 inconclusive 并带上原因,退出码 3', async () => {
  const items = await itemsFile('items-3.json')
  const missing = path.join(DIR, 'no-such-judge')
  const result = await run(
    process.execPath,
    [JUDGE, '--agent', missing, '--items-file', items, '--cwd', DIR],
    { env: { ...process.env, ORCA_GOAL_JUDGE_TEST_AGENT: missing } }
  ).catch((error) => error)
  assert.equal(result.code, 3)
  const marker = result.stdout.split('\n')[0]
  const { verdicts } = JSON.parse(marker.slice('ORCA_GOAL_JUDGE_ITEMS '.length))
  assert.deepEqual(
    verdicts.map((v) => v.status),
    ['inconclusive', 'inconclusive']
  )
  assert.match(verdicts[0].reason, /无法执行/)
})
