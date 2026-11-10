import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  LoaderCircle,
  Maximize2,
  Square,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { findLocalTaskEffectiveWorkspace } from '@/local-tasks/local-task-link-selectors'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { runStopItem } from '@/local-tasks/local-task-proposal-session-items'
import { formatLocalTaskSessionAge } from '@/local-tasks/local-task-session-age'
import {
  localTaskSessionPanelStore,
  type LocalTaskSessionPanelMode
} from '@/local-tasks/local-task-session-panel-store'
import { useLocalTaskSessionProgress } from '@/local-tasks/local-task-session-progress'
import { revealLocalTaskSession } from '@/local-tasks/local-task-session-reveal'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import { LocalTaskActionTooltip } from './LocalTaskActionTooltip'
import { LocalTaskHostIcon, useLocalTaskHostLabel } from './LocalTaskHostLabel'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import {
  LocalTaskSessionDot,
  localTaskSessionStateLabel,
  useLocalTaskWorkspace
} from './LocalTaskProgress'
import { localTaskSessionAgentName, localTaskSessionSurfaceLabel } from './LocalTaskSessionList'

function Dot(): React.JSX.Element {
  return <span aria-hidden>·</span>
}

/** One session in the switcher: its state, agent and surface, and the subtask it belongs to. */
function SessionOption({
  session,
  ownerTitle
}: {
  session: LocalTaskSessionLink
  ownerTitle: string | null
}): React.JSX.Element {
  const state = useLocalTaskSessionProgress(session)?.state ?? 'unknown'
  return (
    <>
      <LocalTaskSessionDot link={session} />
      <AgentIcon agent={isTuiAgent(session.agent) ? session.agent : null} size={13} />
      <span className="font-medium">{localTaskSessionAgentName(session)}</span>
      {ownerTitle ? <span className="max-w-40 truncate">· {ownerTitle}</span> : null}
      <span className="text-muted-foreground">{localTaskSessionSurfaceLabel(session)}</span>
      <span className="ml-auto pl-3 text-xs text-muted-foreground">
        {localTaskSessionStateLabel(state)}
      </span>
    </>
  )
}

/**
 * The preview's head: which agent, terminal or chat, the width and full-screen controls; then the
 * session's state, workspace and host, and the task it works on.
 */
