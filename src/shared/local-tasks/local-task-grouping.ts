import {
  formatLocalTaskRef,
  parseLocalTaskRef,
  type LocalTaskPriority,
  type LocalTaskStatusCategory
} from './local-task-model'
import type { LocalTask, LocalTaskProject, LocalTaskStatusDef } from './local-task-types'
export type LocalTaskView = 'all' | 'started' | 'backlog' | 'completed' | 'canceled'
export type LocalTaskSortBy = 'updated' | 'created' | 'priority' | 'number'
export type LocalTaskGroupBy = 'status' | 'priority' | 'project' | 'none'
export type LocalTaskFilters = {
  priorities: readonly LocalTaskPriority[]
  labels: readonly string[]
  categories: readonly LocalTaskStatusCategory[]
}

export type LocalTaskIndex = {
  projectsById: ReadonlyMap<string, LocalTaskProject>
  statusesById: ReadonlyMap<string, LocalTaskStatusDef>
  tasksById: ReadonlyMap<string, LocalTask>
  childrenByParentId: ReadonlyMap<string, LocalTask[]>
}

export function buildLocalTaskIndex(
  projects: readonly LocalTaskProject[],
  tasks: readonly LocalTask[]
): LocalTaskIndex {
  const childrenByParentId = new Map<string, LocalTask[]>()
  for (const task of tasks) {
    if (task.parentId) {
      const siblings = childrenByParentId.get(task.parentId) ?? []
      siblings.push(task)
      childrenByParentId.set(task.parentId, siblings)
    }
  }
  for (const siblings of childrenByParentId.values()) {
    siblings.sort((a, b) => a.number - b.number)
  }
  return {
    projectsById: new Map(projects.map((project) => [project.id, project])),
    statusesById: new Map(projects.flatMap((project) => project.statuses).map((s) => [s.id, s])),
    tasksById: new Map(tasks.map((task) => [task.id, task])),
    childrenByParentId
  }
}

export function localTaskCategory(
  task: LocalTask,
  index: LocalTaskIndex
): LocalTaskStatusCategory | null {
  return index.statusesById.get(task.statusId)?.category ?? null
}

export function tasksInScope(
  tasks: readonly LocalTask[],
  scopeProjectId: string | null
): LocalTask[] {
  return scopeProjectId ? tasks.filter((task) => task.projectId === scopeProjectId) : [...tasks]
}

/** Rail counts: every task in the project scope, subtasks included, ignoring filters (REQ-006). */
export function countLocalTaskViews(
  scopeTasks: readonly LocalTask[],
  index: LocalTaskIndex
): Record<LocalTaskView, number> {
  const counts: Record<LocalTaskView, number> = {
    all: scopeTasks.length,
    started: 0,
    backlog: 0,
    completed: 0,
    canceled: 0
  }
  for (const task of scopeTasks) {
    const category = localTaskCategory(task, index)
    if (
      category === 'started' ||
      category === 'backlog' ||
      category === 'completed' ||
      category === 'canceled'
    ) {
      counts[category] += 1
    }
  }
  return counts
}

/**
 * Refs the task answers to: the current one, the same number under each earlier prefix, and the
 * refs it had in projects it moved out of.
 */
export function localTaskRefs(task: LocalTask, project: LocalTaskProject | undefined): string[] {
  return [
    task.ref,
    ...(project?.aliases ?? []).map((alias) => formatLocalTaskRef(alias, task.number)),
    ...(task.formerRefs ?? [])
  ]
}

/** `nat-01` → `nat-1`, so a zero-padded ref finds what the host resolves; null for other words. */
function canonicalRefWord(word: string): string | null {
  const parsed = parseLocalTaskRef(word)
  return parsed ? formatLocalTaskRef(parsed.prefix, parsed.taskNumber).toLowerCase() : null
}

export function matchesLocalTaskQuery(
  task: LocalTask,
  project: LocalTaskProject | undefined,
  query: string
): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return true
  }
  const haystack = [...localTaskRefs(task, project), task.title].join(' ').toLowerCase()
  return words.every((word) => {
    if (haystack.includes(word)) {
      return true
    }
    const canonical = canonicalRefWord(word)
    return canonical !== null && haystack.includes(canonical)
  })
}

/** True when the query is this task's ref, written with the current or an earlier prefix. */
export function isExactLocalTaskRef(
  task: LocalTask,
  project: LocalTaskProject | undefined,
  query: string
): boolean {
  const parsed = parseLocalTaskRef(query)
  return (
    parsed !== null &&
    localTaskRefs(task, project).includes(formatLocalTaskRef(parsed.prefix, parsed.taskNumber))
  )
}

export type LocalTaskVisibility = {
  view: LocalTaskView
  filters: LocalTaskFilters
  query: string
  /** When set, only these tasks (e.g. those with a session waiting on the user). */
  onlyTaskIds?: ReadonlySet<string>
}

/** View, filters and search; the rail counts ignore all three (REQ-006). */
export function isLocalTaskVisible(
  task: LocalTask,
  index: LocalTaskIndex,
  visibility: LocalTaskVisibility
): boolean {
  const category = localTaskCategory(task, index)
  const { view, filters, query, onlyTaskIds } = visibility
  return (
    (onlyTaskIds === undefined || onlyTaskIds.has(task.id)) &&
    (view === 'all' || category === view) &&
    (filters.categories.length === 0 ||
      (category !== null && filters.categories.includes(category))) &&
    (filters.priorities.length === 0 || filters.priorities.includes(task.priority)) &&
    (filters.labels.length === 0 || task.labels.some((label) => filters.labels.includes(label))) &&
    matchesLocalTaskQuery(task, index.projectsById.get(task.projectId), query)
  )
}

const textCollator = new Intl.Collator()

/** Urgent first, "no priority" last. */
export function localTaskPriorityRank(priority: LocalTaskPriority): number {
  return priority === 0 ? 5 : priority
}

/** Row order for a sort choice; ties fall back to the most recently updated. */
export function compareLocalTasks(sortBy: LocalTaskSortBy) {
  return (a: LocalTask, b: LocalTask): number => {
    const recent = b.updatedAt - a.updatedAt
    switch (sortBy) {
      case 'updated':
        return recent
      case 'created':
        return b.createdAt - a.createdAt || recent
      case 'priority':
        return localTaskPriorityRank(a.priority) - localTaskPriorityRank(b.priority) || recent
      case 'number':
        return a.number - b.number || textCollator.compare(a.ref, b.ref)
    }
  }
}

/** Completed out of the subtasks still meant to be done; canceled subtasks drop out. */
export function localTaskSubtaskProgress(
  task: LocalTask,
  index: LocalTaskIndex
): { done: number; total: number } | null {
  const children = index.childrenByParentId.get(task.id)
  if (!children || children.length === 0) {
    return null
  }
  let done = 0
  let total = 0
  for (const child of children) {
    const category = localTaskCategory(child, index)
    if (category === 'canceled') {
      continue
    }
    total += 1
    if (category === 'completed') {
      done += 1
    }
  }
  return { done, total }
}

export function firstStatusInCategory(
  project: LocalTaskProject | undefined,
  category: LocalTaskStatusCategory
): LocalTaskStatusDef | null {
  return project?.statuses.find((status) => status.category === category) ?? null
}

export function collectLocalTaskLabels(tasks: readonly LocalTask[]): string[] {
  return [...new Set(tasks.flatMap((task) => task.labels))].sort(textCollator.compare)
}
