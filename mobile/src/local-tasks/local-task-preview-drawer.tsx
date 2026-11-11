import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import type { LocalTasksApi } from './local-tasks-api'
import { localTaskSessionSummary } from './local-task-card-facts'
import type { LocalTaskSite } from './local-task-endpoint'
import { LocalTaskSessionDrawer } from './local-task-session-drawer'
import { localTaskChatPreviewTarget } from './local-task-session-open'
import type { LocalTasksLibrary } from './use-local-tasks-library'

/**
 * A chat session's preview (Q2): the drawer with its head (agent, state, task, where it runs) and
 * a way into the full session. Closed while `taskSessionId` is null or names no routable chat.
 */
export function LocalTaskPreviewDrawer(props: {
  site: Pick<LocalTaskSite, 'hostId' | 'connState'>
  api: LocalTasksApi
  library: LocalTasksLibrary
  taskSessionId: string | null
  now: number
  hostName: (ownerHostId: string, snapshotLabel: string | null) => string
  onOpenFull: (taskSessionId: string) => void
  onClose: () => void
}) {
  const { library } = props
  const target = props.taskSessionId
    ? localTaskChatPreviewTarget(library, props.taskSessionId)
    : null
  const summary = target
    ? localTaskSessionSummary({
        taskSessionId: target.session.id,
        index: buildLocalTaskIndex(library.projects, library.tasks),
        links: library.work.links,
        snapshot: library.work.progress,
        inContact: props.site.connState === 'connected',
        hostName: props.hostName
      })
    : null
  return (
    <LocalTaskSessionDrawer
      hostId={props.site.hostId}
      worktreeId={target?.worktreeId ?? null}
      session={target?.session ?? null}
      api={props.api}
      library={library}
      summary={summary}
      now={props.now}
      onOpenFull={() => {
        if (target) {
          props.onClose()
          props.onOpenFull(target.session.id)
        }
      }}
      onClose={props.onClose}
    />
  )
}
