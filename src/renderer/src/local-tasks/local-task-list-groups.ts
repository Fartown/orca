import {
  LOCAL_TASK_STATUS_CATEGORIES,
  type LocalTaskPriority,
  type LocalTaskStatusCategory
} from '../../../shared/local-tasks/local-task-model'
import type {
  LocalTask,
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../shared/local-tasks/local-task-types'
import {
  compareLocalTasks,
  isExactLocalTaskRef,
  isLocalTaskVisible,
  localTaskCategory,
  type LocalTaskIndex,
  type LocalTaskVisibility
} from './local-task-grouping'
import type { LocalTaskGroupBy, LocalTaskSortBy } from './local-task-page-store'

/** Status groups run from active work down to closed work. */
const LIST_CATEGORY_ORDER: readonly LocalTaskStatusCategory[] = [
  'started',
  'review',
  'unstarted',
  'backlog',
  'completed',
  'canceled'
]
const PRIORITY_ORDER: readonly LocalTaskPriority[] = [1, 2, 3, 4, 0]

export type LocalTaskStatusHead =
  | { kind: 'status'; key: string; status: LocalTaskStatusDef }
  | { kind: 'category'; key: string; category: LocalTaskStatusCategory }
export type LocalTaskGroupHead =
  | LocalTaskStatusHead
  | { kind: 'priority'; key: string; priority: LocalTaskPriority }
  | { kind: 'project'; key: string; project: LocalTaskProject }
  | { kind: 'none'; key: string }
export type LocalTaskListEntry = { task: LocalTask; children: LocalTask[] }
export type LocalTaskListGroup = LocalTaskGroupHead & { entries: LocalTaskListEntry[] }
export type LocalTaskBoardColumn = LocalTaskStatusHead & { tasks: LocalTask[] }

export function statusHeadCategory(head: LocalTaskStatusHead): LocalTaskStatusCategory {
  return head.kind === 'status' ? head.status.category : head.category
}

/** Statuses of the scoped project, or categories across projects. */
function statusHeads(
  index: LocalTaskIndex,
  scopeProjectId: string | null,
  order: readonly LocalTaskStatusCategory[]
): LocalTaskStatusHead[] {
  const project = scopeProjectId ? index.projectsById.get(scopeProjectId) : undefined
  if (project) {
    return [...project.statuses]
      .sort(
        (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.position - b.position
      )
      .map((status) => ({ kind: 'status' as const, key: status.id, status }))
  }
  return order.map((category) => ({ kind: 'category' as const, key: category, category }))
}

function listHeads(
  index: LocalTaskIndex,
  scopeProjectId: string | null,
  groupBy: LocalTaskGroupBy
): LocalTaskGroupHead[] {
  switch (groupBy) {
    case 'status':
      return statusHeads(index, scopeProjectId, LIST_CATEGORY_ORDER)
    case 'priority':
      return PRIORITY_ORDER.map((priority) => ({
        kind: 'priority' as const,
        key: `priority:${priority}`,
        priority
      }))
    case 'project':
      return [...index.projectsById.values()]
        .filter((project) => !scopeProjectId || project.id === scopeProjectId)
        .map((project) => ({ kind: 'project' as const, key: project.id, project }))
    case 'none':
      return [{ kind: 'none', key: 'all' }]
  }
}

function headKeyFor(
  task: LocalTask,
  index: LocalTaskIndex,
  kind: LocalTaskGroupHead['kind']
): string | null {
  switch (kind) {
    case 'status':
      return task.statusId
    case 'category':
      return localTaskCategory(task, index)
    case 'priority':
      return `priority:${task.priority}`
    case 'project':
      return task.projectId
    case 'none':
      return 'all'
  }
}

/** A search for a ref puts that task first, ahead of the chosen sort (REQ-002). */
function exactRefFirst(
  compare: (a: LocalTask, b: LocalTask) => number,
  index: LocalTaskIndex,
  query: string
): (a: LocalTask, b: LocalTask) => number {
  const exact = (task: LocalTask): number =>
    isExactLocalTaskRef(task, index.projectsById.get(task.projectId), query) ? 1 : 0
  return (a, b) => exact(b) - exact(a) || compare(a, b)
}

/**
 * A subtask whose parent is shown rides under the parent, whatever the grouping, and is not
 * counted in the group (REQ-006). Subtasks keep their number order under the parent.
 */
export function groupLocalTasksForList(
  scopeTasks: readonly LocalTask[],
  index: LocalTaskIndex,
  scopeProjectId: string | null,
  visibility: LocalTaskVisibility,
  options: { groupBy: LocalTaskGroupBy; sortBy: LocalTaskSortBy }
): LocalTaskListGroup[] {
  const heads = listHeads(index, scopeProjectId, options.groupBy)
  const kind = heads[0]?.kind
  if (!kind) {
    return []
  }
  const visible = scopeTasks.filter((task) => isLocalTaskVisible(task, index, visibility))
  const visibleIds = new Set(visible.map((task) => task.id))
  const entriesByKey = new Map<string, LocalTaskListEntry[]>()
  for (const task of visible) {
    if (task.parentId && visibleIds.has(task.parentId)) {
      continue
    }
    const key = headKeyFor(task, index, kind)
    if (key === null) {
      continue
    }
    const children = (index.childrenByParentId.get(task.id) ?? []).filter((child) =>
      visibleIds.has(child.id)
    )
    const entries = entriesByKey.get(key) ?? []
    entries.push({ task, children })
    entriesByKey.set(key, entries)
  }
  const compare = exactRefFirst(compareLocalTasks(options.sortBy), index, visibility.query)
  const hasExactRef = (entry: LocalTaskListEntry): boolean =>
    [entry.task, ...entry.children].some((task) =>
      isExactLocalTaskRef(task, index.projectsById.get(task.projectId), visibility.query)
    )
  return (
    heads
      .map((head) => ({
        ...head,
        entries: (entriesByKey.get(head.key) ?? []).sort((a, b) => compare(a.task, b.task))
      }))
      .filter((group) => group.entries.length > 0)
      // Why: the group holding the searched ref moves up too, so the match is the first row.
      .sort((a, b) => Number(b.entries.some(hasExactRef)) - Number(a.entries.some(hasExactRef)))
  )
}

/** Display order of every row, for J/K. */
export function flattenLocalTaskGroups(groups: readonly LocalTaskListGroup[]): string[] {
  return groups.flatMap((group) =>
    group.entries.flatMap((entry) => [entry.task.id, ...entry.children.map((child) => child.id)])
  )
}

/** Columns are the project's statuses, or categories across projects; Canceled is opt-in. */
export function buildLocalTaskBoardColumns(
  scopeTasks: readonly LocalTask[],
  index: LocalTaskIndex,
  scopeProjectId: string | null,
  visibility: LocalTaskVisibility,
  options: { sortBy: LocalTaskSortBy; showCanceled: boolean }
): LocalTaskBoardColumn[] {
  const heads = statusHeads(index, scopeProjectId, LOCAL_TASK_STATUS_CATEGORIES).filter(
    (head) => options.showCanceled || statusHeadCategory(head) !== 'canceled'
  )
  const kind = heads[0]?.kind
  const tasksByKey = new Map<string, LocalTask[]>()
  for (const task of scopeTasks) {
    const key = kind ? headKeyFor(task, index, kind) : null
    if (key === null || !isLocalTaskVisible(task, index, visibility)) {
      continue
    }
    const tasks = tasksByKey.get(key) ?? []
    tasks.push(task)
    tasksByKey.set(key, tasks)
  }
  const compare = exactRefFirst(compareLocalTasks(options.sortBy), index, visibility.query)
  return heads.map((head) => ({ ...head, tasks: (tasksByKey.get(head.key) ?? []).sort(compare) }))
}
