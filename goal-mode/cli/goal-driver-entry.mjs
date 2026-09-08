#!/usr/bin/env node
// 宿主拉起的目标驱动入口。只以打包产物的形式运行(out/goal-driver/goal-driver.js):
// 它 import 了 TypeScript 的 RuntimeClient 和 .md 模板,裸 node 跑不起来。
//
// 和 orca-goal 的 start/resume 走同一条循环、同一套锁和崩溃兜底,区别只有三点:
// 目标定义来自宿主写的 v2 记录而不是命令行;终端走 runtime socket 而不是 PATH 上的 CLI;
// 多了一个合作式控制检查点,让宿主的「暂停/恢复」能被确认。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { notifyDesktop } from './desktop-notification.mjs'
import { installCrashGuard } from './driver-crash-guard.mjs'
import { setTemplateSource } from './continuation-prompt.mjs'
import { DEFAULT_THRESHOLDS } from './goal-decision.mjs'
import { createDriverControl } from './goal-driver-control.mjs'
import { acceptanceOf, applyRecordToGoal, objectiveOf } from './goal-record-projection.mjs'
import { runLoop } from './goal-loop.mjs'
import { createRuntimeTerminalBackend } from './goal-runtime-terminal.mjs'
import { acquireLock, archiveLog, goalKey, newGoal, readGoal, writeGoal } from './goal-state.mjs'
import { setTerminalBackend } from './orca-terminal.mjs'
import {
  GOAL_JUDGE_ENTRY_FILENAME,
  goalControlPath,
  goalJudgeCriteriaPath,
  goalJudgeItemsPath,
  goalOperationPath,
  goalRecordPath,
  legacyDriverLogPath
} from '../../src/shared/goals/goal-store-layout.ts'
import blockedButPassing from './prompts/blocked-but-passing.md'
import budgetLimit from './prompts/budget-limit.md'
import continuation from './prompts/continuation.md'
import gateUnavailable from './prompts/gate-unavailable.md'
import objectiveReminder from './prompts/objective-reminder.md'
import objectiveUpdated from './prompts/objective-updated.md'
import rejectedCompletion from './prompts/rejected-completion.md'

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
    'blocked-but-passing': blockedButPassing,
    'budget-limit': budgetLimit,
    continuation,
    'gate-unavailable': gateUnavailable,
    'objective-reminder': objectiveReminder,
    'objective-updated': objectiveUpdated,
    'rejected-completion': rejectedCompletion
  })
  setTerminalBackend(createRuntimeTerminalBackend())

  // 裁判脚本和驱动打在同一目录;开发期可用 ORCA_GOAL_JUDGE_PATH 指向源码。两种裁判输入文件都由宿主随记录写好。
  const recordOptions = {
    judgeEntry:
      process.env.ORCA_GOAL_JUDGE_PATH ||
      path.join(path.dirname(process.argv[1]), GOAL_JUDGE_ENTRY_FILENAME),
    itemsPath: goalJudgeItemsPath(args.goalHome, args.goalId),
    criteriaPath: goalJudgeCriteriaPath(args.goalHome, args.goalId)
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
      thresholds: DEFAULT_THRESHOLDS,
      attach: args.mode === 'resume',
      control,
      recordOptions
    })
    const label = OUTCOME[final.state] || final.state
    log(`${label} —— ${final.finishReason}(共 ${final.turns} 轮)`)
    notifyDesktop(`orca-goal:${label}`, `${final.finishReason}(${final.turns} 轮)`)
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
      onBlocked: record.spec.onBlocked,
      worktreePath: record.workspace.path,
      terminalHandle: record.binding.terminal,
      acceptance: acceptanceOf(record, recordOptions),
      budget: { maxTurns: record.budget.maxTurns, maxMinutes: record.budget.maxMinutes },
      promptFile: false,
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
      log(`第 ${turn}${maxTurns ? `/${maxTurns}` : ''} 轮 · 注入 ${prompt}`),
    longRun: (mins) => log(`这一轮已经跑了 ${mins} 分钟,agent 仍在干活 —— 继续等,不打断`),
    attach: (turn) => log(`接管:不注入,先等第 ${turn} 轮手上这波跑完`),
    awaitUser: (reason) => log(`⏸ 等你确认:${reason}`),
    working: (source) =>
      log(`agent 已接管,等这一轮跑完${source === 'hook' ? '' : '(无 hook 状态,退回标题判定)'}`),
    needsUser: (tool) => log(`⏸ agent 在等你确认${tool ? `(${tool})` : ''} —— 已暂停注入`),
    verifying: (commands) => log(`声称完成,开始验收(${commands.length} 条)`),
    command: (c) => log(`  $ ${c}`),
    verified: (result) =>
      log(
        `验收${result.passed ? '通过' : '未通过'}:${result.results
          .map((r) => `${r.ok ? '✓' : '✗'} ${r.command}`)
          .join(' / ')}`
      ),
    tamper: (f) => log(`⚑ 验收被削弱的痕迹:${f.label} —— ${f.detail}`),
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
