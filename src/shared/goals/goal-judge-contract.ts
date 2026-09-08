import type { GoalSpec } from './goal-control-contract'

/**
 * The whole-goal verdict rides the same judge-items wire as item verdicts, under one
 * reserved id. Criterion ids are uuids, so it can never be counted as one of them passing.
 */
export const GOAL_WHOLE_VERDICT_ID = 'orca-goal:whole'

/** Verdict prose kept on the evidence row; same ceiling as the gate's per-command capture. */
export const GOAL_WHOLE_VERDICT_TEXT_MAX = 4_000

/** A picked judge with nothing left to judge item by item rules on the goal as a whole. */
export function judgeRunsWholeGoal(
  spec: Pick<GoalSpec, 'judge' | 'criteria' | 'acceptanceDocument'>
): boolean {
  return (
    (spec.judge ?? 'none') !== 'none' &&
    (Boolean(spec.acceptanceDocument) || spec.criteria.every((c) => Boolean(c.command)))
  )
}

/** The goal's own text: objective, the numbered criteria, then the overall acceptance notes. */
export function composeGoalAcceptanceText(
  spec: Pick<GoalSpec, 'objective' | 'criteria' | 'acceptanceText' | 'acceptanceDocument'>
): string {
  if (spec.acceptanceDocument) {
    return spec.acceptanceDocument
  }
  const parts = [spec.objective.trim()]
  if (spec.criteria.length > 0) {
    parts.push(`验收标准:\n${spec.criteria.map((c, i) => `${i + 1}. ${c.description}`).join('\n')}`)
  }
  if (spec.acceptanceText.trim()) {
    parts.push(spec.acceptanceText.trim())
  }
  return parts.join('\n\n')
}
