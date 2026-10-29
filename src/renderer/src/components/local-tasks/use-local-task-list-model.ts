import { useMemo } from 'react'
import {
  buildLocalTaskIndex,
  countLocalTaskViews,
  tasksInScope,
  type LocalTaskIndex
} from '@/local-tasks/local-task-grouping'
import {
  buildLocalTaskBoardColumns,
  flattenLocalTaskGroups,
  groupLocalTasksForList
} from '@/local-tasks/local-task-list-groups'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { localTaskIdsNeedingYou } from '@/local-tasks/local-task-needs-you-rows'
import { useLocalTaskEndpointLabels } from '@/local-tasks/local-task-endpoint-labels'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'

export function useLocalTaskIndex(): {
  projects: LocalTaskProject[]
  tasks: LocalTask[]
  index: LocalTaskIndex
} {
  const projects = useLocalTasksDomain((state) => state.projects)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const index = useMemo(() => buildLocalTaskIndex(projects, tasks), [projects, tasks])
  return { projects, tasks, index }
}

/** Everything the list, board, rail and keyboard read; derived once per store change. */
export function useLocalTaskListModel() {
  const { projects, tasks, index } = useLocalTaskIndex()
  const hostLabels = useLocalTaskEndpointLabels()
  const requestedScope = useLocalTaskPage((state) => state.scopeProjectId)
  const view = useLocalTaskPage((state) => state.view)
  const filters = useLocalTaskPage((state) => state.filters)
  const query = useLocalTaskPage((state) => state.query)
  const layout = useLocalTaskPage((state) => state.layout)
  const showCanceled = useLocalTaskPage((state) => state.showCanceledColumn)
  const groupBy = useLocalTaskPage((state) => state.groupBy)
  const sortBy = useLocalTaskPage((state) => state.sortBy)
  const collapsedGroupKeys = useLocalTaskPage((state) => state.collapsedGroupKeys)
  const collapsedTaskIds = useLocalTaskPage((state) => state.collapsedTaskIds)
  const foldedTaskIds = useMemo(() => new Set(collapsedTaskIds), [collapsedTaskIds])
  // Why: a project removed elsewhere falls back to all projects instead of an empty page.
  const scopeProjectId =
    requestedScope && index.projectsById.has(requestedScope) ? requestedScope : null
  const scopeTasks = useMemo(() => tasksInScope(tasks, scopeProjectId), [tasks, scopeProjectId])
  const counts = useMemo(() => countLocalTaskViews(scopeTasks, index), [scopeTasks, index])
  const taskCountByProject = useMemo(() => {
    const counts = new Map<string, number>()
    for (const task of tasks) {
      counts.set(task.projectId, (counts.get(task.projectId) ?? 0) + 1)
    }
    return counts
  }, [tasks])
  const needsYouProgress = useLocalTasksDomain((state) =>
    filters.needsYou ? state.progress : null
  )
  const visibility = useMemo(
    () => ({
      // The Needs you view draws its own rows; the list behind it keeps the full set.
      view: view === 'needs-you' ? 'all' : view,
      filters,
      query,
      ...(filters.needsYou ? { onlyTaskIds: localTaskIdsNeedingYou(needsYouProgress) } : {})
    }),
    [view, filters, query, needsYouProgress]
  )
  const groups = useMemo(
    () =>
      layout === 'list'
        ? groupLocalTasksForList(scopeTasks, index, scopeProjectId, visibility, {
            groupBy,
            sortBy
          })
        : [],
    [layout, scopeTasks, index, scopeProjectId, visibility, groupBy, sortBy]
  )
  const columns = useMemo(
    () =>
      layout === 'board'
        ? buildLocalTaskBoardColumns(scopeTasks, index, scopeProjectId, visibility, {
            sortBy,
            showCanceled
          })
        : [],
    [layout, scopeTasks, index, scopeProjectId, visibility, sortBy, showCanceled]
  )
  // Every list row with nothing folded or collapsed; what a hidden cursor falls back along.
  const listTaskIds = useMemo(() => flattenLocalTaskGroups(groups), [groups])
  const orderedTaskIds = useMemo(
    () =>
      layout === 'list'
        ? flattenLocalTaskGroups(
            groups.filter((group) => !collapsedGroupKeys.includes(group.key)),
            foldedTaskIds
          )
        : columns.flatMap((column) => column.tasks.map((task) => task.id)),
    [layout, groups, columns, collapsedGroupKeys, foldedTaskIds]
  )
  return {
    projects,
    tasks,
    index,
    scopeProjectId,
    scopeProject: scopeProjectId ? index.projectsById.get(scopeProjectId) : undefined,
    scopeTasks,
    counts,
    taskCountByProject,
    groups,
    columns,
    orderedTaskIds,
    listTaskIds,
    foldedTaskIds,
    layout,
    hostLabels
  }
}

export type LocalTaskListModel = ReturnType<typeof useLocalTaskListModel>
