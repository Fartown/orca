import { useMemo } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { collectLocalTaskLabels, type LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import { localTaskParentCandidates } from '@/local-tasks/local-task-hierarchy'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import {
  runLocalTaskWrite,
  setLocalTasksPriority,
  setLocalTasksStatus,
  toggleLocalTasksLabel,
  updateLocalTaskFields
} from '@/local-tasks/local-task-writes'
import {
  LocalTaskLabelsPicker,
  LocalTaskParentPicker,
  LocalTaskPrioritySelect,
  LocalTaskStatusSelect
} from './LocalTaskFieldPickers'

function Property({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

async function moveTask(task: LocalTask, targetProjectId: string): Promise<void> {
  const result = await runLocalTaskWrite(() =>
    localTasksClient.moveTask({ taskId: task.id, targetProjectId })
  )
  if (result) {
    localTasksDomainStore.getState().upsertTasks([result.task])
    toast.success(
      translate('localTasks.detail.moved', '{{from}} is now {{to}}', {
        from: task.ref,
        to: result.task.ref
      })
    )
  }
}

/** Right column of the detail: properties and the project move (REQ-004). */
export function LocalTaskDetailProperties({
  task,
  index,
  allTasks,
  writable,
  workspace
}: {
  task: LocalTask
  index: LocalTaskIndex
  allTasks: readonly LocalTask[]
  writable: boolean
  /** The 工作区 card (REQ-012) heads the column. */
  workspace?: React.ReactNode
}): React.JSX.Element {
  const now = useNow(60_000)
  const project = index.projectsById.get(task.projectId)
  const suggestions = useMemo(() => collectLocalTaskLabels(allTasks), [allTasks])
  const parents = useMemo(
    () => localTaskParentCandidates(task, task.projectId, allTasks, index),
    [allTasks, index, task]
  )
  // Why one library: each Orca numbers its own tasks, so a task moves only within its library.
  const otherProjects = [...index.projectsById.values()].filter(
    (candidate) =>
      candidate.id !== task.projectId &&
      localTaskIdEndpoint(candidate.id) === localTaskIdEndpoint(task.projectId)
  )

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border/60 pl-5 scrollbar-sleek">
      {workspace ? <div className="border-b border-border/60 pb-3">{workspace}</div> : null}
      <Property label={translate('localTasks.field.status', 'Status')}>
        <LocalTaskStatusSelect
          project={project}
          value={task.statusId}
          disabled={!writable}
          onChange={(statusId) => void setLocalTasksStatus([task], { statusId })}
        />
      </Property>
      <Property label={translate('localTasks.field.priority', 'Priority')}>
        <LocalTaskPrioritySelect
          value={task.priority}
          disabled={!writable}
          onChange={(priority) => void setLocalTasksPriority([task], priority)}
        />
      </Property>
      <Property label={translate('localTasks.field.labels', 'Labels')}>
        <LocalTaskLabelsPicker
          value={task.labels}
          suggestions={suggestions}
          disabled={!writable}
          onToggle={(label) => void toggleLocalTasksLabel([task], label)}
        />
      </Property>
      <Property label={translate('localTasks.field.parent', 'Parent task')}>
        <LocalTaskParentPicker
          candidates={parents}
          value={task.parentId}
          disabled={!writable}
          onChange={(parentId) => void updateLocalTaskFields(task, { parentId })}
        />
      </Property>
      <Property label={translate('localTasks.field.project', 'Project')}>
        <div className="flex items-center gap-1">
          <span className="min-w-0 truncate text-xs text-foreground">{project?.name}</span>
          <span className="font-mono text-2xs text-muted-foreground">{project?.prefix}</span>
          {otherProjects.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={!writable}>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  aria-label={translate('localTasks.detail.moveTo', 'Move to another project')}
                >
                  <ArrowRightLeft className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {translate('localTasks.detail.moveTo', 'Move to another project')}
                </DropdownMenuLabel>
                {otherProjects.map((candidate) => (
                  <DropdownMenuItem
                    key={candidate.id}
                    onSelect={() => void moveTask(task, candidate.id)}
                  >
                    {candidate.name}
                    <span className="font-mono text-2xs text-muted-foreground">
                      {candidate.prefix}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </Property>
      <div className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <span>
          {translate('localTasks.detail.created', 'Created {{when}}', {
            when: formatLocalTaskTime(task.createdAt, now)
          })}
        </span>
        <span>
          {translate('localTasks.detail.updated', 'Updated {{when}}', {
            when: formatLocalTaskTime(task.updatedAt, now)
          })}
        </span>
      </div>
    </aside>
  )
}
