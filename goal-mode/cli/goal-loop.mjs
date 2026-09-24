// 目标驱动主循环:等唤醒 → 叫守卫看 → 执行它的结论。
// 机制归驱动,判断归守卫,拍板归用户:只有守卫验收通过、预算用完、用户停止能结束目标。
import { describeFailures, runAcceptance } from './acceptance-gate.mjs'
import { renderPrompt } from './continuation-prompt.mjs'
import { planVerdict, timeBudgetReason } from './goal-decision.mjs'
import { appendLog, writeGoal } from './goal-state.mjs'
import { sendInterrupt, sendText } from './orca-terminal.mjs'
import { applyRecordToGoal } from './goal-record-projection.mjs'
import { describeActivity, observeAgent } from './terminal-activity.mjs'
import { afterGuard, afterSend, detectWake, initialWakeState } from './round-wait-machine.mjs'
import { callGuard as defaultCallGuard, saveGuardCall } from './guard-call.mjs'
import { addNotice, applyQuestion, resolveNotices } from './goal-notices.mjs'
import {
  AUTO_MESSAGE_PREFIX,
  guardMaterials,
  rememberSent,
  writeObjectiveFile
} from './guard-materials.mjs'
import { GOAL_WHOLE_VERDICT_ID } from '../../src/shared/goals/goal-judge-contract.ts'

const num = (name, fallback) => Number(process.env[name] || fallback)
const POLL_MS = num('ORCA_GOAL_POLL_MS', 3_000)
const QUIET_MS = num('ORCA_GOAL_QUIET_MS', 12_000) // 没有状态行时,终端安静多久算「可能结束了」
const GUARD_INTERVAL_MS = num('ORCA_GOAL_GUARD_INTERVAL_MS', 15 * 60_000)
// 守卫调用失败后的重试间隔;用完之后改为跟着定时唤醒再试。
const GUARD_RETRY_MS = (process.env.ORCA_GOAL_GUARD_RETRY_MS || '30000,120000,300000')
  .split(',')
  .map(Number)
const STOP_GRACE_MS = num('ORCA_GOAL_STOP_GRACE_MS', 60_000)
// 驱动自己出错(磁盘、CLI、git)持续这么久就通知用户;不终结目标,一直重试。
const FAULT_NOTICE_MS = num('ORCA_GOAL_ROUND_ERROR_GRACE_MS', 10 * 60_000)
const SAVE_EVERY_MS = 60_000
export { AUTO_MESSAGE_PREFIX }
// Claude 把大段粘贴切块包进这个标签,驱动自己的消息也会被包住。
const PASTED_CONTENT_TAG = /<\/?pasted_content(?:\s+id="[^"]*")?>/g