export function LocalTaskSessionPanelHeader({
  session,
  options,
  panelTaskId,
  mode
}: {
  session: LocalTaskSessionLink
  /** Sessions of the task the preview opened from and every level below it. */
  options: readonly LocalTaskSessionLink[]
  panelTaskId: string | null
  mode: Exclude<LocalTaskSessionPanelMode, 'closed'>
}): React.JSX.Element {
  const progress = useLocalTaskSessionProgress(session)
  const inContact = useLocalTaskHostInContact(session.hostId)
  const hostLabel = useLocalTaskHostLabel(session.hostId)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const projects = useLocalTasksDomain((state) => state.projects)
  const links = useLocalTasksDomain((state) => state.links)
  const now = useNow(60_000)
  const task = tasks.find((candidate) => candidate.id === session.taskId)
  const titleOf = (taskId: string): string | null =>
    taskId === panelTaskId
      ? null
      : (tasks.find((candidate) => candidate.id === taskId)?.title ?? null)
  const status = task
    ? projects
        .find((project) => project.id === task.projectId)
        ?.statuses.find((candidate) => candidate.id === task.statusId)
    : undefined
  const workspaceLink = useMemo(
    () =>
      task
        ? findLocalTaskEffectiveWorkspace(
            links,
            task,
            new Map(tasks.map((candidate) => [candidate.id, candidate]))
          )
        : null,
    [links, task, tasks]
  )
  const located = useLocalTaskWorkspace(workspaceLink)
  const workspaceName =
    (located !== null && typeof located !== 'string' ? located.displayName : null) ??
    workspaceLink?.nameSnapshot ??
    workspaceLink?.branchSnapshot ??
    null
  const wide = mode === 'wide'
  const state = progress?.state ?? 'unknown'
  const stateText = [
    localTaskSessionStateLabel(state),
    state === 'working' ? formatLocalTaskSessionAge(state, progress?.stateSince ?? null, now) : null
  ]
    .filter(Boolean)
    .join(' · ')
  const offline = inContact
    ? null
    : translate('localTasks.links.hostOffline', '{{host}} is not connected', { host: hostLabel })
  const ownerTitle = titleOf(session.taskId)
  const name = (
    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
      {localTaskSessionAgentName(session)}
      {ownerTitle ? ` · ${ownerTitle}` : ''}
    </span>
  )
  const taskLine = task ? (
    <button
      type="button"
      onClick={() => openLocalTaskPage({ taskId: task.id })}
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-left hover:text-foreground',
        wide && 'ml-auto shrink'
      )}
    >
      {status ? <LocalTaskStatusIcon category={status.category} color={status.color} /> : null}
      <span className="min-w-0 truncate text-foreground">{task.title}</span>
      <span className="shrink-0 font-mono text-2xs">{task.ref}</span>
    </button>
  ) : null
  return (
    <div className="flex shrink-0 flex-col border-b border-border">
      <div className="flex h-10 items-center gap-1.5 pl-3 pr-2">
        <AgentIcon agent={isTuiAgent(session.agent) ? session.agent : null} size={16} />
        {options.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                className="min-w-0 max-w-[45%] justify-start"
                aria-label={translate('localTasks.sessionPanel.switchSession', 'Switch session')}
              >
                {name}
                <ChevronDown className="size-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-72">
              {options.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.id}
                  data-current={candidate.id === session.id ? 'true' : undefined}
                  onSelect={() => localTaskSessionPanelStore.getState().switchSession(candidate)}
                >
                  <SessionOption session={candidate} ownerTitle={titleOf(candidate.taskId)} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          name
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {localTaskSessionSurfaceLabel(session)} ·{' '}
          {wide
            ? translate('localTasks.sessionPanel.wideMode', 'Wide')
            : translate('localTasks.links.peek', 'Peek')}
        </span>
        <span className="flex-1" />
        <Button
          size="xs"
          variant="ghost"
          onClick={() => localTaskSessionPanelStore.getState().setMode(wide ? 'narrow' : 'wide')}
        >
          {wide ? <ChevronRight /> : <ChevronLeft />}
          {wide
            ? translate('localTasks.sessionPanel.narrow', 'Narrow')
            : translate('localTasks.sessionPanel.widen', 'Widen')}
        </Button>
        <LocalTaskActionTooltip reason={offline}>
          <Button
            size="xs"
            variant="ghost"
            disabled={offline !== null}
            onClick={() => {
              localTaskSessionPanelStore.getState().close()
              if (!revealLocalTaskSession(session)) {
                localTaskSessionPanelStore.getState().open(session, mode)
              }
            }}
          >
            <Maximize2 />
            {translate('localTasks.sessionPanel.fullscreen', 'Full screen')}
          </Button>
        </LocalTaskActionTooltip>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={translate('localTasks.sessionPanel.close', 'Close')}
          onClick={() => localTaskSessionPanelStore.getState().close()}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-1 px-3 pb-2 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-x-1.5">
          <LocalTaskSessionDot link={session} />
          <span className={cn('shrink-0', state === 'waiting' && 'font-medium text-foreground')}>
            {stateText}
          </span>
          {workspaceName ? (
            <>
              <Dot />
              <GitBranch className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate" title={workspaceName}>
                {workspaceName}
              </span>
            </>
          ) : null}
          <Dot />
          <LocalTaskHostIcon hostId={session.hostId} inContact={inContact} />
          <span className="min-w-0 truncate" title={offline ?? hostLabel}>
            {offline ?? hostLabel}
          </span>
          {wide ? taskLine : null}
        </div>
        {wide ? null : taskLine}
      </div>
    </div>
  )
}

/** Stop for a terminal session: confirmed first, done through the same stop the dispatcher uses. */
export function LocalTaskSessionStopBar({
  session
}: {
  session: LocalTaskSessionLink
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const stop = async (): Promise<void> => {
    setBusy(true)
    const outcome = await runStopItem({
      kind: 'stop',
      taskId: session.taskId,
      sessionLinkId: session.id,
      reason: 'Stopped from the session preview'
    }).catch(() => null)
    setBusy(false)
    setConfirming(false)
    if (outcome?.ok) {
      toast.success(translate('localTasks.sessionPanel.stopped', 'Session stopped'))
      localTaskSessionPanelStore.getState().close()
    } else {
      toast.error(
        translate('localTasks.sessionPanel.stopFailed', 'Couldn’t confirm the session stopped.')
      )
    }
  }
  if (confirming) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 text-muted-foreground">
          {translate(
            'localTasks.sessionPanel.stopConfirm',
            'Stop this session? The task and workspace stay.'
          )}
        </span>
        <Button variant="ghost" size="xs" disabled={busy} onClick={() => setConfirming(false)}>
          {translate('localTasks.common.cancel', 'Cancel')}
        </Button>
        <Button variant="destructive" size="xs" disabled={busy} onClick={() => void stop()}>
          {busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Square />}
          {translate('localTasks.sessionPanel.stopSession', 'Stop session')}
        </Button>
      </div>
    )
  }
  return (
    <div className="flex shrink-0 justify-end border-t border-border px-2 py-1.5">
      <Button variant="ghost" size="xs" onClick={() => setConfirming(true)}>
        <Square className="text-destructive" />
        <span className="text-destructive">
          {translate('localTasks.sessionPanel.stop', 'Stop')}
        </span>
      </Button>
    </div>
  )
}
