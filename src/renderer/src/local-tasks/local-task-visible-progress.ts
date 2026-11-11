import type {
  LocalTask,
  LocalTaskLatestProgress
} from '../../../shared/local-tasks/local-task-types'
import { localTaskDescendantIds } from '../../../shared/local-tasks/local-task-tree'
import type { LocalTaskIndex } from './local-task-grouping'
import type { LocalTasksDomainState } from './local-tasks-domain-store'

export function localTaskVisibleProgress(
  task: LocalTask,
  index: LocalTaskIndex,
  domain: Pick<LocalTasksDomainState, 'progress' | 'links'>
): { task: LocalTask; progress: LocalTaskLatestProgress } | null {
  const ids = new Set([task.id, ...localTaskDescendantIds(task.id, index.childrenByParentId)])
  let latest: { task: LocalTask; progress: LocalTaskLatestProgress } | null = null
  for (const id of ids) {
    const owner = index.tasksById.get(id)
    if (owner?.latestProgress && (!latest || owner.latestProgress.at > latest.progress.at)) {
      latest = { task: owner, progress: owner.latestProgress }
    }
  }
  for (const session of domain.links.sessions) {
    if (!ids.has(session.taskId)) {
      continue
    }
    const row = domain.progress?.sessions.get(session.id)
    const owner = index.tasksById.get(session.taskId)
    if (
      !row?.lastMessage ||
      !owner ||
      row.stateSince === null ||
      (row.state !== 'done' && row.state !== 'unverifiable') ||
      (latest && row.stateSince <= latest.progress.at)
    ) {
      continue
    }
    latest = {
      task: owner,
      progress: {
        kind: 'turn-ended',
        body: row.lastMessage,
        at: row.stateSince,
        sessionLinkId: session.id
      }
    }
  }
  return latest
}
