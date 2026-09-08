import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { useEffect, useState } from 'react'
import { ChevronLeft, ExternalLink, History } from 'lucide-react'
import { basename } from '@/lib/path'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { translate } from '@/i18n/i18n'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import type {
  GoalDetail as GoalDetailRecord,
  GoalSpecRevision
} from '../../../../shared/goals/goal-control-contract'
import { requestGoalDetailRefresh } from '@/goals/GoalDomainSyncGate'
import { goalRuntimeClient } from '@/goals/goal-runtime-client'
import { goalDomainStore } from '@/goals/goals-domain-store'
import { findPaneForTerminalHandle } from '@/goals/goal-session-target'
import {
  formatActiveMinutes,
  goalCompletionLabel,
  goalPhaseBadgeVariant,
  goalPhaseLabel
} from '@/goals/goal-status-copy'
import { useGoalDomainStore } from '@/goals/use-goals-domain-store'
import { GoalControls } from './GoalControls'
import { GoalProgress } from './GoalProgress'

export function GoalDetail({ goalId }: { goalId: string }): React.JSX.Element {
  const detail = useGoalDomainStore((s) => s.detailsById[goalId])
  const summary = useGoalDomainStore((s) => s.summaries.find((item) => item.goalId === goalId))

  useEffect(() => {
    requestGoalDetailRefresh(goalId)
  }, [goalId])

  const back = (): void => goalDomainStore.getState().select(null)
  const current = detail ?? summary
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-sidebar-border px-1.5 py-1">
        <Button type="button" size="xs" variant="ghost" onClick={back}>
          <ChevronLeft />
          {translate('goals.detail.back', 'Goals')}
        </Button>
      </div>
      {!current ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          {translate('goals.detail.loading', 'Loading goal…')}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-2.5 py-2">
            <section className="space-y-1.5">
              <p className="text-xs whitespace-pre-wrap text-foreground">
                {detail?.spec.objective ?? current.objectivePreview}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={goalPhaseBadgeVariant(current.phase)}>
                  {goalPhaseLabel(current.phase)}
                </Badge>
                {current.continuation === 'paused' ? (
                  <Badge variant="outline">
                    {translate('goals.detail.continuationPaused', 'Continuation paused')}
                  </Badge>
                ) : null}
                {current.driver.status === 'unverifiable' ? (
                  <Badge variant="outline">
                    {translate('goals.detail.driverUnverifiable', 'Driver unverifiable')}
                  </Badge>
                ) : null}
              </div>
              {current.reason ? (
                <p className="text-[11px] text-muted-foreground">{current.reason}</p>
              ) : null}
              {goalCompletionLabel(current) ? (
                <p className="text-[11px] text-muted-foreground">{goalCompletionLabel(current)}</p>
              ) : null}
            </section>
            <BindingSection detail={current} />
            {detail ? <GoalControls detail={detail} /> : null}
            {detail?.spec.acceptanceDocument ? (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold">
                  {translate('goals.editor.document', 'Acceptance document')}
                </h3>
                <CommentMarkdown content={detail.spec.acceptanceDocument} variant="document" />
              </section>
            ) : null}
            {detail ? <GoalProgress detail={detail} /> : null}
            <section className="space-y-1">
              <h3 className="text-[11px] font-semibold text-muted-foreground">
                {translate('goals.detail.execution', 'Execution')}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {translate('goals.detail.turnsAndTime', 'Turn {{value0}} · {{value1}} active', {
                  value0: current.turns,
                  value1: formatActiveMinutes(current.activeMs)
                })}
                {detail
                  ? ` · ${translate(
                      'goals.detail.budget',
                      'budget {{value0}} turns / {{value1}} min',
                      {
                        value0: detail.budget.maxTurns || '∞',
                        value1: detail.budget.maxMinutes || '∞'
                      }
                    )}`
                  : null}
              </p>
              {detail?.latestOperation ? (
                <p className="text-[11px] text-muted-foreground">
                  {detail.latestOperation.message}
                </p>
              ) : null}
            </section>
            {detail ? (
              <VersionsSection goalId={detail.goalId} specRevision={detail.specRevision} />
            ) : null}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

function BindingSection({
  detail
}: {
  detail: Pick<GoalDetailRecord, 'binding' | 'workspace' | 'agentStatus' | 'terminal'>
}): React.JSX.Element {
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const openSession = (): void => {
    const pane = findPaneForTerminalHandle(agentStatusByPaneKey, detail.binding.terminal)
    if (!pane) {
      toast.error(translate('goals.detail.sessionMissing', 'The bound session is no longer open.'))
      return
    }
    if (!activateAndRevealWorktree(detail.binding.worktree)) {
      toast.error(
        translate('goals.detail.workspaceUnavailable', 'The workspace is no longer available.')
      )
      return
    }
    useAppStore.getState().setActiveTabType('terminal')
    activateTabAndFocusPane(pane.tabId, pane.leafId, { flashFocusedPane: true })
  }
  return (
    <section className="space-y-1">
      <h3 className="text-[11px] font-semibold text-muted-foreground">
        {translate('goals.detail.session', 'Session')}
      </h3>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">
          {basename(detail.workspace.path) || detail.workspace.path}
        </span>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{terminalStatusLabel(detail)}</span>
        <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={openSession}>
          <ExternalLink />
          {translate('goals.detail.openSession', 'Open session')}
        </Button>
      </div>
    </section>
  )
}

function terminalStatusLabel(detail: Pick<GoalDetailRecord, 'agentStatus' | 'terminal'>): string {
  if (detail.terminal.status === 'exited') {
    return translate('goals.detail.terminalExited', 'terminal closed')
  }
  if (detail.terminal.status === 'unverifiable') {
    return translate('goals.detail.terminalUnverifiable', 'terminal unverifiable')
  }
  switch (detail.agentStatus) {
    case 'working':
      return translate('goals.detail.agentWorking', 'agent working')
    case 'waiting':
    case 'blocked':
      return translate('goals.detail.agentWaiting', 'agent waiting for you')
    case 'done':
      return translate('goals.detail.agentIdle', 'agent idle')
    case null:
      return translate('goals.detail.agentUnknown', 'agent status unknown')
  }
}

/** Saved definitions, loaded on demand; the current revision is marked. */
function VersionsSection({
  goalId,
  specRevision
}: {
  goalId: string
  specRevision: number
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<GoalSpecRevision[] | null>(null)
  useEffect(() => {
    if (!open) {
      return
    }
    let disposed = false
    void goalRuntimeClient
      .versions(goalId)
      .then((items) => {
        if (!disposed) {
          setVersions(items)
        }
      })
      .catch(() => {
        if (!disposed) {
          setVersions([])
        }
      })
    return () => {
      disposed = true
    }
  }, [goalId, open, specRevision])
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" size="xs" variant="ghost">
          <History />
          {translate('goals.detail.versions', 'Definition revisions ({{value0}})', {
            value0: specRevision
          })}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1 space-y-1">
          {(versions ?? []).map((version) => (
            <li key={version.specRevision} className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">
                {translate('goals.detail.revisionLabel', 'Revision {{value0}}', {
                  value0: version.specRevision
                })}
              </span>
              {version.specRevision === specRevision
                ? ` · ${translate('goals.detail.currentRevision', 'current')}`
                : null}
              {` · ${new Date(version.savedAt).toLocaleString()}`}
              <p className="truncate">{version.spec.objective}</p>
              {version.spec.acceptanceDocument ? (
                <CommentMarkdown content={version.spec.acceptanceDocument} variant="document" />
              ) : null}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
