// orca-goal 终局的文字说明:状态名与收尾时打印的轮数、用时。
const OUTCOME = {
  complete: '目标达成',
  blocked: '已停止:受阻',
  budget_exhausted: '已停止:预算耗尽',
  stalled: '已停止:空转',
  aborted: '已停止:人为中断'
}
export const outcomeLabel = (state) => OUTCOME[state] || state

export function printOutcome(goal) {
  console.log(`\n${outcomeLabel(goal.state)} —— ${goal.finishReason}`)
  const spent = goal.activeMs != null ? goal.activeMs : Date.now() - goal.startedAt
  console.log(`共 ${goal.turns} 轮,${Math.round(spent / 60_000)} 分钟`)
  if (goal.driverError) {
    console.log(`  上次驱动异常退出:${goal.driverError.message}`)
  }
  if (goal.guardMs) {
    console.log(`其中守卫用时 ${Math.round(goal.guardMs / 60_000)} 分钟`)
  }
}
