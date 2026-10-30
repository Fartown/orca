import { memo, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { cn } from '@/lib/utils'
import { localTaskSubtaskProgress, type LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { LOCAL_TASK_ROW_ATTRIBUTE } from '@/local-tasks/local-task-page-keys'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import type { LocalTaskStatusHead } from '../../../../shared/local-tasks/local-task-list-groups'
import type { LocalTask, LocalTaskStatusDef } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskHostTag } from './LocalTaskHostTag'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskProgressBadges } from './LocalTaskProgress'

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

const INDENT_BASE_PX = 12
const INDENT_STEP_PX = 20
// Why capped: past a few levels deeper indent only squeezes the title.
const INDENT_DEPTH_MAX = 4

function FoldToggle({ task, folded }: { task: LocalTask; folded: boolean }): React.JSX.Element {
  const Icon = folded ? ChevronRight : ChevronDown
  return (
    <button
      type="button"
      aria-expanded={!folded}
      aria-label={
        folded
          ? translate('localTasks.row.unfold', 'Show subtasks of {{ref}}', { ref: task.ref })
          : translate('localTasks.row.fold', 'Hide subtasks of {{ref}}', { ref: task.ref })
      }
      onClick={(event) => {
        event.stopPropagation()
        localTaskPageStore.getState().toggleTaskCollapsed(task.id)
      }}
      className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
    >
      <Icon className="size-3.5" />
    </button>
  )
}

/** A status group's identity: a status id, or `category:<category>` across projects. */
export function localTaskStatusHeading(head: LocalTaskStatusHead): string {
  return head.kind === 'status' ? head.status.id : `category:${head.category}`
}

/** The chip says nothing new under its own status, or its category when that holds one status. */
function repeatsHeading(
  status: LocalTaskStatusDef,
  heading: string | null,
  index: LocalTaskIndex,
  projectId: string
): boolean {
  if (heading === status.id) {
    return true
  }
  if (heading !== `category:${status.category}`) {
    return false
  }
  const statuses = index.projectsById.get(projectId)?.statuses ?? []
  return statuses.filter((candidate) => candidate.category === status.category).length <= 1
}

/**
 * One list row, indented by its depth in the task tree; the status chip hides when it would
 * repeat the status heading. `folded` is null for a row with no shown subtasks. As the list
 * narrows, host, status chip, time and labels drop out before the title does.
 */
export const LocalTaskRow = memo(function LocalTaskRow({
  task,
  index,
  statusHeading,
  depth,
  folded,
  hostLabels
}: {
  task: LocalTask
  index: LocalTaskIndex
  statusHeading: string | null
  depth: number
  folded: boolean | null
  hostLabels?: ReadonlyMap<string, string>
}): React.JSX.Element {
  const isCursor = useLocalTaskPage((state) => state.cursorTaskId === task.id)
  // Why not on hover: scrolling a half-shown row under the pointer would hover the next one.
  const reveal = useLocalTaskPage(
    (state) => state.cursorTaskId === task.id && !state.cursorFromPointer
  )
  const isSelected = useLocalTaskPage((state) => state.selectedTaskIds.includes(task.id))
  const rowRef = useRef<HTMLDivElement>(null)
  const status = index.statusesById.get(task.statusId)
  useEffect(() => {
    if (reveal) {
      rowRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [reveal])
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
          localTaskPageStore.getState().setCursor(task.id, 'pointer')
        }
      }}
      style={{
        paddingLeft: `${INDENT_BASE_PX + Math.min(depth, INDENT_DEPTH_MAX) * INDENT_STEP_PX}px`
      }}
      className={cn(
        'group/row flex h-9 min-w-0 cursor-pointer items-center gap-2.5 overflow-hidden border-b border-border/40 pr-3 text-[13px] transition-colors last:border-b-0 hover:bg-accent/60',
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
      {folded === null ? (
        <span className="size-4 shrink-0" />
      ) : (
        <FoldToggle task={task} folded={folded} />
      )}
      <LocalTaskPriorityIcon priority={task.priority} />
      <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
        {task.ref}
      </span>
      <LocalTaskHostTag
        id={task.id}
        labels={hostLabels}
        className="hidden max-w-24 shrink-0 @2xl/local-task-list:block"
      />
      {status ? <LocalTaskStatusIcon category={status.category} color={status.color} /> : null}
      <span className="min-w-16 flex-1 truncate text-foreground">{task.title}</span>
      {status && !repeatsHeading(status, statusHeading, index, task.projectId) ? (
        <span className="hidden shrink-0 rounded-sm bg-muted px-1.5 text-2xs leading-4 text-muted-foreground @xl/local-task-list:inline">
          {status.name}
        </span>
      ) : null}
      <LocalTaskSubtaskProgress task={task} index={index} />
      <LocalTaskProgressBadges task={task} index={index} />
      <span className="hidden min-w-0 @3xl/local-task-list:flex">
        <LocalTaskLabelChips labels={task.labels} />
      </span>
      <LocalTaskUpdatedAt at={task.updatedAt} />
    </div>
  )
})

/** Ticks on its own, so the minute clock never re-renders the whole row or list. */
function LocalTaskUpdatedAt({ at }: { at: number }): React.JSX.Element {
  const now = useNow(60_000)
  return (
    <span className="hidden w-20 shrink-0 text-right text-2xs text-muted-foreground @2xl/local-task-list:inline">
      {formatLocalTaskTime(at, now)}
    </span>
  )
}
