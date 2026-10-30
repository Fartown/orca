import { ListTodo } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../../shared/worktree/types'
import { openLocalTaskWorkspaceDetails } from '@/local-tasks/local-task-workspace-details'
import { selectLocalTaskSourceVisible } from '@/local-tasks/local-task-source-visibility'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { useLocalTaskOfWorkspace } from '@/local-tasks/local-task-workspace-task'
import { useLocalTaskSidebarGrouping } from '@/local-tasks/local-task-sidebar-grouping'
import { useLocalTaskCardChipShown } from '@/local-tasks/local-task-card-chip-preference'
import { localTaskWorktreeHostId } from '@/local-tasks/local-task-workspace-resolution'
import { localTaskEndpointForHost } from '@/local-tasks/local-task-endpoints'
import {
  isLocalTasksReadable,
  selectLocalTasksPartition,
  useLocalTasksDomain
} from '@/local-tasks/local-tasks-domain-store'

type WorkspaceRef = Pick<Worktree, 'id' | 'hostId' | 'instanceId'>

/**
 * The task chip on a sidebar workspace card (REQ-016): the task's title, the ref only in its
 * tooltip. It shrinks three times faster than the workspace name, so the name stays readable.
 * Grouping the sidebar by task already names the task in the group head, so the chip steps aside;
 * "Show properties → Local task" hides it, while the hover card still lists the task.
 */
export function LocalTaskWorkspaceChip({
  worktree
}: {
  worktree: WorkspaceRef
}): React.JSX.Element | null {
  // Why gate: every sidebar card mounts this; with no linked workspace it reads nothing else.
  const anyLinked = useLocalTasksDomain((state) => state.links.workspaces.length > 0)
  return anyLinked ? <LinkedWorkspaceChip worktree={worktree} /> : null
}

function LinkedWorkspaceChip({ worktree }: { worktree: WorkspaceRef }): React.JSX.Element | null {
  const task = useLocalTaskOfWorkspace(worktree)?.task
  const grouping = useLocalTaskSidebarGrouping()
  const shown = useLocalTaskCardChipShown()
  if (!task || grouping === 'on' || !shown) {
    return null
  }
  const label = `${task.title} · ${task.ref}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 min-w-14 max-w-28 shrink-[3] items-center gap-0.5 rounded-[4px] border border-worktree-sidebar-border px-1 text-3xs leading-none text-muted-foreground hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            openLocalTaskPage({ taskId: task.id })
          }}
          aria-label={translate('localTasks.links.openTask', 'Open task {{title}}', {
            title: task.title
          })}
        >
          <ListTodo className="size-2.5 shrink-0" />
          <span className="min-w-0 truncate">{task.title}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="max-w-72">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * 关联到任务… in a workspace's context menu (REQ-011); single selection only. It opens Orca's own
 * workspace details on its Local tasks tab, where the link is a draft until Save.
 */
export function LocalTaskWorkspaceMenuItem({
  worktree,
  disabled
}: {
  worktree: WorkspaceRef
  disabled: boolean
}): React.JSX.Element | null {
  const task = useLocalTaskOfWorkspace(worktree)?.task
  const hostId = useAppStore((state) => localTaskWorktreeHostId(state, worktree))
  // Why the host's library: only the Orca serving this workspace can link it to a task. Without a
  // task project there, or with Local hidden, it has nothing to offer unless a task is linked.
  const offered = useLocalTasksDomain((state) => {
    const endpoint = localTaskEndpointForHost(hostId)
    return (
      endpoint !== null &&
      selectLocalTaskSourceVisible(state) &&
      isLocalTasksReadable(state, endpoint) &&
      (selectLocalTasksPartition(state, endpoint)?.projects.length ?? 0) > 0
    )
  })
  if (!offered && !task) {
    return null
  }
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={() => openLocalTaskWorkspaceDetails({ worktreeId: worktree.id, hostId })}
    >
      <ListTodo className="size-3.5" />
      <span className="max-w-56 truncate">
        {task
          ? translate('localTasks.links.menuLinked', 'Task: {{title}}…', { title: task.title })
          : translate('localTasks.links.menuLink', 'Link to task…')}
      </span>
    </DropdownMenuItem>
  )
}
