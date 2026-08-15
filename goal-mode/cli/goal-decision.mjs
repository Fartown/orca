// 决策核心:纯函数,不碰 I/O。所有循环终止条件都在这里,便于直接测。
export const DEFAULT_THRESHOLDS = {
  maxFalseClaims: 3, // 连续假完成多少次判定为卡死
  maxBlockedClaims: 2, // 连续声称受阻多少次才采信
  maxStallRounds: 3, // 连续多少轮工作区零变化判定为空转
  maxTamperChallenges: 2, // 因削弱验收被挡回多少次后不再给机会
  maxGateFailures: 2 // 验收闸门连续多少次无法给出判定后叫人 —— 这是叫人,不是判 agent 有错
}

/**
 * @param {object} goal 当前目标状态(不会被修改)
 * @param {object} obs  {now, sentinel, snapshot, acceptance}
 *   sentinel: {kind:'complete'|'blocked', summary} | null —— 本轮 agent 输出里的哨兵行
 *   snapshot: git-snapshot 的结果
 *   acceptance: {passed, failures} | null —— null 表示还没跑
 * @returns {{action: object, goal: object}}
 *   action.type: 'verify' | 'continue' | 'finish'
 */
export function decide(goal, obs, thresholds = DEFAULT_THRESHOLDS) {
  const next = { ...goal, updatedAt: obs.now }
  const budget = goal.budget || {}
  // 预算算的是花掉的活跃时长,不是日历天数:目标停着、驱动崩着的时间不该扣预算。
  // runLoop 在每轮结束时已经把这一轮折进 activeMs 了。老记录没这个字段,退回墙钟。
  const elapsedMs = goal.activeMs != null ? goal.activeMs : obs.now - goal.startedAt

  // 篡改证据先入账,后面所有分支共用。
  // 一轮里 decide 会被调两次(先判要不要验收,再带着验收结果判),两次传进来的 goal 都是本轮起点,
  // 所以这里每次都从 goal.tamperFindings 重新拼一遍,结果一致,不会重复累加。
  //
  // suppressedKeys 挡的是一个反馈回路:agent 为了回应质证去改那个文件,本身又会被扫出同一处发现,
  // 于是质证套质证,最后误判成受阻。只压制紧接质证的那一轮,再往后同一处又出现仍然要质证。
  const suppressed = new Set(goal.suppressedKeys || [])
  next.suppressedKeys = []
  next.tamperFindings = [
    ...(goal.tamperFindings || []),
    ...(obs.findings || [])
      .filter((f) => !suppressed.has(f.key))
      .map((f) => ({ ...f, turn: goal.turns }))
  ]

  // 工作区指纹是每一轮都要更新的基线,和走哪条判定分支无关。
  // 早先它写在函数末尾,于是「声称完成」那一整块的所有 return 都绕过了它:
  // 完成声明被验收驳回后基线原地不动,下一轮的「本轮改了什么」会把上一轮的改动也算进来,
  // 空转判定也拿着几轮前的旧基线比 —— 反复声称完成就能一直躲开空转熔断。
  next.lastSnapshot = obs.snapshot

  // 空转计数同理:它衡量的是「工作区有没有动」,和这一轮走哪条判定分支无关。
  // 早先它只在普通轮次里更新,于是「大改一片 + 声称完成 + 验收没过」的那一轮
  // 既不清零也不累加,前后两个空轮就能凑够阈值,判词却说「连续 3 轮零变化」。
  // 三值:true=和上一轮一样(没进展)、false=变了、null=指纹拿不到(未知 ≠ 没变)
  const unchangedThisRound = sameFingerprint(goal.lastSnapshot, obs.snapshot)
  if (unchangedThisRound === true) {
    next.stallCount = goal.stallCount + 1
  } else if (unchangedThisRound === false) {
    next.stallCount = 0
  }

  // 声称完成优先于预算判定:最后一轮真做完了,不该被记成预算耗尽。
  if (obs.sentinel?.kind === 'complete') {
    next.blockedClaims = 0
    const hasChecks = (goal.acceptance?.commands || []).length > 0

    if (!hasChecks) {
      return finish(next, 'complete', `agent 声称完成,且未配置验收命令(未经验证)`, {
        verified: false,
        summary: obs.sentinel.summary
      })
    }
    if (!obs.acceptance) {
      return { action: { type: 'verify' }, goal: next }
    }

    // 门禁自己没跑成(裁判起不来、超时、没给出判词)——「没判成」不是「判定为否」。
    // 这时守卫已经没有判定能力了,把它记成 agent 反复假报完成,是把自己的故障写成对方的诚信问题。
    // 实测发生过:codex 配的模型不可用,四次验收秒失败,假完成计数照涨。
    if (obs.acceptance.inconclusive) {
      next.gateFailures = (goal.gateFailures || 0) + 1
      if (next.gateFailures >= thresholds.maxGateFailures) {
        return finish(
          next,
          'blocked',
          `验收闸门连续 ${next.gateFailures} 次无法给出判定,需要人来看一眼(这不是 agent 的问题)`
        )
      }
      return {
        action: { type: 'continue', prompt: 'gate-unavailable', acceptance: obs.acceptance },
        goal: next
      }
    }
    next.gateFailures = 0

    if (obs.acceptance.passed) {
      // 验收绿了不等于验收还是原来那个验收 —— 但守卫不该替人判断这次改动是修错还是作弊。
      // 改动的 diff 已经随验收一起交给裁判了(见 goal-loop 的 writeGateChanges),
      // 裁判按原始意图判过之后还说通过,守卫就没有理由再挡。
      // 守卫在这里只做两件事:记录,以及在「反复削弱」这种模式出现时叫人。
      const gateTouched = (obs.findings || []).filter((f) => f.challenge)
      if (gateTouched.length > 0) {
        next.tamperChallenges = (goal.tamperChallenges || 0) + 1
        if (next.tamperChallenges > thresholds.maxTamperChallenges) {
          return {
            action: {
              type: 'await-user',
              reason: `第 ${next.tamperChallenges} 次在改动验证方式的同时通过验收,需要人看一眼是不是在削弱验收`,
              findings: gateTouched
            },
            goal: next
          }
        }
      }
      return finish(next, 'complete', '验收通过', {
        verified: true,
        summary: obs.sentinel.summary,
        gateTouched: gateTouched.length || undefined
      })
    }

    next.falseClaims = goal.falseClaims + 1
    if (next.falseClaims >= thresholds.maxFalseClaims) {
      return finish(next, 'blocked', `连续 ${next.falseClaims} 次声称完成但验收未通过,停止循环`)
    }
    const overBudget = budgetVerdict(next, budget, elapsedMs)
    if (overBudget) {
      return finish(next, 'budget_exhausted', `${overBudget}(最后一次完成声明未通过验收)`)
    }
    return {
      action: { type: 'continue', prompt: 'rejected-completion', acceptance: obs.acceptance },
      goal: next
    }
  }

  if (obs.sentinel?.kind === 'blocked') {
    next.blockedClaims = goal.blockedClaims + 1
    if (next.blockedClaims >= thresholds.maxBlockedClaims) {
      const reason = obs.sentinel.summary || 'agent 连续声称受阻'
      // 说「完成」要过全部裁判,说「受阻」原来零核实、连写两轮就下班 ——
      // 对一个想收工的 agent 这是全局最省事的路径,而人在界面上只看得到它自己写的那句理由。
      //
      // verify:让它也付出代价 —— 跑一次验收。全绿本身就证伪了「受阻」。
      // ask(默认):不终结目标,叫人来看。真受阻的场景(缺权限、缺凭证、需求有歧义)
      //   本来就必须人介入,自动终结反而把这个「需要人处理」的信号变成了终点。
      if (goal.onBlocked === 'verify' && (goal.acceptance?.commands || []).length > 0) {
        if (!obs.acceptance) {
          return { action: { type: 'verify', because: 'blocked-claim' }, goal: next }
        }
        if (obs.acceptance.passed) {
          // 它说受阻,验收却全绿 —— 这条声明被自己的工作证伪了,继续跑。
          next.blockedClaims = 0
          return { action: { type: 'continue', prompt: 'blocked-but-passing' }, goal: next }
        }
      }
      return { action: { type: 'await-user', reason, claim: obs.sentinel }, goal: next }
    }
  } else {
    next.blockedClaims = 0
  }

  // 空转熔断。计数已在函数开头更新过(所有分支共用),这里只做阈值判定 ——
  // 但必须仍然要求「本轮确实没变」:指纹拿不到时不能拿历史计数判人空转。
  if (unchangedThisRound === true && next.stallCount >= thresholds.maxStallRounds) {
    return finish(next, 'stalled', `连续 ${next.stallCount} 轮工作区无任何变化,判定为空转`)
  }

  const overBudget = budgetVerdict(next, budget, elapsedMs)
  if (overBudget) {
    return finish(next, 'budget_exhausted', overBudget)
  }

  return { action: { type: 'continue', prompt: 'continuation' }, goal: next }
}

function budgetVerdict(goal, budget, elapsedMs) {
  if (budget.maxTurns && goal.turns >= budget.maxTurns) {
    return `轮数预算耗尽(${goal.turns}/${budget.maxTurns} 轮)`
  }
  if (budget.maxMinutes && elapsedMs >= budget.maxMinutes * 60_000) {
    return `时长预算耗尽(${Math.round(elapsedMs / 60_000)}/${budget.maxMinutes} 分钟)`
  }
  return null
}

function sameFingerprint(a, b) {
  if (!a || !b || a.kind !== 'git' || b.kind !== 'git') {
    return null
  }
  return a.tree === b.tree && a.head === b.head
}

function finish(goal, state, reason, extra = {}) {
  return {
    action: { type: 'finish', state, reason, ...extra },
    goal: { ...goal, state, finishReason: reason, finishedAt: goal.updatedAt }
  }
}
