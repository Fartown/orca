// 宿主写的 v2 记录 → v1 循环认识的字段。入口在启动时用,循环在 reload 时用,两边必须一致。

/**
 * 验收命令 = 有命令的验收项 + 额外检查 + (选了裁判时)一条条目模式裁判命令。
 * @param {{judgeEntry?: string, itemsPath?: string, execPath?: string, platform?: string}} [options]
 */
export function acceptanceOf(record, options = {}) {
  const judge = judgeCommandOf(record, options)
  return {
    commands: [
      ...record.spec.criteria.filter((c) => c.command).map((c) => c.command),
      ...record.spec.extraChecks,
      ...(judge ? [judge] : [])
    ],
    timeoutMs: record.budget.checkTimeoutSeconds * 1000,
    cwd: record.workspace.path,
    all: record.spec.checkAll
  }
}

/**
 * 没有命令的验收项交给独立裁判逐条判定。裁判脚本和驱动打在同一目录,用同一个可执行文件
 * 拉起(驱动跑在 Electron-as-Node 下时 env 里已有 ELECTRON_RUN_AS_NODE);清单文件由宿主随记录写好。
 */
export function judgeCommandOf(
  record,
  { judgeEntry, itemsPath, execPath = process.execPath, platform = process.platform } = {}
) {
  const judge = record.spec.judge ?? 'none'
  if (judge === 'none' || !judgeEntry || !itemsPath) {
    return null
  }
  if (!record.spec.criteria.some((c) => !c.command)) {
    return null
  }
  const q = (value) => quoteForShell(String(value), platform)
  return [
    q(execPath),
    q(judgeEntry),
    '--agent',
    judge,
    '--cwd',
    q(record.workspace.path),
    '--items-file',
    q(itemsPath),
    '--timeout',
    String(record.budget.checkTimeoutSeconds),
    '--sandbox',
    'read-only'
  ].join(' ')
}

/** gate 用 shell 跑命令:POSIX 单引号、cmd.exe 双引号。 */
export function quoteForShell(value, platform = process.platform) {
  if (platform === 'win32') {
    return `"${value.replace(/"/g, '""')}"`
  }
  return `'${value.replace(/'/g, `'\\''`)}'`
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
export function applyRecordToGoal(goal, record, options = {}) {
  const specChanged = goal.specRevision !== record.specRevision
  return {
    ...goal,
    objective: objectiveOf(record),
    onBlocked: record.spec.onBlocked,
    acceptance: acceptanceOf(record, options),
    budget: { maxTurns: record.budget.maxTurns, maxMinutes: record.budget.maxMinutes },
    terminalHandle: record.binding.terminal,
    specRevision: record.specRevision,
    ...(specChanged ? { lastAcceptance: null, falseClaims: 0, blockedClaims: 0 } : {})
  }
}
