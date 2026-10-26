import {
  LOCAL_TASK_STATUS_CATEGORIES,
  type LocalTaskStatusCategory,
  type LocalTaskStatusColor
} from '../../../src/shared/local-tasks/local-task-model'
import type {
  LocalTask,
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import {
  localTaskExactRefMatch,
  localTaskMatchesFilter,
  type LocalTaskFilter
} from './local-task-filter'

export type LocalTaskSegment = 'started' | 'all'

export type LocalTaskListRow = {
  task: LocalTask
  /** Subtasks drawn under this row; they are not counted in their own group. */
  subtasks: LocalTask[]
  subtaskDone: number
  subtaskTotal: number
}

export type LocalTaskListGroup = {
  /** A status id in one project, `category:<name>` across projects, or `unknown`. */
  key: string
  status: LocalTaskStatusDef | null
  category: LocalTaskStatusCategory | null
  rows: LocalTaskListRow[]
}

const CATEGORY_RANK = new Map(
  LOCAL_TASK_STATUS_CATEGORIES.map((category, index) => [category, index])
)
// Urgent first and "no priority" last, which is what 0..4 does not sort to on its own.
const PRIORITY_RANK = [4, 0, 1, 2, 3]

export function localTaskStatusLookup(
  projects: readonly LocalTaskProject[]
): Map<string, LocalTaskStatusDef> {
  return new Map(
    projects.flatMap((project) => project.statuses.map((status) => [status.id, status]))
  )
}

export function orderedLocalTaskStatuses(project: LocalTaskProject): LocalTaskStatusDef[] {
  return [...project.statuses].sort(
    (a, b) =>
      (CATEGORY_RANK.get(a.category) ?? 0) - (CATEGORY_RANK.get(b.category) ?? 0) ||
      a.position - b.position
  )
}

export function localTasksInScope(tasks: readonly LocalTask[], projectId: string | null) {
  return projectId === null ? [...tasks] : tasks.filter((task) => task.projectId === projectId)
}

/** Scope totals count subtasks too, which is the rule every count outside a list group follows. */
export function countLocalTasksInCategory(
  tasks: readonly LocalTask[],
  projects: readonly LocalTaskProject[],
  category: LocalTaskStatusCategory
): number {
  const lookup = localTaskStatusLookup(projects)
  return tasks.filter((task) => lookup.get(task.statusId)?.category === category).length
}

function compareRows(a: LocalTask, b: LocalTask): number {
  return (
    (PRIORITY_RANK[a.priority] ?? 0) - (PRIORITY_RANK[b.priority] ?? 0) || b.updatedAt - a.updatedAt
  )
}

type GroupInput = {
  tasks: readonly LocalTask[]
  projects: readonly LocalTaskProject[]
  projectId: string | null
  segment: LocalTaskSegment
  /** Narrows the rows only; scope totals elsewhere ignore it (REQ-006). */
  filter?: LocalTaskFilter
}

function emptyGroups(input: GroupInput): LocalTaskListGroup[] {
  const project =
    input.projectId === null ? null : input.projects.find((entry) => entry.id === input.projectId)
  const segmentCategories: readonly LocalTaskStatusCategory[] =
    input.segment === 'started' ? ['started'] : LOCAL_TASK_STATUS_CATEGORIES
  const picked = input.filter?.categories ?? []
  const categories =
    picked.length > 0
      ? segmentCategories.filter((category) => picked.includes(category))
      : segmentCategories
  if (project) {
    return orderedLocalTaskStatuses(project)
      .filter((status) => categories.includes(status.category))
      .map((status) => ({ key: status.id, status, category: status.category, rows: [] }))
  }
  return categories.map((category) => ({
    key: `category:${category}`,
    status: null,
    category,
    rows: []
  }))
}

/**
 * The groups a list or board shows. A list nests a subtask under its parent when the parent is
 * shown too, and then the group does not count it; a board shows every task as its own card.
 */
export function buildLocalTaskGroups(
  input: GroupInput & { nestSubtasks: boolean; keepEmpty: boolean }
): LocalTaskListGroup[] {
  const lookup = localTaskStatusLookup(input.projects)
  const scope = localTasksInScope(input.tasks, input.projectId)
  const filter = input.filter
  const context = { statuses: lookup, projects: new Map(input.projects.map((p) => [p.id, p])) }
  const visible = scope.filter(
    (task) =>
      (input.segment === 'all' || lookup.get(task.statusId)?.category === 'started') &&
      (!filter || localTaskMatchesFilter(task, filter, context))
  )
  const visibleIds = new Set(visible.map((task) => task.id))
  // Why: searching SHOP-1 must put SHOP-1 first, not wherever SHOP-12 and SHOP-10 sort.
  const exactId = filter
    ? (visible.find((task) => localTaskExactRefMatch(task, filter.query, context))?.id ?? null)
    : null
  const childrenOf = new Map<string, LocalTask[]>()
  for (const task of scope) {
    if (task.parentId !== null) {
      childrenOf.set(task.parentId, [...(childrenOf.get(task.parentId) ?? []), task])
    }
  }
  const groups = emptyGroups(input)
  const byKey = new Map(groups.map((group) => [group.key, group]))
  const unknown: LocalTaskListGroup = { key: 'unknown', status: null, category: null, rows: [] }
  for (const task of visible) {
    const nested = task.parentId !== null && visibleIds.has(task.parentId) && task.id !== exactId
    if (input.nestSubtasks && nested) {
      continue
    }
    const status = lookup.get(task.statusId)
    const key = !status
      ? 'unknown'
      : input.projectId === null
        ? `category:${status.category}`
        : status.id
    const children = childrenOf.get(task.id) ?? []
    const counted = children.filter((child) => lookup.get(child.statusId)?.category !== 'canceled')
    const row: LocalTaskListRow = {
      task,
      subtasks: input.nestSubtasks
        ? children
            .filter((child) => visibleIds.has(child.id) && child.id !== exactId)
            .sort((a, b) => a.number - b.number)
        : [],
      subtaskDone: counted.filter((child) => lookup.get(child.statusId)?.category === 'completed')
        .length,
      subtaskTotal: counted.length
    }
    const target = byKey.get(key) ?? unknown
    target.rows.push(row)
  }
  const exactFirst = (a: LocalTaskListRow, b: LocalTaskListRow) =>
    Number(b.task.id === exactId) - Number(a.task.id === exactId)
  for (const group of [...groups, unknown]) {
    group.rows.sort((a, b) => exactFirst(a, b) || compareRows(a.task, b.task))
  }
  const ordered = unknown.rows.length > 0 ? [...groups, unknown] : groups
  // A list lifts the exact match's group to the top; a board keeps its columns in status order.
  const holdsExact = (group: LocalTaskListGroup) =>
    group.rows.some((row) => row.task.id === exactId)
  const all = input.keepEmpty
    ? ordered
    : [...ordered.filter(holdsExact), ...ordered.filter((group) => !holdsExact(group))]
  return input.keepEmpty ? all : all.filter((group) => group.rows.length > 0)
}

export function localTaskSegmentCounts(
  tasks: readonly LocalTask[],
  projects: readonly LocalTaskProject[],
  projectId: string | null
): Record<LocalTaskSegment, number> {
  const scope = localTasksInScope(tasks, projectId)
  return { started: countLocalTasksInCategory(scope, projects, 'started'), all: scope.length }
}

export function localTaskStatusColorOf(status: LocalTaskStatusDef | null): LocalTaskStatusColor {
  return status?.color ?? 'gray'
}
