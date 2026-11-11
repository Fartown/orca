import { Bell, Bot, ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { LocalTaskBandRow } from '@/local-tasks/local-task-needs-you-band'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { LocalTaskRow } from './LocalTaskRow'
import { useLocalTaskDispatcherWaitingCount } from './LocalTaskDispatcherView'
import type { LocalTaskListModel } from './use-local-task-list-model'

function BandGroup({
  title,
  rows,
  model
}: {
  title: string
  rows: readonly LocalTaskBandRow[]
  model: LocalTaskListModel
}): React.JSX.Element | null {
  if (rows.length === 0) {
    return null
  }
  return (
    <div>
      <div className="flex h-6 items-center gap-1.5 border-b border-border/40 px-6 text-2xs text-muted-foreground">
        {title}
        <span className="tabular-nums">{rows.length}</span>
      </div>
      {rows.map((row) => (
        <LocalTaskRow
          key={row.task.id}
          task={row.task}
          index={model.index}
          statusHeading={null}
          depth={0}
          folded={null}
          hostLabels={model.hostLabels}
          band={row}
        />
      ))}
    </div>
  )
}

/**
 * The top of the home list: sessions waiting on the person, then tasks waiting for acceptance
 * (REQ-014, REQ-024). Each task shows here once and leaves the status groups below.
 */
export function LocalTaskNeedsYouBand({
  model
}: {
  model: LocalTaskListModel
}): React.JSX.Element | null {
  const { waiting, review } = model.band
  const count = waiting.length + review.length
  const proposals = useLocalTaskDispatcherWaitingCount()
  if (count === 0 && proposals === 0) {
    return null
  }
  return (
    <section
      aria-label={translate('localTasks.needsYou.title', 'Needs you')}
      className="border-b border-border/60 bg-status-warning-background/40"
    >
      <div className="flex h-8 items-center gap-2 border-b border-border/40 px-3 text-xs">
        <Bell className="size-3.5 text-status-warning" aria-hidden />
        <span className="font-medium text-foreground">
          {translate('localTasks.needsYou.title', 'Needs you')}
        </span>
        <span className="rounded-full bg-status-warning px-1.5 text-2xs leading-4 tabular-nums text-background">
          {count}
        </span>
        <span className="truncate text-2xs text-muted-foreground">
          {translate(
            'localTasks.band.description',
            'Sessions waiting for your answer or a finished turn you have not seen, and tasks waiting for your acceptance'
          )}
        </span>
      </div>
      {proposals > 0 ? (
        <button
          type="button"
          onClick={() => localTaskPageStore.getState().setView('dispatcher')}
          className="flex h-8 w-full items-center gap-2 border-b border-border/40 px-6 text-left text-xs text-foreground hover:bg-accent/60"
        >
          <Bot className="size-3.5 text-muted-foreground" aria-hidden />
          {translate(
            'localTasks.band.proposals',
            'The dispatcher has {{count}} proposals waiting for you',
            {
              count: proposals
            }
          )}
          <ChevronRight className="ml-auto size-3.5 text-muted-foreground" aria-hidden />
        </button>
      ) : null}
      <BandGroup
        title={translate('localTasks.band.waiting', 'Sessions waiting on you')}
        rows={waiting}
        model={model}
      />
      <BandGroup
        title={translate('localTasks.band.review', 'Awaiting acceptance')}
        rows={review}
        model={model}
      />
    </section>
  )
}
