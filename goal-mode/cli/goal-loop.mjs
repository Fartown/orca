// 看门狗主循环:清认领 → 注入 → 等这一轮真结束 → 取证 → 判定 → 决定下一轮。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describeFailures, runAcceptance } from './acceptance-gate.mjs'
import { promptPointerLine, renderPrompt, writePromptFile } from './continuation-prompt.mjs'
import { claimPath, clearClaim, readClaim } from './goal-claim.mjs'
import { decide } from './goal-decision.mjs'
import { diffTrees, snapshotWorktree } from './git-snapshot.mjs'
import { describeFindings, scanRound } from './tamper-scan.mjs'
import { ROOT, appendLog, writeGoal } from './goal-state.mjs'
import { sendText } from './orca-terminal.mjs'
import { classifyRound, observeAgent } from './terminal-activity.mjs'

const num = (name, fallback) => Number(process.env[name] || fallback)
const SETTLE_MS = num('ORCA_GOAL_SETTLE_MS', 5_000) // 送出 \r 到 agent 接管之间的空窗
const QUIET_MS = num('ORCA_GOAL_QUIET_MS', 12_000) // 静默多久算这一轮停了
const POLL_MS = num('ORCA_GOAL_POLL_MS', 3_000)
// 观察终端要调 orca CLI,它偶发失败是常态(Orca 在重启、IPC 抖动、机器刚从休眠醒来)。
// 一轮要轮询几千次,把任何一次失败当致命,目标迟早死在一次抖动上 —— 实测发生过。
// 所以连续失败超过这个时长才判定「真的联系不上了」,中间一律重试。
const OBSERVE_GRACE_MS = num('ORCA_GOAL_OBSERVE_GRACE_MS', 3 * 60_000)
// 轮次里出错后重试多久才认输。给得比观察宽限长:这里的错可能要人去修
// (磁盘满了、模板文件没了、git 仓库坏了),留出察觉和补救的窗口。
const ROUND_ERROR_GRACE_MS = num('ORCA_GOAL_ROUND_ERROR_GRACE_MS', 10 * 60_000)
const START_MS = num('ORCA_GOAL_START_MS', 300_000) // 注入后多久还没有任何动静才认定没收到
// 只在 agent「不在干活」时才计的卡死上限。它还在跑就一直等 —— 大任务里一个 turn
// 连续调几十次工具跑上两三小时是正常的,拿单轮上限去砍它等于把干得好好的活腰斩。
// 真正的总闸是目标的时长预算,在下面 deadline 里查。
const STUCK_MS = num('ORCA_GOAL_STUCK_MS', 20 * 60_000)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 老记录没有这个字段。缺就当 0:旧的那个数是墙钟,本来就不代表消耗量,继承过来只会继续误导。 */
const activeMsOf = (goal) => goal.activeMs || 0

/**
 * @param {boolean} attach 挂载到一个已经在干活的会话:首轮不注入,先等它把手上这轮跑完再接管。
 *   目标已经在会话里了(比如上一次驱动退出但注入已落地),这时再注入会打断它。
 */
