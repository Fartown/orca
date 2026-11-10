import { useMemo } from 'react'
import { Bot, ListPlus, Play, Plus, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { getReviewLabel } from '@/components/sidebar/worktree-review-helpers'
import type { WorktreeCardPrDisplay } from '@/components/sidebar/worktree-card-pr-display'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import { localTaskAttentionKindLabel } from '@/local-tasks/local-task-attention-copy'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import type { LocalTaskBandRow } from '@/local-tasks/local-task-needs-you-band'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { localTaskPageStore, useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import {
  localTaskSidebarTreeStore,
  localTaskTreeSessions,
  useLocalTaskSidebarTreeExpanded
} from '@/local-tasks/local-task-sidebar-tree'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { localTaskVisibleProgress } from '@/local-tasks/local-task-visible-progress'
import { runLocalTaskSession } from '@/local-tasks/local-task-work-actions'
import { localTaskRowsWriteReason } from '@/local-tasks/local-task-write-reason'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskStatusIcon } from './LocalTaskIcons'
import { LocalTaskSessionDot } from './LocalTaskProgress'
import {
  useLocalTaskLeadSession,
  useLocalTaskRowSessions,
  useLocalTaskRowWorkspace,
  type LocalTaskRowWorkspace
} from './LocalTaskRowFacts'
import { LocalTaskSidebarSessionNode } from './LocalTaskSidebarSessionNode'
import { LocalTaskSidebarTreeRow } from './LocalTaskSidebarTreeRow'
import { LocalTaskSummaryCard } from './LocalTaskSummaryCard'

function reviewWords(review: WorktreeCardPrDisplay, inContact: boolean): string {
  const label = `${getReviewLabel(review)} #${review.number}`
  if (!inContact) {
    return translate('localTasks.links.review.unverifiable', '{{label}} state can’t be confirmed', {
      label
    })
  }
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

/** Why the task is in Needs you: who waits on what and since when, or that it awaits acceptance. */
function NeedNote({
  need,
  workspace
}: {
  need: LocalTaskBandRow
  workspace: LocalTaskRowWorkspace
}): React.JSX.Element | null {
  const now = useNow(60_000)
  if (need.group === 'review') {
    return (
      <span className="flex min-w-0 items-center gap-1 text-2xs">
        <span className="shrink-0 text-status-success">
          {translate('localTasks.acceptance.title', 'Ready for acceptance')}
        </span>
        {workspace.review ? (
          <span className="min-w-0 truncate text-muted-foreground">
            · {reviewWords(workspace.review, workspace.inContact)}
          </span>
        ) : null}
      </span>
    )
  }
  const [item] = need.items
  if (!item) {
    return null
  }
  const agent = isTuiAgent(item.agent) ? item.agent : null
  const reason = localTaskAttentionKindLabel(item.kind)
  return (
    <span className="flex min-w-0 items-center gap-1 text-2xs">
      {agent ? <AgentIcon agent={agent} size={11} /> : null}
      <span
        className={cn(
          'min-w-0 truncate',
          item.kind === 'unread-done' ? 'text-muted-foreground' : 'text-agent-question-text'
        )}
      >
        {agent
          ? translate('localTasks.sidebar.agentReason', '{{agent}}: {{reason}}', {
              agent: getAgentLabel(agent),
              reason
            })
          : reason}
      </span>
      <span className="shrink-0 text-muted-foreground">
        · {formatLocalTaskTime(item.since, now)}
      </span>
    </span>
  )
}

/** A task whose host is out of contact says so, and how old the last word it has is. */
function OfflineNote({
  task,
  index,
  workspace
}: {
  task: LocalTask
  index: LocalTaskIndex
  workspace: LocalTaskRowWorkspace
}): React.JSX.Element {
  const now = useNow(60_000)
  const progress = useLocalTasksDomain((state) => state.progress)
  const links = useLocalTasksDomain((state) => state.links)
  const latest = localTaskVisibleProgress(task, index, { progress, links })
  return (
    <span className="flex min-w-0 items-center gap-1 text-2xs">
      <span className="flex min-w-0 items-center gap-1 text-status-warning">
        <Unplug className="size-3 shrink-0" aria-hidden />
        <span className="truncate">
          {translate('localTasks.links.hostOffline', '{{host}} is not connected', {
            host: workspace.hostLabel ?? ''
          })}
        </span>
      </span>
      {latest ? (
        <span className="shrink-0 text-muted-foreground">
          ·{' '}
          {translate('localTasks.sidebar.lastProgress', 'last progress {{when}}', {
            when: formatLocalTaskTime(latest.progress.at, now)
          })}
        </span>
      ) : null}
    </span>
  )
}

/** "+" on a task: a subtask under it, or a session in the workspace it works in (Start without one). */
function TaskAddMenu({
  task,
  index,
  workspace
}: {
  task: LocalTask
  index: LocalTaskIndex
  workspace: LocalTaskRowWorkspace
}): React.JSX.Element {
  const label = translate('localTasks.sidebar.addUnder', 'Add under “{{title}}”', {
    title: task.title
  })
  const blocked = (): boolean => {
    const reason = localTaskRowsWriteReason([task.id])
    if (reason) {
      toast.error(reason)
    }
    return reason !== null
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" className="size-5" tabIndex={-1} aria-label={label}>
          <Plus className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right">
        <DropdownMenuItem
          onSelect={() => {
            if (blocked()) {
              return
            }
            openLocalTaskPage({ taskId: task.id })
            localTaskPageStore
              .getState()
              .openCreate({ projectId: task.projectId, parentId: task.id })
          }}
        >
          <ListPlus className="size-3.5" />
          {translate('localTasks.sidebar.newSubtask', 'New subtask')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            const project = index.projectsById.get(task.projectId)
            if (!project || blocked()) {
              return
            }
            openLocalTaskPage({ taskId: task.id })
            runLocalTaskSession(task, project, workspace.link)
          }}
        >
          {workspace.link ? <Bot className="size-3.5" /> : <Play className="size-3.5" />}
          {workspace.link
            ? translate('localTasks.links.newSession', 'New session')
            : translate('localTasks.links.start', 'Start work')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A task in the tree: its status, title and ref, what its sessions are doing, and in Needs you
 * the reason. Expanded, it shows its own sessions, then its subtasks.
 */
export function LocalTaskSidebarTaskNode({
  task,
  index,
  depth,
  path,
  need,
  searchIds
}: {
  task: LocalTask
  index: LocalTaskIndex
  depth: number
  /** The branch it hangs under; each place keeps its own expansion. */
  path: string
  need?: LocalTaskBandRow
  searchIds: ReadonlySet<string> | null
}): React.JSX.Element {
  const key = `${path}/${task.id}`
  const stored = useLocalTaskSidebarTreeExpanded(key)
  const selected = useLocalTaskPage((state) => state.detailTaskId === task.id)
  const allSessions = useLocalTasksDomain((state) => state.links.sessions)
  const sessions = useMemo(
    () => localTaskTreeSessions(allSessions, task.id),
    [allSessions, task.id]
  )
  const children = (index.childrenByParentId.get(task.id) ?? []).filter(
    (child) => searchIds === null || searchIds.has(child.id)
  )
  const workspace = useLocalTaskRowWorkspace(task, index)
  const family = useLocalTaskRowSessions(task, index, workspace.link)
  const lead = useLocalTaskLeadSession(family)
  const status = index.statusesById.get(task.statusId)
  const offline = workspace.hostId !== null && !workspace.inContact
  const expandable = sessions.length > 0 || children.length > 0
  // Why: a search opens the path to every hit; sessions stay folded until asked for.
  const expanded = expandable && (stored || (searchIds !== null && children.length > 0))
  const shownSessions = stored ? sessions : []
  const note = need ? (
    <NeedNote need={need} workspace={workspace} />
  ) : offline ? (
    <OfflineNote task={task} index={index} workspace={workspace} />
  ) : null
  return (
    <>
      <HoverCard openDelay={600} closeDelay={80}>
        <HoverCardTrigger asChild>
          <LocalTaskSidebarTreeRow
            node="task"
            depth={depth}
            expanded={expandable ? expanded : undefined}
            onToggle={() => localTaskSidebarTreeStore.getState().setExpanded(key, !expanded)}
            selected={selected}
            aria-label={`${task.title} ${task.ref}`}
            onActivate={() => openLocalTaskPage({ taskId: task.id })}
            trailing={<TaskAddMenu task={task} index={index} workspace={workspace} />}
          >
            <span className="flex h-5 min-w-0 items-center gap-1.5">
              {status ? (
                <LocalTaskStatusIcon category={status.category} color={status.color} />
              ) : null}
              <span className="min-w-0 truncate text-[13px] font-medium text-sidebar-foreground">
                {task.title}
              </span>
              <span className="shrink-0 text-3xs text-muted-foreground">{task.ref}</span>
              <span className="ml-auto flex shrink-0 items-center pl-1">
                {offline ? (
                  <Unplug className="size-3 text-status-warning" aria-hidden />
                ) : lead ? (
                  <LocalTaskSessionDot link={lead} />
                ) : null}
              </span>
            </span>
            {note ? <span className="flex h-4 min-w-0 items-center">{note}</span> : null}
          </LocalTaskSidebarTreeRow>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" sideOffset={8} className="w-80 p-3">
          <LocalTaskSummaryCard task={task} index={index} caption={task.ref} />
        </HoverCardContent>
      </HoverCard>
      {expanded ? (
        <>
          {shownSessions.map((session) => (
            <LocalTaskSidebarSessionNode key={session.id} session={session} depth={depth + 1} />
          ))}
          {children.map((child) => (
            <LocalTaskSidebarTaskNode
              key={child.id}
              task={child}
              index={index}
              depth={depth + 1}
              path={key}
              searchIds={searchIds}
            />
          ))}
        </>
      ) : null}
    </>
  )
}
