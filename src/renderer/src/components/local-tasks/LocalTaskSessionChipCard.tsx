import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, CornerDownRight, Link2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { isTuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent-config'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import {
  chatSessionIds,
  recordLocalTaskSessionLink,
  terminalSessionIds
} from '@/local-tasks/local-task-session-recording'
import { unlinkLocalTaskSession } from '@/local-tasks/local-task-workspace-linking'
import {
  useLocalTasksDomain,
  selectLocalTasksPartition
} from '@/local-tasks/local-tasks-domain-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { useLocalTaskRowWriteReason } from '@/local-tasks/local-task-write-reason'
import type { LocalTaskSessionPane } from './LocalTaskSessionChip'
import { LocalTaskSummaryCard } from './LocalTaskSummaryCard'
import { useLocalTaskIndex } from './use-local-task-list-model'
import { useLocalTaskPaneWorkspaceLink } from '@/local-tasks/local-task-pane-workspace-link'
import { localTaskSessionLinkChoices } from '@/local-tasks/local-task-session-link-choices'
import { localTaskIdEndpoint, localTaskOwnerId } from '@/local-tasks/local-task-endpoints'
import { useLocalTaskHostLabel } from './LocalTaskHostLabel'

function SessionTaskChoice({
  task,
  crossHost,
  nested,
  busy,
  onPick
}: {
  task: LocalTask
  crossHost: boolean
  nested: boolean
  busy: boolean
  onPick: () => void
}): React.JSX.Element {
  const reason = useLocalTaskRowWriteReason(task.id)
  const hostLabel = useLocalTaskHostLabel(localTaskIdEndpoint(task.id))
  const supported = useLocalTasksDomain(
    (state) =>
      !crossHost ||
      Boolean(selectLocalTasksPartition(state, localTaskIdEndpoint(task.id))?.installationId)
  )
  const unavailable =
    reason ??
    (!supported
      ? translate(
          'localTasks.crossHost.updateRequired',
          'Update the task library’s Orca to link sessions across hosts.'
        )
      : null)
  return (
    <button
      type="button"
      disabled={unavailable !== null || busy}
      title={unavailable ?? undefined}
      onClick={onPick}
      className="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-1 text-left text-xs hover:bg-accent disabled:opacity-50"
    >
      {nested ? <CornerDownRight className="size-3 shrink-0 text-muted-foreground" /> : null}
      <span className="shrink-0 font-mono text-2xs text-muted-foreground">{task.ref}</span>
      <span className="min-w-0 flex-1 truncate text-foreground">{task.title}</span>
      {crossHost ? (
        <span className="shrink-0 text-2xs text-muted-foreground">{hostLabel}</span>
      ) : null}
    </button>
  )
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
 * Offers tasks sharing this workspace and tasks on other hosts. Save the replacement before
 * removing a link in another library; an unconfirmed removal must not discard the new link.
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
  const agentType = useAppStore((state) => state.agentStatusByPaneKey.get(pane.paneKey)?.agentType)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const links = useLocalTasksDomain((state) => state.links)
  const instanceId = useAppStore(
    (state) => state.getKnownWorktreeById(pane.worktreeId, hostId)?.instanceId
  )
  const writeReason = useLocalTaskRowWriteReason(replacing?.id ?? null)
  const [busy, setBusy] = useState(false)
  const choices = localTaskSessionLinkChoices(tasks, links, {
    id: pane.worktreeId,
    hostId,
    ...(instanceId ? { instanceId } : {})
  }).filter(({ task }) => task.id !== replacing?.taskId)
  const tabId = parsePaneKey(pane.paneKey)?.tabId ?? null
  const pick = async (task: LocalTask, crossHost: boolean): Promise<void> => {
    setBusy(true)
    try {
      const acrossLibraries =
        replacing !== null && localTaskIdEndpoint(replacing.id) !== localTaskIdEndpoint(task.id)
      const ids = pane.sessionId
        ? chatSessionIds(tabId, pane.sessionId)
        : tabId
          ? { ...terminalSessionIds(tabId), paneKey: pane.paneKey }
          : { surface: 'terminal' as const, paneKey: pane.paneKey }
      const recorded = await recordLocalTaskSessionLink(
        {
          taskId: task.id,
          hostId,
          worktreeId: pane.worktreeId,
          instanceId: instanceId ?? link?.instanceId ?? null,
          agent: isTuiAgent(agentType)
            ? agentType
            : replacing && isTuiAgent(replacing.agent)
              ? replacing.agent
              : null,
          linkedVia: 'manual',
          crossHost,
          ...(replacing && !acrossLibraries
            ? {
                replacingSessionLinkId: localTaskOwnerId(replacing.id)
              }
            : {})
        },
        ids
      )
      if (recorded) {
        if (
          replacing &&
          acrossLibraries &&
          !(await runLocalTaskWrite(() => localTasksClient.unlinkSession(replacing.id)))
        ) {
          toast.error(
            translate(
              'localTasks.crossHost.previousLinkUnconfirmed',
              'Linked to the new task, but removing the previous link could not be confirmed. Check both tasks.'
            )
          )
          return
        }
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
      {choices.map(({ task, crossHost }) => (
        <SessionTaskChoice
          key={task.id}
          task={task}
          crossHost={crossHost}
          nested={!crossHost && task.id !== link?.taskId}
          busy={busy || writeReason !== null}
          onPick={() => void pick(task, crossHost)}
        />
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
