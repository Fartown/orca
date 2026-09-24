// 待答问题一直保留到解决;同一个问题在一个目标里只通知一次。
import assert from 'node:assert/strict'
import test from 'node:test'
import { addNotice, applyQuestion, NOTICE_LIMIT, resolveNotices } from './goal-notices.mjs'

const open = (goal) => (goal.notices || []).filter((n) => !n.resolvedAt)

test('提出问题:记为待答并产生一条通知', () => {
  const goal = applyQuestion({}, '需要一次性验证码', 1)
  assert.deepEqual(goal.awaitingUser, { reason: '需要一次性验证码', since: 1 })
  assert.equal(open(goal).length, 1)
  assert.equal(open(goal)[0].kind, 'question')
})

test('问题没变:不重发,也不刷新提出时间', () => {
  const first = applyQuestion({}, 'Q', 1)
  const again = applyQuestion(first, 'Q', 99)
  assert.equal(again, first)
})

test('问题解决(守卫给空字符串):清掉待答,通知失效', () => {
  const goal = applyQuestion(applyQuestion({}, 'Q', 1), '', 2)
  assert.equal(goal.awaitingUser, null)
  assert.equal(open(goal).length, 0)
})

test('A → B → A:回到问过的问题不再通知', () => {
  let goal = applyQuestion({}, 'A', 1)
  goal = applyQuestion(goal, 'B', 2)
  goal = applyQuestion(goal, 'A', 3)
  assert.equal(goal.awaitingUser.reason, 'A')
  assert.equal(goal.notices.filter((n) => n.kind === 'question').length, 2, 'A 和 B 各一次')
  assert.equal(open(goal).length, 0, '回到 A 时不再产生新通知')
})

test('通知最多保留 20 条;失效只影响同一类', () => {
  let goal = {}
  for (let i = 0; i < NOTICE_LIMIT + 5; i += 1) {
    goal = addNotice(goal, i % 2 ? 'budget' : 'driver-fault', `n${i}`, i)
  }
  assert.equal(goal.notices.length, NOTICE_LIMIT)
  goal = resolveNotices(goal, 'driver-fault', 100)
  assert.ok(goal.notices.filter((n) => n.kind === 'budget').every((n) => !n.resolvedAt))
  assert.ok(
    goal.notices.filter((n) => n.kind === 'driver-fault').every((n) => n.resolvedAt === 100)
  )
})
