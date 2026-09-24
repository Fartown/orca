// 宿主写的 v2 记录 → 驱动认识的字段。入口在启动时用,循环在 reload 时用,两边必须一致。

/** 用户额外配置的检查命令:带命令的验收项 + 额外检查。守卫判完成后才跑,通过才算完成。 */
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

/** gate 用 shell 跑命令:POSIX 单引号、cmd.exe 双引号。 */
export function quoteForShell(value, platform = process.platform) {
  if (platform === 'win32') {
    return `"${value.replace(/"/g, '""')}"`
  }
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** 发给执行 agent 和守卫的是用户写的目标原文;验收清单另给路径,不再顶替目标。 */
export function objectiveOf(record) {
  return record.spec.objective
}

/**
 * 守卫就是记录里选的那个 agent;没选(旧目标的 judge: none)时为 null,驱动拒绝启动。
 * @param {{ guardLogDir?: string }} [options]
 */
export function guardOf(record, options = {}) {
  const agent = record.spec.judge && record.spec.judge !== 'none' ? record.spec.judge : null
  return {
    agent,
    // 判完成时要当场构建、跑测试;检查超时设得很短也给守卫留足 10 分钟。
    timeoutMs: Math.max(10 * 60_000, record.budget.checkTimeoutSeconds * 1000),
    logDir: options.guardLogDir ?? null
  }
}

/**
 * 清单文件由宿主随记录写好(有验收文档就是文档,否则是验收项与说明)。只有目标原文时不给路径,
 * 免得执行 agent 去读一份和目标一模一样的文件。
 * @param {{ criteriaPath?: string }} [options]
 */
export function checklistPathOf(record, options = {}) {
  const spec = record.spec
  const hasChecklist =
    Boolean(spec.acceptanceDocument) ||
    spec.criteria.length > 0 ||
    Boolean(spec.acceptanceText?.trim())
  return hasChecklist ? (options.criteriaPath ?? null) : null
}

/** 把宿主改过的记录套回运行中的目标对象。定义版本变了,旧的验收结果不再算数。 */
export function applyRecordToGoal(goal, record, options = {}) {
  const specChanged = goal.specRevision !== record.specRevision
  return {
    ...goal,
    objective: objectiveOf(record),
    acceptance: acceptanceOf(record),
    budget: { maxTurns: record.budget.maxTurns, maxMinutes: record.budget.maxMinutes },
    guard: guardOf(record, options),
    checklistPath: checklistPathOf(record, options),
    terminalHandle: record.binding.terminal,
    specRevision: record.specRevision,
    ...(specChanged ? { lastAcceptance: null } : {})
  }
}
