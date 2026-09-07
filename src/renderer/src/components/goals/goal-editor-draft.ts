import { translate } from '@/i18n/i18n'
import type {
  GoalBudget,
  GoalCriterion,
  GoalDetail,
  GoalOperation,
  GoalSpec
} from '../../../../shared/goals/goal-control-contract'
import { fingerprintPayload } from '@/goals/goal-client-operation'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import type { GoalEditorPrefill } from '@/goals/goals-domain-store'
import type { GoalTargetSelection } from './GoalTargetPicker'

/** Form state of the goal editor and the pure conversions around it. */
export type GoalDraft = {
  objective: string
  criteria: GoalCriterion[]
  acceptanceText: string
  extraChecks: string
  checkAll: boolean
  onBlocked: 'ask' | 'verify'
  maxTurns: string
  maxMinutes: string
  checkTimeoutSeconds: string
  acknowledgeUnverified: boolean
}

export const EMPTY_GOAL_DRAFT: GoalDraft = {
  objective: '',
  criteria: [],
  acceptanceText: '',
  extraChecks: '',
  checkAll: false,
  onBlocked: 'ask',
  maxTurns: '20',
  maxMinutes: '180',
  checkTimeoutSeconds: '900',
  acknowledgeUnverified: false
}

export function targetFromPrefill(prefill: GoalEditorPrefill | null): GoalTargetSelection {
  return { worktreeId: prefill?.worktreeId ?? null, paneKey: prefill?.paneKey ?? null }
}

export function isNonNegativeNumber(value: string): boolean {
  const n = Number(value)
  return value.trim() !== '' && Number.isFinite(n) && n >= 0
}

export function isPositiveNumber(value: string): boolean {
  const n = Number(value)
  return value.trim() !== '' && Number.isFinite(n) && n > 0
}

export function bindingFailureMessage(
  reason: 'pane-missing' | 'incarnation-missing' | 'workspace-mismatch'
): string {
  switch (reason) {
    case 'pane-missing':
      return translate(
        'goals.editor.paneMissing',
        'That session is no longer open. Pick another one.'
      )
    case 'incarnation-missing':
      return translate(
        'goals.editor.incarnationMissing',
        'Orca cannot pin this terminal; restart the session and retry.'
      )
    case 'workspace-mismatch':
      return translate(
        'goals.editor.workspaceMismatch',
        'That session belongs to another workspace.'
      )
  }
}

export function specFromDraft(draft: GoalDraft): GoalSpec {
  return {
    objective: draft.objective.trim(),
    criteria: draft.criteria
      .filter((criterion) => criterion.description.trim())
      .map((criterion) => ({
        id: criterion.id,
        description: criterion.description.trim(),
        ...(criterion.command?.trim() ? { command: criterion.command.trim() } : {})
      })),
    acceptanceText: draft.acceptanceText.trim(),
    extraChecks: draft.extraChecks
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    checkAll: draft.checkAll,
    onBlocked: draft.onBlocked
  }
}

export function budgetFromDraft(draft: GoalDraft): GoalBudget {
  return {
    maxTurns: Number(draft.maxTurns),
    maxMinutes: Number(draft.maxMinutes),
    checkTimeoutSeconds: Number(draft.checkTimeoutSeconds)
  }
}

export function draftFromDetail(detail: GoalDetail): GoalDraft {
  return {
    objective: detail.spec.objective,
    criteria: detail.spec.criteria.map((criterion) => ({ ...criterion })),
    acceptanceText: detail.spec.acceptanceText,
    extraChecks: detail.spec.extraChecks.join('\n'),
    checkAll: detail.spec.checkAll,
    onBlocked: detail.spec.onBlocked,
    maxTurns: String(detail.budget.maxTurns),
    maxMinutes: String(detail.budget.maxMinutes),
    checkTimeoutSeconds: String(detail.budget.checkTimeoutSeconds),
    acknowledgeUnverified: true
  }
}

/** Only what changed travels: spec alone bumps the revision, budget alone keeps it. */
export async function amendGoal(
  detail: GoalDetail,
  draft: GoalDraft,
  clientOperationId: string,
  resumeAfterSave: boolean
): Promise<GoalOperation> {
  const spec = specFromDraft(draft)
  const budget = budgetFromDraft(draft)
  const envelope = {
    goalId: detail.goalId,
    expectedRuntimeFence: detail.runtimeFence,
    expectedRunId: detail.runId,
    ...(JSON.stringify(spec) === JSON.stringify(detail.spec) ? {} : { spec }),
    ...(JSON.stringify(budget) === JSON.stringify(detail.budget) ? {} : { budget }),
    resumeAfterSave
  }
  return goalRuntimeClient.amend({
    ...envelope,
    clientOperationId,
    payloadFingerprint: await fingerprintPayload(envelope)
  })
}
