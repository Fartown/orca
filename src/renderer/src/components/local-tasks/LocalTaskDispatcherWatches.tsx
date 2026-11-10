import { CircleDashed, X } from 'lucide-react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { AgentIcon } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import {
  unwatchLocalTaskFromLedger,
  useLocalTaskDispatcherLedger
} from '@/local-tasks/local-task-dispatcher-ledger'
import { localTaskIdEndpoint } from '@/local-tasks/local-task-endpoints'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { useLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { formatLocalTaskSessionAge } from '@/local-tasks/local-task-session-age'
import { useLocalTaskSessionProgress } from '@/local-tasks/local-task-session-progress'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { LocalTaskWatch } from '../../../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LedgerSection } from './LocalTaskDispatcherLedger'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskSessionDot, localTaskSessionStateLabel } from './LocalTaskProgress'
import {
  useLocalTaskLeadSession,
  useLocalTaskRowSessions,
  useLocalTaskRowWorkspace
} from './LocalTaskRowFacts'
import { LocalTaskProgressLine } from './LocalTaskRowProgress'
import { localTaskSessionAgentName } from './LocalTaskSessionList'

/** The lead session in words: its agent, state and since when; out of contact it can't be confirmed. */
function WatchSession({
  session,
  offline
}: {
  session: LocalTaskSessionLink
  offline: boolean
}): React.JSX.Element {
  const progress = useLocalTaskSessionProgress(session)
  const now = useNow(60_000)
  const state = offline ? 'unverifiable' : (progress?.state ?? 'unknown')
  const words = [
    localTaskSessionAgentName(session),
    localTaskSessionStateLabel(state),
    offline ? null : formatLocalTaskSessionAge(state, progress?.stateSince ?? null, now)
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-1', offline && 'text-status-warning')}
    >
      {offline ? (
        <AgentStateDot state="unverifiable" size="sm" />
      ) : (
        <LocalTaskSessionDot link={session} />
      )}
      {isTuiAgent(session.agent) ? <AgentIcon agent={session.agent} size={12} /> : null}
      <span className="truncate">{words}</span>
    </span>
  )
}

function WatchRow({
  watch,
  task,
  index,
  now
}: {
  watch: LocalTaskWatch
  task: LocalTask
  index: LocalTaskIndex
  now: number
}): React.JSX.Element {
  const workspace = useLocalTaskRowWorkspace(task, index)
  const sessions = useLocalTaskRowSessions(task, index, workspace.link)
  const lead = useLocalTaskLeadSession(sessions)
  // Why the library too: a paired server out of contact holds tasks with no workspace as well.
  const libraryInContact = useLocalTaskHostInContact(localTaskIdEndpoint(task.id))
  const offline = !libraryInContact || (workspace.hostId !== null && !workspace.inContact)
  const status = index.statusesById.get(task.statusId)
  const origin =
    watch.addedBy === 'proposal'
      ? translate('localTasks.dispatcher.watches.byProposal', 'From its proposal · {{time}}', {
          time: formatLocalTaskTime(watch.addedAt, now)
        })
      : translate('localTasks.dispatcher.watches.byAsk', 'You asked it to watch · {{time}}', {
          time: formatLocalTaskTime(watch.addedAt, now)
        })
  return (
    <li className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {offline ? (
          <CircleDashed className="size-3.5 shrink-0 text-status-warning" aria-hidden />
        ) : status ? (
          <LocalTaskStatusIcon category={status.category} color={status.color} />
        ) : null}
        <button
          type="button"
          onClick={() => localTaskPageStore.getState().openDetail(task.id)}
          className="min-w-0 truncate text-left text-sm font-medium text-foreground hover:underline"
        >
          {task.title}
        </button>
        <span className="shrink-0 font-mono text-2xs text-muted-foreground">{task.ref}</span>
        <span
          className={cn(
            'shrink-0 text-2xs',
            offline ? 'text-status-warning' : 'text-muted-foreground'
          )}
        >
          {offline
            ? translate('localTasks.links.state.unverifiable', 'Can’t confirm')
            : status?.name}
        </span>
        <span className="min-w-0 flex-1" />
        <span className="flex shrink-0 text-muted-foreground">
          <Button
            variant="ghost"
            size="xs"
            aria-label={translate(
              'localTasks.dispatcher.watches.unwatch',
              'Stop following {{ref}}',
              {
                ref: task.ref
              }
            )}
            onClick={() => void unwatchLocalTaskFromLedger(task.id)}
          >
            <X />
            {translate('localTasks.dispatcher.watches.unwatchShort', 'Stop following')}
          </Button>
        </span>
      </div>
      <div className="min-w-0 pl-5.5">
        <LocalTaskProgressLine task={task} index={index} workspace={workspace} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 pl-5.5 text-2xs text-muted-foreground">
        {lead ? (
          <>
            <WatchSession session={lead} offline={offline} />
            <span aria-hidden>·</span>
          </>
        ) : null}
        <span className="shrink-0">{origin}</span>
      </div>
    </li>
  )
}

/** The tasks the dispatcher follows: state, last progress and session; out of contact, unconfirmed (REQ-031). */
export function DispatcherWatches({
  index,
  now
}: {
  index: LocalTaskIndex
  now: number
}): React.JSX.Element {
  const watches = useLocalTaskDispatcherLedger((state) => state.watches)
  const rows = watches.flatMap((watch) => {
    const task = index.tasksById.get(watch.taskId)
    return task ? [{ watch, task }] : []
  })
  return (
    <LedgerSection
      title={translate('localTasks.dispatcher.watches.title', 'Tasks it follows')}
      count={rows.length}
      empty={translate(
        'localTasks.dispatcher.watches.empty',
        'Nothing yet. Tasks its proposals start are followed, and so is any task you ask it to watch.'
      )}
    >
      <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
        {rows.map(({ watch, task }) => (
          <WatchRow key={task.id} watch={watch} task={task} index={index} now={now} />
        ))}
      </ul>
    </LedgerSection>
  )
}
