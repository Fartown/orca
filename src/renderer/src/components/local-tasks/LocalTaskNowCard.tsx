import { useMemo, useState } from 'react'
import { Activity, CircleDot, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTaskVisibleProgress } from '@/local-tasks/local-task-visible-progress'
import { parseLocalTaskProgressSections } from '@/local-tasks/local-task-progress-sections'
import {
  findLocalTaskWriteback,
  localTaskWritebacks,
  type LocalTaskWriteback
} from '@/local-tasks/local-task-writebacks'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type {
  LocalTaskLatestProgress,
  LocalTask,
  LocalTaskProject
} from '../../../../shared/local-tasks/local-task-types'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../../shared/local-tasks/local-task-link-types'
import { LocalTaskSessionList } from './LocalTaskSessionList'
import { LocalTaskAcceptanceStrip } from './LocalTaskAcceptanceStrip'
import { LocalTaskFactRow, LocalTaskProgressBody } from './LocalTaskFactRows'

function agentOf(
  sessions: readonly LocalTaskSessionLink[],
  sessionLinkId: string | null
): TuiAgent | null {
  const agent = sessionLinkId
    ? sessions.find((candidate) => candidate.id === sessionLinkId)?.agent
    : null
  return isTuiAgent(agent) ? agent : null
}

function AllProgress({
  writebacks,
  sessions,
  now
}: {
  writebacks: readonly LocalTaskWriteback[]
  sessions: readonly LocalTaskSessionLink[]
  now: number
}): React.JSX.Element {
  return (
    <ol className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60">
      {writebacks.toReversed().map((writeback) => {
        const agent = agentOf(sessions, writeback.sessionLinkId)
        return (
          <li
            key={writeback.event.id}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-3 px-3 py-2 text-xs"
          >
            <span className="flex items-center gap-1 text-muted-foreground">
              {agent ? <AgentIcon agent={agent} size={12} /> : null}
              {translate('localTasks.now.writebackNumber', 'Write-back #{{number}}', {
                number: writeback.number
              })}
            </span>
            <span className="whitespace-pre-wrap break-words text-foreground">
              {writeback.event.body}
            </span>
            <span className="text-2xs text-muted-foreground">
              {formatLocalTaskTime(writeback.event.createdAt, now)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The latest progress, said once: an agent's writeback (numbered when this task's activity is
 * loaded) or, newer than any writeback, a session's last message. History unfolds below it.
 */
function LatestProgress({
  task,
  latest,
  writebacks,
  sessions,
  hideNeedsYou
}: {
  task: LocalTask
  latest: { task: LocalTask; progress: LocalTaskLatestProgress }
  writebacks: readonly LocalTaskWriteback[]
  sessions: readonly LocalTaskSessionLink[]
  /** The acceptance block already says what is asked of the person. */
  hideNeedsYou: boolean
}): React.JSX.Element {
  const now = useNow(60_000)
  const [showAll, setShowAll] = useState(false)
  const { progress } = latest
  const own = latest.task.id === task.id
  const writeback =
    progress.kind === 'progress' && own ? findLocalTaskWriteback(writebacks, progress) : null
  const agent = agentOf(sessions, progress.sessionLinkId ?? writeback?.sessionLinkId ?? null)
  const what =
    progress.kind === 'turn-ended'
      ? translate('localTasks.now.lastMessage', 'Last message')
      : writeback
        ? translate('localTasks.now.writebackNumber', 'Write-back #{{number}}', {
            number: writeback.number
          })
        : translate('localTasks.now.writeback', 'Write-back')
  const source = [
    [agent ? getAgentLabel(agent) : null, what].filter(Boolean).join(' '),
    own ? null : latest.task.title,
    formatLocalTaskTime(progress.at, now)
  ]
    .filter(Boolean)
    .join(' · ')
  const needsYou = hideNeedsYou ? null : progress.needsYou
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Activity className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">
          {translate('localTasks.now.latest', 'Latest progress')}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          {agent ? <AgentIcon agent={agent} size={12} /> : null}
          <span className="truncate" title={source}>
            {source}
          </span>
        </span>
        {writebacks.length > 1 ? (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            aria-expanded={showAll}
            onClick={() => setShowAll(!showAll)}
          >
            <History className="size-3" />
            {translate('localTasks.now.allProgress', 'All progress')}
            <span className="tabular-nums text-muted-foreground">{writebacks.length}</span>
          </Button>
        ) : null}
      </div>
      <LocalTaskProgressBody
        key={`${latest.task.id}:${progress.at}`}
        body={progress.body}
        sections={parseLocalTaskProgressSections(progress.body)}
        after={
          needsYou ? (
            <LocalTaskFactRow label={translate('localTasks.now.needsYou', 'Needs you')}>
              <span className="whitespace-pre-wrap font-medium">{needsYou}</span>
            </LocalTaskFactRow>
          ) : null
        }
      />
      {showAll ? <AllProgress writebacks={writebacks} sessions={sessions} now={now} /> : null}
    </div>
  )
}

/** 现在: the acceptance block while it waits for review, the latest progress, then each session. */
export function LocalTaskNowCard({
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
  const progress = useLocalTasksDomain((state) => state.progress)
  const links = useLocalTasksDomain((state) => state.links)
  // Why no watch here: the activity section below already keeps this task's events loaded.
  const events = useLocalTasksDomain((state) => state.eventsByTaskId[task.id])
  const writebacks = useMemo(() => localTaskWritebacks(events), [events])
  const latest = localTaskVisibleProgress(task, index, { progress, links })
  const review =
    project?.statuses.find((status) => status.id === task.statusId)?.category === 'review'
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <h3 className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
        <CircleDot className="size-3.5" />
        {translate('localTasks.now.title', 'Now')}
      </h3>
      {review ? (
        <div className="px-3 pt-3">
          <LocalTaskAcceptanceStrip
            task={task}
            project={project}
            writable={writable}
            variant="detail"
            workspace={workspace}
            writebacks={writebacks}
          />
        </div>
      ) : null}
      {latest ? (
        <LatestProgress
          task={task}
          latest={latest}
          writebacks={writebacks}
          sessions={links.sessions}
          hideNeedsYou={review}
        />
      ) : null}
      <LocalTaskSessionList
        task={task}
        workspace={workspace}
        index={index}
        writable={writable}
        showEmpty={!latest && !review}
      />
    </section>
  )
}
