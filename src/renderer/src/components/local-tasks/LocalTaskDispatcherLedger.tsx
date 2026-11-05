import { Hand, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  unwatchLocalTaskFromLedger,
  useLocalTaskDispatcherLedger
} from '@/local-tasks/local-task-dispatcher-ledger'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskLatestProgressLine } from './LocalTaskLatestProgress'

export function LedgerSection({
  title,
  count,
  empty,
  children
}: {
  title: string
  count: number
  empty: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-baseline gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
        <span className="tabular-nums">{count}</span>
      </h3>
      {count === 0 ? <p className="px-1 text-xs text-muted-foreground">{empty}</p> : children}
    </section>
  )
}

function openTask(taskId: string): void {
  localTaskPageStore.getState().openDetail(taskId)
}

/** The tasks the dispatcher follows, with what each one last reported (REQ-031). */
export function DispatcherWatches({
  index,
  now
}: {
  index: LocalTaskIndex
  now: number
}): React.JSX.Element {
  const watches = useLocalTaskDispatcherLedger((state) => state.watches)
  const rows = watches.flatMap((watch) => {
    const task = index.tasksById.get(watch.taskId)
    return task ? [{ watch, task, status: index.statusesById.get(task.statusId) }] : []
  })
  return (
    <LedgerSection
      title={translate('localTasks.dispatcher.watches.title', 'Tasks it follows')}
      count={rows.length}
      empty={translate(
        'localTasks.dispatcher.watches.empty',
        'Nothing yet. Tasks its proposals start are followed, and so is any task you ask it to watch.'
      )}
    >
      <ul className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/60">
        {rows.map(({ watch, task, status }) => (
          <li key={task.id} className="flex min-w-0 items-start gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => openTask(task.id)}
              className="flex min-w-0 flex-1 flex-col gap-1 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  {task.ref}
                </span>
                {status ? (
                  <LocalTaskStatusIcon category={status.category} color={status.color} />
                ) : null}
                <span className="truncate text-sm text-foreground hover:underline">
                  {task.title}
                </span>
                <span className="shrink-0 text-2xs text-muted-foreground">{status?.name}</span>
              </span>
              <LocalTaskLatestProgressLine task={task} />
              <span className="text-2xs text-muted-foreground">
                {watch.addedBy === 'proposal'
                  ? translate(
                      'localTasks.dispatcher.watches.byProposal',
                      'From its proposal · {{time}}',
                      {
                        time: formatLocalTaskTime(watch.addedAt, now)
                      }
                    )
                  : translate(
                      'localTasks.dispatcher.watches.byAsk',
                      'You asked it to watch · {{time}}',
                      {
                        time: formatLocalTaskTime(watch.addedAt, now)
                      }
                    )}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate(
                'localTasks.dispatcher.watches.unwatch',
                'Stop following {{ref}}',
                {
                  ref: task.ref
                }
              )}
              onClick={() => void unwatchLocalTaskFromLedger(task.id)}
            >
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </LedgerSection>
  )
}

/** Proposals it made that ran, each with the tasks it started (REQ-030). */
export function DispatcherDispatched({
  index,
  now
}: {
  index: LocalTaskIndex
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
      <ul className="flex flex-col gap-1.5">
        {dispatched.map((proposal) => (
          <li key={proposal.id} className="flex min-w-0 flex-col gap-1 px-1">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-xs text-foreground">
                {proposal.summary ??
                  translate('localTasks.dispatcher.untitled', '{{count}} steps', {
                    count: proposal.items.length
                  })}
              </span>
              <span className="shrink-0 text-2xs text-muted-foreground">
                {formatLocalTaskTime(proposal.decidedAt ?? proposal.createdAt, now)}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {(proposal.results ?? []).map((result) => {
                const task = result.taskId ? index.tasksById.get(result.taskId) : undefined
                return result.ok && task ? (
                  <button
                    key={result.index}
                    type="button"
                    onClick={() => openTask(task.id)}
                    className="rounded-sm bg-muted px-1.5 font-mono text-2xs leading-4 text-foreground hover:bg-accent"
                  >
                    {task.ref}
                  </button>
                ) : (
                  <span
                    key={result.index}
                    title={result.detail}
                    className="max-w-full truncate rounded-sm bg-status-warning-background px-1.5 text-2xs leading-4 text-foreground"
                  >
                    {translate('localTasks.dispatcher.dispatched.item', 'Step {{n}}: {{detail}}', {
                      n: result.index + 1,
                      detail: result.detail ?? (result.ok ? '' : '—')
                    })}
                  </span>
                )
              })}
            </span>
          </li>
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
      <p className="px-1 text-2xs text-muted-foreground">
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
      <ul className="flex flex-col gap-1">
        {unread.map((item, position) => (
          <li key={`${item.at}-${position}`} className="flex min-w-0 flex-col gap-0.5 px-1">
            <span className="flex min-w-0 items-baseline gap-2 text-xs">
              <span className="shrink-0 text-2xs text-muted-foreground">
                {formatLocalTaskTime(item.at, now)}
              </span>
              {item.taskRef ? (
                <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                  {item.taskRef}
                </span>
              ) : null}
              <span className="min-w-0 break-words text-foreground">{item.summary}</span>
            </span>
            {item.needsYou ? (
              <span className="flex items-start gap-1 pl-1 text-2xs text-foreground">
                <Hand className="mt-px size-3 shrink-0 text-status-warning" />
                {item.needsYou}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {more ? (
        <p className="px-1 text-2xs text-muted-foreground">
          {translate('localTasks.dispatcher.unread.more', 'More are waiting behind these.')}
        </p>
      ) : null}
    </LedgerSection>
  )
}
