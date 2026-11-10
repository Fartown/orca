import { useMemo } from 'react'
import { CornerDownRight, GitBranch, Folder, Laptop, Server, Unplug } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentStateDot } from '@/components/AgentStateDot'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import { selectLocalTaskHostLabel } from '@/local-tasks/local-task-host-label'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { localTaskAttentionKindLabel } from '@/local-tasks/local-task-attention-copy'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import {
  useLocalTaskEffectiveWorkspace,
  useLocalTaskSessionLinks
} from '@/local-tasks/local-task-link-selectors'
import { selectLocalTaskSessionProgress } from '@/local-tasks/local-task-session-progress'
import {
  useLocalTasksDomain,
  type LocalTasksDomainState
} from '@/local-tasks/local-tasks-domain-store'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import { localTaskWorkspaceFamilyIds } from '../../../../shared/local-tasks/local-task-hierarchy'
import type {
  LocalTaskSessionLink,
  LocalTaskSessionState,
  LocalTaskWorkspaceLink
} from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import {
  LocalTaskReviewBadge,
  localTaskSessionStateLabel,
  useLocalTaskReview,
  useLocalTaskWorkspace,
  useLocalTaskWorkspaceHostId
} from './LocalTaskProgress'

/** Where the task works: its own workspace, else the nearest ancestor's, and that host. */
export function useLocalTaskRowWorkspace(task: LocalTask, index: LocalTaskIndex) {
  const link = useLocalTaskEffectiveWorkspace(task, index.tasksById)
  const located = useLocalTaskWorkspace(link)
  const worktree = located !== null && typeof located !== 'string' ? located : null
  const resolvedHostId = useLocalTaskWorkspaceHostId(worktree)
  const hostId = resolvedHostId ?? link?.hostId ?? null
  const inContact = useLocalTaskHostInContact(hostId)
  const hostLabel = useAppStore((state) => {
    const id = hostId ? normalizeExecutionHostId(hostId) : null
    return id ? selectLocalTaskHostLabel(state, id) : null
  })
  const review = useLocalTaskReview(worktree)
  return {
    link,
    located,
    name: worktree?.displayName ?? link?.nameSnapshot ?? null,
    hostId,
    hostLabel: hostLabel ?? link?.hostLabelSnapshot ?? null,
    inContact,
    review
  }
}

export type LocalTaskRowWorkspace = ReturnType<typeof useLocalTaskRowWorkspace>

/** Sessions the row speaks for: a workspace owner's whole family, else the task's own (REQ-012). */
export function useLocalTaskRowSessions(
  task: LocalTask,
  index: LocalTaskIndex,
  ownWorkspace: LocalTaskWorkspaceLink | null
): LocalTaskSessionLink[] {
  const workspaces = useLocalTasksDomain((state) => state.links.workspaces)
  const ownsWorkspace = ownWorkspace?.taskId === task.id
  const familyIds = useMemo(() => {
    if (!ownsWorkspace) {
      return [task.id]
    }
    const owners = new Set(workspaces.map((workspace) => workspace.taskId))
    return localTaskWorkspaceFamilyIds(task.id, index, (taskId) => owners.has(taskId))
  }, [index, ownsWorkspace, task.id, workspaces])
  return useLocalTaskSessionLinks(familyIds)
}

const LEAD_ORDER: readonly LocalTaskSessionState[] = [
  'waiting',
  'blocked',
  'working',
  'done',
  'idle',
  'unverifiable'
]

/** The session a row names first: what waits on the person, then one at work, then the newest. */
function selectLeadSession(
  state: Pick<LocalTasksDomainState, 'progress'>,
  sessions: readonly LocalTaskSessionLink[]
): string | null {
  const items = state.progress?.items ?? []
  const waiting = sessions.findLast((link) =>
    items.some((item) => item.taskSessionId === link.id && item.kind !== 'unread-done')
  )
  if (waiting) {
    return waiting.id
  }
  for (const wanted of LEAD_ORDER) {
    const link = sessions.findLast(
      (candidate) => selectLocalTaskSessionProgress(state, candidate)?.state === wanted
    )
    if (link) {
      return link.id
    }
  }
  return sessions.at(-1)?.id ?? null
}

export function useLocalTaskLeadSession(
  sessions: readonly LocalTaskSessionLink[]
): LocalTaskSessionLink | null {
  const id = useLocalTasksDomain((state) => selectLeadSession(state, sessions))
  return sessions.find((link) => link.id === id) ?? null
}

function HostIcon({ hostId, className }: { hostId: string; className?: string }) {
  const Icon = hostId === 'local' ? Laptop : Server
  return <Icon className={cn('size-3 shrink-0', className)} aria-hidden />
}

export function LocalTaskWorkspaceCell({
  workspace
}: {
  workspace: LocalTaskRowWorkspace
}): React.JSX.Element {
  if (!workspace.link) {
    return (
      <span className="truncate text-2xs text-muted-foreground">
        {translate('localTasks.row.noWorkspace', 'No workspace yet')}
      </span>
    )
  }
  const Icon = workspace.link.kind === 'folder' ? Folder : GitBranch
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1 text-2xs text-muted-foreground',
        workspace.located === 'missing' && 'text-destructive'
      )}
      title={workspace.name ?? undefined}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        {workspace.located === 'missing'
          ? translate('localTasks.row.workspaceGone', 'Workspace deleted')
          : workspace.name}
      </span>
    </span>
  )
}

