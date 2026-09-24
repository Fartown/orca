// 什么时候叫守卫:每个结束事件只叫一次,定时兜底,没有「多久没动静就判失败」的出口。
import assert from 'node:assert/strict'
import test from 'node:test'
import { afterGuard, afterSend, detectWake, initialWakeState } from './round-wait-machine.mjs'

const LIMITS = { quietMs: 12_000, guardIntervalMs: 15 * 60_000 }
const hook = (activity, stateStartedAt) => ({ activity, stateStartedAt, hasRow: true })
const bare = (activity) => ({ activity, stateStartedAt: null, hasRow: false })

test('本轮结束唤醒一次;守卫回 wait 后状态仍是 done,不会立刻再叫', () => {
  let state = initialWakeState(0, 0)
  let step = detectWake(state, hook('ended', 100), 1_000, LIMITS)
  assert.equal(step.wake, 'turn-ended')
  state = afterGuard(step.state, 2_000)
  step = detectWake(state, hook('ended', 100), 3_000, LIMITS)
  assert.equal(step.wake, null, '同一个结束事件只消费一次')
  step = detectWake(step.state, hook('ended', 5_000), 6_000, LIMITS)
  assert.equal(step.wake, 'turn-ended', '新的结束事件照常唤醒')
})

test('monitoring 也算结束事件(只剩后台 shell 挂着)', () => {
  const step = detectWake(initialWakeState(0, 0), hook('ended', 50), 100, LIMITS)
  assert.equal(step.wake, 'turn-ended')
})

test('发出消息之前的结束事件不属于新的一轮', () => {
  const state = afterSend(initialWakeState(0, 0), 10_000)
  assert.equal(detectWake(state, hook('ended', 9_000), 11_000, LIMITS).wake, null)
  assert.equal(detectWake(state, hook('ended', 10_500), 11_000, LIMITS).wake, 'turn-ended')
})

test('Stop hook 丢了、状态一直是 working:定时唤醒兜底,不判失败', () => {
  const state = initialWakeState(0, 0)
  assert.equal(detectWake(state, hook('busy', 5), 14 * 60_000, LIMITS).wake, null)
  assert.equal(detectWake(state, hook('busy', 5), 15 * 60_000, LIMITS).wake, 'timer')
})

test('观察不到(断联)不产生结束事件,定时照走', () => {
  const state = initialWakeState(0, 0)
  assert.equal(detectWake(state, null, 1_000, LIMITS).wake, null)
  assert.equal(detectWake(state, null, 15 * 60_000, LIMITS).wake, 'timer')
})

test('没有状态行的 agent:见它动过、再安静下来才叫守卫', () => {
  let state = initialWakeState(0, 0)
  assert.equal(detectWake(state, bare('quiet'), 1_000, LIMITS).wake, null, '没见它动过不算')
  state = detectWake(state, bare('busy'), 2_000, LIMITS).state
  const step = detectWake(state, bare('quiet'), 3_000, LIMITS)
  assert.equal(step.wake, 'terminal-quiet')
  assert.equal(detectWake(step.state, bare('quiet'), 4_000, LIMITS).wake, null, '安静一次只叫一次')
})

test('需要确认(权限框)不唤醒;定时照走', () => {
  const state = initialWakeState(0, 0)
  assert.equal(detectWake(state, hook('needs-user', 10), 1_000, LIMITS).wake, null)
})
