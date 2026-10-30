import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { localTaskPriorityLabel } from '@/local-tasks/local-task-vocabulary-copy'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskLabelChips, LocalTaskSubtaskProgress } from './LocalTaskRow'

/** Space toggles this read-only peek at the row under the cursor; Enter opens the full detail. */
export function LocalTaskPreview({
  task,
  index
}: {
  task: LocalTask
  index: LocalTaskIndex
}): React.JSX.Element {
  const status = index.statusesById.get(task.statusId)
  const project = index.projectsById.get(task.projectId)
  return (
    <aside
      aria-label={translate('localTasks.preview.label', 'Task preview')}
      // Why overlay when narrow: beside the list it left the toolbar and titles a few letters wide.
      // Why pb-16: the app's bottom-right floating button otherwise covers Open task.
      className="absolute top-2 right-0 bottom-0 z-20 flex w-72 flex-col gap-3 overflow-y-auto rounded-md border border-border/60 bg-card p-4 pb-16 shadow-floating scrollbar-sleek @4xl/local-task-page:static @4xl/local-task-page:w-64 @4xl/local-task-page:shrink-0 @4xl/local-task-page:shadow-none @5xl/local-task-page:w-80"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{task.ref}</span>
        <span className="truncate text-xs text-muted-foreground">{project?.name}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          onClick={() => localTaskPageStore.getState().setPreviewOpen(false)}
          aria-label={translate('localTasks.preview.close', 'Close preview')}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <h3 className="text-sm font-medium text-foreground">{task.title}</h3>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {status ? (
          <span className="flex items-center gap-1.5">
            <LocalTaskStatusIcon category={status.category} color={status.color} />
            {status.name}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <LocalTaskPriorityIcon priority={task.priority} />
          {localTaskPriorityLabel(task.priority)}
        </span>
        <LocalTaskSubtaskProgress task={task} index={index} />
        <LocalTaskLabelChips labels={task.labels} max={4} />
      </div>
      {task.description ? (
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
          {task.description}
        </p>
      ) : null}
      {task.criteria.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {translate('localTasks.detail.criteria', 'Done criteria')}
          </span>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-foreground">
            {task.criteria.map((criterion, position) => (
              <li key={`${position}-${criterion}`}>{criterion}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="mt-auto"
        onClick={() => localTaskPageStore.getState().openDetail(task.id)}
      >
        {translate('localTasks.preview.open', 'Open task')}
        <ShortcutKeyCombo keys={['↵']} keyCapClassName="min-w-4 px-1 py-0 text-3xs" />
      </Button>
    </aside>
  )
}
