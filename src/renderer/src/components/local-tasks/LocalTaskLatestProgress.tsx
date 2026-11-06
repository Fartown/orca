import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTaskVisibleProgress } from '@/local-tasks/local-task-visible-progress'
import { translate } from '@/i18n/i18n'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'

export function LocalTaskLatestProgress({
  task,
  index
}: {
  task: LocalTask
  index: LocalTaskIndex
}): React.JSX.Element | null {
  const progress = useLocalTasksDomain((state) => state.progress)
  const links = useLocalTasksDomain((state) => state.links)
  const latest = localTaskVisibleProgress(task, index, { progress, links })
  if (!latest) {
    return null
  }
  const text =
    latest.task.id === task.id
      ? latest.progress.body
      : `${latest.task.title}: ${latest.progress.body}`
  return (
    <span className="block truncate text-xs font-normal text-muted-foreground" title={text}>
      <span className="sr-only">{translate('localTasks.now.latest', 'Latest progress')}: </span>
      {text}
    </span>
  )
}
