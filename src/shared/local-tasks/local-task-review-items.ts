import type { LocalTask, LocalTaskProject } from './local-task-types'

/** A task in the project's review category awaits the user's acceptance decision. */
export function localTaskNeedsReview(
  task: LocalTask,
  project: LocalTaskProject | undefined
): boolean {
  return project?.statuses.find((status) => status.id === task.statusId)?.category === 'review'
}
