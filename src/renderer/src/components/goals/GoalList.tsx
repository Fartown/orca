import { useState } from 'react'
import { toast } from 'sonner'
import { basename } from '@/lib/path'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { translate } from '@/i18n/i18n'
import type { GoalSummary } from '../../../../shared/goals/goal-control-contract'
import { fingerprintPayload, newClientOperationId } from '@/goals/goal-client-operation'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { goalPhaseBadgeVariant, goalPhaseLabel } from '@/goals/goal-status-copy'
import { useGoalDomainStore } from '@/goals/use-goals-domain-store'
import { EmptyState, SessionLoadingState } from '../right-sidebar/AiVaultSessionListStates'

export function GoalList(): React.JSX.Element {
  const summaries = useGoalDomainStore((s) => s.summaries)
  const status = useGoalDomainStore((s) => s.status)
  const observedAt = useGoalDomainStore((s) => s.listObservedAt)

  if (status === 'loading' && observedAt === null) {
    return <SessionLoadingState />
  }
  if (status === 'unsupported' || status === 'unavailable' || status === 'offline') {
    // Why: the header already names the reason; an empty list here would read as "no goals".
    return (
      <EmptyState
        title={translate('goals.list.hostUnavailable', 'Goals cannot be listed on this host')}
      />
    )
  }
  if (summaries.length === 0 && observedAt !== null) {
    return <EmptyState title={translate('goals.list.empty', 'No goals in this scope')} />
  }
  return (
    <ScrollArea className="h-full">
      <ul
        className="divide-y divide-sidebar-border"
        aria-label={translate('goals.list.label', 'Goals')}
      >
        {summaries.map((summary) =>
          summary.legacy ? (
            <LegacyGoalRow key={summary.goalId} summary={summary} legacyKey={summary.legacy.key} />
          ) : (
            <GoalRow key={summary.goalId} summary={summary} />
          )
        )}
      </ul>
    </ScrollArea>
  )
}

function GoalRow({ summary }: { summary: GoalSummary }): React.JSX.Element {
  const needsAttention =
    summary.phase === 'waiting_user' ||
    summary.phase === 'interrupted' ||
    summary.phase === 'budget_exhausted'
  return (
    <li>
      <button
        type="button"
        className="flex w-full flex-col gap-1 px-2.5 py-2 text-left hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none"
        onClick={() => goalDomainStore.getState().select(summary.goalId)}
      >
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {summary.objectivePreview}
          </span>
          <Badge variant={goalPhaseBadgeVariant(summary.phase)} className="shrink-0 text-[10px]">
            {goalPhaseLabel(summary.phase)}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">
            {basename(summary.workspace.path) || summary.workspace.path}
          </span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">
            {translate('goals.list.turns', '{{value0}} turns', { value0: summary.turns })}
          </span>
          {needsAttention && summary.reason ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate text-destructive">{summary.reason}</span>
            </>
          ) : null}
        </div>
      </button>
    </li>
  )
}

/** A v1 CLI goal: shown as the CLI left it, with an explicit import instead of a detail view. */
function LegacyGoalRow({
  summary,
  legacyKey
}: {
  summary: GoalSummary
  legacyKey: string
}): React.JSX.Element {
  const [pending, setPending] = useState(false)
  const adopt = async (): Promise<void> => {
    setPending(true)
    try {
      const payload = { legacyKey }
      const operation = await goalRuntimeClient.adoptLegacy({
        ...payload,
        clientOperationId: newClientOperationId(),
        payloadFingerprint: await fingerprintPayload(payload)
      })
      if (operation.status === 'rejected') {
        toast.error(operation.message)
        return
      }
      toast.success(operation.message)
      if (operation.goalId) {
        goalDomainStore.getState().select(operation.goalId)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <li className="flex flex-col gap-1 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {summary.objectivePreview}
        </span>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {translate('goals.list.legacy', 'CLI goal')}
        </Badge>
        <Badge variant={goalPhaseBadgeVariant(summary.phase)} className="shrink-0 text-[10px]">
          {goalPhaseLabel(summary.phase)}
        </Badge>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="truncate">
          {basename(summary.workspace.path) || summary.workspace.path}
        </span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">
          {translate('goals.list.turns', '{{value0}} turns', { value0: summary.turns })}
        </span>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="ml-auto"
          disabled={pending || summary.driver.status !== 'exited'}
          onClick={() => void adopt()}
        >
          {translate('goals.list.import', 'Import')}
        </Button>
      </div>
      {summary.driver.status !== 'exited' ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'goals.list.legacyRunning',
            'Still driven by the orca-goal CLI; stop it there before importing.'
          )}
        </p>
      ) : null}
    </li>
  )
}