export async function runLoop(goal, { report, thresholds, attach = false }) {
  let current = goal
  let pending = { name: 'continuation', extra: {} }
  let attachPending = attach
  let injectedTurn = null // 这一轮的提示词已经送出去了吗 —— 重试时别送第二遍
  let errorSince = null // 连续出错的起点,成功跑完一轮就清掉

  while (true) {
    // 轮次里的任何一步都可能抛:git、fs、orca CLI、读提示词模板。
    // 早先这些错误会一路抛到顶层 catch,打印一行就 process.exit(1) —— 目标就此终结,
    // 记录还停在 active,从外面看只是「驱动没了」。同一个模式已经杀过它两次:
    // 一次是偶发的 CLI 调用失败,一次是被搬走的提示词模板。
    // 一个瞬时或局部的错误不该终结整个目标,所以这里重试,连续错够久了才认输 ——
    // 而且认输也要留下死因、留在可接回的状态。
    // 上一轮已经判了终局(达成/受阻/预算耗尽),但落盘或写日志失败被 catch 接住时,
    // 循环会带着一个 state 已是终态的目标继续注入 —— 一个已达成的目标会被一路改写成 blocked。
    if (current.state !== 'active') {
      return current
    }
    let turn = current.turns + 1
    try {
      const before = current.lastSnapshot || (await snapshotWorktree(current.worktreePath))
      if (before.kind === 'unavailable' && turn === 1) {
        report.warn(`空转熔断已关闭:${before.reason}`)
      }

      const sentAt = Date.now()
      let inject = true
      if (attachPending) {
        attachPending = false
        // attach 的前提是「它手上真有一轮在跑」。agent 已经空闲时干等是等一个不存在的轮次,
        // START_MS 一到就被判「毫无动静」受阻 —— 真发生过:上一轮声称完成后它就闲着了。
        inject = await safeToInject(current.terminalHandle)
        if (inject) {
          report.warn('接管时 agent 已空闲,没有在跑的轮次可挂 —— 改为正常注入')
        } else {
          report.attach(turn)
        }
      }
      if (inject) {
        // 清认领必须和注入绑在一起。早先它在循环体开头无条件执行,而重试是从体开头重来的:
        // 取证阶段抖一下,重试第一件事就是删掉 agent 上一轮已经写好的完成声明,
        // 而它已经闲下来不会再写第二次 —— 完成被静默吞掉,目标一路跑到预算耗尽。
        await clearClaim(current.key)
        const text = await buildInjection(current, turn, pending)
        report.round(turn, current.budget.maxTurns, pending.name)
        await sendText(current.terminalHandle, text, { enter: true })
        injectedTurn = turn
      }

      // 预算按「已经花掉的活跃时长」算,不是按日历。本轮最多还能跑 remaining。
      const remainingMs = current.budget.maxMinutes
        ? Math.max(0, current.budget.maxMinutes * 60_000 - activeMsOf(current))
        : Infinity
      const goalDeadline = remainingMs === Infinity ? Infinity : sentAt + remainingMs
      const outcome = await waitForRoundEnd(current.terminalHandle, sentAt, report, goalDeadline)
      // 这一轮实际花了多久,立刻记账 —— 下面每个出口分支都从 current 派生,记在这里才不会漏。
      current = { ...current, activeMs: activeMsOf(current) + (Date.now() - sentAt) }
      if (outcome.budgetHit) {
        current = {
          ...current,
          turns: turn,
          state: 'budget_exhausted',
          finishReason: `时长预算耗尽(累计跑了 ${Math.round(activeMsOf(current) / 60_000)} / ${current.budget.maxMinutes} 分钟),该轮仍在进行中`,
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
        // 终端断开、注入后没动静 —— 这些也可能只是一时的(Orca 在重启、机器刚睡醒),
        // 交给下面同一套重试:能恢复就接着跑,连续不好满 ROUND_ERROR_GRACE_MS 才认输。
        // 早先这里直接判 blocked 结束目标,是「一次意外终结目标」的另一条藏起来的路径。
        throw new Error(outcome.failure)
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
        const verifyStart = Date.now()
        acceptance = await runAcceptance(current.acceptance, {
          onCommandStart: (c) => report.command(c)
        })
        // 验收耗时同样计入预算:一次判定十几到四十分钟,是整条链上最贵的一步,
        // 不计的话唯一的总闸几乎不动 —— 实测 9 小时挂钟只记了 5 分钟。
        current = { ...current, activeMs: activeMsOf(current) + (Date.now() - verifyStart) }
        report.verified(acceptance)
        // 判词立刻落盘,再去干别的。裁判一次跑十几到四十分钟,是整条链上最贵的一步,
        // 却曾经是唯一不留痕的:它只在内存里待到「构造下一轮注入」那一刻。
        // 那一步一旦失败(真发生过),这几十分钟就白跑,连「为什么没通过」都查不到。
        await saveVerdict(current.key, turn, acceptance).catch((err) =>
          report.warn(`判词落盘失败(不影响本轮):${err?.message || err}`)
        )
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
        // 「这一轮干了什么」的主体。只记哈希的话,时间线上就只剩一句「第 N 轮」,
        // 看不出它到底动了什么。文件名截断保存,避免大改动把日志撑爆。
        changed: changed
          ? { source: changed.source.slice(0, 20), test: changed.test.slice(0, 20) }
          : null,
        acceptancePassed: acceptance?.passed ?? null,
        // 没通过的话把哪几条挂了记下来。全文在 verdict/ 里,这里只留摘要,免得撑爆日志。
        acceptanceFailed:
          acceptance && !acceptance.passed ? describeFailures(acceptance).list : null,
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
      if (errorSince) {
        report.warn(
          `第 ${turn} 轮已恢复正常(出错持续了 ${Math.round((Date.now() - errorSince) / 1000)} 秒)`
        )
      }
      errorSince = null
    } catch (err) {
      const message = err?.message || String(err)
      if (!errorSince) {
        errorSince = Date.now()
        report.warn(`第 ${turn} 轮出错,重试中:${message}`)
      }
      if (Date.now() - errorSince >= ROUND_ERROR_GRACE_MS) {
        current = {
          ...current,
          state: 'blocked',
          finishReason: `第 ${turn} 轮连续 ${Math.round(ROUND_ERROR_GRACE_MS / 60_000)} 分钟出错:${message}`,
          driverError: { kind: 'round', message: message.slice(0, 500), at: Date.now() },
          finishedAt: Date.now()
        }
        await writeGoal(current).catch(() => {})
        return current
      }
      // 已经注入过就别再注入一次 —— 重试时挂到 agent 手上那一轮上,和 resume 的语义一样。
      attachPending = injectedTurn === turn
      await sleep(POLL_MS)
    }
  }
}

/**
 * 现在往这个终端注入安不安全。
 *
 * 要问的不是「忙不忙」而是「安不安全」:agent 卡在权限确认框上时它并不忙,
 * 但这时注入会把整段提示词敲进那个对话框。所以只有明确处于「空闲在提示符前」
 * (finished / quiet)才放行,busy、needs-user、断开、判不出来一律不注入。
 *
 * sinceMs 传 0:这里问的是「此刻是什么状态」,不是「本轮有没有结束」,
 * 所以 hook 状态不论新旧都要采信 —— 传 Date.now() 会让 stateStartedAt > sinceMs 恒假,
 * needs-user 那一档直接变成死代码,权限对话框会被误判成空闲。
 */
async function safeToInject(handle) {
  try {
    const verdict = classifyRound(await observeAgent(handle), 0, QUIET_MS)
    return verdict === 'finished' || verdict === 'quiet'
  } catch {
    return false // 观察不到就别乱敲
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
  let waitingSince = null // 此刻正在等用户确认的起点;等待时长不该算进两道超时
  let startAt = sentAt // START_MS 的计时起点,等人的时间要往后顺延
  let lastBusyAt = sentAt
  let longRunNoticed = false

  let firstObserveError = null // 连续失败的起点,恢复了就清掉

  while (Date.now() < goalDeadline) {
    let activity
    try {
      activity = await observeAgent(handle)
      if (firstObserveError) {
        report.warn(
          `观察恢复正常(中断了 ${Math.round((Date.now() - firstObserveError.at) / 1000)} 秒)`
        )
        firstObserveError = null
      }
    } catch (err) {
      // 一次失败不算数,连续失败够久才算联系不上。
      if (!firstObserveError) {
        firstObserveError = { at: Date.now(), message: err?.message || String(err) }
        report.warn(`观察终端失败,重试中:${firstObserveError.message}`)
      }
      if (Date.now() - firstObserveError.at >= OBSERVE_GRACE_MS) {
        return {
          failure: `连续 ${Math.round(OBSERVE_GRACE_MS / 60_000)} 分钟观察不到终端:${firstObserveError.message}`
        }
      }
      await sleep(POLL_MS)
      continue
    }
    const verdict = classifyRound(activity, sentAt, QUIET_MS)

    if (verdict === 'disconnected') {
      return { failure: '终端已断开' }
    }
    if (verdict === 'needs-user') {
      if (!announcedNeedsUser) {
        announcedNeedsUser = true
        report.needsUser(activity.toolName)
      }
      waitingSince = waitingSince ?? Date.now()
      await sleep(POLL_MS)
      continue
    }
    if (waitingSince) {
      // 刚从「等你确认」里出来:两道超时的计时都要从这一刻重新起算,
      // 否则你思考的那段时间会被算成 agent 没动静。
      // 而这个标志必须清掉 —— 早先它只置位不复位,于是本轮只要等过一次人,
      // START_MS 和 STUCK_MS 就对这一整轮永久失效:agent 之后崩掉也没人管,
      // 配 --max-minutes 0 就是永久挂起。
      const waitedMs = Date.now() - waitingSince
      waitingSince = null
      announcedNeedsUser = false
      startAt += waitedMs
      lastBusyAt = Date.now()
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
    if (!startedWorking && Date.now() - startAt > START_MS) {
      return {
        failure: `注入后 ${Math.round(START_MS / 1000)} 秒 agent 毫无动静,可能没收到输入或已退出`
      }
    }
    // 卡死判定只看「多久没见它动过」。等你确认不算卡死,那是在等人。
    if (Date.now() - lastBusyAt > STUCK_MS) {
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
    elapsedMinutes: Math.round(activeMsOf(goal) / 60_000),
    maxMinutes: goal.budget.maxMinutes || '不限',
    editsSource: noEvidence,
    editsTest: noEvidence,
    diffChanged: noEvidence,
    tamperNote: noEvidence
  }
}

function nextPrompt(action, acceptance, changed, findings) {
  if (action.prompt === 'gate-unavailable') {
    return { name: 'gate-unavailable', extra: failureVars(acceptance) }
  }
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

/**
 * 把这一轮的验收判词写进 ~/.orca-goal/verdict/<key>-turn<N>.md。
 * 一条命令一节,原样保留裁判的输出 —— 驳回理由是下一轮要改什么的唯一依据,
 * 也是人事后回看「它到底卡在哪」的唯一材料。
 */
async function saveVerdict(key, turn, acceptance) {
  const dir = path.join(ROOT, 'verdict')
  await fs.mkdir(dir, { recursive: true })
  const body = acceptance.results
    .map((r) => `## ${r.ok ? '通过' : '未通过'}:${r.command}\n\n${r.output || '(没有输出)'}`)
    .join('\n\n')
  await fs.writeFile(
    path.join(dir, `${key}-turn${turn}.md`),
    `# 第 ${turn} 轮验收 —— ${acceptance.passed ? '全部通过' : '未通过'}\n\n${body}\n`,
    'utf8'
  )
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
      elapsedMinutes: Math.round(activeMsOf(goal) / 60_000),
      claimPath: claimPath(goal.key)
    })
    await sendText(goal.terminalHandle, text, { enter: true })
    report.warn('已发出收尾指令,循环结束')
  } catch (err) {
    report.warn(`收尾指令发送失败: ${err.message}`)
  }
}
