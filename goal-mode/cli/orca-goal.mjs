#!/usr/bin/env node
// orca-goal —— 目标模式 agent 看门狗。
// 不改 Orca 源码,不装 hook:作为外部进程,用 Orca 公开 CLI 驱动你已经开着的交互式会话。
//
// 为什么不做成 Orca 插件:插件的 terminal.sendText 每次调用都要求目标 worktree 处于聚焦状态,
// 而看门狗天生是延迟写入者;而且它有 4096 字符上限,面板与 worker 之间也没有通道。详见 README。
import { promises as fs, createReadStream } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { isProcessAlive, spawnDetached, stopProcess } from './detached-driver.mjs'
import { installCrashGuard } from './driver-crash-guard.mjs'
import { notifyDesktop } from './desktop-notification.mjs'
import { loadGoalConfig } from './goal-config-file.mjs'
import { DEFAULT_THRESHOLDS } from './goal-decision.mjs'
import { runLoop } from './goal-loop.mjs'
import {
  ROOT,
  acquireLock,
  deleteGoal,
  goalKey,
  listGoals,
  logPath,
  newGoal,
  readGoal,
  readLockPid,
  writeGoal,
  archiveLog
} from './goal-state.mjs'
import { listTerminals } from './orca-terminal.mjs'
import { formatChoice, listTerminalChoices, pickTerminal } from './terminal-picker.mjs'

const SCRIPT = import.meta.filename
const BOOLEAN_FLAGS = new Set(['yes', 'detach', 'prompt-file', 'check-all'])
const VALUE_FLAGS = new Set([
  'file',
  'terminal',
  'objective',
  'on-blocked',
  'check',
  'check-timeout',
  'max-turns',
  'max-minutes',
  'worktree'
])
const ALIASES = { f: 'file', t: 'terminal', y: 'yes' }

const USAGE = `orca-goal —— 目标模式 agent 看门狗

  orca-goal start [选项]                     启动目标(省略 --terminal 会让你交互式选)
  orca-goal terminals                        列出终端及其 agent 状态
  orca-goal status [--terminal HANDLE]       查看目标状态与驱动进程是否还活着
  orca-goal resume --terminal HANDLE [选项]  接上一个已有目标继续跑(首轮不注入,先等它手上这轮跑完)
                                             可带 --check / --max-turns / --max-minutes 覆盖原配置
  orca-goal watch --terminal HANDLE          跟踪后台驱动的输出
  orca-goal stop --terminal HANDLE           停掉驱动进程(保留记录)
  orca-goal forget --terminal HANDLE         删除目标记录

start 选项:
  -f, --file 路径       从 JSON 配置文件读取,命令行参数优先级更高
  -t, --terminal HANDLE 目标终端
  --objective 文本      目标描述
  --check 命令          验收命令,可重复。全部退出码为 0 才算完成
  --check-timeout 秒    单条验收命令超时,默认 900
  --check-all           验收跑完全部检查再汇总;默认第一条失败就停(省时间,也强制按顺序修)
  --on-blocked 模式     agent 声称受阻时怎么办:ask(默认,停下叫人)| verify(先跑一次验收核实)
  --max-turns N         轮数预算,默认 20;写 0 表示不限
  --max-minutes N       时长预算,默认 180;写 0 表示不限
  --worktree 路径       取证与验收的目录,默认取终端登记的工作区
  --detach              后台跑,立刻返回;用 watch/status 跟进度
  --prompt-file         提示词写进文件,只注入一行指针(保排版,但 agent 多一次读取且可能不读)
  -y, --yes             跳过验收命令的确认提示

配置文件字段:objective(字符串或字符串数组)、check、checkTimeout、
maxTurns、maxMinutes、worktree、terminal、promptFile。支持整行 // 注释。

状态目录:${ROOT}
`

async function main(argv) {
  const [command, ...rest] = argv
  const flags = parseFlags(rest)
  switch (command) {
    case 'start':
      return await start(flags, rest)
    case 'terminals':
      return await terminals()
    case 'status':
      return await status(flags)
    case 'resume':
      return await resume(flags, rest)
    case 'watch':
      return await watch(flags)
    case 'stop':
      return await stop(flags)
    case 'forget':
      return await forget(flags)
    default:
      process.stdout.write(USAGE)
      return command ? 1 : 0
  }
}

const absolutize = (v) => (v ? path.resolve(v) : v)

