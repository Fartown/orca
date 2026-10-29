import { CornerDownRight, ExternalLink, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { localTaskLinkDialogStore } from '@/local-tasks/local-task-link-dialog-store'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import {
  chatSessionIds,
  recordLocalTaskSession,
  terminalSessionIds
} from '@/local-tasks/local-task-session-recording'
import { unlinkLocalTaskSession } from '@/local-tasks/local-task-workspace-linking'
import { findLocalTaskLinkForWorkspace } from '@/local-tasks/local-task-link-selectors'
import {
  useLocalTaskRowWritable,
  useLocalTasksDomain
} from '@/local-tasks/local-tasks-domain-store'
import { buildLocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTaskWorkspaceFamilyIds } from '../../../../shared/local-tasks/local-task-hierarchy'
import type { LocalTaskSessionPane } from './LocalTaskSessionChip'

function TaskLine({ task, onOpen }: { task: LocalTask; onOpen: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
    >
      <span className="shrink-0 font-mono text-2xs text-muted-foreground">{task.ref}</span>
      <span className="min-w-0 truncate text-foreground">{task.title}</span>
    </button>
  )
}

function LinkedCard({
  session,
  onDone
}: {
  session: LocalTaskSessionLink
  onDone: () => void
}): React.JSX.Element | null {
  const task = useLocalTasksDomain((state) => state.tasks.find((t) => t.id === session.taskId))
  const parent = useLocalTasksDomain((state) =>
    task?.parentId ? state.tasks.find((t) => t.id === task.parentId) : undefined
  )
  const writable = useLocalTaskRowWritable(session.id)
  if (!task) {
    return null
  }
  const open = (taskId: string): void => {
    onDone()
    openLocalTaskPage({ taskId })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-2xs text-muted-foreground">{task.ref}</span>
        <span className="text-sm font-medium leading-snug text-foreground">{task.title}</span>
      </div>
      {parent ? (
        <div className="flex items-center gap-1 text-2xs text-muted-foreground">
          <CornerDownRight className="size-3 shrink-0" />
          {translate('localTasks.links.parentTask', 'Parent task')}
          <TaskLine task={parent} onOpen={() => open(parent.id)} />
        </div>
      ) : null}
      <div className="flex gap-1.5">
        <Button size="xs" variant="outline" onClick={() => open(task.id)}>
          <ExternalLink className="size-3" />
          {translate('localTasks.links.openTaskShort', 'Open task')}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={!writable}
          onClick={() => {
            onDone()
            void unlinkLocalTaskSession(session.id)
          }}
        >
          <Unlink className="size-3" />
          {translate('localTasks.links.unlink', 'Unlink')}
        </Button>
      </div>
    </div>
  )
}

/** A pane's workspace link, matched as the sidebar card matches it: instance, then host and id. */
export function useLocalTaskPaneWorkspaceLink(worktreeId: string): {
  hostId: ExecutionHostId
  link: LocalTaskWorkspaceLink | null
} {
  const hostId = useAppStore((state) => getExecutionHostIdForWorktree(state, worktreeId))
  const instanceId = useAppStore(
    (state) => state.getKnownWorktreeById(worktreeId, hostId)?.instanceId
  )
  const link = useLocalTasksDomain((state) =>
    findLocalTaskLinkForWorkspace(state.links, {
      id: worktreeId,
      hostId,
      ...(instanceId ? { instanceId } : {})
    })
  )
  return { hostId, link }
}

/**
 * 关联到任务…: the task that owns this workspace and every task below it that works in it; a
 * descendant with its own workspace works elsewhere (REQ-011), and the host would refuse it.
 */
function LinkChooser({
  pane,
  onDone
}: {
  pane: LocalTaskSessionPane
  onDone: () => void
}): React.JSX.Element {
  const { hostId, link } = useLocalTaskPaneWorkspaceLink(pane.worktreeId)
  const agentType = useAppStore((state) => state.agentStatusByPaneKey[pane.paneKey]?.agentType)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const workspaces = useLocalTasksDomain((state) => state.links.workspaces)
  const writable = useLocalTaskRowWritable(link?.taskId ?? null)
  if (!link) {
    return (
      <div className="flex flex-col gap-2 text-xs text-muted-foreground">
        {translate(
          'localTasks.links.workspaceNotLinked',
          'This workspace is not linked to a task yet. Link the workspace first.'
        )}
        <Button
          size="xs"
          variant="outline"
          className="w-fit"
          onClick={() => {
            onDone()
            localTaskLinkDialogStore
              .getState()
              .open({ kind: 'pick-task', worktreeId: pane.worktreeId, hostId })
          }}
        >
          {translate('localTasks.links.linkWorkspaceFirst', 'Link workspace to a task…')}
        </Button>
      </div>
    )
  }
  const owner = tasks.find((task) => task.id === link.taskId)
  const owners = new Set(workspaces.map((workspace) => workspace.taskId))
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  const family = owner
    ? localTaskWorkspaceFamilyIds(owner.id, buildLocalTaskIndex([], tasks), (taskId) =>
        owners.has(taskId)
      ).flatMap((taskId) => tasksById.get(taskId) ?? [])
    : []
  const tabId = parsePaneKey(pane.paneKey)?.tabId ?? null
  const pick = async (task: LocalTask): Promise<void> => {
    const ids = pane.sessionId
      ? chatSessionIds(tabId, pane.sessionId)
      : tabId
        ? { ...terminalSessionIds(tabId), paneKey: pane.paneKey }
        : { surface: 'terminal' as const, paneKey: pane.paneKey }
    const recorded = await recordLocalTaskSession(
      {
        taskId: task.id,
        hostId,
        worktreeId: pane.worktreeId,
        instanceId: link.instanceId,
        agent: isTuiAgent(agentType) ? agentType : null,
        linkedVia: 'manual'
      },
      ids
    )
    if (recorded) {
      onDone()
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-2xs text-muted-foreground">
        {translate('localTasks.links.linkSessionTo', 'Link this session to')}
      </span>
      {family.map((task) => (
        <button
          key={task.id}
          type="button"
          disabled={!writable}
          onClick={() => void pick(task)}
          className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-1 text-left text-xs hover:bg-accent disabled:opacity-50"
        >
          {task.id !== owner?.id ? (
            <CornerDownRight className="size-3 shrink-0 text-muted-foreground" />
          ) : null}
          <span className="shrink-0 font-mono text-2xs text-muted-foreground">{task.ref}</span>
          <span className="min-w-0 truncate text-foreground">{task.title}</span>
        </button>
      ))}
    </div>
  )
}

/** Mounted only while the chip's popover is open. */
export function LocalTaskSessionChipCard({
  pane,
  session,
  onDone
}: {
  pane: LocalTaskSessionPane
  session: LocalTaskSessionLink | null
  onDone: () => void
}): React.JSX.Element | null {
  return session ? (
    <LinkedCard session={session} onDone={onDone} />
  ) : (
    <LinkChooser pane={pane} onDone={onDone} />
  )
}
