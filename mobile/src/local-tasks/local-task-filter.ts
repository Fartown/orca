import {
  formatLocalTaskRef,
  type LocalTaskPriority,
  type LocalTaskStatusCategory
} from '../../../src/shared/local-tasks/local-task-model'
import type {
  LocalTask,
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'

/**
 * The task page's filter, applied on the phone to tasks already loaded; it sends no request.
 * Inside one dimension any match passes; across dimensions every one must pass.
 */
export type LocalTaskFilter = {
  query: string
  priorities: readonly LocalTaskPriority[]
  labels: readonly string[]
  categories: readonly LocalTaskStatusCategory[]
}

export const EMPTY_LOCAL_TASK_FILTER: LocalTaskFilter = {
  query: '',
  priorities: [],
  labels: [],
  categories: []
}

/** How many of the three pickers narrow the list; the search box shows itself. */
export function localTaskFilterCount(filter: LocalTaskFilter): number {
  return filter.priorities.length + filter.labels.length + filter.categories.length
}

export function isLocalTaskFilterActive(filter: LocalTaskFilter): boolean {
  return filter.query.trim().length > 0 || localTaskFilterCount(filter) > 0
}

export type LocalTaskFilterContext = {
  statuses: Map<string, LocalTaskStatusDef>
  projects: Map<string, LocalTaskProject>
}

function matchesQuery(task: LocalTask, query: string, context: LocalTaskFilterContext): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  if (task.title.toLowerCase().includes(needle) || task.ref.toLowerCase().includes(needle)) {
    return true
  }
  // Why aliases: after SHOP became MALL, searching SHOP-12 must still find MALL-12 (REQ-002).
  const aliases = context.projects.get(task.projectId)?.aliases ?? []
  return aliases.some((alias) =>
    formatLocalTaskRef(alias, task.number).toLowerCase().includes(needle)
  )
}

/** Whether the search is this task's ref exactly, in its current or an earlier prefix. */
export function localTaskExactRefMatch(
  task: LocalTask,
  query: string,
  context: LocalTaskFilterContext
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return false
  }
  const aliases = context.projects.get(task.projectId)?.aliases ?? []
  return [task.ref, ...aliases.map((alias) => formatLocalTaskRef(alias, task.number))].some(
    (ref) => ref.toLowerCase() === needle
  )
}

export function localTaskMatchesFilter(
  task: LocalTask,
  filter: LocalTaskFilter,
  context: LocalTaskFilterContext
): boolean {
  if (filter.priorities.length > 0 && !filter.priorities.includes(task.priority)) {
    return false
  }
  if (filter.labels.length > 0 && !task.labels.some((label) => filter.labels.includes(label))) {
    return false
  }
  if (filter.categories.length > 0) {
    const category = context.statuses.get(task.statusId)?.category
    if (!category || !filter.categories.includes(category)) {
      return false
    }
  }
  return matchesQuery(task, filter.query, context)
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