/** 0 合法(表示不限),负数和非数字不合法。 */
function nonNegative(name, value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} 需要一个不小于 0 的数字,收到:${value}`)
  }
  return n
}

/** 超时必须为正:0 在这里不是「不限」而是「立刻超时」,几乎肯定是笔误。 */
function positive(name, value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} 需要一个大于 0 的秒数(0 会让检查立刻超时),收到:${value}`)
  }
  return n
}

function parseFlags(args) {
  const flags = { check: [] }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('-')) {
      throw new Error(`无法识别的参数: ${arg}`)
    }
    const raw = arg.replace(/^--?/, '')
    const name = ALIASES[raw] || raw
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true
      continue
    }
    // 不认的参数直接报错。否则 --max-turn 这种手滑会把后面的数字当成它的取值吞掉。
    if (!VALUE_FLAGS.has(name)) {
      const known = [...VALUE_FLAGS, ...BOOLEAN_FLAGS]
        .sort()
        .map((f) => `--${f}`)
        .join(' ')
      throw new Error(`不认识的参数 --${name}。可用参数:${known}`)
    }
    const value = args[++i]
    if (value === undefined) {
      throw new Error(`--${name} 缺少取值`)
    }
    if (name === 'check') {
      flags.check.push(value)
    } else {
      flags[name] = value
    }
  }
  return flags
}

async function terminals() {
  const choices = await listTerminalChoices()
  if (choices.length === 0) {
    console.log('没有找到运行中的 Orca 终端。')
    return 0
  }
  for (const [i, t] of choices.entries()) {
    console.log(formatChoice(t, i))
    console.log(`     ${t.handle}`)
  }
  return 0
}

/** 命令行 > 配置文件 > 默认值。 */
async function resolveSettings(flags) {
  const file = flags.file ? await loadGoalConfig(flags.file) : {}
  const pick = (flagName, fileName, fallback) =>
    flags[flagName] !== undefined ? flags[flagName] : (file[fileName] ?? fallback)
  return {
    objective: pick('objective', 'objective'),
    onBlocked: pick('on-blocked', 'onBlocked') || 'ask',
    terminal: pick('terminal', 'terminal'),
    // 子进程的 cwd 是状态目录(刻意的,见 detached-driver),相对路径在那里解析必然错 ——
    // 父进程打印「已在后台启动」后子进程立刻退出,唯一线索埋在驱动日志里。
    worktree: absolutize(pick('worktree', 'worktree')),
    checks: flags.check.length > 0 ? flags.check : (file.check ?? []),
    // 必须校验:`--check-timeout abc` 会变成 NaN,setTimeout(NaN) 被 Node 当成 1 毫秒,
    // 于是每条验收刚起就被杀、完成声明永远被驳回。而 0 在轮数/时长里表示「不限」,
    // 在超时里却是「立刻超时」—— 语义相反,更不能静默接受。
    checkTimeout: positive('--check-timeout', pick('check-timeout', 'checkTimeout', 900)),
    maxTurns: nonNegative('--max-turns', pick('max-turns', 'maxTurns', 20)),
    maxMinutes: nonNegative('--max-minutes', pick('max-minutes', 'maxMinutes', 180)),
    promptFile: Boolean(flags['prompt-file'] || file.promptFile)
  }
}

