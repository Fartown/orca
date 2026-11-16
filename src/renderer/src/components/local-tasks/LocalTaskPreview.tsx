import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { useLocalTaskEffectiveWorkspace } from '@/local-tasks/local-task-link-selectors'
import { useLocalTaskRowWritable } from '@/local-tasks/local-tasks-domain-store'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { localTaskPriorityLabel } from '@/local-tasks/local-task-vocabulary-copy'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskLabelChips, LocalTaskSubtaskProgress } from './LocalTaskRow'
import { LocalTaskLatestProgressCard } from './LocalTaskLatestProgress'
import { LocalTaskSessionList } from './LocalTaskSessionList'

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
  const workspace = useLocalTaskEffectiveWorkspace(task, index.tasksById)
  const writable = useLocalTaskRowWritable(task.id)
  return (
    <aside
      aria-label={translate('localTasks.preview.label', 'Task preview')}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto rounded-md border border-border/60 bg-card p-4 pb-16 scrollbar-sleek @5xl/local-task-page:w-96 @5xl/local-task-page:flex-none"
    >
      <Button
        variant="ghost"
        size="sm"
        className="self-start @5xl/local-task-page:hidden"
        onClick={() => localTaskPageStore.getState().setPreviewOpen(false)}
      >
        <ArrowLeft className="size-4" />
        {translate('localTasks.detail.backToList', 'Back to tasks')}
      </Button>
      <div className="flex min-w-0 items-start gap-2">
        <h3
          className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-medium text-foreground"
          title={task.title}
        >
          {task.title}
        </h3>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto hidden @5xl/local-task-page:inline-flex"
          onClick={() => localTaskPageStore.getState().setPreviewOpen(false)}
          aria-label={translate('localTasks.preview.close', 'Close preview')}
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-2xs text-muted-foreground">
        <span className="font-mono">{task.ref}</span>
        <span className="truncate" title={project?.name}>
          {project?.name}
        </span>
      </div>
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
      <LocalTaskLatestProgressCard task={task} index={index} compact />
      <div className="min-w-0 rounded-md border border-border/60">
        <LocalTaskSessionList
          task={task}
          workspace={workspace}
          index={index}
          writable={writable}
          showEmpty
          compact
        />
      </div>
      {task.description ? (
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground">
          {task.description}
        </p>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="mt-auto"
        onClick={() => localTaskPageStore.getState().openDetail(task.id)}
      >
        {translate('localTasks.preview.open', 'Open task details')}
        <ShortcutKeyCombo keys={['↵']} keyCapClassName="min-w-4 px-1 py-0 text-3xs" />
      </Button>
    </aside>
  )
}
