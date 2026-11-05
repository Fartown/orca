import { Hand } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'

/**
 * The newest result an agent wrote back on the task (REQ-022): what it did, and what it needs
 * from the person. Nothing is inferred from the session; a task with no writeback shows nothing.
 */
export function LocalTaskLatestProgressCard({
  task,
  compact = false
}: {
  task: LocalTask
  compact?: boolean
}): React.JSX.Element | null {
  const now = useNow(60_000)
  const progress = task.latestProgress
  if (!progress) {
    return null
  }
  return (
    <section className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-3">
      <header className="flex items-baseline gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {translate('localTasks.latestProgress.title', 'Latest progress')}
        </span>
        <span className="text-2xs text-muted-foreground">
          {formatLocalTaskTime(progress.at, now)}
        </span>
      </header>
      {progress.needsYou ? <NeedsYou text={progress.needsYou} /> : null}
      <p
        className={cn(
          'whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground',
          compact && 'line-clamp-4'
        )}
      >
        {progress.body}
      </p>
    </section>
  )
}

function NeedsYou({ text }: { text: string }): React.JSX.Element {
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-status-warning-border bg-status-warning-background px-2 py-1 text-xs text-foreground">
      <Hand className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
      <span className="min-w-0 break-words">
        {translate('localTasks.latestProgress.needsYou', 'Needs you: {{text}}', { text })}
      </span>
    </p>
  )
}

/** One line for a board card: what the agent needs first, else the start of its result. */
export function LocalTaskLatestProgressLine({
  task
}: {
  task: LocalTask
}): React.JSX.Element | null {
  const progress = task.latestProgress
  if (!progress) {
    return null
  }
  return progress.needsYou ? (
    <span className="flex min-w-0 items-start gap-1 text-2xs text-foreground">
      <Hand className="mt-px size-3 shrink-0 text-status-warning" />
      <span className="line-clamp-2 break-words">{progress.needsYou}</span>
    </span>
  ) : (
    <span className="line-clamp-2 break-words text-2xs text-muted-foreground">{progress.body}</span>
  )
}

/** A list row's marker when the agent's latest result asks something of the person. */
export function LocalTaskNeedsYouMarker({ task }: { task: LocalTask }): React.JSX.Element | null {
  const needsYou = task.latestProgress?.needsYou
  if (!needsYou) {
    return null
  }
  return (
    <span
      title={needsYou}
      className="hidden shrink-0 items-center gap-1 rounded-sm bg-status-warning-background px-1.5 text-2xs leading-4 text-foreground @xl/local-task-list:inline-flex"
    >
      <Hand className="size-3 text-status-warning" />
      {translate('localTasks.latestProgress.chip', 'Needs you')}
    </span>
  )
}
