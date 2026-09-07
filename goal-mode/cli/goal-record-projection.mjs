// 宿主写的 v2 记录 → v1 循环认识的字段。入口在启动时用,循环在 reload 时用,两边必须一致。

/** 验收命令 = 有命令的验收项 + 额外检查。 */
export function acceptanceOf(record) {
  return {
    commands: [
      ...record.spec.criteria.filter((c) => c.command).map((c) => c.command),
      ...record.spec.extraChecks
    ],
    timeoutMs: record.budget.checkTimeoutSeconds * 1000,
    cwd: record.workspace.path,
    all: record.spec.checkAll
  }
}

/** 注入给 agent 的目标正文:目标 + 逐条验收项 + 整体验收说明。 */
export function objectiveOf(record) {
  const parts = [record.spec.objective.trim()]
  if (record.spec.criteria.length > 0) {
    parts.push(
      '验收标准:\n' + record.spec.criteria.map((c, i) => `${i + 1}. ${c.description}`).join('\n')
    )
  }
  if (record.spec.acceptanceText.trim()) {
    parts.push(record.spec.acceptanceText.trim())
  }
  return parts.join('\n\n')
}

/**
 * 把宿主改过的记录套回运行中的目标对象。定义版本变了,旧判词不再算数:
 * 上一次验收结果清掉,假完成计数归零,下一轮提示词用新目标正文。
 */
export function applyRecordToGoal(goal, record) {
  const specChanged = goal.specRevision !== record.specRevision
  return {
    ...goal,
    objective: objectiveOf(record),
    onBlocked: record.spec.onBlocked,
    acceptance: acceptanceOf(record),
    budget: { maxTurns: record.budget.maxTurns, maxMinutes: record.budget.maxMinutes },
    terminalHandle: record.binding.terminal,
    specRevision: record.specRevision,
    ...(specChanged ? { lastAcceptance: null, falseClaims: 0, blockedClaims: 0 } : {})
  }
}
