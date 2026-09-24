// 驱动只剩预算与守卫结论的落点;没有空转、假完成、受阻计数这类终局。
import assert from 'node:assert/strict'
import test from 'node:test'
import { planVerdict, timeBudgetReason, turnBudgetReason } from './goal-decision.mjs'

const goal = (over = {}) => ({
  turns: 1,
  activeMs: 0,
  budget: { maxTurns: 5, maxMinutes: 60 },
  ...over
})
const verdict = (decision, instruction = '') => ({ decision, instruction })

test('四种结论各自落到一个动作', () => {
  assert.deepEqual(planVerdict(goal(), verdict('wait')), { type: 'wait' })
  assert.deepEqual(planVerdict(goal(), verdict('instruct', '去改 a.ts')), { type: 'send' })
  assert.deepEqual(planVerdict(goal(), verdict('ask_user', '先做 B')), { type: 'send' })
  assert.deepEqual(planVerdict(goal(), verdict('ask_user')), { type: 'wait' })
  assert.deepEqual(planVerdict(goal(), verdict('done')), { type: 'verify' })
})

test('轮数用完只挡新的一轮:最后一轮之后守卫仍能判完成,也能等', () => {
  const spent = goal({ turns: 5 })
  assert.deepEqual(planVerdict(spent, verdict('done')), { type: 'verify' })
  assert.deepEqual(planVerdict(spent, verdict('wait')), { type: 'wait' })
  assert.deepEqual(planVerdict(spent, verdict('instruct', 'x')), {
    type: 'budget',
    reason: '轮数预算耗尽(5/5 轮)'
  })
})

test('时长用完时结论只能是完成或收尾', () => {
  const spent = goal({ activeMs: 60 * 60_000 })
  assert.deepEqual(planVerdict(spent, verdict('done')), { type: 'verify' })
  assert.equal(planVerdict(spent, verdict('wait')).type, 'budget')
  assert.equal(planVerdict(spent, verdict('instruct', 'x')).type, 'budget')
})

test('预算写 0 表示不限', () => {
  const unlimited = goal({
    turns: 999,
    activeMs: 99 * 60 * 60_000,
    budget: { maxTurns: 0, maxMinutes: 0 }
  })
  assert.equal(timeBudgetReason(unlimited), null)
  assert.equal(turnBudgetReason(unlimited), null)
  assert.deepEqual(planVerdict(unlimited, verdict('instruct', 'x')), { type: 'send' })
})
