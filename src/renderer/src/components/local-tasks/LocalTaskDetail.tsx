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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-center gap-2 border-b border-border/60 pb-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={back}
          aria-label={translate('localTasks.detail.backToList', 'Back to tasks')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground">{project?.name}</span>
        <span className="text-xs text-muted-foreground">/</span>
        {path.map((ancestor) => (
          <span key={ancestor.id} className="flex items-center gap-2">
            <button
              type="button"
              title={ancestor.title}
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
              onClick={() => localTaskPageStore.getState().openDetail(ancestor.id)}
            >
              {ancestor.ref}
            </button>
            <span className="text-xs text-muted-foreground">›</span>
          </span>
        ))}
        {status ? <LocalTaskStatusIcon category={status.category} color={status.color} /> : null}
        <span className="font-mono text-xs font-medium text-foreground">{task.ref}</span>
        <LocalTaskHostTag id={task.id} labels={model.hostLabels} />
        {position !== -1 ? (
          <span className="ml-1 flex items-center gap-0.5 text-2xs text-muted-foreground">
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
      <div className="flex min-h-0 flex-1 gap-5">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-2 scrollbar-sleek">
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
