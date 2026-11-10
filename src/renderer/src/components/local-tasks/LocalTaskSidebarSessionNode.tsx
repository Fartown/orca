import { Unplug } from 'lucide-react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { translate } from '@/i18n/i18n'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { selectLocalTaskHostLabel } from '@/local-tasks/local-task-host-label'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { localTaskAttentionKindLabel } from '@/local-tasks/local-task-attention-copy'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { useLocalTaskSessionPanel } from '@/local-tasks/local-task-session-panel-store'
import { useLocalTaskSessionProgress } from '@/local-tasks/local-task-session-progress'
import { openLocalTaskSession } from '@/local-tasks/local-task-session-reveal'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { normalizeExecutionHostId } from '../../../../shared/execution-host'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import { LocalTaskSessionDot, localTaskSessionStateLabel } from './LocalTaskProgress'
import { LocalTaskSidebarTreeRow } from './LocalTaskSidebarTreeRow'

/**
 * A session under its task: state, agent and what it is doing, then its last line. Opening it lands
 * on the task's overview with the session's preview beside it. A host out of contact greys it.
 */
export function LocalTaskSidebarSessionNode({
  session,
  depth
}: {
  session: LocalTaskSessionLink
  depth: number
}): React.JSX.Element {
  const progress = useLocalTaskSessionProgress(session)
  const inContact = useLocalTaskHostInContact(session.hostId)
  const item = useLocalTasksDomain(
    (state) =>
      state.progress?.items.find(
        (candidate) => candidate.taskSessionId === session.id && candidate.kind !== 'unread-done'
      ) ?? null
  )
  const hostLabel = useAppStore((state) => {
    const hostId = inContact ? null : normalizeExecutionHostId(session.hostId)
    return hostId ? selectLocalTaskHostLabel(state, hostId) : null
  })
  const selected = useLocalTaskSessionPanel(
    (state) => state.mode !== 'closed' && state.sessionLinkId === session.id
  )
  const agent = isTuiAgent(session.agent) ? session.agent : null
  const name = agent
    ? getAgentLabel(agent)
    : session.surface === 'chat'
      ? translate('localTasks.links.surfaceChat', 'Chat')
      : translate('localTasks.links.surfaceTerminal', 'Terminal')
  // Why not the cached state: out of contact nothing about the session can be vouched for.
  const state = inContact ? (progress?.state ?? 'unknown') : 'unverifiable'
  const label =
    inContact && item ? localTaskAttentionKindLabel(item.kind) : localTaskSessionStateLabel(state)
  const offline = hostLabel
    ? translate('localTasks.links.hostOffline', '{{host}} is not connected', { host: hostLabel })
    : null
  const lastLine = progress?.lastMessage ?? item?.lastMessage ?? null
  return (
    <LocalTaskSidebarTreeRow
      node="session"
      depth={depth}
      disabled={!inContact}
      selected={selected}
      title={offline ?? undefined}
      aria-label={`${name} · ${label}`}
      onActivate={() => {
        openLocalTaskPage({ taskId: session.taskId })
        openLocalTaskSession(session)
      }}
    >
      <span className="flex h-5 min-w-0 items-center gap-1.5">
        {inContact ? (
          <LocalTaskSessionDot link={session} />
        ) : (
          <AgentStateDot state="unverifiable" size="sm" />
        )}
        <AgentIcon agent={agent} size={12} />
        <span className="shrink-0 text-xs text-sidebar-foreground">{name}</span>
        <span
          className={cn(
            'min-w-0 truncate text-2xs',
            inContact && item ? 'text-agent-question-text' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
        {offline ? (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-3xs text-status-warning">
            <Unplug className="size-3" aria-hidden />
            {offline}
          </span>
        ) : null}
      </span>
      {lastLine ? (
        <span className="block truncate text-2xs leading-4 text-muted-foreground" title={lastLine}>
          {lastLine}
        </span>
      ) : null}
    </LocalTaskSidebarTreeRow>
  )
}
