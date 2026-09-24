#!/usr/bin/env node
// 宿主拉起的目标驱动入口。只以打包产物的形式运行(out/goal-driver/goal-driver.js):
// 它 import 了 TypeScript 的 RuntimeClient 和 .md 模板,裸 node 跑不起来。
//
// 和 orca-goal 的 start/resume 走同一条循环、同一套锁和崩溃兜底,区别只有三点:
// 目标定义来自宿主写的 v2 记录而不是命令行;终端走 runtime socket 而不是 PATH 上的 CLI;
// 多了一个合作式控制检查点,让宿主的「暂停/恢复」能被确认。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { installCrashGuard } from './driver-crash-guard.mjs'
import { setTemplateSource } from './continuation-prompt.mjs'
import { createDriverControl } from './goal-driver-control.mjs'
import {
  acceptanceOf,
  applyRecordToGoal,
  checklistPathOf,
  guardOf,
  objectiveOf
} from './goal-record-projection.mjs'
import { runLoop } from './goal-loop.mjs'
import { createRuntimeTerminalBackend } from './goal-runtime-terminal.mjs'
import { acquireLock, archiveLog, goalKey, newGoal, readGoal, writeGoal } from './goal-state.mjs'
import { setTerminalBackend } from './orca-terminal.mjs'
import {
  goalControlPath,
  goalGuardCallsDir,
  goalJudgeCriteriaPath,
  goalOperationPath,
  goalRecordPath,
  legacyDriverLogPath
} from '../../src/shared/goals/goal-store-layout.ts'
import budgetLimit from './prompts/budget-limit.md'
import continuation from './prompts/continuation.md'
import firstTurn from './prompts/first-turn.md'
import guard from './prompts/guard.md'
import objectiveUpdated from './prompts/objective-updated.md'

const OUTCOME = {
  complete: '目标达成',
  blocked: '已停止:受阻',
  budget_exhausted: '已停止:预算耗尽',
  stalled: '已停止:空转',
  aborted: '已停止:人为中断'
}

async function main(argv) {
  const args = parseArgs(argv)
  const record = JSON.parse(await fs.readFile(goalRecordPath(args.goalHome, args.goalId), 'utf8'))
  if (record.goalId !== args.goalId) {
    throw new Error(`记录里的 goalId 与参数不一致:${record.goalId} != ${args.goalId}`)
  }
  const key = goalKey(record.workspace.path)
  const log = makeLogger(legacyDriverLogPath(args.goalHome, key))
  log(`=== 驱动启动 ${args.mode} goal=${args.goalId} run=${args.runId} ===`)

  setTemplateSource({
    'budget-limit': budgetLimit,
    continuation,
    'first-turn': firstTurn,
    guard,
    'objective-updated': objectiveUpdated
  })
  if (process.env.ORCA_GOAL_TERMINAL_BACKEND !== 'ssh-cli') {
    setTerminalBackend(createRuntimeTerminalBackend())
  }

  // 清单文件由宿主随记录写好;守卫每次调用的全文留在目标目录下。
  const recordOptions = {
    criteriaPath: goalJudgeCriteriaPath(args.goalHome, args.goalId),
    guardLogDir: goalGuardCallsDir(args.goalHome, args.goalId)
  }
  if (!guardOf(record, recordOptions).agent) {
    throw new Error('这个目标没有守卫,不能启动:先在编辑里选一个守卫')
  }
  const goal =
    args.mode === 'start'
      ? buildStartGoal(record, args, key, recordOptions)
      : await buildResumeGoal(record, args, key, recordOptions)

  // 装在拿锁之前:锁一拿到,这个进程就是这个目标的唯一驱动,再崩就得留下死因。
  installCrashGuard(key, { log })
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
      log('已停止(收到信号)。目标记录保留。')
      process.exit(130)
    })
  }

  if (args.mode === 'start') {
    await archiveLog(key)
  }
  await writeGoal(goal)
  sendToHost({ type: 'ready', goalId: args.goalId, runId: args.runId, key, pid: process.pid })

  const control = createDriverControl({
    controlPath: goalControlPath(args.goalHome, args.goalId),
    recordPath: goalRecordPath(args.goalHome, args.goalId),
    receiptPathFor: (clientOperationId) => goalOperationPath(args.goalHome, clientOperationId),
    runId: args.runId,
    log
  })
  try {
    const final = await runLoop(goal, {
      report: makeReport(log),
      attach: args.mode === 'resume',
      control,
      recordOptions
    })
    // 不在这台机器上弹通知:SSH 下它是远端。终局已写成通知事件,由客户端发出。
    const label = OUTCOME[final.state] || final.state
    log(`${label} —— ${final.finishReason}(共 ${final.turns} 轮)`)
    return final.state === 'complete' ? 0 : 2
  } finally {
    await release()
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    out[argv[i].replace(/^--/, '')] = argv[i + 1]
  }
  const { 'goal-id': goalId, 'run-id': runId, mode, 'goal-home': goalHome } = out
  if (!goalId || !runId || !goalHome || (mode !== 'start' && mode !== 'resume')) {
    throw new Error('用法:goal-driver --goal-id ID --run-id ID --mode start|resume --goal-home DIR')
  }
  return { goalId, runId, mode, goalHome }
}

