import { CircleAlert, CircleCheck, CircleDashed, CircleX } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { GoalDetail, GoalEvidence } from '../../../../shared/goals/goal-control-contract'
import { judgeRunsWholeGoal } from '../../../../shared/goals/goal-judge-contract'

type CriterionStatus = GoalEvidence['status'] | 'not_verified'

/**
 * One row per user-declared criterion, plus the extra checks, plus the whole-goal
 * verdict when a judge ruled on the goal as a whole. Only evidence from the current
 * spec revision counts; anything older reads as not verified.
 */
export function GoalProgress({ detail }: { detail: GoalDetail }): React.JSX.Element | null {
  const criteria = detail.spec.criteria
  const extraChecks = detail.spec.extraChecks
  const current = detail.evidence.filter((row) => row.specRevision === detail.specRevision)
  const wholeGoal = judgeRunsWholeGoal(detail.spec)
  const whole = current.find((row) => row.scope === 'goal')
  if (criteria.length === 0 && extraChecks.length === 0 && !wholeGoal) {
    return (
      <section className="space-y-1">
        <h3 className="text-[11px] font-semibold text-muted-foreground">
          {translate('goals.progress.title', 'Acceptance')}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'goals.progress.noCriteria',
            'Nothing to verify: completion is whatever the working session claims.'
          )}
        </p>
      </section>
    )
  }
  const verified = criteria.filter(
    (criterion) => latestFor(current, criterion.id)?.status === 'passed'
  )
  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-muted-foreground">
          {translate('goals.progress.title', 'Acceptance')}
        </h3>
        {criteria.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {translate('goals.progress.verifiedCount', '{{value0}} of {{value1}} verified', {
              value0: verified.length,
              value1: criteria.length
            })}
          </span>
        ) : null}
      </div>
      {wholeGoal || whole ? (
        <div className="flex items-start gap-1.5 text-[11px]">
          <StatusIcon status={whole?.status ?? 'not_verified'} />
          <div className="min-w-0 flex-1">
            <p className="text-foreground">
              {translate('goals.progress.wholeGoal', 'Whole-goal acceptance')} ·{' '}
              {statusLabel(whole?.status ?? 'not_verified')}
            </p>
            {whole?.summary ? (
              <p className="scrollbar-sleek max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-muted-foreground">
                {whole.summary}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <ul className="space-y-1">
        {criteria.map((criterion) => {
          const evidence = latestFor(current, criterion.id)
          return (
            <li key={criterion.id} className="flex items-start gap-1.5 text-[11px]">
              <StatusIcon status={evidence?.status ?? 'not_verified'} />
              <div className="min-w-0 flex-1">
                <p className="text-foreground">{criterion.description}</p>
                <p className="truncate text-muted-foreground">
                  {statusLabel(evidence?.status ?? 'not_verified')}
                  {evidence?.source === 'judge'
                    ? ` · ${translate('goals.progress.judge', 'Judge')}${evidence.summary ? `: ${evidence.summary.slice(0, 160)}` : ''}`
                    : evidence && evidence.status !== 'passed' && evidence.summary
                      ? ` · ${evidence.summary.split('\n').slice(1).join(' ').slice(0, 120)}`
                      : null}
                </p>
              </div>
            </li>
          )
        })}
        {extraChecks.map((command) => {
          // 精确匹配第一行:整体判词行也是 criterionId 为 null,不能被某条检查认领。
          const evidence = current.find(
            (row) =>
              row.source === 'command' &&
              row.criterionId === null &&
              row.summary.split('\n')[0] === command
          )
          return (
            <li key={`extra-${command}`} className="flex items-start gap-1.5 text-[11px]">
              <StatusIcon status={evidence?.status ?? 'not_verified'} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-foreground">{command}</p>
                <p className="text-muted-foreground">
                  {translate('goals.progress.extraCheck', 'Check')} ·{' '}
                  {statusLabel(evidence?.status ?? 'not_verified')}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function latestFor(evidence: GoalEvidence[], criterionId: string): GoalEvidence | undefined {
  return evidence
    .filter((row) => row.criterionId === criterionId)
    .sort((a, b) => b.turn - a.turn)[0]
}

function StatusIcon({ status }: { status: CriterionStatus }): React.JSX.Element {
  const className = 'mt-0.5 size-3 shrink-0'
  switch (status) {
    case 'passed':
      return <CircleCheck className={`${className} text-primary`} aria-hidden="true" />
    case 'failed':
      return <CircleX className={`${className} text-destructive`} aria-hidden="true" />
    case 'inconclusive':
    case 'stale':
      return <CircleAlert className={`${className} text-muted-foreground`} aria-hidden="true" />
    case 'not_run':
    case 'not_verified':
      return <CircleDashed className={`${className} text-muted-foreground`} aria-hidden="true" />
  }
}

function statusLabel(status: CriterionStatus): string {
  switch (status) {
    case 'passed':
      return translate('goals.progress.passed', 'Passed')
    case 'failed':
      return translate('goals.progress.failed', 'Failed')
    case 'inconclusive':
      return translate('goals.progress.inconclusive', 'Could not be judged')
    case 'stale':
      return translate('goals.progress.stale', 'Evidence out of date')
    case 'not_run':
      return translate('goals.progress.notRun', 'Not run')
    case 'not_verified':
      return translate('goals.progress.notVerified', 'Not verified yet')
  }
}
