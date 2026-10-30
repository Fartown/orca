import { MoreHorizontal, Plus, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { useNow } from '@/hooks/use-now'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { cn } from '@/lib/utils'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { useLocalTaskSessionLinks } from '@/local-tasks/local-task-link-selectors'
import { useLocalTaskSessionProgress } from '@/local-tasks/local-task-session-progress'
import { selectLocalTaskSessionTabLabel } from '@/local-tasks/local-task-session-tab-label'
import { useAppStore } from '@/store'
import { openLocalTaskSession } from '@/local-tasks/local-task-session-reveal'
import { unlinkLocalTaskSession } from '@/local-tasks/local-task-workspace-linking'
import {
  openLocalTaskWorkspace,
  runLocalTaskSession,
  useLocalTaskSessionState
} from '@/local-tasks/local-task-work-actions'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { localTaskDescendantIds } from '../../../../shared/local-tasks/local-task-tree'
import { LocalTaskSessionDot, localTaskSessionStateLabel } from './LocalTaskProgress'

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
  const tabLabel = useAppStore((state) => selectLocalTaskSessionTabLabel(state, session))
  const now = useNow(60_000)
  const state = progress?.state ?? 'unknown'
  const agent = isTuiAgent(session.agent) ? session.agent : null
  const exceptional =
    state === 'missing' || state === 'exited' || state === 'unverifiable' || state === 'unknown'
  const detail =
    state === 'missing'
      ? translate('localTasks.links.sessionMissingHint', 'Session not found — open the workspace')
      : exceptional
        ? localTaskSessionStateLabel(state)
        : (progress?.lastMessage ?? localTaskSessionStateLabel(state))
  const meta = [
    tabLabel ?? (agent ? getAgentLabel(agent) : null),
    session.surface === 'chat'
      ? translate('localTasks.links.surfaceChat', 'Chat')
      : translate('localTasks.links.surfaceTerminal', 'Terminal'),
    formatLocalTaskTime(session.openedAt, now)
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="group/session flex min-h-9 items-center gap-2 border-b border-border/40 px-3 py-1.5 last:border-b-0 hover:bg-accent/60">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => {
          // Why: a session that is gone still has a workspace to land in.
          if (!openLocalTaskSession(session) && workspace) {
            openLocalTaskWorkspace(workspace)
          }
        }}
      >
        <LocalTaskSessionDot link={session} />
        <AgentIcon agent={agent} size={14} />
        {showOwner && owner ? (
          <span
            className="max-w-32 shrink-0 truncate text-2xs text-muted-foreground"
            title={`${owner.title} · ${owner.ref}`}
          >
            {owner.title}
          </span>
        ) : null}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-xs',
            exceptional ? 'text-muted-foreground' : 'text-foreground'
          )}
          title={detail}
        >
          {detail}
        </span>
        {/* Why: two sessions in one state read the same; the tab's name, surface and age tell them
            apart, and the icon already names the agent. */}
        <span className="min-w-0 max-w-[45%] truncate text-2xs text-muted-foreground" title={meta}>
          {meta}
        </span>
      </button>
      {writable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
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
 * The detail's 会话 section (REQ-010, REQ-012): one row per session with its agent, subtask, state
 * and last words; every level below the task lists its sessions here too. New sessions open in the
 * workspace the task works in (`workspace`: its own or the nearest ancestor's).
 */
export function LocalTaskSessionList({
  task,
  project,
  workspace,
  index,
  writable
}: {
  task: LocalTask
  project: LocalTaskProject | undefined
  workspace: LocalTaskWorkspaceLink | null
  index: LocalTaskIndex
  writable: boolean
}): React.JSX.Element {
  const sessions = useLocalTaskSessionLinks([
    task.id,
    ...localTaskDescendantIds(task.id, index.childrenByParentId)
  ])
  const action = useLocalTaskSessionState(project, workspace)
  const label = translate('localTasks.links.openSession', 'Open session')
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {translate('localTasks.links.sessions', 'Sessions')}
        {action.mode !== 'hidden' && project ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-auto">
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={!writable || action.reason !== null}
                  onClick={() => runLocalTaskSession(task, project, workspace)}
                >
                  <Plus className="size-3" />
                  {label}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              <span className="flex items-center gap-2">
                {action.reason ?? label}
                {action.reason ? null : <ShortcutKeyCombo keys={['A']} />}
              </span>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </h3>
      {sessions.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border/60">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              owner={index.tasksById.get(session.taskId)}
              showOwner={session.taskId !== task.id}
              workspace={workspace}
              writable={writable}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate('localTasks.links.noSessions', 'No sessions yet.')}
        </p>
      )}
    </section>
  )
}
