import { useState } from 'react'
import { CornerDownRight, EyeOff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { LocalTaskHostTag } from './LocalTaskHostTag'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { statusHeadCategory, type LocalTaskBoardColumn } from '@/local-tasks/local-task-list-groups'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { setLocalTasksStatus } from '@/local-tasks/local-task-writes'
import {
  isLocalTaskRowWritable,
  localTasksDomainStore,
  useLocalTaskRowWritable,
  useLocalTasksDomain
} from '@/local-tasks/local-tasks-domain-store'
import {
  localTaskPathFromRoot,
  localTaskPathLabel
} from '../../../../shared/local-tasks/local-task-hierarchy'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskLabelChips, LocalTaskSubtaskProgress } from './LocalTaskRow'
import { LocalTaskProgressBadges } from './LocalTaskProgress'
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
      onClick={() => localTaskPageStore.getState().openDetail(task.id)}
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
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 font-mono text-2xs text-muted-foreground">{task.ref}</span>
          <LocalTaskHostTag id={task.id} labels={hostLabels} />
        </span>
        <LocalTaskPriorityIcon priority={task.priority} />
      </div>
      {path.length > 0 ? (
        <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
          <CornerDownRight className="size-3 shrink-0" />
          <span className="truncate">{localTaskPathLabel(path)}</span>
        </span>
      ) : null}
      <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
        {task.title}
      </span>
      {task.labels.length > 0 || index.childrenByParentId.has(task.id) ? (
        <div className="flex items-center gap-2">
          <LocalTaskLabelChips labels={task.labels} />
          <LocalTaskSubtaskProgress task={task} index={index} />
        </div>
      ) : null}
      <LocalTaskProgressBadges task={task} index={index} />
    </div>
  )
}

/** A card lands where its own library takes writes and the column's status belongs to it. */
function acceptsDrop(column: LocalTaskBoardColumn, task: LocalTask): boolean {
  return (
    isLocalTaskRowWritable(localTasksDomainStore.getState(), task.id) &&
    (column.kind !== 'status' || column.status.projectId === task.projectId)
  )
}

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
        if (!task || !acceptsDrop(column, task)) {
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
        'flex w-64 shrink-0 flex-col rounded-md border border-border/50 bg-muted/20 transition-[border-color,box-shadow]',
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
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1 scrollbar-sleek">
        {model.columns.map((column) => (
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
