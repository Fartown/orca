// 看门狗主循环:清认领 → 注入 → 等这一轮真结束 → 取证 → 判定 → 决定下一轮。
import { describeFailures, runAcceptance } from './acceptance-gate.mjs'
import { promptPointerLine, renderPrompt, writePromptFile } from './continuation-prompt.mjs'
import { claimPath, clearClaim, readClaim } from './goal-claim.mjs'
import { decide } from './goal-decision.mjs'
import { diffTrees, snapshotWorktree } from './git-snapshot.mjs'
import { describeFindings, scanRound } from './tamper-scan.mjs'
import { appendLog, writeGoal } from './goal-state.mjs'
import { sendText } from './orca-terminal.mjs'
import { classifyRound, observeAgent } from './terminal-activity.mjs'

const num = (name, fallback) => Number(process.env[name] || fallback)
const SETTLE_MS = num('ORCA_GOAL_SETTLE_MS', 5_000) // 送出 \r 到 agent 接管之间的空窗
const QUIET_MS = num('ORCA_GOAL_QUIET_MS', 12_000) // 静默多久算这一轮停了
const POLL_MS = num('ORCA_GOAL_POLL_MS', 3_000)
const START_MS = num('ORCA_GOAL_START_MS', 300_000) // 注入后多久还没有任何动静才认定没收到
// 只在 agent「不在干活」时才计的卡死上限。它还在跑就一直等 —— 大任务里一个 turn
// 连续调几十次工具跑上两三小时是正常的,拿单轮上限去砍它等于把干得好好的活腰斩。
// 真正的总闸是目标的时长预算,在下面 deadline 里查。
const STUCK_MS = num('ORCA_GOAL_STUCK_MS', 20 * 60_000)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {boolean} attach 挂载到一个已经在干活的会话:首轮不注入,先等它把手上这轮跑完再接管。
 *   目标已经在会话里了(比如上一次驱动退出但注入已落地),这时再注入会打断它。
 */
export async function runLoop(goal, { report, thresholds, attach = false }) {
  let current = goal
  let pending = { name: 'continuation', extra: {} }
  let attachPending = attach

  while (true) {
    const turn = current.turns + 1
    const before = current.lastSnapshot || (await snapshotWorktree(current.worktreePath))
    if (before.kind === 'unavailable' && turn === 1) {
      report.warn(`空转熔断已关闭:${before.reason}`)
    }

    await clearClaim(current.key)
    const sentAt = Date.now()
    if (attachPending) {
      attachPending = false
      report.attach(turn)
    } else {
      const text = await buildInjection(current, turn, pending)
      report.round(turn, current.budget.maxTurns, pending.name)
      await sendText(current.terminalHandle, text, { enter: true })
    }

    const goalDeadline = current.budget.maxMinutes
      ? current.startedAt + current.budget.maxMinutes * 60_000
      : Infinity
    const outcome = await waitForRoundEnd(current.terminalHandle, sentAt, report, goalDeadline)
    if (outcome.budgetHit) {
      current = {
        ...current,
        turns: turn,
        state: 'budget_exhausted',
        finishReason: `时长预算耗尽(${current.budget.maxMinutes} 分钟),该轮仍在进行中`,
        finishedAt: Date.now()
      }
      await writeGoal(current)
      await maybeSendWrapUp(
        current,
        { state: 'budget_exhausted', reason: current.finishReason },
        report
      )
      return current
    }
    if (outcome.failure) {
      current = {
        ...current,
        turns: turn,
        state: 'blocked',
        finishReason: `第 ${turn} 轮:${outcome.failure}`,
        finishedAt: Date.now()
      }
      await writeGoal(current)
      return current
    }

    const after = await snapshotWorktree(current.worktreePath)
    const changed = await diffTrees(current.worktreePath, before, after)
    const findings = await scanRound(current.worktreePath, before, after, changed)
    for (const f of findings.filter((x) => x.challenge)) {
      report.tamper(f)
    }

    const claim = await readClaim(current.key)
    if (claim?.kind === 'malformed') {
      report.warn(`认领文件格式不对,按「未声明」处理:${claim.summary}`)
    }
    const sentinel = claim && claim.kind !== 'malformed' ? claim : null
    current = { ...current, turns: turn }

    let acceptance = null
    const obs = { now: Date.now(), sentinel, snapshot: after, findings }
    let verdict = decide(current, obs, thresholds)

    if (verdict.action.type === 'verify') {
      report.verifying(current.acceptance.commands)
      acceptance = await runAcceptance(current.acceptance, {
        onCommandStart: (c) => report.command(c)
      })
      report.verified(acceptance)
      verdict = decide(current, { ...obs, now: Date.now(), acceptance }, thresholds)
    }

    current = verdict.goal
    await writeGoal(current)
    await appendLog(current.key, {
      at: new Date(current.updatedAt).toISOString(),
      turn,
      prompt: pending.name,
      claim: sentinel,
      tree: after.kind === 'git' ? after.tree : null,
      head: after.kind === 'git' ? after.head : null,
      acceptancePassed: acceptance?.passed ?? null,
      findings: findings.length ? findings : null,
      action: verdict.action.type,
      state: current.state,
      reason: verdict.action.reason || null
    })

    if (verdict.action.type === 'finish') {
      await maybeSendWrapUp(current, verdict.action, report)
      return current
    }

    pending = nextPrompt(verdict.action, acceptance, changed, findings)

    if (sentinel?.kind === 'blocked') {
      report.warn(
        `agent 声称受阻(第 ${current.blockedClaims} 次,满 ${thresholds.maxBlockedClaims} 次才采信):${sentinel.summary}`
      )
    }
  }
}