async function start(flags, rawArgs) {
  const settings = await resolveSettings(flags)
  if (!settings.objective) {
    throw new Error('必须给出目标描述(--objective,或配置文件里的 objective)')
  }

  const terminal = settings.terminal
    ? (await listTerminals()).find((t) => t.handle === settings.terminal)
    : await pickTerminal()
  if (!terminal) {
    throw new Error(`找不到终端 ${settings.terminal}(它可能已经关了)`)
  }
  if (!terminal.writable) {
    throw new Error(`终端 ${terminal.handle} 不可写`)
  }

  const worktreePath = settings.worktree || terminal.worktreePath
  if (!worktreePath) {
    throw new Error(`终端 ${terminal.handle} 没有关联的工作区路径,请用 --worktree 指定`)
  }

  const key = goalKey(terminal.handle)
  const existing = await readGoal(key)
  if (existing?.state === 'active' && isProcessAlive(await readLockPid(key))) {
    throw new Error(
      `该终端已有在跑的目标(${existing.turns} 轮)。先 \`orca-goal stop --terminal ${terminal.handle}\``
    )
  }

  const acceptance = {
    commands: settings.checks,
    timeoutMs: settings.checkTimeout * 1000,
    cwd: worktreePath,
    all: 'check-all' in flags
  }
  if (!(await confirmAcceptance(acceptance, flags.yes))) {
    console.log('已取消。')
    return 1
  }

  if (flags.detach) {
    return await relaunchDetached('start', key, terminal, rawArgs)
  }

  const goal = newGoal({
    key,
    objective: settings.objective,
    onBlocked: settings.onBlocked,
    worktreePath,
    terminalHandle: terminal.handle,
    acceptance,
    budget: { maxTurns: settings.maxTurns, maxMinutes: settings.maxMinutes },
    promptFile: settings.promptFile,
    now: Date.now()
  })

  // 装在拿锁之前:锁一拿到,这个进程就是这个目标的唯一驱动,再崩就得留下死因。
  installCrashGuard(key)
  const lock = await acquireLock(key)
  let released = false
  const release = async () => {
    if (released) {
      return
    }
    released = true
    await lock.release()
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await markAborted(key)
      await release()
      console.log(`\n已停止。目标记录保留,可用 \`orca-goal status\` 查看。`)
      process.exit(130)
    })
  }

  // 同一个终端上一代目标的逐轮日志先归档,否则新目标的轮次会追加在它后面,
  // 面板读日志尾部就把上一代的轮次混进这一代的时间线。
  await archiveLog(key)
  await writeGoal(goal)
  console.log(`目标已启动 → ${worktreePath}`)
  console.log(`预算:${describeBudget(goal.budget)}`)
  console.log(`日志:${logPath(key)}\n`)

  try {
    const final = await runLoop(goal, { report: makeReport(), thresholds: DEFAULT_THRESHOLDS })
    printOutcome(final)
    if (process.env.ORCA_GOAL_DETACHED === '1') {
      notifyDesktop(
        `orca-goal:${outcomeLabel(final.state)}`,
        `${final.finishReason}(${final.turns} 轮)`
      )
    }
    return final.state === 'complete' ? 0 : 2
  } finally {
    await release()
  }
}

async function relaunchDetached(command, key, terminal, rawArgs) {
  const argv = [command, ...rawArgs.filter((a) => a !== '--detach'), '--yes']
  if (!rawArgs.some((a) => a === '--terminal' || a === '-t')) {
    argv.push('--terminal', terminal.handle) // 交互式选出来的,子进程没法再问一次
  }
  const outFile = driverLogPath(key)
  const pid = await spawnDetached({ scriptPath: SCRIPT, argv, logFile: outFile })
  console.log(`已在后台启动,pid ${pid}`)
  console.log(`跟进度:orca-goal watch --terminal ${terminal.handle}`)
  console.log(`停止:  orca-goal stop  --terminal ${terminal.handle}`)
  return 0
}

const driverLogPath = (key) => path.join(ROOT, 'log', `${key}.out`)

