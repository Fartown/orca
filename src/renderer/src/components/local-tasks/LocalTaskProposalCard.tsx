import { useMemo, useState } from 'react'
import { Check, CheckCheck, CircleAlert, Info, ListChecks, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  decideLocalTaskProposal,
  finishInterruptedLocalTaskProposal,
  runLocalTaskProposal,
  useLocalTaskProposals
} from '@/local-tasks/local-task-dispatcher-proposals'
import type { LocalTaskProposalNames } from '@/local-tasks/local-task-proposal-copy'
import { useLocalTaskProposalEdits } from '@/local-tasks/local-task-proposal-edits'
import { useLocalTaskProposalItemViews } from '@/local-tasks/local-task-proposal-item-facts'
import {
  localTaskProposalProgress,
  type LocalTaskProposalProgress
} from '@/local-tasks/local-task-proposal-progress'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTaskProposal } from '../../../../shared/local-tasks/local-task-dispatcher-types'
import { LocalTaskProposalItemRow } from './LocalTaskProposalItemRow'

/** Refs and names the proposal items point at, as this window knows them. */
export function useProposalNames(): LocalTaskProposalNames {
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const getWorktree = useAppStore((state) => state.getKnownWorktreeById)
  const repos = useAppStore((state) => state.repos)
  return useMemo(() => {
    const refs = new Map(tasks.map((task) => [task.id, task.ref]))
    return {
      taskRef: (taskId) => refs.get(taskId) ?? taskId,
      workspace: (worktreeId) => getWorktree(worktreeId)?.displayName ?? worktreeId,
      repo: (repoId) => repos.find((repo) => repo.id === repoId)?.displayName ?? repoId
    }
  }, [tasks, getWorktree, repos])
}

type CardPhase =
  | 'pending'
  | 'unrun'
  | 'running-here'
  | 'running-elsewhere'
  | 'interrupted'
  /** This window stopped its own run when a result could not be recorded. */
  | 'abandoned'
  | 'unverifiable'
  | 'closed'

function cardPhase(
  proposal: LocalTaskProposal,
  runningHere: boolean,
  abandonedHere: boolean
): CardPhase {
  if (proposal.status === 'pending') {
    return 'pending'
  }
  if (runningHere) {
    return 'running-here'
  }
  if (abandonedHere && (proposal.status === 'confirmed' || proposal.status === 'executing')) {
    return 'abandoned'
  }
  if (proposal.status === 'confirmed') {
    return 'unrun'
  }
  if (proposal.status !== 'executing') {
    return 'closed'
  }
  return proposal.executionActive === true
    ? 'running-elsewhere'
    : proposal.executionActive === false
      ? 'interrupted'
      : 'unverifiable'
}

function PhasePill({ phase }: { phase: CardPhase }): React.JSX.Element | null {
  const pill = 'shrink-0 rounded-sm px-1.5 text-2xs leading-4'
  switch (phase) {
    case 'pending':
      return (
        <span className={cn(pill, 'bg-agent-question/15 text-agent-question-text')}>
          {translate('localTasks.dispatcher.pill.pending', 'Waiting for you')}
        </span>
      )
    case 'running-here':
    case 'running-elsewhere':
      return (
        <span className={cn(pill, 'bg-muted text-foreground')}>
          {translate('localTasks.dispatcher.pill.running', 'Running')}
        </span>
      )
    case 'interrupted':
      return (
        <span className={cn(pill, 'bg-status-warning-background text-status-warning')}>
          {translate('localTasks.dispatcher.pill.disconnected', 'Execution window disconnected')}
        </span>
      )
    case 'abandoned':
      return (
        <span className={cn(pill, 'bg-status-warning-background text-status-warning')}>
          {translate('localTasks.dispatcher.pill.stopped', 'Stopped')}
        </span>
      )
    case 'unrun':
      return (
        <span className={cn(pill, 'bg-muted text-muted-foreground')}>
          {translate('localTasks.dispatcher.pill.confirmed', 'Confirmed')}
        </span>
      )
    case 'unverifiable':
    case 'closed':
      return null
  }
}

