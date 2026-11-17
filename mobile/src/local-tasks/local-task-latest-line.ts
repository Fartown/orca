import { chooseLocalTaskFamilyProgress } from '../../../src/shared/local-tasks/local-task-latest-progress-choice'
import type {
  LocalTask,
  LocalTaskLatestProgress
} from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTaskSessionView } from './local-task-progress-projection'

type WrittenProgress = { taskId: string; progress: LocalTaskLatestProgress }

function writtenProgress(task: LocalTask): WrittenProgress | null {
  return task.latestProgress?.body ? { taskId: task.id, progress: task.latestProgress } : null
}

/** The task's own progress first, else its newest descendant's (REQ-012, REQ-022). */
export function localTaskLatestProgress(
  task: LocalTask,
  descendants: readonly LocalTask[] = []
): { taskId: string; body: string; at: number; sessionLinkId: string | null } | null {
  const chosen = chooseLocalTaskFamilyProgress(
    writtenProgress(task),
    descendants.flatMap((entry) => {
      const written = writtenProgress(entry)
      return written ? [written] : []
    })
  )
  return chosen ? { taskId: chosen.taskId, ...chosen.progress } : null
}

export function localTaskLatestLine(
  task: LocalTask,
  sessions: readonly Pick<LocalTaskSessionView, 'lastMessage'>[],
  descendants: readonly LocalTask[] = []
): string | null {
  return (
    localTaskLatestProgress(task, descendants)?.body ||
    sessions.find((session) => session.lastMessage)?.lastMessage ||
    null
  )
}
