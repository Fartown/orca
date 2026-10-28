import { ListTodo } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../../shared/worktree/types'
import { localTaskLinkDialogStore } from '@/local-tasks/local-task-link-dialog-store'
import { findLocalTaskLinkForWorkspace } from '@/local-tasks/local-task-link-selectors'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { useLocalTaskSidebarGrouping } from '@/local-tasks/local-task-sidebar-grouping'
import { localTaskWorktreeHostId } from '@/local-tasks/local-task-workspace-resolution'
import { localTaskEndpointForHost } from '@/local-tasks/local-task-endpoints'
import { isLocalTasksReadable, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'

type WorkspaceRef = Pick<Worktree, 'id' | 'hostId' | 'instanceId'>

/** The task a sidebar workspace belongs to, by its host and id; links are read with no host contact. */
function useWorkspaceTask(
  worktree: WorkspaceRef
): { taskId: string; ref: string; title: string } | null {
  const hostId = useAppStore((state) => localTaskWorktreeHostId(state, worktree))
  const link = useLocalTasksDomain((state) =>
    findLocalTaskLinkForWorkspace(state.links, {
      id: worktree.id,
      hostId,
      ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
    })
  )
  const task = useLocalTasksDomain((state) =>
    link ? state.tasks.find((candidate) => candidate.id === link.taskId) : undefined
  )
  return task ? { taskId: task.id, ref: task.ref, title: task.title } : null
}

/**
 * The task chip on a sidebar workspace card (REQ-016): ref and title, truncated with a tooltip.
 * Grouping the sidebar by task already names the task in the group head, so the chip steps aside.
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
  const task = useWorkspaceTask(worktree)
  const grouping = useLocalTaskSidebarGrouping()
  if (!task || grouping === 'on') {
    return null
  }
  const label = `${task.ref} · ${task.title}`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 max-w-36 shrink items-center gap-0.5 rounded-[4px] border border-worktree-sidebar-border px-1 text-3xs leading-none text-muted-foreground hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            openLocalTaskPage({ taskId: task.taskId })
          }}
          aria-label={translate('localTasks.links.openTask', 'Open task {{ref}}', {
            ref: task.ref
          })}
        >
          <span className="shrink-0 font-mono">{task.ref}</span>
          <span className="min-w-0 truncate">· {task.title}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="max-w-72">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** 关联到任务… in a workspace's context menu (REQ-011); single selection only. */
export function LocalTaskWorkspaceMenuItem({
  worktree,
  disabled
}: {
  worktree: WorkspaceRef
  disabled: boolean
}): React.JSX.Element | null {
  const task = useWorkspaceTask(worktree)
  const hostId = useAppStore((state) => localTaskWorktreeHostId(state, worktree))
  // Why the host's library: only the Orca serving this workspace can link it to a task.
  const readable = useLocalTasksDomain((state) => {
    const endpoint = localTaskEndpointForHost(hostId)
    return endpoint !== null && isLocalTasksReadable(state, endpoint)
  })
  if (!readable) {
    return null
  }
  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={() =>
        localTaskLinkDialogStore
          .getState()
          .open({ kind: 'pick-task', worktreeId: worktree.id, hostId })
      }
    >
      <ListTodo className="size-3.5" />
      {task
        ? translate('localTasks.links.menuLinked', 'Task {{ref}}…', { ref: task.ref })
        : translate('localTasks.links.menuLink', 'Link to task…')}
    </DropdownMenuItem>
  )
}
