import { useMemo } from 'react'
import type {
  LocalTask,
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../shared/local-tasks/local-task-types'
import { isExactLocalTaskRef, matchesLocalTaskQuery } from './local-task-grouping'
import { localTaskHostLabelFor, useLocalTaskEndpointLabels } from './local-task-endpoint-labels'
import { localTaskIdEndpoint } from './local-task-endpoints'
import { selectLocalTaskSourceVisible } from './local-task-source-visibility'
import { useLocalTasksDomain } from './local-tasks-domain-store'

/** A local task in Cmd+J's Tasks group, ahead of upstream's provider results (REQ-007). */
export type LocalTaskPaletteItem = {
  /** The client id carries the library, so the same ref on two hosts stays two rows. */
  id: string
  type: 'local-task'
  task: LocalTask
  projectName: string
  status: LocalTaskStatusDef | null
  /** Only once projects come from more than one Orca, as the task page labels them. */
  hostLabel: string | null
  /** Its library's Orca is out of contact: the row is the last read, not the current task. */
  unverifiable: boolean
}

const RESULT_MAX = 30

// Why one shared list: a query matching no task must not hand the palette a new array per keystroke.
const NO_ITEMS: readonly LocalTaskPaletteItem[] = []
const NO_ENDPOINTS: ReadonlySet<string> = new Set()

/** The task page's own search, the exactly named ref first; capped like upstream's task results. */
export function buildLocalTaskPaletteItems(
  projects: readonly LocalTaskProject[],
  tasks: readonly LocalTask[],
  query: string,
  hostLabels?: ReadonlyMap<string, string>,
  outOfContact: ReadonlySet<string> = NO_ENDPOINTS
): readonly LocalTaskPaletteItem[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return NO_ITEMS
  }
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const matches = tasks.filter((task) =>
    matchesLocalTaskQuery(task, projectsById.get(task.projectId), trimmed)
  )
  if (matches.length === 0) {
    return NO_ITEMS
  }
  const exact = new Set(
    matches.filter((task) => isExactLocalTaskRef(task, projectsById.get(task.projectId), trimmed))
  )
  const ranked = [...exact, ...matches.filter((task) => !exact.has(task))]
  return ranked.slice(0, RESULT_MAX).map((task) => {
    const project = projectsById.get(task.projectId)
    return {
      id: `local-task:${task.id}`,
      type: 'local-task',
      task,
      projectName: project?.name ?? '',
      status: project?.statuses.find((status) => status.id === task.statusId) ?? null,
      hostLabel: localTaskHostLabelFor(hostLabels, task.id),
      unverifiable: outOfContact.has(localTaskIdEndpoint(task.id))
    }
  })
}

/** Nothing while Settings → Task sources hides Local, as upstream's hidden providers are left out. */
export function useLocalTaskPaletteItems(query: string): readonly LocalTaskPaletteItem[] {
  const projects = useLocalTasksDomain((state) => state.projects)
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const visible = useLocalTasksDomain(selectLocalTaskSourceVisible)
  const hostLabels = useLocalTaskEndpointLabels()
  // Why the shared verdict only: the palette reads what the page holds and never asks a host.
  const outOfContactKey = useLocalTasksDomain((state) =>
    state.partitions
      .filter((partition) => !partition.inContact)
      .map((partition) => partition.endpoint)
      .join('\n')
  )
  return useMemo(
    () =>
      visible
        ? buildLocalTaskPaletteItems(
            projects,
            tasks,
            query,
            hostLabels,
            outOfContactKey ? new Set(outOfContactKey.split('\n')) : NO_ENDPOINTS
          )
        : NO_ITEMS,
    [visible, projects, tasks, query, hostLabels, outOfContactKey]
  )
}
