// 什么时候叫守卫来看。纯函数:喂观察进去,吐唤醒原因出来;时钟和终端观察都留在调用方。
//
// 这里只产生「叫守卫来看」的事件,不判任何结局:没有「多久没动静就判失败」的出口。
// agent 卡住、没收到消息、hook 丢了,都由定时唤醒把守卫叫来,由守卫读对话记录后决定。

export const WAKE_DEFAULTS = {
  quietMs: 12_000, // 没有状态行时,终端安静多久算「可能结束了」
  guardIntervalMs: 15 * 60_000 // 定时唤醒(C15)
}

/**
 * @param {number} now
 * @param {number} consumedEndAt 已消费过的结束事件时刻。每个结束事件(状态行的 stateStartedAt)只唤醒一次:
 *   守卫回 wait 之后状态仍是 done,也不会立刻再叫一次。
 */
export function initialWakeState(now, consumedEndAt = 0) {
  return { consumedEndAt, lastGuardAt: now, sawBusy: false }
}

/** 发出一条消息之后:早于这一刻的结束事件都不属于新的一轮。 */
export function afterSend(state, sentAt) {
  return { ...state, consumedEndAt: Math.max(state.consumedEndAt, sentAt), sawBusy: false }
}

/** 守卫调用结束(不论结论)后重新计定时。 */
export function afterGuard(state, at) {
  return { ...state, lastGuardAt: at }
}

/**
 * @param {object} state
 * @param {{ activity: 'disconnected'|'needs-user'|'ended'|'busy'|'quiet'|'unknown', stateStartedAt: number|null, hasRow: boolean } | null} obs
 *   null 表示这次没观察到(断联、出错):不产生结束事件,定时照走。
 * @returns {{ state: object, wake: string | null }} wake 是唤醒原因。
 */
export function detectWake(state, obs, now, limits = WAKE_DEFAULTS) {
  let next = state
  if (obs?.hasRow && obs.activity === 'ended' && (obs.stateStartedAt ?? 0) > state.consumedEndAt) {
    return { state: { ...state, consumedEndAt: obs.stateStartedAt }, wake: 'turn-ended' }
  }
  if (obs && !obs.hasRow) {
    if (obs.activity === 'busy') {
      next = { ...state, sawBusy: true }
    } else if (obs.activity === 'quiet' && state.sawBusy) {
      return { state: { ...state, sawBusy: false }, wake: 'terminal-quiet' }
    }
  }
  if (now - state.lastGuardAt >= limits.guardIntervalMs) {
    return { state: next, wake: 'timer' }
  }
  return { state: next, wake: null }
}
