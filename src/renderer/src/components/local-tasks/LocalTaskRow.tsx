import { useEffect, useRef } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { cn } from '@/lib/utils'
import { localTaskSubtaskProgress, type LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { LOCAL_TASK_ROW_ATTRIBUTE } from '@/local-tasks/local-task-page-keys'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'

export function LocalTaskLabelChips({
  labels,
  max = 2
}: {
  labels: readonly string[]
  max?: number
}): React.JSX.Element | null {
  if (labels.length === 0) {
    return null
  }
  return (
    <span className="flex min-w-0 shrink items-center gap-1">
      {labels.slice(0, max).map((label) => (
        <span
          key={label}
          className="max-w-24 truncate rounded-full border border-border/60 px-1.5 text-2xs leading-4 text-muted-foreground"
        >
          {label}
        </span>
      ))}
      {labels.length > max ? (
        <span className="text-2xs text-muted-foreground">+{labels.length - max}</span>
      ) : null}
    </span>
  )
}

export function LocalTaskSubtaskProgress({
  task,
  index
}: {
  task: LocalTask
  index: LocalTaskIndex
}): React.JSX.Element | null {
  const progress = localTaskSubtaskProgress(task, index)
  if (!progress) {
    return null
  }
  return (
    <span
      className="shrink-0 font-mono text-2xs text-muted-foreground"
      title={translate('localTasks.row.subtaskProgress', 'Subtasks done: {{done}} of {{total}}', {
        done: progress.done,
        total: progress.total
      })}
    >
      {progress.done}/{progress.total}
    </span>
  )
}

/** One list row; the status chip hides when it would repeat a status heading (`groupLabel`). */
export function LocalTaskRow({
  task,
  index,
  groupLabel,
  nested,
  now
}: {
  task: LocalTask
  index: LocalTaskIndex
  groupLabel: string | null
  nested: boolean
  now: number
}): React.JSX.Element {
  const isCursor = useLocalTaskPage((state) => state.cursorTaskId === task.id)
  const isSelected = useLocalTaskPage((state) => state.selectedTaskIds.includes(task.id))
  const rowRef = useRef<HTMLDivElement>(null)
  const status = index.statusesById.get(task.statusId)
  useEffect(() => {
    if (isCursor) {
      rowRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [isCursor])
  const open = (): void => localTaskPageStore.getState().openDetail(task.id)
  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={-1}
      {...{ [LOCAL_TASK_ROW_ATTRIBUTE]: '' }}
      aria-current={isCursor ? 'true' : undefined}
      data-current={isCursor ? 'true' : undefined}
      onClick={open}
      onMouseMove={() => {
        if (!isCursor) {
          localTaskPageStore.getState().setCursor(task.id)
        }
      }}
      className={cn(
        'group/row flex h-9 cursor-pointer items-center gap-2.5 border-b border-border/40 pr-3 text-[13px] transition-colors last:border-b-0 hover:bg-accent/60',
        nested ? 'pl-10' : 'pl-3',
        isCursor && 'bg-accent',
        isSelected && 'bg-accent/80'
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover/row:opacity-100',
          isSelected && 'opacity-100'
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => localTaskPageStore.getState().toggleSelected(task.id)}
          aria-label={translate('localTasks.row.select', 'Select {{ref}}', { ref: task.ref })}
        />
      </span>
      <LocalTaskPriorityIcon priority={task.priority} />
      <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
        {task.ref}
      </span>
      {status ? <LocalTaskStatusIcon category={status.category} color={status.color} /> : null}
      <span className="min-w-0 truncate text-foreground">{task.title}</span>
      {status && status.name !== groupLabel ? (
        <span className="shrink-0 rounded-sm bg-muted px-1.5 text-2xs leading-4 text-muted-foreground">
          {status.name}
        </span>
      ) : null}
      <LocalTaskSubtaskProgress task={task} index={index} />
      <span className="min-w-0 flex-1" />
      <LocalTaskLabelChips labels={task.labels} />
      <span className="w-20 shrink-0 text-right text-2xs text-muted-foreground">
        {formatLocalTaskTime(task.updatedAt, now)}
      </span>
    </div>
  )
}
