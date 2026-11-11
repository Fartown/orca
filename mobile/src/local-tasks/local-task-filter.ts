import type {
  LocalTaskPriority,
  LocalTaskStatusCategory
} from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'

/**
 * The task page's filter, applied on the phone to tasks already loaded; it sends no request.
 * Inside one dimension any match passes; across dimensions every one must pass.
 */
export type LocalTaskFilter = {
  query: string
  /** Only tasks with an item in "Needs you", as the desktop's "A session is waiting on me". */
  needsYou: boolean
  priorities: readonly LocalTaskPriority[]
  labels: readonly string[]
  categories: readonly LocalTaskStatusCategory[]
}

export const EMPTY_LOCAL_TASK_FILTER: LocalTaskFilter = {
  query: '',
  needsYou: false,
  priorities: [],
  labels: [],
  categories: []
}

/** How many choices in the filter sheet narrow the list; the search box shows itself. */
export function localTaskFilterCount(filter: LocalTaskFilter): number {
  return (
    Number(filter.needsYou) +
    filter.priorities.length +
    filter.labels.length +
    filter.categories.length
  )
}

export function isLocalTaskFilterActive(filter: LocalTaskFilter): boolean {
  return filter.query.trim().length > 0 || localTaskFilterCount(filter) > 0
}

/** The labels offered: those in scope, plus any still selected so it can be turned off. */
export function localTaskFilterLabels(
  tasks: readonly LocalTask[],
  selected: readonly string[]
): string[] {
  const labels = new Set(selected)
  for (const task of tasks) {
    for (const label of task.labels) {
      labels.add(label)
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b))
}

export function toggleLocalTaskFilterValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}