function doneOf(progress: LocalTaskProposalProgress | null): { done: number; total: number } {
  return { done: progress?.done ?? 0, total: progress?.total ?? 0 }
}

function CardFooter({
  proposal,
  phase,
  progress,
  keep,
  busy
}: {
  proposal: LocalTaskProposal
  phase: CardPhase
  progress: LocalTaskProposalProgress | null
  keep: number[]
  busy: boolean
}): React.JSX.Element | null {
  const note = 'flex min-w-0 flex-1 items-start gap-1.5'
  const icon = 'mt-px size-3.5 shrink-0'
  switch (phase) {
    case 'pending':
      return (
        <>
          <span className={note}>
            <Info className={icon} aria-hidden />
            {translate(
              'localTasks.dispatcher.footer.pending',
              'Once you confirm, Orca runs these directly, without the dispatcher.'
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void decideLocalTaskProposal(proposal.id, 'dismissed')}
          >
            {translate('localTasks.dispatcher.dismiss', 'Dismiss')}
          </Button>
          <Button
            size="sm"
            disabled={busy || keep.length === 0}
            onClick={() =>
              void decideLocalTaskProposal(
                proposal.id,
                'confirmed',
                keep.length === proposal.items.length ? undefined : keep
              )
            }
          >
            <Check />
            {translate('localTasks.dispatcher.confirm', 'Confirm {{count}}', {
              count: keep.length
            })}
          </Button>
        </>
      )
    case 'running-here':
      return (
        <span className={note}>
          <LoaderCircle
            className={cn(icon, 'animate-spin motion-reduce:animate-none')}
            aria-hidden
          />
          {translate(
            'localTasks.dispatcher.footer.runningHere',
            'Running: done {{done}} of {{total}}. Finished steps are recorded and never run again.',
            doneOf(progress)
          )}
        </span>
      )
    case 'running-elsewhere':
      return (
        <>
          <span className={note}>
            <LoaderCircle
              className={cn(icon, 'animate-spin motion-reduce:animate-none')}
              aria-hidden
            />
            <span>
              <span className="font-medium text-foreground">
                {translate(
                  'localTasks.dispatcher.claimedElsewhere',
                  'This proposal is already running or has run.'
                )}
              </span>{' '}
              {translate(
                'localTasks.dispatcher.footer.progress',
                'Done {{done}} of {{total}}',
                doneOf(progress)
              )}
            </span>
          </span>
          <span className="shrink-0">
            {translate(
              'localTasks.dispatcher.footer.windowAlive',
              'The execution window is still open'
            )}
          </span>
          <Button variant="outline" size="sm" disabled>
            {translate('localTasks.dispatcher.finish', 'Mark as finished')}
          </Button>
        </>
      )
    case 'interrupted':
    case 'abandoned':
      return (
        <>
          <span className={note}>
            <CircleAlert className={cn(icon, 'text-status-warning')} aria-hidden />
            {phase === 'abandoned'
              ? translate(
                  'localTasks.dispatcher.abandoned',
                  'A result could not be recorded, so this window stopped the run. Check the tasks before finishing. Recorded results are kept; no steps are repeated.'
                )
              : translate(
                  'localTasks.dispatcher.interrupted',
                  'The execution window is no longer connected. Check the tasks before finishing. Recorded results are kept; no steps are repeated.'
                )}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void finishInterruptedLocalTaskProposal(proposal.id)}
          >
            {translate('localTasks.dispatcher.finish', 'Mark as finished')}
          </Button>
        </>
      )
    case 'unverifiable':
      return (
        <span className={note}>
          <CircleAlert className={icon} aria-hidden />
          {translate(
            'localTasks.dispatcher.executionUnverifiable',
            'Execution cannot be verified. Check the tasks before repeating anything.'
          )}
        </span>
      )
    case 'unrun':
      return (
        <>
          <span className={note}>
            <CheckCheck className={icon} aria-hidden />
            {translate('localTasks.dispatcher.footer.unrun', 'Confirmed, not run yet.')}
          </span>
          <Button size="sm" disabled={busy} onClick={() => void runLocalTaskProposal(proposal)}>
            {translate('localTasks.dispatcher.run', 'Run')}
          </Button>
        </>
      )
    case 'closed':
      return null
  }
}