export function LocalTaskHostCell({
  workspace
}: {
  workspace: LocalTaskRowWorkspace
}): React.JSX.Element | null {
  if (!workspace.hostId || !workspace.hostLabel) {
    return null
  }
  if (!workspace.inContact) {
    return (
      <span className="flex min-w-0 items-center gap-1 text-2xs text-status-warning">
        <Unplug className="size-3 shrink-0" aria-hidden />
        <span className="truncate">
          {translate('localTasks.row.hostOffline', '{{host}} not connected', {
            host: workspace.hostLabel
          })}
        </span>
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
      <HostIcon hostId={workspace.hostId} />
      <span className="truncate">{workspace.hostLabel}</span>
    </span>
  )
}

function dotFor(state: LocalTaskSessionState) {
  switch (state) {
    case 'missing':
      return 'unconfirmed' as const
    case 'exited':
    case 'unknown':
      return 'idle' as const
    default:
      return state
  }
}

/** The lead session in words, with how many more the row holds. */
export function LocalTaskSessionCell({
  sessions,
  lead,
  inContact
}: {
  sessions: readonly LocalTaskSessionLink[]
  lead: LocalTaskSessionLink | null
  inContact: boolean
}): React.JSX.Element | null {
  const progress = useLocalTasksDomain((state) =>
    lead ? selectLocalTaskSessionProgress(state, lead) : null
  )
  const item = useLocalTasksDomain((state) =>
    lead
      ? (state.progress?.items.find(
          (candidate) => candidate.taskSessionId === lead.id && candidate.kind !== 'unread-done'
        ) ?? null)
      : null
  )
  if (!lead) {
    return null
  }
  const state: LocalTaskSessionState = inContact ? (progress?.state ?? 'unknown') : 'unverifiable'
  const label = item ? localTaskAttentionKindLabel(item.kind) : localTaskSessionStateLabel(state)
  const agent = isTuiAgent(lead.agent) ? lead.agent : null
  return (
    <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
      <AgentStateDot state={item ? 'waiting' : dotFor(state)} size="sm" />
      {agent ? <AgentIcon agent={agent} size={12} /> : null}
      <span className={cn('truncate', item && 'text-status-warning')}>{label}</span>
      {sessions.length > 1 ? <span className="shrink-0">+{sessions.length - 1}</span> : null}
    </span>
  )
}

/** A parent's line under its own: how many subtasks, how their sessions stand, and the newest word. */
export function LocalTaskSubtaskLine({
  task,
  index
}: {
  task: LocalTask
  index: LocalTaskIndex
}): React.JSX.Element | null {
  const children = useMemo(() => index.childrenByParentId.get(task.id) ?? [], [index, task.id])
  const childIds = useMemo(() => children.map((child) => child.id), [children])
  const sessions = useLocalTaskSessionLinks(childIds)
  const summary = useLocalTasksDomain((state) => {
    const states = sessions.map((link) => selectLocalTaskSessionProgress(state, link)?.state)
    if (states.length === 0) {
      return null
    }
    if (states.every((value) => value === 'done')) {
      return translate('localTasks.row.subtasksAllDone', 'all finished a turn')
    }
    const working = states.filter((value) => value === 'working').length
    return working > 0
      ? translate('localTasks.row.subtasksWorking', '{{count}} working', { count: working })
      : null
  })
  if (children.length === 0) {
    return null
  }
  const latest = children
    .filter((child) => child.latestProgress)
    .toSorted((a, b) => (b.latestProgress?.at ?? 0) - (a.latestProgress?.at ?? 0))[0]
  return (
    <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
      <CornerDownRight className="size-3 shrink-0" aria-hidden />
      <span className="shrink-0">
        {translate('localTasks.row.subtaskCount', 'Subtasks {{count}}', {
          count: children.length
        })}
      </span>
      {summary ? <span className="shrink-0">· {summary}</span> : null}
      {latest?.latestProgress ? (
        <span className="min-w-0 truncate">
          ·{' '}
          {translate('localTasks.row.subtaskLatest', 'Latest: {{ref}} {{body}}', {
            ref: latest.ref,
            body: latest.latestProgress.body.replace(/\s*\n+\s*/g, ' ')
          })}
        </span>
      ) : null}
    </span>
  )
}

export function LocalTaskRowReview({
  workspace
}: {
  workspace: LocalTaskRowWorkspace
}): React.JSX.Element | null {
  return workspace.review ? (
    <LocalTaskReviewBadge review={workspace.review} inContact={workspace.inContact} />
  ) : null
}

export function LocalTaskOfflineNote({
  workspace
}: {
  workspace: LocalTaskRowWorkspace
}): React.JSX.Element | null {
  if (!workspace.hostId || workspace.inContact) {
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {translate('localTasks.row.previewUnavailable', 'Preview unavailable')}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {translate('localTasks.row.hostOffline', '{{host}} not connected', {
          host: workspace.hostLabel ?? ''
        })}
      </TooltipContent>
    </Tooltip>
  )
}
