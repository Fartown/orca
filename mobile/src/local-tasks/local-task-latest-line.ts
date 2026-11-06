import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTaskSessionView } from './local-task-progress-projection'

export function localTaskLatestLine(
  task: LocalTask,
  sessions: readonly Pick<LocalTaskSessionView, 'lastMessage'>[],
  descendants: readonly LocalTask[] = []
): string | null {
  return (
    [task, ...descendants]
      .flatMap((entry) => (entry.latestProgress ? [entry.latestProgress] : []))
      .sort((a, b) => b.at - a.at)[0]?.body ||
    sessions.find((session) => session.lastMessage)?.lastMessage ||
    null
  )
}