const WAKE_REASONS = {
  'turn-ended': '执行 agent 这一轮结束了',
  'terminal-quiet': '执行 agent 的终端安静下来了（它没有状态信号，可能是这一轮结束了）',
  timer: '定时巡检（距上次复盘已满 15 分钟）',
  attached: '驱动刚接回这个目标，先弄清现在的情况',
  resumed: '用户恢复了自动续跑',
  'objective-changed': '用户修改了目标',
  'binding-changed': '目标换绑到了另一个终端',
  'checks-failed': '你判了完成，但用户配置的检查命令没有通过',
  'guard-retry': '上次调用守卫失败，现在重试'
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 没有宿主控制时的空实现:永远放行,不写收据。 */
const NO_CONTROL = {
  checkpoint: async () => 'run',
  takeReload: () => null,
  confirmReload: async () => {},
  confirmStop: async () => {}
}

/**
 * @param {object} goal 驱动记录(goal-state.mjs 的 newGoal),带 guard:{agent, timeoutMs, logDir}
 * @param {object} options
 * @param {boolean} [options.attach] 接回一个已经在跑的目标:不发首轮消息,先叫守卫弄清现状。
 * @param {object} [options.control] 宿主的合作式控制检查点(暂停、停止、改定义)。
 * @param {typeof defaultCallGuard} [options.callGuard] 测试注入。
 * @param {Function} [options.digestTranscript] 测试注入:整理对话摘要。
 */
export async function runLoop(
  goal,
  {
    report,
    attach = false,
    control = NO_CONTROL,
    recordOptions = {},
    callGuard = defaultCallGuard,
    digestTranscript
  }
) {
  if (!goal.guard?.agent) {
    throw new Error('这个目标没有守卫,不能启动:先在编辑里选一个守卫')
  }
  const startedAt = Date.now()
  const run = {
    current: goal,
    // 新开的目标:之前遗留的结束事件不属于它。接回的目标:当前的结束事件还没人看过。
    wake: { ...initialWakeState(startedAt, attach ? 0 : startedAt), sawBusy: attach },
    pendingWake: null,
    attachedPending: attach,
    objectiveChanged: false,
    checkFailures: null,
    snapshot: goal.lastSnapshot || null,
    lastTickAt: startedAt,
    lastSavedAt: startedAt,
    agentIdle: false,
    lastRow: null,
    faultSince: null,
    faultNoticed: false,
    guardFailures: 0,
    guardRetryAt: 0
  }

  const save = async () => {
    run.current = await writeGoal(run.current)
    run.lastSavedAt = Date.now()
  }
  const applyReload = async () => {
    const reload = control.takeReload?.()
    if (!reload) {
      return null
    }
    const before = run.current
    run.current = applyRecordToGoal(before, reload, recordOptions)
    await save()
    await control.confirmReload?.()
    report.warn(`已套用宿主更新的目标定义(版本 ${run.current.specRevision ?? '?'})`)
    if (before.terminalHandle !== run.current.terminalHandle) {
      run.lastRow = null
    }
    if (before.specRevision !== run.current.specRevision) {
      run.objectiveChanged = true
      return 'objective-changed'
    }
    return before.terminalHandle !== run.current.terminalHandle ? 'binding-changed' : null
  }

  if (!attach) {
    const first = await sendFirstTurn(run, { report, control, applyReload, save })
    if (first === 'stop') {
      return finishStopped(run, control, null)
    }
  }

  while (true) {
    if (run.current.state !== 'active') {
      return run.current
    }
    try {
      const gate = await holdWhilePaused(control, report, async () => {
        const changed = await applyReload()
        run.pendingWake = changed ?? run.pendingWake
      })
      if (gate === 'stop') {
        return await finishStopped(run, control, await interruptInFlight(run, report))
      }
      if (gate === 'resumed') {
        run.lastTickAt = Date.now() // 暂停的时间不计入预算
        run.pendingWake = run.pendingWake ?? 'resumed'
      }
      tick(run)
      const outOfTime = timeBudgetReason(run.current)
      if (outOfTime) {
        return await finishBudget(run, outOfTime, report)
      }

      const obs = await observe(run)
      clearFault(run, report)
      const detected = detectWake(run.wake, obs, Date.now(), {
        quietMs: QUIET_MS,
        guardIntervalMs: GUARD_INTERVAL_MS
      })
      run.wake = detected.state
      const reason = run.pendingWake ?? detected.wake
      if (!reason || Date.now() < run.guardRetryAt) {
        if (Date.now() - run.lastSavedAt >= SAVE_EVERY_MS) {
          await save()
        }
        await sleep(POLL_MS)
        continue
      }
      run.pendingWake = null
      const ended = await review(run, reason, {
        report,
        control,
        applyReload,
        save,
        callGuard,
        digestTranscript
      })
      if (ended) {
        return ended
      }
    } catch (err) {
      await noteFault(run, err, report, save)
      if ((await control.checkpoint('retry-backoff').catch(() => 'run')) === 'stop') {
        return await finishStopped(run, control, null)
      }
      await sleep(POLL_MS)
    }
  }
}

/** 活跃时长按墙钟逐拍累加:守卫调用一律算(C12);等用户回答且 agent 闲着时不算。 */
function tick(run, { force = false } = {}) {
  const now = Date.now()
  const delta = Math.max(0, now - run.lastTickAt)
  run.lastTickAt = now
  if (force || !(run.current.awaitingUser && run.agentIdle)) {
    run.current = { ...run.current, activeMs: (run.current.activeMs || 0) + delta }
  }
}

async function observe(run) {
  try {
    const activity = await observeAgent(run.current.terminalHandle)
    const kind = describeActivity(activity, QUIET_MS)
    run.agentIdle = kind === 'ended' || kind === 'quiet' || kind === 'needs-user'
    run.lastRow = activity.row ?? run.lastRow
    return {
      activity: kind,
      stateStartedAt: activity.row?.stateStartedAt ?? null,
      hasRow: Boolean(activity.row?.state)
    }
  } catch {
    // 观察不到(断联、Orca 在重启)不是任何结论:不产生结束事件,定时照走。
    return null
  }
}

/** 一次唤醒:叫守卫看,复核现场,执行结论。返回非空表示目标已结束。 */
async function review(
  run,
  reason,
  { report, control, applyReload, save, callGuard, digestTranscript }
) {
  const attached = run.attachedPending
  run.attachedPending = false
  const wakeText =
    attached && reason === 'turn-ended' ? WAKE_REASONS.attached : (WAKE_REASONS[reason] ?? reason)
  const startedAt = Date.now()
  const promptBefore = run.lastRow?.prompt ?? ''
  const sequence = (run.current.guardCalls || 0) + 1
  const { vars, cursor } = await guardMaterials(run, wakeText, { sequence, digestTranscript })
  report.guard?.(wakeText)

  const abort = new AbortController()
  let interruptedBy = null
  const call = callGuard(
    {
      agent: run.current.guard.agent,
      cwd: run.current.worktreePath,
      timeoutMs: run.current.guard.timeoutMs,
      vars,
      signal: abort.signal
    },
    {}
  )
  let settled = false
  call.then(
    () => (settled = true),
    () => (settled = true)
  )
  // 调用进行中也守着控制检查点:暂停、停止会终止这次调用;目标或终端改了,这次结论作废。
  while (!settled) {
    await Promise.race([call.catch(() => {}), sleep(POLL_MS)])
    if (settled) {
      break
    }
    // 这里抛出去的话调用会在后台继续跑,下一拍又起一个:同一时间只能有一个守卫调用。
    const gate = await control.checkpoint('guard-call').catch(() => 'run')
    const changed = await applyReload().catch(() => null)
    if (gate === 'stop' || gate === 'paused') {
      interruptedBy = gate
    } else if (changed) {
      interruptedBy = changed
    }
    if (interruptedBy) {
      abort.abort()
    }
  }
  const result = await call.catch((err) => ({
    ok: false,
    reason: err?.message || String(err),
    prompt: '',
    attempts: []
  }))
  const guardMs = Date.now() - startedAt
  tick(run, { force: true })
  run.wake = afterGuard(run.wake, Date.now())
  run.current = {
    ...run.current,
    guardCalls: sequence,
    guardMs: (run.current.guardMs || 0) + guardMs
  }
  if (run.current.guard.logDir) {
    await saveGuardCall(run.current.guard.logDir, sequence, {
      sequence,
      at: new Date(startedAt).toISOString(),
      wakeReason: wakeText,
      ms: guardMs,
      interruptedBy,
      prompt: result.prompt,
      attempts: result.attempts,
      verdict: result.ok ? result.verdict : null,
      error: result.ok ? null : result.reason
    }).catch((err) => report.warn(`守卫调用留档失败:${err?.message || err}`))
  }
  report.guardDone?.(result.ok ? result.verdict : null, guardMs, result.ok ? null : result.reason)

  if (interruptedBy === 'stop') {
    return finishStopped(run, control, await interruptInFlight(run, report))
  }
  if (interruptedBy) {
    // 暂停:下一拍停在闸口;改了目标或终端:以新的情况重新叫守卫。
    run.pendingWake = interruptedBy === 'paused' ? null : interruptedBy
    await save()
    return null
  }
  if (!result.ok) {
    await guardFailed(run, result.reason, report, save)
    return null
  }
  if (run.guardFailures > 0) {
    report.warn(`守卫恢复正常(之前连续失败 ${run.guardFailures} 次)`)
  }
  run.guardFailures = 0
  run.guardRetryAt = 0
  run.current = resolveNotices(run.current, 'guard-unavailable', Date.now())

  // 调用期间用户亲自说了话:这次结论没看到它,作废;那一轮结束时自然会再唤醒。
  const promptAfter = await currentPrompt(run)
  if (promptAfter && promptAfter !== promptBefore && !isAutoMessage(promptAfter)) {
    report.warn('守卫调用期间用户给 agent 发了新消息,这次结论作废,等这一轮结束再看')
    await save()
    return null
  }

  const verdict = result.verdict
  const now = Date.now()
  run.checkFailures = null
  run.current = applyQuestion(
    {
      ...run.current,
      guardNote: verdict.note,
      guardObservation: verdict.observation,
      lastReviewAt: startedAt,
      transcriptCursor: cursor ?? run.current.transcriptCursor ?? null
    },
    verdict.question,
    now
  )
  const plan = planVerdict(run.current, verdict)
  await logReview(run.current, wakeText, verdict, plan)

  if (plan.type === 'budget') {
    return finishBudget(run, plan.reason, report)
  }
  if (plan.type === 'verify') {
    return verifyDone(run, verdict, report, save)
  }
  if (plan.type === 'send') {
    await deliver(run, verdict, report)
  }
  await save()
  return null
}

function isAutoMessage(prompt) {
  return prompt.replace(PASTED_CONTENT_TAG, '').trimStart().startsWith(AUTO_MESSAGE_PREFIX)
}

async function currentPrompt(run) {
  try {
    const activity = await observeAgent(run.current.terminalHandle)
    run.lastRow = activity.row ?? run.lastRow
    return activity.row?.prompt ?? ''
  } catch {
    return run.lastRow?.prompt ?? ''
  }
}

/** 发给执行 agent 的消息:守卫给了指示就视为本轮已结束;只看是否停在确认框。 */
async function deliver(run, verdict, report) {
  const name = run.objectiveChanged ? 'objective-updated' : 'continuation'
  const text = await renderPrompt(name, {
    objective: run.current.objective,
    objectivePath: await writeObjectiveFile(run.current),
    checklistPath: run.current.checklistPath || '无（以目标原文为准）',
    observation: verdict.observation || '（守卫没有写观察）',
    instruction: verdict.instruction
  })
  if (!(await sendWhenSafe(run, text, report))) {
    return
  }
  startRound(run, name, report)
  run.objectiveChanged = false
}

/** 每条续跑消息开一轮;收尾消息不算。 */
function startRound(run, name, report) {
  const turn = run.current.turns + 1
  run.current = { ...run.current, turns: turn, roundStartedAt: Date.now() }
  report.round(turn, run.current.budget.maxTurns, name)
}

/**
 * @returns {Promise<boolean>} 发出去了吗。停在确认框或终端断开就不发,等下一次唤醒。
 * 不看输入框草稿:Claude 一轮结束后的暗色建议也被算作草稿,检查它会让续跑永远发不出去(用户 2026-09-24 决定不管)。
 */
async function sendWhenSafe(run, text, report) {
  const handle = run.current.terminalHandle
  let activity
  try {
    activity = await observeAgent(handle)
  } catch (err) {
    report.warn(`看不到终端,这次不发:${err?.message || err}`)
    return false
  }
  const kind = describeActivity(activity, QUIET_MS)
  if (kind === 'needs-user' || kind === 'disconnected') {
    report.warn(kind === 'needs-user' ? 'agent 正在等确认,这次不发' : '终端已断开,这次不发')
    return false
  }
  await sendText(handle, text, { enter: true })
  run.wake = afterSend(run.wake, Date.now())
  run.current = rememberSent(run.current, text, Date.now())
  return true
}

async function sendFirstTurn(run, { report, control, applyReload, save }) {
  while (true) {
    try {
      const gate = await holdWhilePaused(control, report, applyReload)
      if (gate === 'stop') {
        return 'stop'
      }
      // 每次都按最新定义渲染:等发送条件期间用户可能改了目标。
      const text = await renderPrompt('first-turn', {
        objective: run.current.objective,
        checklistPath: run.current.checklistPath || '无（以目标原文为准）'
      })
      if (await sendWhenSafe(run, text, report)) {
        startRound(run, 'first-turn', report)
        run.objectiveChanged = false
        await save()
        return 'sent'
      }
    } catch (err) {
      await noteFault(run, err, report, save)
    }
    await sleep(POLL_MS)
  }
}

/** 守卫判了完成:有用户配置的检查命令就跑一遍;通过才写验收结果并结束。 */
async function verifyDone(run, verdict, report, save) {
  const commands = run.current.acceptance?.commands || []
  let checks = { passed: true, inconclusive: false, results: [] }
  if (commands.length > 0) {
    report.verifying(commands)
    const started = Date.now()
    checks = await runAcceptance(run.current.acceptance, {
      onCommandStart: (c) => report.command(c)
    })
    run.current = { ...run.current, activeMs: (run.current.activeMs || 0) + (Date.now() - started) }
    run.lastTickAt = Date.now()
    report.verified(checks)
    if (!checks.passed) {
      const { list, output } = describeFailures(checks)
      run.checkFailures = `${list}\n${output || '(命令没有产生输出)'}`.slice(0, 8_000)
      run.pendingWake = 'checks-failed'
      await save()
      return null
    }
  }
  const now = Date.now()
  const tree = run.snapshot?.kind === 'git' ? run.snapshot.tree : null
  const guardResult = {
    command: '守卫验收',
    ok: true,
    output: `${verdict.observation}\n\n${verdict.note}`.slice(0, 4_000),
    items: [{ id: GOAL_WHOLE_VERDICT_ID, status: 'passed', reason: verdict.observation }]
  }
  run.current = addNotice(
    resolveNotices(
      {
        ...run.current,
        state: 'complete',
        finishReason: `守卫验收通过:${verdict.observation}`.slice(0, 1_000),
        finishedAt: now,
        awaitingUser: null,
        lastAcceptance: {
          tree,
          result: { passed: true, inconclusive: false, results: [...checks.results, guardResult] }
        }
      },
      'question',
      now
    ),
    'complete',
    verdict.observation || '守卫验收通过',
    now
  )
  await save()
  await logTerminal(run.current)
  return run.current
}

/** 预算用完:先落终局,再在满足发送条件时发收尾消息;发不出去就记下来,不等总结。 */
async function finishBudget(run, reason, report) {
  const now = Date.now()
  run.current = addNotice(
    resolveNotices(
      {
        ...run.current,
        state: 'budget_exhausted',
        finishReason: reason,
        finishedAt: now,
        awaitingUser: null
      },
      'question',
      now
    ),
    'budget',
    reason,
    now
  )
  await writeGoal(run.current)
  await logTerminal(run.current)
  try {
    const text = await renderPrompt('budget-limit', { limitKind: reason })
    if (await sendWhenSafe(run, text, report)) {
      report.warn('已发出收尾消息,循环结束')
    } else {
      run.current = { ...run.current, wrapUp: 'undelivered' }
      report.warn('收尾消息未送达,目标照常结束')
    }
  } catch (err) {
    run.current = { ...run.current, wrapUp: 'undelivered' }
    report.warn(`收尾消息发送失败:${err?.message || err}`)
  }
  run.current = await writeGoal(run.current)
  return run.current
}

async function guardFailed(run, reason, report, save) {
  run.guardFailures += 1
  const delay = GUARD_RETRY_MS[run.guardFailures - 1]
  report.warn(`守卫调用失败(第 ${run.guardFailures} 次):${reason}`)
  if (delay !== undefined) {
    run.guardRetryAt = Date.now() + delay
  } else {
    // 重试用完:通知用户,之后跟着定时唤醒再试,成功即恢复。
    if (run.guardFailures === GUARD_RETRY_MS.length + 1) {
      run.current = addNotice(
        run.current,
        'guard-unavailable',
        `守卫无法运行:${reason}`,
        Date.now()
      )
    }
    run.guardRetryAt = Date.now() + GUARD_INTERVAL_MS
  }
  run.pendingWake = 'guard-retry'
  await save()
}

async function noteFault(run, err, report, save) {
  const message = err?.message || String(err)
  if (err?.code === 'goal_host_unverifiable') {
    return
  }
  if (!run.faultSince) {
    run.faultSince = Date.now()
    report.warn(`驱动出错,重试中:${message}`)
  }
  if (!run.faultNoticed && Date.now() - run.faultSince >= FAULT_NOTICE_MS) {
    run.faultNoticed = true
    run.current = {
      ...addNotice(run.current, 'driver-fault', `驱动持续出错:${message}`, Date.now()),
      driverError: { kind: 'round', message: message.slice(0, 500), at: Date.now() }
    }
    await save().catch(() => {})
  }
}

function clearFault(run, report) {
  if (!run.faultSince) {
    return
  }
  report.warn(`驱动恢复正常(出错持续了 ${Math.round((Date.now() - run.faultSince) / 1000)} 秒)`)
  run.faultSince = null
  run.faultNoticed = false
  run.current = {
    ...resolveNotices(run.current, 'driver-fault', Date.now()),
    driverError: null
  }
}

/** 停止时对在途的一轮发一次中断,再按证据判断它结不结束;没有在跑的一轮就不打断。 */
async function interruptInFlight(run, report) {
  const handle = run.current.terminalHandle
  let kind
  try {
    kind = describeActivity(await observeAgent(handle), QUIET_MS)
  } catch {
    return null
  }
  if (kind !== 'busy') {
    return null
  }
  try {
    await sendInterrupt(handle)
    report.warn('宿主要求停止:已向终端发送中断,等待本轮结束的证据')
  } catch (err) {
    report.warn(`宿主要求停止,但中断发送失败:${err?.message || err}`)
    return false
  }
  const deadline = Date.now() + STOP_GRACE_MS
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    try {
      if (describeActivity(await observeAgent(handle), QUIET_MS) !== 'busy') {
        return true
      }
    } catch {
      // 观察不到就继续等,到点如实报「未确认」
    }
  }
  return false
}

