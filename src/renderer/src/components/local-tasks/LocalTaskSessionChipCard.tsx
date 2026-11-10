import { useState } from 'react'
import { ArrowUpRight, CornerDownRight, Link2, Unlink } from 'lucide-react'
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
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import {
  chatSessionIds,
  recordLocalTaskSession,
  terminalSessionIds
} from '@/local-tasks/local-task-session-recording'
import { unlinkLocalTaskSession } from '@/local-tasks/local-task-workspace-linking'
import { findLocalTaskLinkForWorkspace } from '@/local-tasks/local-task-link-selectors'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { useLocalTaskRowWriteReason } from '@/local-tasks/local-task-write-reason'
import { buildLocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTaskWorkspaceFamilyIds } from '../../../../shared/local-tasks/local-task-hierarchy'
import type { LocalTaskSessionPane } from './LocalTaskSessionChip'
import { LocalTaskSummaryCard } from './LocalTaskSummaryCard'
import { useLocalTaskIndex } from './use-local-task-list-model'

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

/** The card behind a linked session's chip: the task at a glance, then relink or open it. */
function LinkedCard({
  pane,
  session,
  onDone
}: {
  pane: LocalTaskSessionPane
  session: LocalTaskSessionLink
  onDone: () => void
}): React.JSX.Element | null {
  const { index } = useLocalTaskIndex()
  const [relinking, setRelinking] = useState(false)
  const writeReason = useLocalTaskRowWriteReason(session.id)
  const task = index.tasksById.get(session.taskId)
  if (!task) {
    return null
  }
  if (relinking) {
    return (
      <LinkChooser
        pane={pane}
        replacing={session}
        onDone={onDone}
        onBack={() => setRelinking(false)}
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <LocalTaskSummaryCard
        task={task}
        index={index}
        caption={translate(
          'localTasks.sessionChip.belongs',
          '{{ref}} · This session belongs to it',
          {
            ref: task.ref
          }
        )}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={writeReason !== null}
          onClick={() => setRelinking(true)}
        >
          <Link2 className="size-3.5" />
          {translate('localTasks.sessionChip.relink', 'Link to another task…')}
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => {
            onDone()
            openLocalTaskPage({ taskId: task.id })
          }}
        >
          <ArrowUpRight className="size-3.5" />
          {translate('localTasks.links.openTaskShort', 'Open task')}
        </Button>
      </div>
      {/* Why in the card: no page notice is on screen in a session header. */}
      {writeReason ? <p className="text-2xs text-muted-foreground">{writeReason}</p> : null}
    </div>
  )
}

/**
 * 关联到任务…: the task that owns this workspace and every task below it that works in it; a
 * descendant with its own workspace works elsewhere (REQ-011), and the host would refuse it.
 * Relinking a linked session lists the others and unlinks it first, as the host keeps one link.
 */
function LinkChooser({
  pane,
  replacing = null,
  onDone,
  onBack
}: {
  pane: LocalTaskSessionPane
  replacing?: LocalTaskSessionLink | null
  onDone: () => void
  onBack?: () => void
}): React.JSX.Element | null {
  const { hostId, link } = useLocalTaskPaneWorkspaceLink(pane.worktreeId)
  const agentType = useAppStore((state) => state.agentStatusByPaneKey[pane.paneKey]?.agentType)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const workspaces = useLocalTasksDomain((state) => state.links.workspaces)
  const writeReason = useLocalTaskRowWriteReason(replacing?.id ?? link?.taskId ?? null)
  const [busy, setBusy] = useState(false)
  // Why nothing: the chip shows no entry on a workspace without a task (REQ-011, REQ-016).
  if (!link) {
    return null
  }
  const owner = tasks.find((task) => task.id === link.taskId)
  const owners = new Set(workspaces.map((workspace) => workspace.taskId))
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  const family = (
    owner
      ? localTaskWorkspaceFamilyIds(owner.id, buildLocalTaskIndex([], tasks), (taskId) =>
          owners.has(taskId)
        ).flatMap((taskId) => tasksById.get(taskId) ?? [])
      : []
  ).filter((task) => task.id !== replacing?.taskId)
  const tabId = parsePaneKey(pane.paneKey)?.tabId ?? null
  const pick = async (task: LocalTask): Promise<void> => {
    setBusy(true)
    try {
      if (
        replacing &&
        !(await runLocalTaskWrite(() => localTasksClient.unlinkSession(replacing.id)))
      ) {
        return
      }
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
          agent: isTuiAgent(agentType)
            ? agentType
            : isTuiAgent(replacing?.agent)
              ? replacing.agent
              : null,
          linkedVia: 'manual'
        },
        ids
      )
      if (recorded) {
        onDone()
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-2xs text-muted-foreground">
        {translate('localTasks.links.linkSessionTo', 'Link this session to')}
      </span>
      {writeReason ? <p className="px-1 text-2xs text-muted-foreground">{writeReason}</p> : null}
      {family.map((task) => (
        <button
          key={task.id}
          type="button"
          disabled={writeReason !== null || busy}
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
      {replacing ? (
        <div className="mt-1 flex gap-1.5 border-t border-border pt-2">
          {onBack ? (
            <Button size="xs" variant="ghost" onClick={onBack}>
              {translate('localTasks.sessionChip.back', 'Back')}
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            disabled={writeReason !== null || busy}
            onClick={() => {
              onDone()
              void unlinkLocalTaskSession(replacing.id)
            }}
          >
            <Unlink className="size-3" />
            {translate('localTasks.links.unlink', 'Unlink')}
          </Button>
        </div>
      ) : null}
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
    <LinkedCard pane={pane} session={session} onDone={onDone} />
  ) : (
    <LinkChooser pane={pane} onDone={onDone} />
  )
}
