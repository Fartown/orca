import type { GoalEvidence } from '../../shared/goals/goal-control-contract'
import { GOAL_WHOLE_VERDICT_ID } from '../../shared/goals/goal-judge-contract'
import type { GoalRecord, LegacyGoalRecord } from '../../shared/goals/goal-store-records'

/**
 * Evidence rows from the v1 driver's last acceptance run: one per command, plus
 * one per criterion the item-mode judge answered, or one whole-goal row when the
 * judge ruled on the goal as a whole. Results from an earlier
 * definition revision are shown as stale, never as current passes, and a judge
 * verdict for an id the current definition does not declare carries no
 * criterion (it can never count as one of the user's items passing).
 */
export function projectGoalEvidence(
  record: GoalRecord,
  legacy: LegacyGoalRecord | null
): GoalEvidence[] {
  const last = legacy?.lastAcceptance
  if (!last?.result.results) {
    return []
  }
  const runId = record.currentRun?.runId ?? legacy?.runId ?? null
  if (!runId) {
    return []
  }
  const commandToCriterion = new Map(
    record.spec.criteria.filter((c) => c.command).map((c) => [c.command as string, c.id])
  )
  const declaredCriteria = new Set(record.spec.criteria.map((c) => c.id))
  const evidenceRevision = legacy?.specRevision ?? record.specRevision
  const stale = evidenceRevision !== record.specRevision
  const turn = legacy?.turns ?? 0
  const base = {
    runId,
    specRevision: evidenceRevision,
    turn,
    artifactId: null,
    snapshotTree: last.tree
  }
  return last.result.results.flatMap((result, index) => {
    const commandRow: GoalEvidence = {
      ...base,
      id: `${runId}:${turn}:${index}`,
      criterionId: commandToCriterion.get(result.command) ?? null,
      status: stale
        ? 'stale'
        : result.inconclusive
          ? 'inconclusive'
          : result.ok
            ? 'passed'
            : 'failed',
      source: 'command',
      summary: `${result.command}\n${(result.output ?? '').slice(0, 200)}`.trim()
    }
    const judgeRows: GoalEvidence[] = (result.items ?? []).map((item) => ({
      ...base,
      id: `${runId}:${turn}:${index}:${item.id}`,
      criterionId: declaredCriteria.has(item.id) ? item.id : null,
      status: stale ? 'stale' : item.status,
      source: 'judge',
      // 整体判词是整个目标的结果,不属于任何一条验收项。
      ...(item.id === GOAL_WHOLE_VERDICT_ID ? { scope: 'goal' as const } : {}),
      summary: item.reason ?? ''
    }))
    return [commandRow, ...judgeRows]
  })
}
