// 决策核心:纯函数,不碰 I/O。所有循环终止条件都在这里,便于直接测。
export const DEFAULT_THRESHOLDS = {
  maxFalseClaims: 3, // 连续假完成多少次判定为卡死
  maxBlockedClaims: 2, // 连续声称受阻多少次才采信
  maxStallRounds: 3, // 连续多少轮工作区零变化判定为空转
  maxTamperChallenges: 2 // 因削弱验收被挡回多少次后不再给机会
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

    if (obs.acceptance.passed) {
      // 验收绿了不等于验收还是原来那个验收。有未质证的削弱痕迹就先挡一轮。
      const pending = next.tamperFindings.filter((f) => f.challenge && !f.acknowledged)
      if (pending.length > 0) {
        next.tamperChallenges = (goal.tamperChallenges || 0) + 1
        next.tamperFindings = next.tamperFindings.map((f) => ({ ...f, acknowledged: true }))
        next.suppressedKeys = pending.map((f) => f.key)
        if (next.tamperChallenges > thresholds.maxTamperChallenges) {
          return finish(
            next,
            'blocked',
            `被指出削弱验收后仍在继续,已挡回 ${thresholds.maxTamperChallenges} 次,停止循环`
          )
        }
        return {
          action: { type: 'continue', prompt: 'tamper-challenge', findings: pending },
          goal: next
        }
      }
      return finish(next, 'complete', '验收通过', {
        verified: true,
        summary: obs.sentinel.summary
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
      return finish(next, 'blocked', obs.sentinel.summary || 'agent 连续声称受阻')
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
