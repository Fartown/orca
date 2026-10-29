import { useMemo } from 'react'
import { Folder, GitBranch } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentStateDot, type AgentDotState } from '@/components/AgentStateDot'
import {
  ReviewIcon,
  getReviewChecksTone,
  getReviewLabel
} from '@/components/sidebar/worktree-review-helpers'
import type { WorktreeCardPrDisplay } from '@/components/sidebar/worktree-card-pr-display'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { getIndexedRepoMap } from '@/store/worktree-repo-index'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import {
  useLocalTaskSessionLinks,
  useLocalTaskWorkspaceLink
} from '@/local-tasks/local-task-link-selectors'
import { localTaskWorkspaceFamilyIds } from '../../../../shared/local-tasks/local-task-hierarchy'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { useLocalTaskSessionProgress } from '@/local-tasks/local-task-session-progress'
import {
  selectLocalTaskWorkspace,
  localTaskWorktreeHostId
} from '@/local-tasks/local-task-workspace-resolution'
import {
  localTaskReviewKeys,
  resolveLocalTaskReview
} from '@/local-tasks/local-task-workspace-review'
import type { Worktree } from '../../../../shared/worktree/types'
import type {
  LocalTaskSessionLink,
  LocalTaskSessionState,
  LocalTaskWorkspaceLink
} from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'

const SESSION_DOTS_MAX = 3

function dotState(state: LocalTaskSessionState): AgentDotState {
  switch (state) {
    case 'working':
    case 'waiting':
    case 'blocked':
    case 'done':
    case 'idle':
    case 'unverifiable':
      return state
    case 'missing':
      return 'unconfirmed'
    case 'exited':
    case 'unknown':
      return 'idle'
  }
}

export function localTaskSessionStateLabel(state: LocalTaskSessionState): string {
  switch (state) {
    case 'working':
      return translate('localTasks.links.state.working', 'Working')
    case 'waiting':
      return translate('localTasks.links.state.waiting', 'Waiting for you')
    case 'blocked':
      return translate('localTasks.links.state.blocked', 'Blocked')
    case 'done':
      return translate('localTasks.links.state.done', 'Finished a turn')
    case 'idle':
      return translate('localTasks.links.state.idle', 'Idle')
    case 'exited':
      return translate('localTasks.links.state.exited', 'Ended')
    case 'missing':
      return translate('localTasks.links.state.missing', 'Session not found')
    case 'unknown':
      return translate('localTasks.links.state.unknown', 'Status unknown')
    case 'unverifiable':
      return translate('localTasks.links.state.unverifiable', 'Can’t confirm')
  }
}

export function LocalTaskSessionDot({
  link,
  size = 'sm'
}: {
  link: LocalTaskSessionLink
  size?: 'sm' | 'md'
}): React.JSX.Element | null {
  const progress = useLocalTaskSessionProgress(link)
  if (!progress) {
    return null
  }
  return (
    <AgentStateDot
      state={dotState(progress.state)}
      size={size}
      title={localTaskSessionStateLabel(progress.state)}
    />
  )
}

/** The linked workspace's row (or why there is none), subscribed for this one link only. */
export function useLocalTaskWorkspace(
  link: LocalTaskWorkspaceLink | null
): Worktree | 'missing' | 'unverifiable' | null {
  return useAppStore((state) => (link ? selectLocalTaskWorkspace(state, link) : null))
}

export function useLocalTaskWorkspaceHostId(worktree: Worktree | null): string | null {
  return useAppStore((state) => (worktree ? localTaskWorktreeHostId(state, worktree) : null))
}

/** The same review the sidebar card shows, read from the two cache entries for this workspace. */
export function useLocalTaskReview(worktree: Worktree | null): WorktreeCardPrDisplay | null {
  const repo = useAppStore((state) =>
    worktree ? getIndexedRepoMap(state.repos).get(worktree.repoId) : undefined
  )
  const settings = useAppStore((state) => state.settings)
  const keys = useMemo(
    () => (worktree ? localTaskReviewKeys(worktree, repo, settings) : null),
    [repo, settings, worktree]
  )
  const hostedEntry = useAppStore((state) =>
    keys?.hostedReviewKey ? state.hostedReviewCache[keys.hostedReviewKey] : undefined
  )
  const prEntry = useAppStore((state) =>
    keys?.prCacheKey ? state.prCache?.[keys.prCacheKey] : undefined
  )
  return useMemo(
    () => (worktree ? resolveLocalTaskReview(worktree, hostedEntry, prEntry) : null),
    [hostedEntry, prEntry, worktree]
  )
}

export function localTaskReviewStateLabel(review: WorktreeCardPrDisplay): string {
  const label = getReviewLabel(review)
  switch (review.state) {
    case 'merged':
      return translate('localTasks.links.review.merged', '{{label}} merged', { label })
    case 'closed':
      return translate('localTasks.links.review.closed', '{{label}} closed', { label })
    case 'draft':
      return translate('localTasks.links.review.draft', '{{label}} draft', { label })
    case 'open':
    case undefined:
      return translate('localTasks.links.review.open', '{{label}} open', { label })
  }
}