function buildStartGoal(record, args, key, recordOptions) {
  return {
    ...newGoal({
      key,
      objective: objectiveOf(record),
      worktreePath: record.workspace.path,
      terminalHandle: record.binding.terminal,
      acceptance: acceptanceOf(record),
      budget: { maxTurns: record.budget.maxTurns, maxMinutes: record.budget.maxMinutes },
      guard: guardOf(record, recordOptions),
      checklistPath: checklistPathOf(record, recordOptions),
      now: Date.now()
    }),
    goalId: record.goalId,
    runId: args.runId,
    specRevision: record.specRevision
  }
}

/** 接回:沿用轮次、耗时和历史,只换掉可能变化的绑定、预算和验收。基线重取,见 orca-goal resume。 */
async function buildResumeGoal(record, args, key, recordOptions) {
  const existing = await readGoal(key)
  if (!existing || (existing.goalId && existing.goalId !== record.goalId)) {
    throw new Error(`工作区 ${record.workspace.path} 没有属于目标 ${record.goalId} 的运行记录`)
  }
  // 定义、预算、绑定统一走 applyRecordToGoal:驱动不在时改过的目标正文也要在这里生效,
  // 版本变了就清掉旧判词,和运行中 reload 的规则一致。
  return {
    ...applyRecordToGoal(existing, record, recordOptions),
    goalId: record.goalId,
    runId: args.runId,
    state: 'active',
    finishReason: null,
    finishedAt: null,
    driverError: null,
    lastSnapshot: null
  }
}

async function markAborted(key) {
  const goal = await readGoal(key)
  if (!goal || goal.state !== 'active') {
    return
  }
  await writeGoal({ ...goal, state: 'aborted', finishReason: '人为停止', finishedAt: Date.now() })
}

function sendToHost(message) {
  if (typeof process.send === 'function') {
    process.send(message)
  }
}

/** 没有 stdout 可看(宿主把它接到了 ignore),一切进度都写驱动日志文件。 */
function makeLogger(file) {
  const stamp = () => new Date().toTimeString().slice(0, 8)
  // 全新的目标主目录里还没有 log/;写入串行排队,保证行序和目录先于首行存在。
  let queue = fs.mkdir(path.dirname(file), { recursive: true }).catch(() => {})
  return (line) => {
    queue = queue.then(() => fs.appendFile(file, `[${stamp()}] ${line}\n`, 'utf8')).catch(() => {})
  }
}

function makeReport(log) {
  return {
    round: (turn, maxTurns, prompt) =>
      log(`第 ${turn}${maxTurns ? `/${maxTurns}` : ''} 轮 · 发出 ${prompt}`),
    guard: (reason) => log(`唤醒守卫:${reason}`),
    guardDone: (verdict, ms, error) =>
      log(
        verdict
          ? `守卫结论 ${verdict.decision}(${Math.round(ms / 1000)} 秒):${verdict.observation}`
          : `守卫调用失败(${Math.round(ms / 1000)} 秒):${error}`
      ),
    verifying: (commands) => log(`守卫判了完成,跑用户配置的检查命令(${commands.length} 条)`),
    command: (c) => log(`  $ ${c}`),
    verified: (result) =>
      log(
        `检查命令${result.passed ? '通过' : '未通过'}:${result.results
          .map((r) => `${r.ok ? '✓' : '✗'} ${r.command}`)
          .join(' / ')}`
      ),
    warn: (msg) => log(`⚠ ${msg}`)
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    sendToHost({ type: 'failed', reason: err?.message || String(err) })
    console.error(`错误:${err?.stack || err?.message || err}`)
    process.exit(1)
  })