/**
 * 等这一轮真结束。首选 hook 状态,它自带 stateStartedAt,能把上一轮遗留的 done 排除掉;
 * 拿不到时退回标题字形 + PTY 静默,那条路没有时间戳,所以必须先看到它动起来才敢判结束。
 * 「等用户确认」单独一档:此时绝不能注入,否则提示词会被打进权限对话框。
 */
async function waitForRoundEnd(handle, sentAt, report, goalDeadline = Infinity) {
  await sleep(SETTLE_MS)
  let startedWorking = false
  let announcedNeedsUser = false
  let lastBusyAt = sentAt
  let longRunNoticed = false

  while (Date.now() < goalDeadline) {
    const activity = await observeAgent(handle)
    const verdict = classifyRound(activity, sentAt, QUIET_MS)

    if (verdict === 'disconnected') {
      return { failure: '终端已断开' }
    }
    if (verdict === 'needs-user') {
      if (!announcedNeedsUser) {
        announcedNeedsUser = true
        report.needsUser(activity.toolName)
      }
      await sleep(POLL_MS)
      continue
    }
    if (verdict === 'busy') {
      lastBusyAt = Date.now()
      if (!startedWorking) {
        startedWorking = true
        report.working(activity.source)
      } else if (!longRunNoticed && Date.now() - sentAt > 30 * 60_000) {
        longRunNoticed = true
        report.longRun(Math.round((Date.now() - sentAt) / 60_000))
      }
    }
    // finished 来自本轮的 hook 状态,可以直接采信。
    if (verdict === 'finished') {
      return { ok: true }
    }
    // quiet 只说明终端安静了 —— 只有确实见它动过,才算这一轮跑完;
    // 否则就是注入刚发出去、agent 还没接管,继续等。
    if (verdict === 'quiet' && startedWorking) {
      return { ok: true }
    }
    if (!startedWorking && !announcedNeedsUser && Date.now() - sentAt > START_MS) {
      return {
        failure: `注入后 ${Math.round(START_MS / 1000)} 秒 agent 毫无动静,可能没收到输入或已退出`
      }
    }
    // 卡死判定只看「多久没见它动过」。等你确认不算卡死,那是在等人。
    if (!announcedNeedsUser && Date.now() - lastBusyAt > STUCK_MS) {
      return {
        failure: `agent 已 ${Math.round(STUCK_MS / 60_000)} 分钟没有任何动静,且这一轮没有结束`
      }
    }
    await sleep(POLL_MS)
  }
  return { budgetHit: true }
}

async function buildInjection(goal, turn, pending) {
  const vars = { ...promptVars(goal, turn), ...pending.extra }
  const body = await renderPrompt(pending.name, vars, { flatten: !goal.promptFile })
  if (!goal.promptFile) {
    return body
  }
  return promptPointerLine(await writePromptFile(goal.key, turn, body))
}

// 预算写 0 表示不限。这里必须用 || 而不是 ?? —— 0 是有效取值,?? 只挡 null/undefined,
// 结果会让提示词里出现「Turn 4 of 0」,agent 可能据此以为预算已经耗尽。
function promptVars(goal, turn) {
  const noEvidence = turn === 1 ? '(首轮,没有上一轮可比)' : '(未能取得工作区指纹)'
  return {
    objective: goal.objective,
    claimPath: claimPath(goal.key),
    turns: turn,
    maxTurns: goal.budget.maxTurns || '不限',
    elapsedMinutes: Math.round((Date.now() - goal.startedAt) / 60_000),
    maxMinutes: goal.budget.maxMinutes || '不限',
    editsSource: noEvidence,
    editsTest: noEvidence,
    diffChanged: noEvidence,
    tamperNote: noEvidence
  }
}

function nextPrompt(action, acceptance, changed, findings) {
  if (action.prompt === 'rejected-completion') {
    return { name: 'rejected-completion', extra: failureVars(acceptance) }
  }
  if (action.prompt === 'tamper-challenge') {
    return {
      name: 'tamper-challenge',
      extra: { tamperList: action.findings.map((f) => `- ${f.label}:${f.detail}`).join('\n') }
    }
  }
  return { name: 'continuation', extra: evidenceVars(changed, findings) }
}

function evidenceVars(changed, findings) {
  const vars = { tamperNote: describeFindings(findings) }
  if (!changed) {
    return vars
  }
  const total = changed.source.length + changed.test.length
  return {
    ...vars,
    editsSource: changed.source.length ? changed.source.slice(0, 12).join(', ') : '无',
    editsTest: changed.test.length ? changed.test.slice(0, 12).join(', ') : '无',
    diffChanged: total > 0 ? '是' : '否 —— 上一轮没有产生任何文件改动'
  }
}

function failureVars(acceptance) {
  const { list, output } = describeFailures(acceptance)
  return { failureList: list, failureOutput: output || '(命令没有产生输出)' }
}

/** 预算耗尽时给 agent 最后一轮收尾的机会 —— 让它自己总结进度和剩余工作。 */
async function maybeSendWrapUp(goal, action, report) {
  if (action.state !== 'budget_exhausted') {
    return
  }
  try {
    const text = await renderPrompt('budget-limit', {
      limitKind: action.reason,
      turns: goal.turns,
      elapsedMinutes: Math.round((Date.now() - goal.startedAt) / 60_000),
      claimPath: claimPath(goal.key)
    })
    await sendText(goal.terminalHandle, text, { enter: true })
    report.warn('已发出收尾指令,循环结束')
  } catch (err) {
    report.warn(`收尾指令发送失败: ${err.message}`)
  }
}