export function localTaskChecksLabel(status: WorktreeCardPrDisplay['status']): string | null {
  switch (status) {
    case 'success':
      return translate('localTasks.links.checks.success', 'Checks passing')
    case 'failure':
      return translate('localTasks.links.checks.failure', 'Checks failing')
    case 'pending':
      return translate('localTasks.links.checks.pending', 'Checks running')
    case 'neutral':
    case undefined:
      return null
  }
}

/** PR state with its number; an out-of-contact host's cached state is not shown as current. */
export function LocalTaskReviewBadge({
  review,
  inContact
}: {
  review: WorktreeCardPrDisplay
  inContact: boolean
}): React.JSX.Element {
  const checks = localTaskChecksLabel(review.status)
  const label = inContact
    ? [localTaskReviewStateLabel(review), checks].filter(Boolean).join(' · ')
    : translate('localTasks.links.review.unverifiable', '{{label}} state can’t be confirmed', {
        label: getReviewLabel(review)
      })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-0.5 font-mono text-2xs text-muted-foreground',
            !inContact && 'opacity-60'
          )}
        >
          <ReviewIcon
            review={review}
            className={cn('size-3', inContact && getReviewChecksTone(review.status))}
            variant="generic"
          />
          #{review.number}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function WorkspaceMarker({
  link,
  located,
  inContact
}: {
  link: LocalTaskWorkspaceLink
  located: Worktree | 'missing' | 'unverifiable'
  inContact: boolean
}): React.JSX.Element {
  const Icon = link.kind === 'folder' ? Folder : GitBranch
  const name = typeof located === 'string' ? link.nameSnapshot : located.displayName
  const label =
    located === 'missing'
      ? translate('localTasks.links.workspaceGone', 'The workspace was deleted.')
      : located === 'unverifiable' || !inContact
        ? translate('localTasks.links.workspaceUnverifiableNamed', '{{name}} · can’t confirm', {
            name: name ?? link.hostLabelSnapshot ?? ''
          })
        : (name ?? '')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 items-center">
          <Icon
            className={cn(
              'size-3',
              located === 'missing'
                ? 'text-destructive'
                : typeof located === 'string' || !inContact
                  ? 'text-muted-foreground/50'
                  : 'text-muted-foreground'
            )}
            aria-label={label}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function WorkspaceProgress({
  link,
  sessions
}: {
  link: LocalTaskWorkspaceLink | null
  sessions: LocalTaskSessionLink[]
}): React.JSX.Element | null {
  const located = useLocalTaskWorkspace(link)
  const worktree = located !== null && typeof located !== 'string' ? located : null
  const hostId = useLocalTaskWorkspaceHostId(worktree)
  const inContact = useLocalTaskHostInContact(hostId ?? link?.hostId ?? null)
  const review = useLocalTaskReview(worktree)
  if (!link && sessions.length === 0) {
    return null
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {link && located ? (
        <WorkspaceMarker link={link} located={located} inContact={inContact} />
      ) : null}
      <SessionDots sessions={sessions} />
      {review ? <LocalTaskReviewBadge review={review} inContact={inContact} /> : null}
    </span>
  )
}

function SessionDots({ sessions }: { sessions: LocalTaskSessionLink[] }): React.JSX.Element | null {
  if (sessions.length === 0) {
    return null
  }
  return (
    <span className="flex items-center gap-0.5">
      {sessions.slice(-SESSION_DOTS_MAX).map((session) => (
        <LocalTaskSessionDot key={session.id} link={session} />
      ))}
      {sessions.length > SESSION_DOTS_MAX ? (
        <span className="text-2xs text-muted-foreground">
          +{sessions.length - SESSION_DOTS_MAX}
        </span>
      ) : null}
    </span>
  )
}

/**
 * Workspace marker, session dots and PR state for a list row or board card (REQ-012). A task with
 * its own workspace shows it and every session in it, its descendants' included; one that works
 * in an ancestor's shows only the sessions it opened, the ancestor's row carries the workspace.
 */
export function LocalTaskProgressBadges({
  task,
  index
}: {
  task: LocalTask
  index: LocalTaskIndex
}): React.JSX.Element | null {
  const link = useLocalTaskWorkspaceLink(task.id)
  const workspaces = useLocalTasksDomain((state) => state.links.workspaces)
  const familyIds = useMemo(() => {
    if (!link) {
      return [task.id]
    }
    const owners = new Set(workspaces.map((workspace) => workspace.taskId))
    return localTaskWorkspaceFamilyIds(task.id, index, (taskId) => owners.has(taskId))
  }, [index, link, task.id, workspaces])
  const sessions = useLocalTaskSessionLinks(familyIds)
  if (!link) {
    return <SessionDots sessions={sessions} />
  }
  return <WorkspaceProgress link={link} sessions={sessions} />
}
