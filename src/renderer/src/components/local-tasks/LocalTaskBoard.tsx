import { useState } from 'react'
import { Bell, CornerDownRight, EyeOff, Plus } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { localTaskVisibleProgress } from '@/local-tasks/local-task-visible-progress'
import { localTaskProgressSummary } from '@/local-tasks/local-task-progress-summary'
import { localTaskAttentionKindLabel } from '@/local-tasks/local-task-attention-copy'
import {
  LocalTaskHostCell,
  LocalTaskSessionCell,
  LocalTaskWorkspaceCell,
  useLocalTaskLeadSession,
  useLocalTaskRowSessions,
  useLocalTaskRowWorkspace
} from './LocalTaskRowFacts'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { LocalTaskHostTag } from './LocalTaskHostTag'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { statusHeadCategory, type LocalTaskBoardColumn } from '@/local-tasks/local-task-list-groups'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { setLocalTasksStatus } from '@/local-tasks/local-task-writes'
import {
  useLocalTaskRowWritable,
  useLocalTasksDomain
} from '@/local-tasks/local-tasks-domain-store'
import { localTaskBoardDropRefusal } from '@/local-tasks/local-task-write-reason'
import {
  localTaskPathFromRoot,
  localTaskPathLabel
} from '../../../../shared/local-tasks/local-task-hierarchy'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskLabelChips, LocalTaskSubtaskProgress } from './LocalTaskRow'
import { canCreateInGroup, localTaskGroupLabel, openCreateInGroup } from './LocalTaskGroupHead'
import type { LocalTaskListModel } from './use-local-task-list-model'

const DRAG_TYPE = 'application/x-orca-local-task'

function BoardCard({
  task,
  index,
  hostLabels
}: {
  task: LocalTask
  index: LocalTaskIndex
  hostLabels: ReadonlyMap<string, string> | undefined
}): React.JSX.Element {
  const isCursor = useLocalTaskPage((state) => state.cursorTaskId === task.id)
  const draggable = useLocalTaskRowWritable(task.id)
  const path = localTaskPathFromRoot(task, index.tasksById)
  const status = index.statusesById.get(task.statusId)
  const workspace = useLocalTaskRowWorkspace(task, index)
  const sessions = useLocalTaskRowSessions(task, index, workspace.link)
  const lead = useLocalTaskLeadSession(sessions)
  const now = useNow(60_000)
  return (
    <div
      role="button"
      tabIndex={-1}
      draggable={draggable}
      data-local-task-row=""
      data-current={isCursor ? 'true' : undefined}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, task.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => localTaskPageStore.getState().openPreview(task.id)}
      onMouseMove={() => {
        if (!isCursor) {
          localTaskPageStore.getState().setCursor(task.id, 'pointer')
        }
      }}
      className={cn(
        'flex cursor-pointer flex-col gap-1.5 rounded-md border border-border/60 bg-card px-3 py-2 text-left transition hover:bg-accent',
        draggable && 'active:cursor-grabbing',
        isCursor && 'bg-accent ring-1 ring-ring/50'
      )}
    >
      {path.length > 0 ? (
        <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
          <CornerDownRight className="size-3 shrink-0" />
          {/* Why the parent alone: a narrow card would cut it off the end of the full path. */}
          <span className="truncate" title={localTaskPathLabel(path)}>
            {path.length > 1 ? '… › ' : ''}
            {path.at(-1)?.title}
          </span>
        </span>
      ) : null}
      <span className="flex min-w-0 items-start gap-1.5">
        {status ? (
          <LocalTaskStatusIcon category={status.category} color={status.color} className="mt-0.5" />
        ) : null}
        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
          {task.title}
        </span>
        {task.priority !== 0 ? <LocalTaskPriorityIcon priority={task.priority} /> : null}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-2xs text-muted-foreground">
        <span className="shrink-0 tabular-nums">{task.ref}</span>
        <LocalTaskHostTag id={task.id} labels={hostLabels} />
        <span className="min-w-0 truncate">
          <LocalTaskWorkspaceCell workspace={workspace} />
        </span>
        <span className="ml-auto min-w-0 shrink-0">
          <LocalTaskHostCell workspace={workspace} />
        </span>
      </span>
      {task.labels.length > 0 || index.childrenByParentId.has(task.id) ? (
        <div className="flex items-center gap-2">
          <LocalTaskLabelChips labels={task.labels} />
          <LocalTaskSubtaskProgress task={task} index={index} />
        </div>
      ) : null}
      <LocalTaskBoardProgress task={task} index={index} />
      {lead ? (
        <span className="flex min-w-0 items-center justify-between gap-2">
          <LocalTaskSessionCell sessions={sessions} lead={lead} inContact={workspace.inContact} />
          <span className="shrink-0 text-2xs text-muted-foreground">
            {formatLocalTaskTime(task.updatedAt, now)}
          </span>
        </span>
      ) : null}
    </div>
  )
}

/** A card's newest writeback, two lines at most; the full text sits in the tooltip. */
function LocalTaskBoardProgress({
  task,
  index
}: {
  task: LocalTask
  index: LocalTaskIndex
}): React.JSX.Element | null {
  const progress = useLocalTasksDomain((state) => state.progress)
  const links = useLocalTasksDomain((state) => state.links)
  const latest = localTaskVisibleProgress(task, index, { progress, links })
  if (!latest) {
    return null
  }
  const summary = localTaskProgressSummary(latest.progress.body)
  return (
    <span className="line-clamp-2 text-2xs leading-relaxed text-muted-foreground" title={summary}>
      <span className="mr-1 rounded-sm bg-muted px-1 text-foreground/80">
        {latest.progress.kind === 'progress'
          ? translate('localTasks.row.writeback', 'Writeback')
          : translate('localTasks.row.lastSentence', 'Last line')}
      </span>
      {latest.task.id === task.id ? '' : `${latest.task.ref} `}
      {summary}
    </span>
  )
}

