import { Folder, GitBranch, Unplug } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { localTaskPriorityLabel } from '@/local-tasks/local-task-vocabulary-copy'
import { localTaskVisibleProgress } from '@/local-tasks/local-task-visible-progress'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import { useLocalTaskRowWorkspace, type LocalTaskRowWorkspace } from './LocalTaskRowFacts'

function Field({
  label,
  top = false,
  children
}: {
  label: string
  top?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('flex min-h-5 min-w-0 gap-2 text-xs', top ? 'items-start' : 'items-center')}>
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-foreground">{children}</div>
    </div>
  )
}

function WorkspaceValue({ workspace }: { workspace: LocalTaskRowWorkspace }): React.JSX.Element {
  if (!workspace.link) {
    return (
      <span className="text-muted-foreground">
        {translate('localTasks.taskSummary.noWorkspace', 'No workspace yet')}
      </span>
    )
  }
  const Icon = workspace.link.kind === 'folder' ? Folder : GitBranch
  // Why the host's own words: loss of contact says nothing about the workspace, only that it can't be read.
  const host =
    workspace.hostId && !workspace.inContact
      ? translate('localTasks.links.hostOffline', '{{host}} is not connected', {
          host: workspace.hostLabel ?? ''
        })
      : workspace.hostLabel
  return (
    <>
      <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">{workspace.name}</span>
      {host ? (
        <span
          className={cn(
            'flex shrink-0 items-center gap-1',
            workspace.inContact ? 'text-muted-foreground' : 'text-status-warning'
          )}
        >
          {workspace.inContact ? null : <Unplug className="size-3" aria-hidden />}· {host}
        </span>
      ) : null}
    </>
  )
}

/**
 * A task at a glance: status and priority, the newest progress, and where it works. Shared by the
 * session chip's card and the task tree's hover card, so both say the same thing.
 */
export function LocalTaskSummaryCard({
  task,
  index,
  caption
}: {
  task: LocalTask
  index: LocalTaskIndex
  caption: string
}): React.JSX.Element {
  const now = useNow(60_000)
  const progress = useLocalTasksDomain((state) => state.progress)
  const links = useLocalTasksDomain((state) => state.links)
  const workspace = useLocalTaskRowWorkspace(task, index)
  const status = index.statusesById.get(task.statusId)
  const parent = task.parentId ? index.tasksById.get(task.parentId) : undefined
  const latest = localTaskVisibleProgress(task, index, { progress, links })
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-w-0 items-start gap-2">
        {status ? (
          <LocalTaskStatusIcon category={status.category} color={status.color} className="mt-0.5" />
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-2xs text-muted-foreground">{caption}</span>
          <span className="break-words text-sm font-semibold leading-snug text-foreground">
            {task.title}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Field label={translate('localTasks.taskSummary.status', 'Status')}>
          {status ? (
            <>
              <LocalTaskStatusIcon category={status.category} color={status.color} />
              <span className="truncate">{status.name}</span>
              <span className="text-muted-foreground">·</span>
            </>
          ) : null}
          <LocalTaskPriorityIcon priority={task.priority} />
          <span className="truncate">{localTaskPriorityLabel(task.priority)}</span>
        </Field>
        {latest ? (
          <Field label={translate('localTasks.now.latest', 'Latest progress')} top>
            <p className="line-clamp-4 min-w-0 break-words leading-relaxed">
              <span className="mr-1 rounded-sm bg-muted px-1 text-2xs text-muted-foreground">
                {latest.progress.kind === 'progress'
                  ? translate('localTasks.taskSummary.writeback', 'Writeback')
                  : translate('localTasks.taskSummary.lastLine', 'Last line')}
              </span>
              {latest.task.id === task.id ? null : (
                <span className="mr-1 text-muted-foreground">{latest.task.ref}</span>
              )}
              {latest.progress.body}
              <span className="text-muted-foreground">
                {' '}
                · {formatLocalTaskTime(latest.progress.at, now)}
              </span>
            </p>
          </Field>
        ) : null}
        <Field label={translate('localTasks.links.workspace', 'Workspace')}>
          <WorkspaceValue workspace={workspace} />
        </Field>
        {parent ? (
          <Field label={translate('localTasks.links.parentTask', 'Parent task')}>
            <span className="shrink-0 text-2xs text-muted-foreground">{parent.ref}</span>
            <span className="min-w-0 truncate">{parent.title}</span>
          </Field>
        ) : null}
      </div>
    </div>
  )
}
