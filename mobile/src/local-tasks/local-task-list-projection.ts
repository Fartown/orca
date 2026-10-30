import type { LocalTaskStatusCategory } from '../../../src/shared/local-tasks/local-task-model'
import type {
  LocalTask,
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import {
  buildLocalTaskIndex,
  countLocalTaskViews,
  localTaskSubtaskProgress,
  tasksInScope
} from '../../../src/shared/local-tasks/local-task-grouping'
import {
  buildLocalTaskBoardColumns,
  groupLocalTasksForList,
  statusHeadCategory,
  type LocalTaskTreeLine
} from '../../../src/shared/local-tasks/local-task-list-groups'
import { EMPTY_LOCAL_TASK_FILTER, type LocalTaskFilter } from './local-task-filter'

export type LocalTaskSegment = 'started' | 'all'
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
  /** Tasks in this status, subtasks nested under another group included (REQ-006). */
  count: number
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
  /** The tasks "Needs you" holds, which the filter's `needsYou` narrows to. */
  needingYou?: ReadonlySet<string>
}

export function buildLocalTaskGroups(
  input: GroupInput & { nestSubtasks: boolean; keepEmpty: boolean }
): LocalTaskListGroup[] {
  const index = buildLocalTaskIndex(input.projects, input.tasks)
  const scope = tasksInScope(input.tasks, input.projectId)
  const filter = input.filter ?? EMPTY_LOCAL_TASK_FILTER
  const visibility = {
    view: input.segment,
    filters: filter,
    query: filter.query,
    ...(filter.needsYou ? { onlyTaskIds: input.needingYou ?? new Set<string>() } : {})
  }
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
        rows: head.tasks.map((task) => row(task, [])),
        count: head.tasks.length
      }))
      .filter(
        (group) =>
          (input.segment === 'all' || group.category === input.segment) &&
          (filter.categories.length === 0 ||
            (group.category !== null && filter.categories.includes(group.category))) &&
          (input.keepEmpty || group.rows.length > 0)
      )
  }
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
    rows: head.entries.map((entry) => row(entry.task, entry.lines)),
    count: head.count
  }))
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
