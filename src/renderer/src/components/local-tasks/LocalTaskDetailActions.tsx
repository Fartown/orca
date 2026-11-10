import { useRef } from 'react'
import {
  ArrowRightLeft,
  Ban,
  Bot,
  CheckCheck,
  MoreHorizontal,
  SlidersHorizontal,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { firstStatusInCategory, type LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { runLocalTaskWrite, setLocalTasksStatus } from '@/local-tasks/local-task-writes'
import { useLocalTaskRowWriteReason } from '@/local-tasks/local-task-write-reason'
import {
  runLocalTaskSession,
  useLocalTaskSessionState
} from '@/local-tasks/local-task-work-actions'
import type { LocalTaskWorkspaceLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskActionTooltip } from './LocalTaskActionTooltip'
import { LocalTaskStartActions } from './LocalTaskStartActions'
import { focusLocalTaskAcceptance } from './LocalTaskAcceptanceStrip'

async function moveTask(task: LocalTask, target: LocalTaskProject): Promise<void> {
  const result = await runLocalTaskWrite(() =>
    localTasksClient.moveTask({ taskId: task.id, targetProjectId: target.id })
  )
  if (result) {
    localTasksDomainStore.getState().upsertTasks([result.task])
    // Why the title first: the new ref is news, but it is not what names the task (§4).
    toast.success(
      translate('localTasks.detail.moved', '“{{title}}” moved to {{project}} as {{ref}}', {
        title: result.task.title,
        project: target.name,
        ref: result.task.ref
      })
    )
  }
}

/**
 * One primary action by status: Start before there is a workspace, New session while it is worked
 * on, Review while it waits for acceptance, none once it is done or canceled.
 */
export function LocalTaskDetailPrimaryAction({
  task,
  project,
  ownLink,
  workspace
}: {
  task: LocalTask
  project: LocalTaskProject | undefined
  ownLink: LocalTaskWorkspaceLink | null
  workspace: LocalTaskWorkspaceLink | null
}): React.JSX.Element | null {
  const writeReason = useLocalTaskRowWriteReason(task.id)
  const session = useLocalTaskSessionState(project, workspace)
  const category = project?.statuses.find((status) => status.id === task.statusId)?.category
  if (!project || category === 'completed' || category === 'canceled') {
    return null
  }
  if (category === 'review') {
    return (
      <Button size="sm" onClick={focusLocalTaskAcceptance}>
        <CheckCheck className="size-3.5" />
        {translate('localTasks.detail.review', 'Review')}
      </Button>
    )
  }
  if (!workspace) {
    return (
      <LocalTaskStartActions
        task={task}
        project={project}
        ownLink={ownLink}
        writeReason={writeReason}
        inherited={false}
        show="start"
        size="sm"
      />
    )
  }
  const reason = writeReason ?? session.reason
  const label = translate('localTasks.links.newSession', 'New session')
  return (
    <LocalTaskActionTooltip reason={reason} label={label} shortcut={['A']}>
      <Button
        size="sm"
        disabled={reason !== null}
        onClick={() => runLocalTaskSession(task, project, workspace)}
      >
        <Bot className="size-3.5" />
        {label}
      </Button>
    </LocalTaskActionTooltip>
  )
}

export function LocalTaskDetailMenu({
  task,
  index,
  writable,
  onEditProperties,
  onDelete
}: {
  task: LocalTask
  index: LocalTaskIndex
  writable: boolean
  onEditProperties: () => void
  onDelete: () => void
}): React.JSX.Element {
  // Why: the properties popover opens as the menu closes; returning focus to … would dismiss it.
  const keepFocus = useRef(false)
  const project = index.projectsById.get(task.projectId)
  const category = project?.statuses.find((status) => status.id === task.statusId)?.category
  const canCancel = category !== 'canceled' && firstStatusInCategory(project, 'canceled')
  // Why one library: each Orca numbers its own tasks, so a task moves only within its library.
  const otherProjects = [...index.projectsById.values()].filter(
    (candidate) =>
      candidate.id !== task.projectId &&
      localTaskIdEndpoint(candidate.id) === localTaskIdEndpoint(task.projectId)
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('localTasks.detail.actions', 'Task actions')}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (keepFocus.current) {
            keepFocus.current = false
            event.preventDefault()
          }
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            keepFocus.current = true
            onEditProperties()
          }}
        >
          <SlidersHorizontal />
          {translate('localTasks.detail.editProperties', 'Edit properties…')}
        </DropdownMenuItem>
        {writable && otherProjects.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRightLeft />
              {translate('localTasks.detail.moveTo', 'Move to another project')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {otherProjects.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.id}
                  onSelect={() => void moveTask(task, candidate)}
                >
                  {candidate.name}
                  <span className="font-mono text-2xs text-muted-foreground">
                    {candidate.prefix}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {writable ? (
          <>
            <DropdownMenuSeparator />
            {canCancel ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => void setLocalTasksStatus([task], { category: 'canceled' })}
              >
                <Ban />
                {translate('localTasks.detail.cancelTask', 'Cancel task')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              {translate('localTasks.detail.delete', 'Delete task…')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