function NeedsYouStrip({ model }: { model: LocalTaskListModel }): React.JSX.Element | null {
  const rows = [...model.band.waiting, ...model.band.review]
  if (rows.length === 0) {
    return null
  }
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-sleek">
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
        <Bell className="size-3.5 text-status-warning" aria-hidden />
        {translate('localTasks.needsYou.title', 'Needs you')}
        <span className="rounded-full bg-status-warning px-1.5 text-2xs leading-4 tabular-nums text-background">
          {rows.length}
        </span>
      </span>
      {rows.map((row) => {
        const status = model.index.statusesById.get(row.task.statusId)
        const item = row.items.find((candidate) => candidate.kind !== 'unread-done') ?? row.items[0]
        return (
          <button
            key={row.task.id}
            type="button"
            onClick={() => localTaskPageStore.getState().openPreview(row.task.id)}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 text-xs hover:bg-accent"
          >
            {status ? (
              <LocalTaskStatusIcon category={status.category} color={status.color} />
            ) : null}
            <span className="max-w-48 truncate text-foreground">{row.task.title}</span>
            <span className="text-2xs text-muted-foreground">{row.task.ref}</span>
            <span
              className={cn(
                'rounded-sm px-1 text-2xs leading-4',
                row.group === 'review'
                  ? 'bg-status-success-background text-status-success'
                  : 'bg-status-warning-background text-status-warning'
              )}
            >
              {row.group === 'review'
                ? translate('localTasks.row.awaitingAcceptance', 'Awaiting acceptance')
                : item
                  ? localTaskAttentionKindLabel(item.kind)
                  : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Active work first, then what is done; planning after it so an empty column never pushes
 * Completed off screen. A drop still moves a card to any column.
 */
const COLUMN_ORDER = ['started', 'review', 'unstarted', 'completed', 'backlog', 'canceled'] as const

function BoardColumn({
  column,
  model
}: {
  column: LocalTaskBoardColumn
  model: LocalTaskListModel
}): React.JSX.Element {
  const [dragOver, setDragOver] = useState(false)
  const writable = useLocalTasksDomain((state) => canCreateInGroup(state, column, model))
  const label = localTaskGroupLabel(column)
  const color = column.kind === 'status' ? column.status.color : 'gray'
  return (
    <section
      aria-label={label}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(DRAG_TYPE)) {
          event.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        setDragOver(false)
        const task = model.index.tasksById.get(event.dataTransfer.getData(DRAG_TYPE))
        if (!task) {
          return
        }
        const refusal = localTaskBoardDropRefusal(
          column,
          task,
          (projectId) => model.index.projectsById.get(projectId)?.name ?? '?'
        )
        if (refusal) {
          toast.error(refusal)
          return
        }
        event.preventDefault()
        const target =
          column.kind === 'status'
            ? column.status.id
            : model.index.statusesById.get(task.statusId)?.category
        if (column.kind === 'status' ? task.statusId === target : target === column.category) {
          return
        }
        void setLocalTasksStatus(
          [task],
          column.kind === 'status' ? { statusId: column.status.id } : { category: column.category }
        )
      }}
      className={cn(
        'flex w-52 shrink-0 flex-col rounded-md border border-border/50 bg-muted/20 transition-[border-color,box-shadow]',
        dragOver && 'border-ring/70 ring-1 ring-ring/70'
      )}
    >
      <div className="flex h-9 items-center gap-2 border-b border-border/50 pr-1.5 pl-3">
        <LocalTaskStatusIcon category={statusHeadCategory(column)} color={color} />
        <span className="truncate text-xs font-medium text-foreground">{label}</span>
        <span className="text-2xs tabular-nums text-muted-foreground">{column.tasks.length}</span>
        {writable ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            onClick={() => openCreateInGroup(column, model)}
            aria-label={translate('localTasks.list.addInGroup', 'New task in {{group}}', {
              group: label
            })}
          >
            <Plus className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto p-2 scrollbar-sleek">
        {column.tasks.map((task) => (
          <BoardCard key={task.id} task={task} index={model.index} hostLabels={model.hostLabels} />
        ))}
      </div>
    </section>
  )
}

/** Columns are statuses, or categories across projects; drop a card to change its status. */
export function LocalTaskBoard({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const showCanceled = useLocalTaskPage((state) => state.showCanceledColumn)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <NeedsYouStrip model={model} />
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1 scrollbar-sleek">
        {model.columns
          .toSorted(
            (a, b) =>
              COLUMN_ORDER.indexOf(statusHeadCategory(a)) -
              COLUMN_ORDER.indexOf(statusHeadCategory(b))
          )
          .map((column) => (
            <BoardColumn key={column.key} column={column} model={model} />
          ))}
      </div>
      {showCanceled ? null : (
        <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <EyeOff className="size-3" />
          {translate(
            'localTasks.board.canceledHidden',
            'The Canceled column is hidden. Turn it on under Filter.'
          )}
        </p>
      )}
    </div>
  )
}
