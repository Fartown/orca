import { useMemo } from 'react'
import { GitBranch, Plus } from 'lucide-react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type {
  LocalTaskProposalPlace,
  LocalTaskProposalSessionFacts
} from '@/local-tasks/local-task-proposal-item-facts'
import { formatLocalTaskSessionAge } from '@/local-tasks/local-task-session-age'
import { selectLocalTaskWorkspace } from '@/local-tasks/local-task-workspace-resolution'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { LocalTaskHostIcon, useLocalTaskHostLabel } from './LocalTaskHostLabel'
import {
  LocalTaskReviewBadge,
  localTaskSessionDotState,
  localTaskSessionStateLabel,
  useLocalTaskReview
} from './LocalTaskProgress'

/** The workspace an item acts in and its host; a host out of contact says so instead. */
export function LocalTaskProposalPlaceChip({
  place,
  hostId,
  inContact
}: {
  place: LocalTaskProposalPlace
  hostId: string | null
  inContact: boolean
}): React.JSX.Element {
  const hostLabel = useLocalTaskHostLabel(hostId)
  const name =
    place.kind === 'new-workspace'
      ? translate('localTasks.dispatcher.place.newWorkspace', 'New workspace of {{repo}}', {
          repo: place.name
        })
      : place.repoName
        ? `${place.repoName}/${place.name}`
        : place.name
  const Icon = place.kind === 'new-workspace' ? Plus : GitBranch
  return (
    <span className="inline-flex h-5 min-w-0 max-w-full items-center gap-1 rounded-sm border border-border/60 px-1.5 text-2xs text-muted-foreground">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
      {hostId ? (
        <>
          <span aria-hidden>·</span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1',
              !inContact && 'text-status-warning'
            )}
          >
            <LocalTaskHostIcon hostId={hostId} inContact={inContact} className="size-3" />
            {inContact
              ? hostLabel
              : translate('localTasks.row.hostOffline', '{{host}} not connected', {
                  host: hostLabel
                })}
          </span>
        </>
      ) : null}
    </span>
  )
}

function agentName(agent: string | null): string {
  return isTuiAgent(agent) ? getAgentLabel(agent) : translate('localTasks.links.agent', 'Agent')
}

/** A session's state in words: its agent, what it is doing and since when. */
export function LocalTaskProposalSessionLine({
  session
}: {
  session: LocalTaskProposalSessionFacts
}): React.JSX.Element {
  const now = useNow(60_000)
  const words = [
    agentName(session.agent),
    localTaskSessionStateLabel(session.state),
    formatLocalTaskSessionAge(session.state, session.since, now)
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1',
        session.state === 'unverifiable' && 'text-status-warning'
      )}
    >
      <AgentStateDot state={localTaskSessionDotState(session.state)} size="sm" />
      {isTuiAgent(session.agent) ? <AgentIcon agent={session.agent} size={12} /> : null}
      <span className="truncate">{words}</span>
    </span>
  )
}

/** The agent a new session would open with. */
export function LocalTaskProposalNewSession({
  agent
}: {
  agent: string | null
}): React.JSX.Element {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {isTuiAgent(agent) ? <AgentIcon agent={agent} size={12} /> : null}
      {translate('localTasks.dispatcher.place.newSession', '{{agent}} · new session', {
        agent: agentName(agent)
      })}
    </span>
  )
}

/** The workspace's PR, as the sidebar card shows it; cached state is not shown as current. */
export function LocalTaskProposalReview({
  worktreeId,
  hostId,
  inContact
}: {
  worktreeId: string
  hostId: string
  inContact: boolean
}): React.JSX.Element | null {
  const place = useMemo(
    () => ({
      hostId,
      kind: 'git-worktree' as const,
      instanceId: null,
      worktreeId,
      folderWorkspaceId: null,
      repoId: null
    }),
    [hostId, worktreeId]
  )
  const located = useAppStore((state) => selectLocalTaskWorkspace(state, place))
  const review = useLocalTaskReview(typeof located === 'string' ? null : located)
  return review ? <LocalTaskReviewBadge review={review} inContact={inContact} /> : null
}
