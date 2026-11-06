import { translate } from '@/i18n/i18n'
import { localTaskNeedsReview } from '../../../../shared/local-tasks/local-task-review-items'
import { useLocalTasksDomain, isLocalTaskRowWritable } from '@/local-tasks/local-tasks-domain-store'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { openLocalTaskSession } from '@/local-tasks/local-task-session-reveal'
import type { LocalTaskListModel } from './use-local-task-list-model'
import { LocalTaskAcceptanceStrip } from './LocalTaskAcceptanceStrip'
import { Button } from '@/components/ui/button'

export function LocalTaskReviewQueue({
  model
}: {
  model: LocalTaskListModel
}): React.JSX.Element | null {
  const partitions = useLocalTasksDomain((state) => state.partitions)
  const home = useLocalTasksDomain((state) => state.home)
  const links = useLocalTasksDomain((state) => state.links)
  const tasks = model.scopeTasks.filter((task) =>
    localTaskNeedsReview(task, model.index.projectsById.get(task.projectId))
  )
  if (tasks.length === 0) {
    return null
  }
  return (
    <section className="flex shrink-0 flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">
        {translate('localTasks.acceptance.queue', 'Tasks waiting for acceptance')} · {tasks.length}
      </h3>
      {tasks.map((task) => {
        const session = links.sessions.find(
          (link) => link.id === task.latestProgress?.sessionLinkId
        )
        return (
          <div key={task.id} className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                onClick={() => openLocalTaskPage({ taskId: task.id })}
              >
                {task.title}
              </button>
              {session ? (
                <Button variant="ghost" size="xs" onClick={() => openLocalTaskSession(session)}>
                  {translate('localTasks.now.viewSession', 'View session')}
                </Button>
              ) : null}
            </div>
            <LocalTaskAcceptanceStrip
              task={task}
              project={model.index.projectsById.get(task.projectId)}
              writable={isLocalTaskRowWritable({ partitions, home }, task.id)}
            />
          </div>
        )
      })}
    </section>
  )
}
