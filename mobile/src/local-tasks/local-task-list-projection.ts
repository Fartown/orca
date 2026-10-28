import type {
  LocalTaskStatusCategory,
  LocalTaskStatusColor
} from '../../../src/shared/local-tasks/local-task-model'
import type {
  LocalTask,
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import {
  buildLocalTaskIndex,
  countLocalTaskViews,
  isExactLocalTaskRef,
  isLocalTaskVisible,
  localTaskSubtaskProgress,
  tasksInScope,
  type LocalTaskIndex,
  type LocalTaskVisibility
} from '../../../src/shared/local-tasks/local-task-grouping'
import { localTaskAncestors } from '../../../src/shared/local-tasks/local-task-tree'
import {
  buildLocalTaskBoardColumns,
  groupLocalTasksForList,
  statusHeadCategory
} from '../../../src/shared/local-tasks/local-task-list-groups'
import { EMPTY_LOCAL_TASK_FILTER, type LocalTaskFilter } from './local-task-filter'

export type LocalTaskSegment = 'started' | 'all'
/** One descendant under a list row, any depth (D-008). */
export type LocalTaskTreeLine = {
  task: LocalTask
  /** 1 for a direct subtask of the row's task, 2 below that, and so on. */
  depth: number
  /** Shown children under this line; it folds only when there are some. */
  childCount: number
}
export type LocalTaskListRow = {
  task: LocalTask
  /** Every shown descendant, in tree order (each line after its parent). */
  subtasks: LocalTaskTreeLine[]
  subtaskDone: number
  subtaskTotal: number
}
export type LocalTaskListGroup = {
  key: string
  status: LocalTaskStatusDef | null
  category: LocalTaskStatusCategory | null
  rows: LocalTaskListRow[]
}

export function localTaskStatusLookup(
  projects: readonly LocalTaskProject[]
): Map<string, LocalTaskStatusDef> {
  return new Map(
    projects.flatMap((project) => project.statuses.map((status) => [status.id, status]))
  )
}

export function orderedLocalTaskStatuses(project: LocalTaskProject): LocalTaskStatusDef[] {
  return buildLocalTaskBoardColumns(
    [],
    buildLocalTaskIndex([project], []),
    project.id,
    { view: 'all', query: '', filters: EMPTY_LOCAL_TASK_FILTER },
    { sortBy: 'priority', showCanceled: true }
  ).flatMap((head) => (head.kind === 'status' ? [head.status] : []))
}

export const localTasksInScope = tasksInScope

export function countLocalTasksInCategory(
  tasks: readonly LocalTask[],
  projects: readonly LocalTaskProject[],
  category: LocalTaskStatusCategory
): number {
  const index = buildLocalTaskIndex(projects, tasks)
  return tasks.filter((task) => index.statusesById.get(task.statusId)?.category === category).length
}

type GroupInput = {
  tasks: readonly LocalTask[]
  projects: readonly LocalTaskProject[]
  projectId: string | null
  segment: LocalTaskSegment
  filter?: LocalTaskFilter
}

/**
 * The shown descendants below a list row's direct children, depth first. The shared grouping nests
 * one level; deeper tasks whose parent is shown ride here instead of becoming rows of their own,
 * and a searched ref stays a row of its own as it does there.
 */
function treeLines(
  children: readonly LocalTask[],
  index: LocalTaskIndex,
  shown: (task: LocalTask) => boolean,
  depth = 1,
  seen = new Set<string>()
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

function nestedShown(
  scope: readonly LocalTask[],
  index: LocalTaskIndex,
  visibility: LocalTaskVisibility
): (task: LocalTask) => boolean {
  const visible = new Set(
    scope.filter((task) => isLocalTaskVisible(task, index, visibility)).map((task) => task.id)
  )
  return (task) =>
    visible.has(task.id) &&
    !isExactLocalTaskRef(task, index.projectsById.get(task.projectId), visibility.query)
}

export function buildLocalTaskGroups(
  input: GroupInput & { nestSubtasks: boolean; keepEmpty: boolean }
): LocalTaskListGroup[] {
  const index = buildLocalTaskIndex(input.projects, input.tasks)
  const scope = tasksInScope(input.tasks, input.projectId)
  const filter = input.filter ?? EMPTY_LOCAL_TASK_FILTER
  const visibility = { view: input.segment, filters: filter, query: filter.query }
  const row = (task: LocalTask, subtasks: LocalTaskTreeLine[]): LocalTaskListRow => {
    const progress = localTaskSubtaskProgress(task, index)
    return { task, subtasks, subtaskDone: progress?.done ?? 0, subtaskTotal: progress?.total ?? 0 }
  }
  if (!input.nestSubtasks) {
    return buildLocalTaskBoardColumns(scope, index, input.projectId, visibility, {
      sortBy: 'priority',
      showCanceled: true
    })
      .map((head) => ({
        key: head.kind === 'status' ? head.key : `category:${head.category}`,
        status: head.kind === 'status' ? head.status : null,
        category: statusHeadCategory(head),
        rows: head.tasks.map((task) => row(task, []))
      }))
      .filter(
        (group) =>
          (input.segment === 'all' || group.category === input.segment) &&
          (filter.categories.length === 0 ||
            (group.category !== null && filter.categories.includes(group.category))) &&
          (input.keepEmpty || group.rows.length > 0)
      )
  }
  const shown = nestedShown(scope, index, visibility)
  return groupLocalTasksForList(scope, index, input.projectId, visibility, {
    groupBy: 'status',
    sortBy: 'priority'
  }).map((head) => ({
    key: head.kind === 'category' ? `category:${head.category}` : head.key,
    status: head.kind === 'status' ? head.status : null,
    category:
      head.kind === 'status'
        ? head.status.category
        : head.kind === 'category'
          ? head.category
          : null,
    rows: head.entries.map((entry) =>
      row(entry.task, treeLines(entry.children, index, shown, 1, new Set([entry.task.id])))
    )
  }))
}

/** The tree lines still shown once folded tasks hide everything below them. */
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

/** A task's ancestors root first, as its "SHOP-1 › SHOP-4" path reads. */
export function localTaskPathFromRoot(
  task: LocalTask,
  tasksById: ReadonlyMap<string, LocalTask>
): LocalTask[] {
  const path: LocalTask[] = []
  for (const ancestor of localTaskAncestors(task, tasksById)) {
    path.unshift(ancestor)
  }
  return path
}

export function localTaskSegmentCounts(
  tasks: readonly LocalTask[],
  projects: readonly LocalTaskProject[],
  projectId: string | null
): Record<LocalTaskSegment, number> {
  const counts = countLocalTaskViews(
    tasksInScope(tasks, projectId),
    buildLocalTaskIndex(projects, tasks)
  )
  return { all: counts.all, started: counts.started }
}

export function localTaskStatusColorOf(status: LocalTaskStatusDef | null): LocalTaskStatusColor {
  return status?.color ?? 'gray'
}