async function confirmAcceptance(acceptance, skip) {
  if (acceptance.commands.length === 0) {
    console.log('没有配置验收命令 —— 和 Codex 的 /goal 一样,完成与否采信 agent 的说法。')
    console.log('想让它被独立验证,加 --check;见 README「--check 是什么」。')
    return true
  }
  console.log('验收命令(agent 声称完成时,由本进程在下面这个目录里执行):')
  console.log(`  目录:${acceptance.cwd}`)
  for (const c of acceptance.commands) {
    console.log(`  $ ${c}`)
  }
  if (skip) {
    return true
  }
  if (!process.stdin.isTTY) {
    throw new Error('非交互环境下必须加 --yes 确认验收命令')
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('确认执行这些命令?[y/N] ')
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

/** 预算写 0 表示不限,别把 0 直接印出来。 */
function describeBudget(budget) {
  const turns = budget.maxTurns ? `${budget.maxTurns} 轮` : '轮数不限'
  const minutes = budget.maxMinutes ? `${budget.maxMinutes} 分钟` : '时长不限'
  return `${turns} / ${minutes}`
}

function makeReport() {
  const stamp = () => new Date().toTimeString().slice(0, 8)
  return {
    round: (turn, maxTurns, prompt) =>
      console.log(`[${stamp()}] 第 ${turn}${maxTurns ? `/${maxTurns}` : ''} 轮 · 注入 ${prompt}`),
    longRun: (mins) =>
      console.log(`[${stamp()}]   这一轮已经跑了 ${mins} 分钟,agent 仍在干活 —— 继续等,不打断`),
    attach: (turn) => console.log(`[${stamp()}] 接管:不注入,先等第 ${turn} 轮手上这波跑完`),
    awaitUser: (reason) => console.log(`[${stamp()}] ⏸ 等你确认:${reason}`),
    working: (source) =>
      console.log(
        `[${stamp()}]   agent 已接管,等这一轮跑完${source === 'hook' ? '' : '(无 hook 状态,退回标题判定)'}`
      ),
    needsUser: (tool) =>
      console.log(
        `[${stamp()}] ⏸ agent 在等你确认${tool ? `(${tool})` : ''} —— 已暂停注入,去终端里回应它`
      ),
    verifying: (commands) => console.log(`[${stamp()}]   声称完成,开始验收(${commands.length} 条)`),
    command: (c) => console.log(`[${stamp()}]     $ ${c}`),
    verified: (result) =>
      console.log(
        `[${stamp()}]   验收${result.passed ? '通过' : '未通过'}:${result.results
          .map((r) => `${r.ok ? '✓' : '✗'} ${r.command}`)
          .join(' / ')}`
      ),
    tamper: (f) => console.log(`[${stamp()}] ⚑ 验收被削弱的痕迹:${f.label} —— ${f.detail}`),
    warn: (msg) => console.log(`[${stamp()}] ⚠ ${msg}`)
  }
}

const OUTCOME = {
  complete: '目标达成',
  blocked: '已停止:受阻',
  budget_exhausted: '已停止:预算耗尽',
  stalled: '已停止:空转',
  aborted: '已停止:人为中断'
}
const outcomeLabel = (state) => OUTCOME[state] || state

function printOutcome(goal) {
  console.log(`\n${outcomeLabel(goal.state)} —— ${goal.finishReason}`)
  const spent = goal.activeMs != null ? goal.activeMs : Date.now() - goal.startedAt
  console.log(`共 ${goal.turns} 轮,${Math.round(spent / 60_000)} 分钟`)
  if (goal.driverError) {
    console.log(`  上次驱动异常退出:${goal.driverError.message}`)
  }
  if (goal.falseClaims > 0) {
    console.log(`其中被验收驳回的完成声明:${goal.falseClaims} 次`)
  }
  if (goal.tamperChallenges > 0) {
    console.log(`因削弱验收被挡回:${goal.tamperChallenges} 次`)
  }
}

async function status(flags) {
  const goals = flags.terminal
    ? [await readGoal(goalKey(flags.terminal))].filter(Boolean)
    : await listGoals()
  if (goals.length === 0) {
    console.log('没有目标记录。')
    return 0
  }
  for (const g of goals) {
    const pid = await readLockPid(g.key)
    const alive = isProcessAlive(pid)
    const driver = alive
      ? `驱动进程在跑(pid ${pid})`
      : g.state === 'active'
        ? '驱动进程已不在(记录停留在 active)'
        : '已结束'
    console.log(`${outcomeLabel(g.state).padEnd(14)} ${g.turns} 轮  ${driver}`)
    console.log(`  ${g.worktreePath}`)
    console.log(`  ${g.objective.replace(/\s+/g, ' ').slice(0, 80)}`)
    if (g.finishReason) {
      console.log(`  结束原因:${g.finishReason}`)
    }
    console.log(`  handle:${g.terminalHandle}`)
  }
  return 0
}

/** 驱动进程退出了但 agent 还在干活时用这个接回去,不重开、不打断。 */
async function resume(flags, rawArgs = []) {
  if (!flags.terminal) {
    throw new Error('必须指定 --terminal')
  }
  const key = goalKey(flags.terminal)
  const existing = await readGoal(key)
  if (!existing) {
    throw new Error('这个终端没有目标记录,请用 `orca-goal start` 新建')
  }
  if (isProcessAlive(await readLockPid(key))) {
    throw new Error('已经有驱动进程在跑这个目标了')
  }

  const terminal = (await listTerminals()).find((t) => t.handle === flags.terminal)
  if (!terminal) {
    throw new Error(`找不到终端 ${flags.terminal}(它可能已经关了)`)
  }

  const file = flags.file ? await loadGoalConfig(flags.file) : {}
  const goal = {
    ...existing,
    state: 'active',
    finishReason: null,
    finishedAt: null,
    driverError: null, // 这次接回是新的一程,别挂着上次的死因
    // 基线必须重取:停几天后接回,旧基线会把这期间别人的提交全算成「本轮改动」,
    // 篡改扫描据此报「改了门禁配置」「删了断言」,质证计数已到阈值时第一轮就判受阻。
    lastSnapshot: null
  }

  // 只在显式给了的时候才覆盖,没给就沿用原记录。
  const checks = flags.check.length > 0 ? flags.check : file.check
  if (checks) {
    goal.acceptance = {
      commands: checks,
      timeoutMs:
        positive('--check-timeout', flags['check-timeout'] ?? file.checkTimeout ?? 900) * 1000,
      cwd: flags.worktree || file.worktree || existing.worktreePath,
      all: 'check-all' in flags
    }
    if (!(await confirmAcceptance(goal.acceptance, flags.yes))) {
      console.log('已取消。')
      return 1
    }
  }
  for (const [flag, field] of [
    ['max-turns', 'maxTurns'],
    ['max-minutes', 'maxMinutes']
  ]) {
    const value = flags[flag] ?? file[field]
    if (value !== undefined) {
      goal.budget = { ...goal.budget, [field]: Number(value) }
    }
  }

  if (flags.detach) {
    return await relaunchDetached('resume', key, terminal, rawArgs)
  }

  // 装在拿锁之前:锁一拿到,这个进程就是这个目标的唯一驱动,再崩就得留下死因。
  installCrashGuard(key)
  const lock = await acquireLock(key)
  let released = false
  const release = async () => {
    if (released) {
      return
    }
    released = true
    await lock.release()
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      await markAborted(key)
      await release()
      console.log('\n已停止。目标记录保留,可用 `orca-goal status` 查看。')
      process.exit(130)
    })
  }

  await writeGoal(goal)
  console.log(`接回目标 → ${goal.worktreePath}`)
  console.log(`已跑 ${goal.turns} 轮,预算 ${describeBudget(goal.budget)}`)
  console.log(
    `${goal.acceptance?.commands?.length ? `验收:${goal.acceptance.commands.join(' / ')}` : '没有验收命令'}\n`
  )

  try {
    const final = await runLoop(goal, {
      report: makeReport(),
      thresholds: DEFAULT_THRESHOLDS,
      attach: true
    })
    printOutcome(final)
    if (process.env.ORCA_GOAL_DETACHED === '1') {
      notifyDesktop(
        `orca-goal:${outcomeLabel(final.state)}`,
        `${final.finishReason}(${final.turns} 轮)`
      )
    }
    return final.state === 'complete' ? 0 : 2
  } finally {
    await release()
  }
}

