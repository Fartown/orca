import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTaskSessionView } from './local-task-progress-projection'

export function localTaskLatestProgress(
  task: LocalTask,
  descendants: readonly LocalTask[] = []
): { taskId: string; body: string; at: number; sessionLinkId: string | null } | null {
  const newest = [task, ...descendants]
    .flatMap((entry) =>
      entry.latestProgress ? [{ taskId: entry.id, ...entry.latestProgress }] : []
    )
    .sort((a, b) => b.at - a.at)[0]
  return newest?.body ? newest : null
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