/** 停止收尾:记录标为人为停止、落盘,再把驱动真正确认了的部分写进收据。 */
async function finishStopped(run, control, turnStopped) {
  const now = Date.now()
  run.current = resolveNotices(
    {
      ...run.current,
      state: 'aborted',
      finishReason: '人为停止',
      finishedAt: now,
      awaitingUser: null
    },
    'question',
    now
  )
  await writeGoal(run.current).catch(() => {})
  await logTerminal(run.current)
  await control.confirmStop?.({ turnStopped, acceptanceStopped: null })
  return run.current
}

/**
 * 注入前的闸口:暂停期间停在这里轮询意图,直到宿主重新放行或要求停止。不计入活跃时长。
 * @returns {Promise<'run'|'resumed'|'stop'>}
 */
async function holdWhilePaused(control, report, applyReload = async () => {}) {
  let announced = false
  while (true) {
    const gate = await control.checkpoint('before-inject')
    await applyReload()
    if (gate === 'stop') {
      return 'stop'
    }
    if (gate !== 'paused') {
      break
    }
    if (!announced) {
      announced = true
      report.warn('续跑已暂停 —— 不再叫守卫、不再发消息,等待宿主恢复')
    }
    await sleep(POLL_MS)
  }
  if (announced) {
    report.warn('续跑已恢复')
    return 'resumed'
  }
  return 'run'
}

async function logReview(goal, wakeText, verdict, plan) {
  await appendLog(goal.key, {
    at: new Date().toISOString(),
    turn: goal.turns,
    prompt: wakeText,
    tree: goal.lastSnapshot?.kind === 'git' ? goal.lastSnapshot.tree : null,
    head: goal.lastSnapshot?.kind === 'git' ? goal.lastSnapshot.head : null,
    action: verdict.decision,
    plan: plan.type,
    state: goal.state,
    reason: verdict.observation || null,
    question: verdict.question || null
  }).catch(() => {})
}

/** 终局也在逐轮日志里留一条,目标不会「戛然而止」。 */
async function logTerminal(goal) {
  await appendLog(goal.key, {
    at: new Date(goal.updatedAt || Date.now()).toISOString(),
    turn: goal.turns,
    prompt: null,
    tree: null,
    head: null,
    action: 'finish',
    state: goal.state,
    reason: goal.finishReason || null
  }).catch(() => {})
}
