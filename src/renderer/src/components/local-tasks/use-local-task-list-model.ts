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
  const requestedScope = useLocalTaskPage((state) => state.scopeProjectId)
  const view = useLocalTaskPage((state) => state.view)
  const filters = useLocalTaskPage((state) => state.filters)
  const query = useLocalTaskPage((state) => state.query)
  const layout = useLocalTaskPage((state) => state.layout)
  const showCanceled = useLocalTaskPage((state) => state.showCanceledColumn)
  const groupBy = useLocalTaskPage((state) => state.groupBy)
  const sortBy = useLocalTaskPage((state) => state.sortBy)
  // Why: a project removed elsewhere falls back to all projects instead of an empty page.
  const scopeProjectId =
    requestedScope && index.projectsById.has(requestedScope) ? requestedScope : null
  const scopeTasks = useMemo(() => tasksInScope(tasks, scopeProjectId), [tasks, scopeProjectId])
  const counts = useMemo(() => countLocalTaskViews(scopeTasks, index), [scopeTasks, index])
  const visibility = useMemo(() => ({ view, filters, query }), [view, filters, query])
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
  const orderedTaskIds = useMemo(
    () =>
      layout === 'list'
        ? flattenLocalTaskGroups(groups)
        : columns.flatMap((column) => column.tasks.map((task) => task.id)),
    [layout, groups, columns]
  )
  return {
    projects,
    tasks,
    index,
    scopeProjectId,
    scopeProject: scopeProjectId ? index.projectsById.get(scopeProjectId) : undefined,
    scopeTasks,
    counts,
    groups,
    columns,
    orderedTaskIds,
    layout
  }
}

export type LocalTaskListModel = ReturnType<typeof useLocalTaskListModel>
