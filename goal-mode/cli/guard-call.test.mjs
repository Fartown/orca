// 调一次守卫:格式不合格带着具体错误重跑一次,再不合格就算这次调用失败。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { callGuard, saveGuardCall } from './guard-call.mjs'

const vars = {
  wakeReason: 'r',
  objective: '目标',
  checklistPath: '/c.md',
  previousNote: 'n',
  digestPath: '/guard/1-transcript.md',
  transcriptPath: '/t.jsonl',
  orcaCommand: 'orca',
  terminalHandle: 'term_1',
  sessionDir: '不可用',
  changes: '无改动',
  checkFailures: '无',
  openQuestion: '无'
}
const good =
  '```json\n{"decision":"wait","observation":"在跑测试","instruction":"","question":"","note":"n"}\n```'
const input = { agent: 'codex', cwd: '/w', timeoutMs: 1000, vars }

test('第一次就合格:只调一次,守卫拿到的是完整的 G1', async () => {
  const prompts = []
  const result = await callGuard(input, {
    runAgent: async ({ prompt }) => {
      prompts.push(prompt)
      return { ok: true, text: good }
    }
  })
  assert.equal(result.ok, true)
  assert.equal(result.verdict.decision, 'wait')
  assert.equal(prompts.length, 1)
  assert.match(prompts[0], /你是这个目标的守卫/)
  assert.match(prompts[0], /\/t\.jsonl/)
})

test('格式不合格:带着具体错误重跑一次', async () => {
  const prompts = []
  const outputs = ['我觉得还行', good]
  const result = await callGuard(input, {
    runAgent: async ({ prompt }) => {
      prompts.push(prompt)
      return { ok: true, text: outputs.shift() }
    }
  })
  assert.equal(result.ok, true)
  assert.equal(prompts.length, 2)
  assert.match(prompts[1], /上一次的输出格式不合格:没有找到包含 decision 字段的 json 代码块/)
  assert.equal(result.attempts[0].formatError, '没有找到包含 decision 字段的 json 代码块')
})

test('两次都不合格,或守卫起不来:这次调用失败', async () => {
  const bad = await callGuard(input, { runAgent: async () => ({ ok: true, text: 'x' }) })
  assert.equal(bad.ok, false)
  assert.match(bad.reason, /两次输出的格式都不合格/)
  const down = await callGuard(input, {
    runAgent: async () => ({ ok: false, error: 'codex: command not found' })
  })
  assert.deepEqual([down.ok, down.reason], [false, 'codex: command not found'])
})

test('每次调用的全文留档', async () => {
  const dir = path.join(tmpdir(), `goal-guard-calls-${process.pid}`)
  const file = await saveGuardCall(dir, 3, { prompt: 'p', verdict: null })
  assert.equal(path.basename(file), '3.json')
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { prompt: 'p', verdict: null })
})
