import { useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import {
  useLocalTaskEffectiveWorkspace,
  useLocalTaskWorkspaceLink
} from '@/local-tasks/local-task-link-selectors'
import { localTaskPathFromRoot } from '../../../../shared/local-tasks/local-task-hierarchy'
import { useLocalTaskRowWritable } from '@/local-tasks/local-tasks-domain-store'
import { localTaskDescendantIds } from '../../../../shared/local-tasks/local-task-tree'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskDetailBody } from './LocalTaskDetailBody'
import { LocalTaskDetailProperties } from './LocalTaskDetailProperties'
import { LocalTaskSubtasks } from './LocalTaskSubtasks'
import { LocalTaskActivity } from './LocalTaskActivity'
import { LocalTaskWorkspaceCard } from './LocalTaskWorkspaceCard'
import { LocalTaskSessionList } from './LocalTaskSessionList'
import { LocalTaskDeleteDialog } from './LocalTaskDeleteDialog'
import { LocalTaskHostTag } from './LocalTaskHostTag'
import type { LocalTaskListModel } from './use-local-task-list-model'
import { useLocalTaskEscapeLayer } from './use-local-task-page-keys'

function back(): void {
  localTaskPageStore.getState().openDetail(null)
}

function StepButton({
  direction,
  targetId
}: {
  direction: 'previous' | 'next'
  targetId: string | null
}): React.JSX.Element {
  const label =
    direction === 'previous'
      ? translate('localTasks.detail.previous', 'Previous task')
      : translate('localTasks.detail.next', 'Next task')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!targetId}
          aria-label={label}
          onClick={() => targetId && localTaskPageStore.getState().openDetail(targetId)}
        >
          {direction === 'previous' ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <span className="flex items-center gap-2">
          {label}
          <ShortcutKeyCombo keys={[direction === 'previous' ? 'K' : 'J']} />
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

/** Full task view at any level; Esc or the back arrow returns to the list (REQ-004, REQ-005). */
export function LocalTaskDetail({
  taskId,
  model
}: {
  taskId: string
  model: LocalTaskListModel
}): React.JSX.Element {
  const writable = useLocalTaskRowWritable(taskId)
  const [deleting, setDeleting] = useState(false)
  useLocalTaskEscapeLayer('panel', true, back)
  const task = model.index.tasksById.get(taskId)
  const ownLink = useLocalTaskWorkspaceLink(task?.id ?? null)
  const workspace = useLocalTaskEffectiveWorkspace(task ?? null, model.index.tasksById)
  if (!task) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        {translate('localTasks.detail.missing', 'This task no longer exists.')}
        <Button variant="outline" size="sm" onClick={back}>
          {translate('localTasks.detail.backToList', 'Back to tasks')}
        </Button>
      </div>
    )
  }
  const project = model.index.projectsById.get(task.projectId)
  const status = model.index.statusesById.get(task.statusId)
  const path = localTaskPathFromRoot(task, model.index.tasksById)
  const position = model.orderedTaskIds.indexOf(task.id)
  return (
    <div className="@container/local-task-detail flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-center gap-2 border-b border-border/60 pb-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={back}
          aria-label={translate('localTasks.detail.backToList', 'Back to tasks')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="max-w-40 shrink-0 truncate text-xs text-muted-foreground">
          {project?.name}
        </span>
        <span className="text-xs text-muted-foreground">/</span>
        {/* Why one shrinking run: a deep path gives way before the task's own ref does. */}
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          {path.map((ancestor) => (
            <span key={ancestor.id} className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                title={`${ancestor.title} · ${ancestor.ref}`}
                className="min-w-0 max-w-48 truncate text-xs text-muted-foreground hover:text-foreground"
                onClick={() => localTaskPageStore.getState().openDetail(ancestor.id)}
              >
                {ancestor.title}
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">›</span>
            </span>
          ))}
        </span>
        {status ? <LocalTaskStatusIcon category={status.category} color={status.color} /> : null}
        {/* Why muted: the title below is the task's name; the ref here only places it. */}
        <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
          {task.ref}
        </span>
        <LocalTaskHostTag id={task.id} labels={model.hostLabels} />
        {position !== -1 ? (
          <span className="ml-1 flex shrink-0 items-center gap-0.5 whitespace-nowrap text-2xs text-muted-foreground">
            <StepButton
              direction="previous"
              targetId={model.orderedTaskIds[position - 1] ?? null}
            />
            <StepButton direction="next" targetId={model.orderedTaskIds[position + 1] ?? null} />
            {position + 1} / {model.orderedTaskIds.length}
          </span>
        ) : null}
        {writable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                aria-label={translate('localTasks.detail.actions', 'Task actions')}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2 />
                {translate('localTasks.detail.delete', 'Delete task…')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      {/* Why: below 48rem the properties stack under the body, so neither squeezes the other. */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto scrollbar-sleek @3xl/local-task-detail:flex-row @3xl/local-task-detail:overflow-visible">
        <div className="min-w-0 pr-2 scrollbar-sleek @3xl/local-task-detail:min-h-0 @3xl/local-task-detail:flex-1 @3xl/local-task-detail:overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-8">
            <LocalTaskDetailBody key={task.id} task={task} writable={writable} />
            <LocalTaskSessionList
              task={task}
              project={project}
              workspace={workspace}
              index={model.index}
              writable={writable}
            />
            <LocalTaskSubtasks key={task.id} task={task} index={model.index} writable={writable} />
            <LocalTaskActivity
              key={task.id}
              taskId={task.id}
              index={model.index}
              writable={writable}
            />
          </div>
        </div>
        <LocalTaskDetailProperties
          task={task}
          index={model.index}
          allTasks={model.tasks}
          writable={writable}
          workspace={
            <LocalTaskWorkspaceCard
              task={task}
              project={project}
              ownLink={ownLink}
              workspace={workspace}
              index={model.index}
              writable={writable}
            />
          }
        />
      </div>
      <LocalTaskDeleteDialog
        task={task}
        descendantCount={localTaskDescendantIds(task.id, model.index.childrenByParentId).length}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </div>
  )
}
