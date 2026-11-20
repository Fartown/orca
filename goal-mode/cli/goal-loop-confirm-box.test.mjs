// 确认框由守卫处理(方案 §3.5):守卫给意见时驱动按键,没给时行为不变。
//
// 需要 `node --test --experimental-test-module-mocks`。
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  done,
  goal,
  instruct,
  loadLoop,
  makeWorld,
  report,
  scriptedGuard
} from './goal-loop-test-world.mjs'

// —— 确认框由守卫处理(方案 §3.5) ——

const CODEX_BOX = [
  '  Would you like to run the following command?',
  '  $ date > /tmp/out/a.txt',
  '› 1. Yes, proceed (y)',
  '  3. No, and tell Codex what to do differently (esc)',
  '  Press enter to confirm or esc to cancel'
]

/** 首轮发出后 agent 停在确认框;按了键框就消失,agent 接着干完这一轮。 */
function boxWorld() {
  const w = makeWorld()
  w.onSend = (text) => {
    if (w.sent.length === 1) {
      w.row = { ...w.row, state: 'waiting', stateStartedAt: Date.now() + 1, agentType: 'codex' }
      w.screen = CODEX_BOX
    } else {
      w.runTurn(text)
    }
  }
  w.onKeys = () => {
    w.screen = ['• Ran date']
    w.runTurn('')
  }
  return w
}

for (const [choice, key] of [
  ['approve', '1'],
  ['reject', '\x1b']
]) {
  test(`守卫 ${choice} 确认框:先按 ${JSON.stringify(key)},再把指示发出去`, async () => {
    const w = boxWorld()
    const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_CONFIRM_SETTLE_MS: '500' } })
    const guard = scriptedGuard([
      (input, n) => {
        assert.equal(n, 1)
        assert.match(input.vars.wakeReason, /确认框/)
        return instruct('换成写到 /tmp/out/b.txt', { confirmBox: choice })
      },
      done
    ])
    assert.equal((await runLoop(goal(), { report, callGuard: guard })).state, 'complete')
    assert.deepEqual(w.keys, [key])
    assert.equal(w.sent.length, 2)
    assert.match(w.sent[1], /换成写到/)
  })
}

test('守卫没给确认框意见:不按键,照旧不往确认框里发指示', async () => {
  const w = boxWorld()
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_GUARD_INTERVAL_MS: '40' } })
  const guard = scriptedGuard([
    instruct('x'),
    () => {
      assert.equal(w.sent.length, 1)
      return done
    }
  ])
  assert.equal((await runLoop(goal(), { report, callGuard: guard })).state, 'complete')
  assert.deepEqual(w.keys, [])
})

test('守卫判断期间确认框换了:不按键', async () => {
  const w = boxWorld()
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_GUARD_INTERVAL_MS: '40' } })
  const guard = scriptedGuard([
    () => {
      w.screen = CODEX_BOX.map((line) => line.replace('a.txt', 'other.txt'))
      return instruct('x', { confirmBox: 'approve' })
    },
    done
  ])
  assert.equal((await runLoop(goal(), { report, callGuard: guard })).state, 'complete')
  assert.deepEqual(w.keys, [])
})

test('Esc 取消后状态行仍停在等确认:画面上没有框就照发指示', async () => {
  const w = boxWorld()
  w.onKeys = () => {
    w.screen = ['  ⎿  Interrupted · What should Claude do instead?', '❯ ']
  }
  const { runLoop } = await loadLoop(w, { env: { ORCA_GOAL_CONFIRM_SETTLE_MS: '300' } })
  const guard = scriptedGuard([instruct('改写到 b.txt', { confirmBox: 'reject' }), done])
  assert.equal((await runLoop(goal(), { report, callGuard: guard })).state, 'complete')
  assert.deepEqual(w.keys, ['\x1b'])
  assert.match(w.sent[1], /改写到 b\.txt/)
})
