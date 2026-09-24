// 驱动只剩机制层的判断:预算,以及守卫四种结论落到哪个动作。判断本身是守卫的事。
// 纯函数,不碰 I/O。

/** 时长预算按已花掉的活跃时长算,不按日历:停着、崩着的时间不扣。 */
export function timeBudgetReason(goal) {
  const maxMinutes = goal.budget?.maxMinutes
  const activeMs = goal.activeMs || 0
  if (maxMinutes && activeMs >= maxMinutes * 60_000) {
    return `时长预算耗尽(${Math.round(activeMs / 60_000)}/${maxMinutes} 分钟)`
  }
  return null
}

/** 轮数预算只限制「不再开新的一轮」:最后一轮结束后的守卫调用照常进行,仍能判完成。 */
export function turnBudgetReason(goal) {
  const maxTurns = goal.budget?.maxTurns
  if (maxTurns && goal.turns >= maxTurns) {
    return `轮数预算耗尽(${goal.turns}/${maxTurns} 轮)`
  }
  return null
}

/**
 * @param {object} goal
 * @param {{decision: string, instruction: string}} verdict 已通过格式校验的守卫结论
 * @returns {{ type: 'wait' } | { type: 'send' } | { type: 'verify' } | { type: 'budget', reason: string }}
 *   时长用完时,结论只能是完成或收尾;轮数用完时,不再发新的指示。
 */
export function planVerdict(goal, verdict) {
  if (verdict.decision === 'done') {
    return { type: 'verify' }
  }
  const outOfTime = timeBudgetReason(goal)
  if (outOfTime) {
    return { type: 'budget', reason: outOfTime }
  }
  if (!verdict.instruction) {
    return { type: 'wait' }
  }
  const outOfTurns = turnBudgetReason(goal)
  return outOfTurns ? { type: 'budget', reason: outOfTurns } : { type: 'send' }
}
