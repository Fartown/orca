import { Hand, Unplug } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useLocalTaskDispatcherLedger } from '@/local-tasks/local-task-dispatcher-ledger'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import type { LocalTaskProposalNames } from '@/local-tasks/local-task-proposal-copy'
import { localTaskProposalProgress } from '@/local-tasks/local-task-proposal-progress'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import type { LocalTaskProposal } from '../../../../shared/local-tasks/local-task-dispatcher-types'

/** A ledger block: its title and count, then its rows or what it shows when there are none. */
export function LedgerSection({
  title,
  count,
  empty,
  highlight = false,
  children
}: {
  title: string
  count: number
  empty: string
  /** The count asks for the person, so it takes the waiting color while non-zero. */
  highlight?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="flex items-baseline gap-1.5 text-xs font-semibold text-muted-foreground">
        {title}
        <span
          className={cn(
            'font-medium tabular-nums',
            highlight && count > 0 && 'font-semibold text-agent-question-text'
          )}
        >
          {count}
        </span>
      </h3>
      {count === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
          {empty}
        </p>
      ) : (
        children
      )}
    </section>
  )
}

function openTask(taskId: string): void {
  localTaskPageStore.getState().openDetail(taskId)
}

function StepChip({
  tone,
  children,
  title
}: {
  tone: 'warning' | 'muted'
  children: React.ReactNode
  title?: string
}): React.JSX.Element {
  return (
    <span
      title={title}
      className={cn(
        'max-w-full truncate rounded-sm px-1.5 text-2xs leading-5',
        tone === 'warning'
          ? 'bg-status-warning-background text-status-warning'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  )
}

function DispatchedRow({
  proposal,
  index,
  names,
  now
}: {
  proposal: LocalTaskProposal
  index: LocalTaskIndex
  names: LocalTaskProposalNames
  now: number
}): React.JSX.Element {
  const progress = localTaskProposalProgress(proposal, false)
  const step = (n: number, detail: string): string =>
    translate('localTasks.dispatcher.dispatched.item', 'Step {{n}}: {{detail}}', { n, detail })
  return (
    <li className="flex min-w-0 flex-col gap-1.5 px-3 py-2.5">
      <span className="flex min-w-0 items-baseline gap-2.5">
        <span className="min-w-0 flex-1 break-words text-xs text-foreground">
          {proposal.summary ??
            translate('localTasks.dispatcher.untitled', '{{count}} steps', {
              count: proposal.items.length
            })}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {formatLocalTaskTime(proposal.decidedAt ?? proposal.createdAt, now)}
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {(progress?.items ?? []).map(({ index: at, stage, result }) => {
          const taskId = result?.taskId
          const task = taskId ? index.tasksById.get(taskId) : undefined
          const ref = taskId ? (
            task ? (
              <button
                key={`${at}-ref`}
                type="button"
                onClick={() => openTask(task.id)}
                className="rounded-sm bg-muted px-1.5 font-mono text-2xs leading-5 text-foreground hover:bg-accent"
              >
                {task.ref}
              </button>
            ) : (
              <span
                key={`${at}-ref`}
                className="rounded-sm bg-muted px-1.5 font-mono text-2xs leading-5 text-muted-foreground"
              >
                {names.taskRef(taskId)}
              </span>
            )
          ) : null
          switch (stage) {
            case 'done':
              return ref
            case 'failed':
              return [
                ref,
                <StepChip key={`${at}-step`} tone="warning" title={result?.detail}>
                  {step(at + 1, result?.detail ?? '—')}
                </StepChip>
              ]
            case 'unknown':
              return (
                <StepChip key={`${at}-step`} tone="warning">
                  {step(at + 1, translate('localTasks.dispatcher.stage.unknown', 'Result unknown'))}
                </StepChip>
              )
            case 'skipped':
              return (
                <StepChip key={`${at}-step`} tone="muted">
                  {step(at + 1, translate('localTasks.dispatcher.stage.skipped', 'Not run'))}
                </StepChip>
              )
            case 'dropped':
            case 'running':
            case 'unverifiable':
            case 'waiting':
              return null
          }
        })}
      </span>
    </li>
  )
}

/**
 * Proposals it made that ran, each with the tasks they started and any step that did not finish.
 * There is no conversation history yet, so nothing links back into the conversation (REQ-030).
 */
export function DispatcherDispatched({
  index,
  names,
  now
}: {
  index: LocalTaskIndex
  names: LocalTaskProposalNames
  now: number
}): React.JSX.Element {
  const dispatched = useLocalTaskDispatcherLedger((state) => state.dispatched)
  return (
    <LedgerSection
      title={translate('localTasks.dispatcher.dispatched.title', 'What it dispatched')}
      count={dispatched.length}
      empty={translate(
        'localTasks.dispatcher.dispatched.empty',
        'No confirmed proposal has run yet.'
      )}
    >
      <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
        {dispatched.map((proposal) => (
          <DispatchedRow
            key={proposal.id}
            proposal={proposal}
            index={index}
            names={names}
            now={now}
          />
        ))}
      </ul>
    </LedgerSection>
  )
}

/** Facts it has not acked yet: what it will be told the next time it is idle (REQ-031). */
export function DispatcherUnread({
  now,
  wakeOn
}: {
  now: number
  wakeOn: boolean
}): React.JSX.Element {
  const unread = useLocalTaskDispatcherLedger((state) => state.unread)
  const more = useLocalTaskDispatcherLedger((state) => state.moreUnread)
  return (
    <LedgerSection
      title={translate('localTasks.dispatcher.unread.title', 'News it has not handled')}
      count={unread.length}
      empty={translate('localTasks.dispatcher.unread.empty', 'It has handled everything so far.')}
    >
      <p className="text-2xs text-muted-foreground">
        {wakeOn
          ? translate(
              'localTasks.dispatcher.unread.wakeOn',
              'Orca points it here the next time it finishes a turn.'
            )
          : translate(
              'localTasks.dispatcher.unread.wakeOff',
              'Waking is off: it reads these only when it checks its inbox itself.'
            )}
      </p>
      <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
        {unread.map((item, position) => (
          <li
            key={`${item.at}-${position}`}
            className="flex min-w-0 gap-2.5 px-3 py-2 text-xs leading-relaxed"
          >
            <span className="w-14 shrink-0 pt-px text-2xs text-muted-foreground">
              {formatLocalTaskTime(item.at, now)}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 break-words',
                item.kind === 'host' ? 'text-status-warning' : 'text-foreground'
              )}
            >
              {item.kind === 'host' ? (
                <Unplug className="mr-1 inline size-3 align-[-2px]" aria-hidden />
              ) : null}
              {item.taskRef ? (
                <span className="mr-1.5 font-mono text-2xs text-muted-foreground">
                  {item.taskRef}
                </span>
              ) : null}
              {item.summary}
              {item.needsYou ? (
                <span className="mt-0.5 flex items-start gap-1 text-2xs text-agent-question-text">
                  <Hand className="mt-px size-3 shrink-0" aria-hidden />
                  {item.needsYou}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {more ? (
        <p className="text-2xs text-muted-foreground">
          {translate('localTasks.dispatcher.unread.more', 'More are waiting behind these.')}
        </p>
      ) : null}
    </LedgerSection>
  )
}
