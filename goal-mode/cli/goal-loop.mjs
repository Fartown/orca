// 看门狗主循环:清认领 → 注入 → 等这一轮真结束 → 取证 → 判定 → 决定下一轮。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { describeFailures, runAcceptance } from './acceptance-gate.mjs'
import { promptPointerLine, renderPrompt, writePromptFile } from './continuation-prompt.mjs'
import { claimPath, clearClaim, readClaim } from './goal-claim.mjs'
import { decide } from './goal-decision.mjs'
import { diffText, diffTrees, snapshotWorktree } from './git-snapshot.mjs'
import { describeFindings, scanRound } from './tamper-scan.mjs'
import { ROOT, appendLog, writeGoal } from './goal-state.mjs'
import { sendText } from './orca-terminal.mjs'
import { classifyRound, observeAgent } from './terminal-activity.mjs'
import { advanceWait, initialWaitState } from './round-wait-machine.mjs'
import { notifyDesktop } from './desktop-notification.mjs'

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
// 一轮最短要占多久。判定再怎么误判,也不该出现「几秒一轮」——
// 那会在几秒内烧光轮数预算,并向终端连灌几十条提示词。实测复现过:6 秒跑完 20 轮。
const MIN_ROUND_MS = num('ORCA_GOAL_MIN_ROUND_MS', 15_000)
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
      // 计时起点取在**发送之后**:取在之前的话,落在「取时刻 → 发送返回」这个窗口里的
      // 上一轮结束事件会被当成本轮的结束,一轮几秒就「跑完」,轮数预算几秒烧光、
      // 终端被连灌几十条提示词。git 工作区还有空转熔断兜底,文件夹工作区完全没有。
      const sentAt = Date.now()
      // 本轮起点落盘:面板要显示「这一轮跑了多久」,而记录是一轮结束才写的 ——
      // 拿「现在减记录更新时间」当本轮耗时,跑到一半时会把上一轮结束到现在的全部时间算进来。
      current = { ...current, roundStartedAt: sentAt }
      await writeGoal(current).catch(() => {})

      // 预算按「已经花掉的活跃时长」算,不是按日历。本轮最多还能跑 remaining。
      const remainingMs = current.budget.maxMinutes
        ? Math.max(0, current.budget.maxMinutes * 60_000 - activeMsOf(current))
        : Infinity
      const goalDeadline = remainingMs === Infinity ? Infinity : sentAt + remainingMs
      const outcome = await waitForRoundEnd(
        current.terminalHandle,
        sentAt,
        report,
        goalDeadline,
        inject
      )
      // 判定说结束了,但这一轮短得不像话 —— 多半是把上一轮的结束事件当成了本轮的。
      // 补足最短间隔再进下一轮,别让误判把预算和终端一起冲垮。
      const roundMs = Date.now() - sentAt
      if (outcome.ok && roundMs < MIN_ROUND_MS) {
        await sleep(MIN_ROUND_MS - roundMs)
      }
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
        await logTerminalRound(current, turn, pending.name)
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

      // 取证阶段:几乎免费,而且下游本来就支持空值(判定会自动关掉指纹类熔断)。
      // 所以它失败时降级,不把整轮拖去重来 —— 重来会连带把验收也重跑一遍。
      const { after, changed, findings } = await collectEvidence(current, before, report)
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
        // 验收是整条链上最贵的一步(一次判定十几到四十分钟)。
        // 同一轮、同一份工作区内容重试时直接读回上次的结果 —— 早先落盘之后任何一步出错,
        // 重试都会把四批裁判从头再跑一遍,而判词其实已经在盘上了。
        const cached = reusableAcceptance(current, after)
        if (cached) {
          report.warn('复用本轮已经跑过的验收结果,不重跑裁判')
          acceptance = cached
        } else {
          report.verifying(current.acceptance.commands)
          const verifyStart = Date.now()
          // 本轮动过「验证方式本身」的话,把真实 diff 摆给裁判,让它按原始意图裁决 ——
          // 而不是由守卫用静态规则替人判断这次改动是修错还是作弊。
          const gateChangesFile = await writeGateChanges(current, before, after, findings)
          acceptance = await runAcceptance(current.acceptance, {
            onCommandStart: (c) => report.command(c),
            env: gateChangesFile ? { ORCA_GOAL_GATE_CHANGES: gateChangesFile } : undefined
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
          current = {
            ...current,
            lastAcceptance: { tree: after.kind === 'git' ? after.tree : null, result: acceptance }
          }
        }
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

      // 「等你确认」:agent 说它受阻了,而守卫核实不了。不终结目标,也不再注入 ——
      // 停在这里等人。真受阻的场景(缺权限、缺凭证、需求有歧义)本来就必须人介入,
      // 自动终结反而把这个「需要人处理」的信号变成了终点。
      // 任何人跟 agent 说了话(它重新忙起来)就自动接着跑,不需要再敲一次命令。
      if (verdict.action.type === 'await-user') {
        current = { ...current, awaitingUser: { reason: verdict.action.reason, since: Date.now() } }
        await writeGoal(current)
        report.awaitUser(verdict.action.reason)
        // 停下等人是唯一「不叫人就永远不会动」的状态,必须主动通知,不能只写日志。
        notifyDesktop('orca-goal:等你确认', verdict.action.reason.slice(0, 160))
        await waitForUser(current.terminalHandle, report)
        current = { ...current, awaitingUser: null }
        await writeGoal(current)
        attachPending = true // 人可能已经给它新指令了,别打断
        errorSince = null
        continue
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
        await logTerminalRound(current, turn, pending.name)
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
/**
 * 终止分支也要在逐轮日志里留一条。
 * 早先只有正常轮次写日志,于是目标是「戛然而止」的:JSONL 里缺最后一轮,
 * 面板据此推算「正在跑第几轮」就会错位,查因也只能去翻驱动的纯文本输出。
 */
async function logTerminalRound(goal, turn, promptName) {
  await appendLog(goal.key, {
    at: new Date(goal.updatedAt || Date.now()).toISOString(),
    turn,
    prompt: promptName,
    claim: null,
    tree: null,
    head: null,
    changed: null,
    acceptancePassed: null,
    acceptanceFailed: null,
    findings: null,
    action: 'finish',
    state: goal.state,
    reason: goal.finishReason || null
  }).catch(() => {})
}

/**
 * 取证阶段:快照 + 树 diff + 篡改扫描。
 * 失败时降级而不是让整轮重来 —— 下游对空值本来就有定义(判定会自动关掉指纹类熔断),
 * 而重来会把同一轮里最贵的验收也一起重跑。
 */
async function collectEvidence(goal, before, report) {
  try {
    const after = await snapshotWorktree(goal.worktreePath)
    const changed = await diffTrees(goal.worktreePath, before, after)
    const findings = await scanRound(goal.worktreePath, before, after, changed)
    return { after, changed, findings }
  } catch (err) {
    report.warn(`取证失败,本轮按「拿不到指纹」处理:${err?.message || err}`)
    return {
      after: { kind: 'unavailable', reason: String(err?.message || err) },
      changed: null,
      findings: []
    }
  }
}

/**
 * 已经判过的工作区内容不必再判一次。
 *
 * 键只用树哈希,不用轮次:重试时轮次号已经推进(turns 在验收之前就写了),按轮次永远命中不了。
 * 而按内容更准 —— 同一份内容的判词本来就还成立,内容一变缓存自然失效。
 * 拿不到指纹(非 git 工作区)时不缓存:那时无法判断内容有没有变。
 */
function reusableAcceptance(goal, after) {
  const last = goal.lastAcceptance
  const tree = after.kind === 'git' ? after.tree : null
  if (!last || !tree || last.tree !== tree) {
    return null
  }
  return last.result
}

/**
 * 把本轮「决定检查怎么跑」的改动写成一份 diff 交给裁判。
 * 不预设动机:断言、门禁、ignore 规则本身就可能是错的,人发现写错了也会直接删掉它 ——
 * 静态规则区分不了「为蒙混而改松」和「因为它本来就错而改掉」,差别在于有没有正当理由,
 * 而能判断理由的只有裁判。所以守卫只把改动摆出来,不替人下判决。
 */
async function writeGateChanges(goal, before, after, findings) {
  const gate = (findings || []).filter((f) => f.challenge)
  if (gate.length === 0) {
    return null
  }
  const files = [...new Set(gate.flatMap((f) => String(f.detail || '').split(/,\s*/)))].filter(
    Boolean
  )
  const diff = await diffText(goal.worktreePath, before, after, files).catch(() => '')
  const body = gate.map((f) => `- ${f.label}:${f.detail}`).join('\n') + (diff ? `\n\n${diff}` : '')
  const dir = path.join(ROOT, 'gate-changes')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${goal.key}-turn${goal.turns + 1}.diff`)
  await fs.writeFile(file, body, 'utf8')
  return file
}

/** 停下来等人:不注入、不判卡死,直到 agent 重新动起来。 */
async function waitForUser(handle, report) {
  let announced = false
  while (true) {
    if (await isAgentBusy(handle)) {
      report.warn('agent 重新开始动了,继续跑')
      return
    }
    if (!announced) {
      announced = true
      report.warn('已停下等人 —— 在那个终端里回复 agent 即可继续,或用 orca-goal stop 收摊')
    }
    await sleep(POLL_MS)
  }
}

/** 此刻它在动吗(与「注入安不安全」相反:这里只问忙不忙)。 */
async function isAgentBusy(handle) {
  try {
    return classifyRound(await observeAgent(handle), 0, QUIET_MS) === 'busy'
  } catch {
    return false
  }
}

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
async function waitForRoundEnd(handle, sentAt, report, goalDeadline = Infinity, injected = true) {
  await sleep(SETTLE_MS)
  // 判定本身在 round-wait-machine 里,是纯函数;这里只负责观察、报告和睡觉。
  const limits = {
    startMs: START_MS,
    stuckMs: STUCK_MS,
    observeGraceMs: OBSERVE_GRACE_MS,
    longRunMs: 30 * 60_000
  }
  let state = initialWaitState(sentAt, injected)

  while (Date.now() < goalDeadline) {
    let event
    try {
      const activity = await observeAgent(handle)
      event = {
        ok: true,
        now: Date.now(),
        verdict: classifyRound(activity, sentAt, QUIET_MS),
        source: activity.source,
        toolName: activity.toolName
      }
    } catch (err) {
      event = { ok: false, now: Date.now(), message: err?.message || String(err) }
    }

    const step = advanceWait(state, event, limits)
    state = step.state
    for (const n of step.notices) {
      reportWaitNotice(report, n)
    }
    if (step.outcome.type === 'done') {
      return { ok: true }
    }
    if (step.outcome.type === 'failure') {
      return { failure: step.outcome.reason }
    }
    await sleep(POLL_MS)
  }
  return { budgetHit: true }
}

/** 状态机吐出来的事件怎么讲给人听 —— 纯函数不碰 I/O,呈现留在这里。 */
function reportWaitNotice(report, notice) {
  if (notice.kind === 'observe-failed') {
    report.warn(`观察终端失败,重试中:${notice.message}`)
  } else if (notice.kind === 'observe-recovered') {
    report.warn(`观察恢复正常(中断了 ${Math.round(notice.outMs / 1000)} 秒)`)
  } else if (notice.kind === 'needs-user') {
    report.needsUser(notice.toolName)
  } else if (notice.kind === 'working') {
    report.working(notice.source)
  } else if (notice.kind === 'long-run') {
    report.longRun(notice.minutes)
  }
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
  if (action.prompt === 'blocked-but-passing') {
    return { name: 'blocked-but-passing', extra: {} }
  }
  if (action.prompt === 'gate-unavailable') {
    return { name: 'gate-unavailable', extra: failureVars(acceptance) }
  }
  if (action.prompt === 'rejected-completion') {
    return { name: 'rejected-completion', extra: failureVars(acceptance) }
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
