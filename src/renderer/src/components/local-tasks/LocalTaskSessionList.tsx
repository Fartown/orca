import { CornerDownRight, Eye, MoreHorizontal, SquareArrowOutUpRight, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useNow } from '@/hooks/use-now'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { useLocalTaskSessionLinks } from '@/local-tasks/local-task-link-selectors'
import { useLocalTaskSessionProgress } from '@/local-tasks/local-task-session-progress'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { localTaskSessionPanelStore } from '@/local-tasks/local-task-session-panel-store'
import { formatLocalTaskSessionAge } from '@/local-tasks/local-task-session-age'
import { unlinkLocalTaskSession } from '@/local-tasks/local-task-workspace-linking'
import { openLocalTaskWorkspace } from '@/local-tasks/local-task-work-actions'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { localTaskDescendantIds } from '../../../../shared/local-tasks/local-task-tree'
import { LocalTaskSessionDot, localTaskSessionStateLabel } from './LocalTaskProgress'
import { useLocalTaskHostLabel } from './LocalTaskHostLabel'

/** The surface a session runs in, as the person knows it. */
export function localTaskSessionSurfaceLabel(
  session: Pick<LocalTaskSessionLink, 'surface'>
): string {
  return session.surface === 'chat'
    ? translate('localTasks.links.surfaceChat', 'Chat')
    : translate('localTasks.links.surfaceTerminal', 'Terminal')
}

export function localTaskSessionAgentName(session: Pick<LocalTaskSessionLink, 'agent'>): string {
  return isTuiAgent(session.agent)
    ? getAgentLabel(session.agent)
    : translate('localTasks.links.agent', 'Agent')
}

function SessionRow({
  session,
  owner,
  showOwner,
  workspace,
  writable
}: {
  session: LocalTaskSessionLink
  owner: LocalTask | undefined
  showOwner: boolean
  workspace: LocalTaskWorkspaceLink | null
  writable: boolean
}): React.JSX.Element {
  const progress = useLocalTaskSessionProgress(session)
  const inContact = useLocalTaskHostInContact(session.hostId)
  const hostLabel = useLocalTaskHostLabel(session.hostId)
  const now = useNow(60_000)
  const state = progress?.state ?? 'unknown'
  const agent = isTuiAgent(session.agent) ? session.agent : null
  const missing = state === 'missing'
  const status = [
    localTaskSessionStateLabel(state),
    formatLocalTaskSessionAge(state, progress?.stateSince ?? null, now)
  ]
    .filter(Boolean)
    .join(' · ')
  const last = missing
    ? translate('localTasks.links.sessionMissingHint', 'Session not found — open the workspace')
    : (progress?.lastMessage ?? '')
  // Why: the preview reads the session on its own host; out of contact there is nothing to show.
  const offline = inContact
    ? null
    : translate('localTasks.links.hostOffline', '{{host}} is not connected', { host: hostLabel })
  const open = (): void => {
    if (missing) {
      if (workspace) {
        openLocalTaskWorkspace(workspace)
      }
      return
    }
    localTaskSessionPanelStore.getState().open(session)
  }
  return (
    <div className="group/session flex min-h-10 items-center gap-2 border-t border-border/60 px-4 py-1.5 hover:bg-accent/60">
      {/* Why no tab stop: the Peek button beside it is the keyboard's way in. */}
      <button
        type="button"
        tabIndex={-1}
        disabled={offline !== null || (missing && !workspace)}
        onClick={open}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        <LocalTaskSessionDot link={session} />
        <AgentIcon agent={agent} size={14} />
        <span className="shrink-0 text-sm font-medium text-foreground">
          {localTaskSessionAgentName(session)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {localTaskSessionSurfaceLabel(session)}
        </span>
        {showOwner && owner ? (
          <span
            className="inline-flex min-w-0 max-w-40 shrink items-center gap-1 rounded-sm border border-border/60 px-1 text-2xs text-muted-foreground"
            title={`${owner.title} · ${owner.ref}`}
          >
            <CornerDownRight className="size-3 shrink-0" />
            <span className="truncate">{owner.title}</span>
          </span>
        ) : null}
        <span
          className={cn(
            'shrink-0 text-xs',
            state === 'waiting' || state === 'blocked'
              ? 'font-medium text-foreground'
              : 'text-muted-foreground'
          )}
        >
          {status}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-xs',
            missing ? 'text-muted-foreground' : 'text-foreground'
          )}
          title={last}
        >
          {last}
        </span>
      </button>
      {offline ? (
        <span className="shrink-0 truncate text-xs text-muted-foreground" title={offline}>
          {translate('localTasks.links.peekUnavailable', 'Peek unavailable · {{reason}}', {
            reason: offline
          })}
        </span>
      ) : missing ? (
        workspace ? (
          <Button variant="ghost" size="xs" onClick={open}>
            <SquareArrowOutUpRight className="size-3" />
            {translate('localTasks.links.openWorkspace', 'Open workspace')}
          </Button>
        ) : null
      ) : (
        <Button variant="ghost" size="xs" onClick={open}>
          <Eye className="size-3" />
          {translate('localTasks.links.peek', 'Peek')}
        </Button>
      )}
      {writable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 focus-visible:opacity-100 group-hover/session:opacity-100 data-[state=open]:opacity-100"
              aria-label={translate('localTasks.links.sessionActions', 'Session actions')}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void unlinkLocalTaskSession(session.id)}>
              <Unlink />
              {translate('localTasks.links.unlinkSession', 'Unlink session')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

/**
 * The 现在 card's sessions (REQ-010, REQ-012): one row per session of the task and every level
 * below it, with its agent, state, last words and a peek. New sessions start from the title row.
 */
export function LocalTaskSessionList({
  task,
  workspace,
  index,
  writable,
  showEmpty
}: {
  task: LocalTask
  /** The workspace the task works in: its own or the nearest ancestor's. */
  workspace: LocalTaskWorkspaceLink | null
  index: LocalTaskIndex
  writable: boolean
  showEmpty: boolean
}): React.JSX.Element | null {
  const sessions = useLocalTaskSessionLinks([
    task.id,
    ...localTaskDescendantIds(task.id, index.childrenByParentId)
  ])
  if (sessions.length === 0 && !showEmpty) {
    return null
  }
  return (
    <section className="flex flex-col">
      <h4 className="sr-only">{translate('localTasks.links.sessions', 'Sessions')}</h4>
      {sessions.length > 0 ? (
        sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            owner={index.tasksById.get(session.taskId)}
            showOwner={session.taskId !== task.id}
            workspace={workspace}
            writable={writable}
          />
        ))
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          {translate('localTasks.links.noSessions', 'No sessions yet.')}
        </p>
      )}
    </section>
  )
}