async function watch(flags) {
  if (!flags.terminal) {
    throw new Error('必须指定 --terminal')
  }
  const key = goalKey(flags.terminal)
  const file = driverLogPath(key)
  let size
  try {
    size = (await fs.stat(file)).size
  } catch {
    throw new Error(`没有后台驱动的输出文件。这个目标可能不是用 --detach 起的:${file}`)
  }

  await new Promise((resolve, reject) => {
    createReadStream(file, { encoding: 'utf8' })
      .on('data', (d) => process.stdout.write(d))
      .on('end', resolve)
      .on('error', reject)
  })

  // 简单的 tail -f:驱动结束了就退出,不用额外依赖。
  let offset = size
  while (true) {
    await new Promise((r) => setTimeout(r, 1000))
    const stat = await fs.stat(file).catch(() => null)
    if (stat && stat.size > offset) {
      const chunk = await readRange(file, offset, stat.size)
      process.stdout.write(chunk)
      offset = stat.size
    }
    if (!isProcessAlive(await readLockPid(key))) {
      const tail = await fs.stat(file).catch(() => null)
      if (tail && tail.size > offset) {
        process.stdout.write(await readRange(file, offset, tail.size))
      }
      return 0
    }
  }
}

async function readRange(file, start, end) {
  const handle = await fs.open(file, 'r')
  try {
    const buffer = Buffer.alloc(end - start)
    await handle.read(buffer, 0, buffer.length, start)
    return buffer.toString('utf8')
  } finally {
    await handle.close()
  }
}

async function stop(flags) {
  if (!flags.terminal) {
    throw new Error('必须指定 --terminal')
  }
  const key = goalKey(flags.terminal)
  const pid = await readLockPid(key)
  const result = await stopProcess(pid)
  await markAborted(key)
  console.log(
    result === 'not-running'
      ? '没有在跑的驱动进程。'
      : `驱动进程已${result === 'killed' ? '强制终止' : '停止'}(pid ${pid})。`
  )
  console.log('目标记录保留;要删掉用 `orca-goal forget`。')
  return 0
}

async function markAborted(key) {
  const goal = await readGoal(key)
  if (!goal || goal.state !== 'active') {
    return
  }
  await writeGoal({ ...goal, state: 'aborted', finishReason: '人为停止', finishedAt: Date.now() })
}

async function forget(flags) {
  if (!flags.terminal) {
    throw new Error('必须指定 --terminal')
  }
  const key = goalKey(flags.terminal)
  if (isProcessAlive(await readLockPid(key))) {
    throw new Error('驱动进程还在跑。先 `orca-goal stop`。')
  }
  await deleteGoal(key)
  console.log('目标记录已删除。')
  return 0
}

main(process.argv.slice(2))
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error(`错误:${err.message}`)
    process.exit(1)
  })