/**
 * One proposal (REQ-030): each item can be kept, dropped or edited before the person confirms;
 * once confirmed, each item says where it stands from the claim and the recorded results (D-018).
 */
export function LocalTaskProposalCard({
  proposal,
  names,
  now
}: {
  proposal: LocalTaskProposal
  names: LocalTaskProposalNames
  now: number
}): React.JSX.Element {
  const runningHere = useLocalTaskProposals((state) => state.running.includes(proposal.id))
  const abandonedHere = useLocalTaskProposals((state) => state.abandoned.includes(proposal.id))
  const edits = useLocalTaskProposalEdits(proposal.id)
  const items = useMemo(
    () =>
      proposal.items.map((item, index) => {
        const edited = edits[index]
        return edited && edited.kind === item.kind ? edited : item
      }),
    [edits, proposal.items]
  )
  const views = useLocalTaskProposalItemViews(items)
  const [dropped, setDropped] = useState<ReadonlySet<number>>(() => new Set())
  const phase = cardPhase(proposal, runningHere, abandonedHere)
  const pending = phase === 'pending'
  const progress = useMemo(
    () =>
      localTaskProposalProgress(
        // Why: a run this window stopped is over, whatever the host last said about its claim.
        phase === 'abandoned'
          ? { ...proposal, status: 'executing', executionActive: false }
          : proposal,
        runningHere
      ),
    [phase, proposal, runningHere]
  )
  const keep = pending
    ? items.map((_, index) => index).filter((index) => !dropped.has(index) && !views[index]?.lock)
    : []
  const toggle = (index: number): void =>
    setDropped((current) => {
      const next = new Set(current)
      if (!next.delete(index)) {
        next.add(index)
      }
      return next
    })
  return (
    <section className="flex flex-col rounded-lg border border-border bg-card shadow-xs">
      <header className="flex min-w-0 items-start gap-2 border-b border-border/60 px-3.5 py-2.5">
        <ListChecks className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 break-words text-sm font-semibold text-foreground">
          {proposal.summary ??
            translate('localTasks.dispatcher.untitled', '{{count}} steps', {
              count: proposal.items.length
            })}
        </span>
        <span className="mt-0.5 shrink-0 text-2xs text-muted-foreground">
          {formatLocalTaskTime(proposal.createdAt, now)}
        </span>
        <span className="mt-0.5 flex shrink-0">
          <PhasePill phase={phase} />
        </span>
      </header>
      <ul className="flex flex-col divide-y divide-border/60">
        {items.map((item, index) => {
          const view = views[index]
          if (!view) {
            return null
          }
          return (
            <LocalTaskProposalItemRow
              // Why the position is the key: a stored proposal never reorders its items.
              key={`${proposal.id}/${index}`}
              proposalId={proposal.id}
              index={index}
              item={item}
              original={proposal.items[index]}
              names={names}
              view={view}
              pending={pending}
              kept={keep.includes(index)}
              busy={runningHere}
              progress={pending ? null : (progress?.items[index] ?? null)}
              unrecorded={phase === 'abandoned'}
              onToggle={() => toggle(index)}
            />
          )
        })}
      </ul>
      {phase === 'closed' ? null : (
        <footer className="flex min-w-0 flex-wrap items-center gap-2 border-t border-border/60 px-3.5 py-2.5 text-2xs text-muted-foreground">
          <CardFooter
            proposal={proposal}
            phase={phase}
            progress={progress}
            keep={keep}
            busy={runningHere}
          />
        </footer>
      )}
    </section>
  )
}
