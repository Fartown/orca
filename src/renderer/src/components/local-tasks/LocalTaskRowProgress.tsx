import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { Unplug } from 'lucide-react'
import { localTaskAttentionKindLabel } from '@/local-tasks/local-task-attention-copy'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { parseLocalTaskProgressSections } from '@/local-tasks/local-task-progress-sections'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { localTaskVisibleProgress } from '@/local-tasks/local-task-visible-progress'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type {
  LocalTaskAttentionItem,
  LocalTaskSessionLink
} from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTaskRowWorkspace } from './LocalTaskRowFacts'

/**
 * What happened last: an agent's writeback, or its last sentence when it wrote none. A task on a
 * host out of contact says the line is as last read.
 */
export function LocalTaskProgressLine({
  task,
  index,
  workspace
}: {
  task: LocalTask
  index: LocalTaskIndex
  workspace: LocalTaskRowWorkspace
}): React.JSX.Element | null {
  const progress = useLocalTasksDomain((state) => state.progress)
  const links = useLocalTasksDomain((state) => state.links)
  const now = useNow(60_000)
  const latest = localTaskVisibleProgress(task, index, { progress, links })
  if (!latest) {
    return null
  }
  const from = latest.task.id === task.id ? null : latest.task.ref
  const body = latest.progress.body.replace(/\s*\n+\s*/g, ' ')
  const when = formatLocalTaskTime(latest.progress.at, now)
  const offline = workspace.hostId !== null && !workspace.inContact
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {offline ? (
            <span className="flex shrink-0 items-center gap-1 rounded-sm bg-status-warning-background px-1 text-2xs leading-4 text-status-warning">
              <Unplug className="size-3" aria-hidden />
              {translate('localTasks.row.hostOffline', '{{host}} not connected', {
                host: workspace.hostLabel ?? ''
              })}
            </span>
          ) : (
            <span className="shrink-0 rounded-sm bg-muted px-1 text-2xs leading-4 text-muted-foreground">
              {latest.progress.kind === 'progress'
                ? translate('localTasks.row.writeback', 'Writeback')
                : translate('localTasks.row.lastSentence', 'Last line')}
            </span>
          )}
          <span className="min-w-0 truncate">
            {offline
              ? translate('localTasks.row.lastProgressAt', 'Last progress {{when}}: ', { when })
              : null}
            {from ? <span className="mr-1 text-2xs">{from}</span> : null}
            {body}
          </span>
          {offline ? null : <span className="shrink-0 text-2xs">· {when}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        variant="tab-preview"
        showArrow={false}
        className="w-auto max-w-lg"
      >
        <LocalTaskProgressCard
          body={latest.progress.body}
          writeback={latest.progress.kind === 'progress'}
          when={when}
          session={links.sessions.find((link) => link.id === latest.progress.sessionLinkId)}
        />
      </TooltipContent>
    </Tooltip>
  )
}

/** A waiting session's line in Needs you: who asks, what, and since when. */
export function LocalTaskAttentionLine({
  item
}: {
  item: LocalTaskAttentionItem
}): React.JSX.Element {
  const now = useNow(60_000)
  const agent = isTuiAgent(item.agent) ? item.agent : null
  const who = agent ? getAgentLabel(agent) : translate('localTasks.row.agent', 'Agent')
  const said =
    item.lastMessage?.replace(/\s*\n+\s*/g, ' ') ?? localTaskAttentionKindLabel(item.kind)
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {agent ? <AgentIcon agent={agent} size={12} /> : null}
      <span className="min-w-0 truncate">
        {item.kind === 'question' && item.lastMessage
          ? translate('localTasks.row.agentAsks', '{{agent}} asks: {{text}}', {
              agent: who,
              text: said
            })
          : translate('localTasks.row.agentSays', '{{agent}}: {{text}}', {
              agent: who,
              text: said
            })}
      </span>
      <span className="shrink-0 text-2xs">· {formatLocalTaskTime(item.since, now)}</span>
    </span>
  )
}

/** The hover card over a row's progress: who wrote it and when, then its labelled lines. */
function LocalTaskProgressCard({
  body,
  writeback,
  when,
  session
}: {
  body: string
  writeback: boolean
  when: string
  session: LocalTaskSessionLink | undefined
}): React.JSX.Element {
  const agent = session && isTuiAgent(session.agent) ? session.agent : null
  const sections = parseLocalTaskProgressSections(body)
  // Why -my-1: the tab-preview tooltip pads p-3; this card keeps its 8px top and bottom.
  return (
    <div className="-my-1 flex flex-col gap-1.5 text-xs">
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
        {agent ? <AgentIcon agent={agent} size={12} /> : null}
        {agent ? <span>{getAgentLabel(agent)}</span> : null}
        <span>
          {writeback
            ? translate('localTasks.row.writeback', 'Writeback')
            : translate('localTasks.row.lastSentence', 'Last line')}
        </span>
        <span>· {when}</span>
      </div>
      {sections ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {sections.map((section, at) => (
            <div key={`${section.label}-${at}`} className="contents">
              <dt className="text-muted-foreground">{section.label}</dt>
              <dd className="whitespace-pre-wrap text-foreground">{section.text}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="whitespace-pre-wrap text-foreground">{body}</p>
      )}
    </div>
  )
}
