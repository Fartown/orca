import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { formatLocalTaskTime } from '@/local-tasks/local-task-time'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTaskVisibleProgress } from '@/local-tasks/local-task-visible-progress'
import { openLocalTaskSession } from '@/local-tasks/local-task-session-reveal'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTaskWorkspaceLink } from '../../../../shared/local-tasks/local-task-link-types'
import { LocalTaskSessionList } from './LocalTaskSessionList'
import { LocalTaskAcceptanceStrip } from './LocalTaskAcceptanceStrip'

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
  const latest = localTaskVisibleProgress(task, index, { progress, links })
  const session = latest?.progress.sessionLinkId
    ? links.sessions.find((candidate) => candidate.id === latest.progress.sessionLinkId)
    : null
  const now = useNow(60_000)
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h3 className="text-xs font-medium text-muted-foreground">
        {translate('localTasks.now.title', 'Now')}
      </h3>
      <LocalTaskAcceptanceStrip task={task} project={project} writable={writable} />
      {latest ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{translate('localTasks.now.latest', 'Latest progress')}</span>
            {latest.task.id !== task.id ? <span>{latest.task.title}</span> : null}
            <span>{formatLocalTaskTime(latest.progress.at, now)}</span>
            {session ? (
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => openLocalTaskSession(session)}
              >
                {translate('localTasks.now.viewSession', 'View session')}
              </button>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">
            {latest.progress.body}
          </p>
          {latest.progress.needsYou ? (
            <p className="whitespace-pre-wrap break-words text-sm font-medium text-foreground">
              {translate('localTasks.now.needsYou', 'Needs you')}: {latest.progress.needsYou}
            </p>
          ) : null}
        </div>
      ) : null}
      <LocalTaskSessionList
        task={task}
        project={project}
        workspace={workspace}
        index={index}
        writable={writable}
      />
    </section>
  )
}
