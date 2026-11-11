import { translate } from '@/i18n/i18n'
import { localTaskNeedsReview } from '../../../../shared/local-tasks/local-task-review-items'
import type { LocalTaskBandRow } from '@/local-tasks/local-task-needs-you-band'
import { LocalTaskRow } from './LocalTaskRow'
import type { LocalTaskListModel } from './use-local-task-list-model'

/** Needs you view: tasks waiting for acceptance, as the home list draws them (REQ-024). */
export function LocalTaskReviewQueue({
  model
}: {
  model: LocalTaskListModel
}): React.JSX.Element | null {
  const rows: LocalTaskBandRow[] = model.scopeTasks
    .filter((task) => localTaskNeedsReview(task, model.index.projectsById.get(task.projectId)))
    .map((task) => ({ task, group: 'review', items: [] }))
  if (rows.length === 0) {
    return null
  }
  return (
    <section className="@container/local-task-list flex shrink-0 flex-col overflow-hidden rounded-md border border-border/60">
      <h3 className="flex h-7 items-center gap-1.5 border-b border-border/40 px-3 text-2xs text-muted-foreground">
        {translate('localTasks.band.review', 'Awaiting acceptance')}
        <span className="tabular-nums">{rows.length}</span>
      </h3>
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
    </section>
  )
}
