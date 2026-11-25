import type { GoalAcceptanceDraft } from '../../shared/goals/goal-acceptance-draft-contract'
import type {
  GoalDetail,
  GoalOperation,
  GoalSummary
} from '../../shared/goals/goal-control-contract'

export function formatDraft(draft: GoalAcceptanceDraft): string {
  const lines = [
    `Draft: ${draft.draftId}`,
    `Status: ${draft.status}`,
    `Guard: ${draft.judge}`,
    `Workspace: ${draft.workspace}`
  ]
  if (draft.documentPath) {
    lines.push(`Checklist file: ${draft.documentPath}`)
  }
  if (draft.error) {
    lines.push(`Error: ${draft.error}`)
  }
  if (draft.status === 'generating') {
    lines.push('', `Next: orca goal checklist ${draft.draftId} --wait`)
  }
  if (draft.status === 'ready' && draft.document) {
    lines.push(
      '',
      draft.document.trim(),
      '',
      `Show this checklist to the user. After they confirm: orca goal start ${draft.draftId} --terminal <handle>`
    )
  }
  return lines.join('\n')
}

export function formatOperation(operation: GoalOperation): string {
  const lines = [
    `Goal: ${operation.goalId ?? '-'}`,
    `Operation: ${operation.status}${operation.code ? ` (${operation.code})` : ''}`
  ]
  if (operation.message) {
    lines.push(operation.message)
  }
  return lines.join('\n')
}

function summaryLine(goal: GoalSummary): string {
  return `${goal.goalId}  ${goal.phase}  ${goal.completion}  turns=${goal.turns}  ${goal.objectivePreview}`
}

export function formatGoalList(result: { items: GoalSummary[] }): string {
  return result.items.length === 0 ? 'No goals.' : result.items.map(summaryLine).join('\n')
}

export function formatGoalDetail(goal: GoalDetail): string {
  const lines = [
    summaryLine(goal),
    `Workspace: ${goal.workspace.path}`,
    `Terminal: ${goal.binding.terminal}`,
    `Guard: ${goal.spec.judge}`,
    `Continuation: ${goal.continuation}`
  ]
  if (goal.reason) {
    lines.push(`Reason: ${goal.reason}`)
  }
  for (const notice of goal.notices ?? []) {
    lines.push(`Notice: ${notice.text}`)
  }
  return lines.join('\n')
}
