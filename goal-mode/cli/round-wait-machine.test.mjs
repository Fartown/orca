// 「这一轮结束了没有」的全部阈值,直接喂事件序列来测:零 mock、零 sleep、零真实时钟。
// 这段逻辑原来长在循环里,只能靠 mock 掉 git/终端/验收再真 sleep 才驱动得动,
// 于是它成了事故最密集的一段,而测试只能事后补在「它应该长什么样」上 ——
// 有两条甚至退化成了正则匹配源码,重构一移位就集体误报。
import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceWait, initialWaitState } from './round-wait-machine.mjs'

const T0 = 1_700_000_000_000
const limits = {
  startMs: 300_000,
  stuckMs: 1_200_000,
  observeGraceMs: 180_000,
  longRunMs: 1_800_000
}

/** 依次喂事件,返回最后一步的结果和路上所有的 notice。 */
function run(events) {
  let state = initialWaitState(T0)
  let outcome = { type: 'wait' }
  const notices = []
  for (const e of events) {
    const step = advanceWait(state, e, limits)
    state = step.state
    outcome = step.outcome
    notices.push(...step.notices)
    if (outcome.type !== 'wait') break
  }
  return { state, outcome, notices }
}

const busy = (t) => ({ ok: true, now: T0 + t, verdict: 'busy', source: 'hook' })
const quiet = (t) => ({ ok: true, now: T0 + t, verdict: 'quiet' })
const finished = (t) => ({ ok: true, now: T0 + t, verdict: 'finished' })
const needsUser = (t) => ({ ok: true, now: T0 + t, verdict: 'needs-user', toolName: 'Bash' })
const failed = (t, m = 'CLI 挂了') => ({ ok: false, now: T0 + t, message: m })

test('本轮的 finished 直接采信', () => {
  assert.equal(run([busy(1000), finished(2000)]).outcome.type, 'done')
})

test('没见它动过的 quiet 不算结束 —— 那是注入刚发出去还没接管', () => {
  assert.equal(run([quiet(1000), quiet(2000)]).outcome.type, 'wait')
})

test('见它动过之后的 quiet 才算这一轮跑完', () => {
  assert.equal(run([busy(1000), quiet(2000)]).outcome.type, 'done')
})

test('注入后一直没动静 → 到 startMs 判失败', () => {
  const r = run([quiet(1000), quiet(limits.startMs + 1)])
  assert.equal(r.outcome.type, 'failure')
  assert.match(r.outcome.reason, /毫无动静/)
})

test('等你确认期间不算「没动静」,而且等待时长要还给计时器', () => {
  // 实测过的事故:announcedNeedsUser 只置位不复位,本轮只要等过一次人,
  // 两道超时就对整轮永久失效 —— agent 之后崩掉也没人管。
  const waited = limits.startMs * 2
  const r = run([needsUser(1000), needsUser(waited), quiet(waited + 1000)])
  assert.equal(r.outcome.type, 'wait', '等人的这段时间不能把它判成没动静')
  assert.equal(r.notices.filter((n) => n.kind === 'needs-user').length, 1, '只提醒一次')
})

test('从等你确认里出来之后,两道超时重新起算', () => {
  const waited = limits.startMs * 2
  const r = run([needsUser(1000), quiet(waited), quiet(waited + limits.startMs - 1000)])
  assert.equal(r.outcome.type, 'wait', '不该拿等人的时间去凑 startMs')
})

test('等过人之后 agent 崩了,闸门仍然要生效 —— 不能对整轮永久失效', () => {
  const waited = 60_000
  const r = run([needsUser(1000), quiet(waited), quiet(waited + limits.startMs + 1)])
  assert.equal(r.outcome.type, 'failure')
})

test('干活期间不判卡死,不在干活才判', () => {
  const long = limits.stuckMs * 3
  // 一直 busy:再久也不停 —— 长任务腰斩比卡死更糟
  assert.equal(run([busy(1000), busy(long), busy(long * 2)]).outcome.type, 'wait')
  // 动过之后长时间不动:到 stuckMs 判失败
  const r = run([busy(1000), quiet(2000 + limits.stuckMs)])
  assert.equal(r.outcome.type, 'done', 'quiet + 动过 = 结束,不是卡死')
})

test('观察偶发失败要重试,连续失败够久才算联系不上', () => {
  assert.equal(run([failed(1000), failed(2000), busy(3000)]).outcome.type, 'wait')
  const r = run([failed(1000), failed(1000 + limits.observeGraceMs + 1)])
  assert.equal(r.outcome.type, 'failure')
  assert.match(r.outcome.reason, /观察不到终端/)
})

test('观察恢复正常要说一声,并且不再重复报错', () => {
  const r = run([failed(1000), busy(2000), failed(3000)])
  assert.equal(r.notices.filter((n) => n.kind === 'observe-failed').length, 2)
  assert.equal(r.notices.filter((n) => n.kind === 'observe-recovered').length, 1)
})

test('终端断开立即判失败', () => {
  const r = run([{ ok: true, now: T0 + 1000, verdict: 'disconnected' }])
  assert.equal(r.outcome.type, 'failure')
  assert.match(r.outcome.reason, /断开/)
})

test('长时间干活提醒一次,不重复刷屏', () => {
  const r = run([busy(1000), busy(limits.longRunMs + 1000), busy(limits.longRunMs + 2000)])
  assert.equal(r.notices.filter((n) => n.kind === 'long-run').length, 1)
})

// C4:陈旧的 working 不该无条件采信 —— 它是最容易陈旧的一档
// (上一轮被打断、agent 崩了、Stop hook 没发出来)。无条件采信会让卡死闸门永远差一步。
test('陈旧的 working 只有终端还在动时才算忙', async () => {
  const { classifyRound } = await import('./terminal-activity.mjs')
  const now = T0
  const stale = {
    connected: true,
    state: 'working',
    stateStartedAt: now - 3_600_000,
    spinning: false
  }
  assert.equal(
    classifyRound({ ...stale, silentMs: 3_600_000 }, now - 1000, 12_000),
    'quiet',
    '一小时没输出还判 busy,卡死闸门就永远差一步'
  )
  assert.equal(classifyRound({ ...stale, silentMs: 1000 }, now - 1000, 12_000), 'busy')
  // 本轮产生的 working 仍然直接采信,和终端静不静无关
  const fresh = { connected: true, state: 'working', stateStartedAt: now, silentMs: 3_600_000 }
  assert.equal(classifyRound(fresh, now - 1000, 12_000), 'busy')
})
