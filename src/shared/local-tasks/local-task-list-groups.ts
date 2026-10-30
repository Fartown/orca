import {
  LOCAL_TASK_STATUS_CATEGORIES,
  type LocalTaskPriority,
  type LocalTaskStatusCategory
} from './local-task-model'
import type { LocalTask, LocalTaskProject, LocalTaskStatusDef } from './local-task-types'
import {
  compareLocalTasks,
  isExactLocalTaskRef,
  isLocalTaskVisible,
  localTaskCategory,
  type LocalTaskIndex,
  type LocalTaskVisibility,
  type LocalTaskGroupBy,
  type LocalTaskSortBy
} from './local-task-grouping'

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
/** One shown descendant under a list entry, any depth (D-008). */
export type LocalTaskTreeLine = {
  task: LocalTask
  /** 1 for a direct subtask of the entry's task, 2 below that, and so on. */
  depth: number
  /** Shown children right under this line; it folds only when there are some. */
  childCount: number
}
/** `children` are the shown direct subtasks; `lines` every shown descendant in tree order. */
export type LocalTaskListEntry = {
  task: LocalTask
  children: LocalTask[]
  lines: LocalTaskTreeLine[]
}
/** `count` is every shown task whose own value is this group's, nested under another group or not. */
export type LocalTaskListGroup = LocalTaskGroupHead & {
  entries: LocalTaskListEntry[]
  count: number
}
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

/** Shown descendants depth first, each line right after its parent; a cycle is cut, not looped. */
function treeLines(
  children: readonly LocalTask[],
  index: LocalTaskIndex,
  shown: (task: LocalTask) => boolean,
  depth: number,
  seen: Set<string>
): LocalTaskTreeLine[] {
  const lines: LocalTaskTreeLine[] = []
  for (const child of children) {
    if (seen.has(child.id)) {
      continue
    }
    seen.add(child.id)
    const grandchildren = (index.childrenByParentId.get(child.id) ?? []).filter(shown)
    lines.push({ task: child, depth, childCount: grandchildren.length })
    lines.push(...treeLines(grandchildren, index, shown, depth + 1, seen))
  }
  return lines
}

/** The lines still shown once folded tasks hide everything below them. */
export function unfoldedLocalTaskLines(
  lines: readonly LocalTaskTreeLine[],
  folded: ReadonlySet<string>
): LocalTaskTreeLine[] {
  const hidden = new Set<string>()
  return lines.filter((line) => {
    const parentId = line.task.parentId
    if (parentId !== null && (hidden.has(parentId) || folded.has(parentId))) {
      hidden.add(line.task.id)
      return false
    }
    return true
  })
}

/**
 * A subtask whose parent is shown rides under the parent, whatever the grouping, yet counts in the
 * group of its own value, so a heading agrees with the nav and the board (REQ-006). Subtasks keep
 * their number order under the parent, at any depth (D-008); `children` stays the first level so
 * every client nests alike.
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
  // Why: a searched ref stays a row of its own instead of hiding under its parent.
  const nests = (task: LocalTask): boolean =>
    visibleIds.has(task.id) &&
    !isExactLocalTaskRef(task, index.projectsById.get(task.projectId), visibility.query)
  const entriesByKey = new Map<string, LocalTaskListEntry[]>()
  const countByKey = new Map<string, number>()
  for (const task of visible) {
    const key = headKeyFor(task, index, kind)
    if (key === null) {
      continue
    }
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1)
    if (task.parentId && visibleIds.has(task.parentId) && nests(task)) {
      continue
    }
    const children = (index.childrenByParentId.get(task.id) ?? []).filter(nests)
    const entries = entriesByKey.get(key) ?? []
    entries.push({
      task,
      children,
      lines: treeLines(children, index, nests, 1, new Set([task.id]))
    })
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
        entries: (entriesByKey.get(head.key) ?? []).sort((a, b) => compare(a.task, b.task)),
        count: countByKey.get(head.key) ?? 0
      }))
      .filter((group) => group.entries.length > 0)
      // Why: the group holding the searched ref moves up too, so the match is the first row.
      .sort((a, b) => Number(b.entries.some(hasExactRef)) - Number(a.entries.some(hasExactRef)))
  )
}

/** Display order of every row for J/K: tree order, skipping what folded tasks hide. */
export function flattenLocalTaskGroups(
  groups: readonly LocalTaskListGroup[],
  folded: ReadonlySet<string> = new Set()
): string[] {
  return groups.flatMap((group) =>
    group.entries.flatMap((entry) => [
      entry.task.id,
      ...unfoldedLocalTaskLines(entry.lines, folded).map((line) => line.task.id)
    ])
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
