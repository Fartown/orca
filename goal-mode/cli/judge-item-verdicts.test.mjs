// 条目级判词的解析契约:只认声明过的 id,缺失/重复/解析失败一律 inconclusive。
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  encodeItemsMarker,
  extractItemVerdicts,
  itemsPromptSection,
  overallExitCode,
  parseItemVerdicts
} from './judge-item-verdicts.mjs'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

test('代码块里的 JSON 判词按声明 id 逐条取出,退出码全过为 0', () => {
  const text = `核对过程...\n\`\`\`json\n${JSON.stringify({
    verdicts: [
      { id: A, status: 'passed', reason: 'README 第 3 行已写' },
      { id: B, status: 'passed', reason: '测试文件存在' }
    ]
  })}\n\`\`\``
  const { verdicts, problems } = parseItemVerdicts(text, [A, B])
  assert.deepEqual(verdicts, [
    { id: A, status: 'passed', reason: 'README 第 3 行已写' },
    { id: B, status: 'passed', reason: '测试文件存在' }
  ])
  assert.deepEqual(problems, [])
  assert.equal(overallExitCode(verdicts), 0)
})

test('没答到的条目、清单外的 id、重复回答都不能变成通过', () => {
  const text = JSON.stringify({
    verdicts: [
      { id: A, status: 'passed' },
      { id: A, status: 'passed' },
      { id: 'not-declared', status: 'passed' }
    ]
  })
  const { verdicts, problems } = parseItemVerdicts(text, [A, B])
  assert.equal(verdicts[0].status, 'inconclusive', '重复回答记 inconclusive')
  assert.equal(verdicts[1].status, 'inconclusive', '没回答记 inconclusive')
  assert.equal(overallExitCode(verdicts), 3)
  assert.ok(problems.some((p) => p.includes('not-declared')))
})

test('解析不出 JSON 或 status 不合法:全部 inconclusive;有 failed 时退出码 1', () => {
  const none = parseItemVerdicts('PASS\n都做完了', [A])
  assert.deepEqual(none.verdicts, [
    { id: A, status: 'inconclusive', reason: '裁判没有输出可解析的 JSON 判词' }
  ])
  const bad = parseItemVerdicts(JSON.stringify({ verdicts: [{ id: A, status: 'done' }] }), [A])
  assert.equal(bad.verdicts[0].status, 'inconclusive')
  const failed = parseItemVerdicts(
    JSON.stringify({
      verdicts: [
        { id: A, status: 'failed', reason: '缺测试' },
        { id: B, status: 'passed' }
      ]
    }),
    [A, B]
  )
  assert.equal(overallExitCode(failed.verdicts), 1)
})

test('gate 从输出第一行摘出判词行,其余文本原样保留', () => {
  const verdicts = [{ id: A, status: 'passed', reason: 'ok' }]
  const output = `${encodeItemsMarker(verdicts)}\nPASS\n✓ 条目一 —— ok\n`
  const extracted = extractItemVerdicts(output)
  assert.deepEqual(extracted.items, verdicts)
  assert.equal(extracted.output, 'PASS\n✓ 条目一 —— ok\n')
  assert.deepEqual(extractItemVerdicts('普通命令输出'), { items: null, output: '普通命令输出' })
  assert.equal(extractItemVerdicts('ORCA_GOAL_JUDGE_ITEMS not-json\nrest').items, null)
})

test('提示词里列出固定 id 和输出契约,备注可选', () => {
  const section = itemsPromptSection([{ id: A, description: ' 首页可访问 ' }], '整体说明')
  assert.match(section, new RegExp(`- \\[${A}\\] 首页可访问`))
  assert.match(section, /<acceptance_notes>\n整体说明\n<\/acceptance_notes>/)
  assert.match(section, /"verdicts"/)
  assert.doesNotMatch(itemsPromptSection([{ id: A, description: 'x' }], ''), /acceptance_notes/)
})
