import { LOCAL_TASK_STATUS_CATEGORIES } from '../../../src/shared/local-tasks/local-task-model'
import {
  isExactLocalTaskRef,
  matchesLocalTaskQuery
} from '../../../src/shared/local-tasks/local-task-grouping'
import type { LocalTaskLinks } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'

/** A row of Create From's Local tab; `task` is null for the notice row saying why none can be picked. */
export type LocalTaskCreateSourceRow = {
  kind: 'local-task'
  value: string
  task: LocalTask | null
  disabled: boolean
  /** Muted text under the title: the workspace the task already has, or the notice itself. */
  note: string | null
}

export function isLocalTaskCreateSourceRow(row: { kind: string }): row is LocalTaskCreateSourceRow {
  return row.kind === 'local-task'
}

/** One Orca's task library, as the Local tab read it last. */
export type LocalTaskCreateLibrary = {
  projects: readonly LocalTaskProject[]
  tasks: readonly LocalTask[]
  links: LocalTaskLinks
}

const ROW_MAX = 50

function categoryRank(project: LocalTaskProject | undefined, task: LocalTask): number {
  const category = project?.statuses.find((status) => status.id === task.statusId)?.category
  return category
    ? LOCAL_TASK_STATUS_CATEGORIES.indexOf(category)
    : LOCAL_TASK_STATUS_CATEGORIES.length
}

/**
 * The tab's rows, ordered as the desktop's Local tab orders them (REQ-009, REQ-011): tasks of any
 * level matching the query by title or any ref, the exact ref first; then those of task projects
 * linking the picked repo's Orca project, open categories first, newest first. A task that already
 * has a workspace is greyed with its name; `blocked` greys every row behind a notice row.
 */
export function buildLocalTaskCreateSourceRows(input: {
  library: LocalTaskCreateLibrary
  /** The picked repo's Orca project; its task projects rank first. */
  orcaProjectId: string | null
  query: string
  blocked: string | null
  hasWorkspace: (name: string) => string
}): LocalTaskCreateSourceRow[] {
  const { library, orcaProjectId, query, blocked } = input
  const projects = new Map(library.projects.map((project) => [project.id, project]))
  const related = (task: LocalTask): boolean =>
    orcaProjectId !== null && projects.get(task.projectId)?.repos.includes(orcaProjectId) === true
  const exact = (task: LocalTask): boolean =>
    isExactLocalTaskRef(task, projects.get(task.projectId), query)
  const matches = library.tasks
    .filter(
      (task) =>
        projects.has(task.projectId) &&
        matchesLocalTaskQuery(task, projects.get(task.projectId), query)
    )
    .sort(
      (left, right) =>
        Number(exact(right)) - Number(exact(left)) ||
        Number(related(right)) - Number(related(left)) ||
        categoryRank(projects.get(left.projectId), left) -
          categoryRank(projects.get(right.projectId), right) ||
        right.number - left.number
    )
  const rows = matches.slice(0, ROW_MAX).map((task): LocalTaskCreateSourceRow => {
    const link = library.links.workspaces.find((candidate) => candidate.taskId === task.id)
    const taken = link
      ? input.hasWorkspace(link.nameSnapshot ?? link.branchSnapshot ?? link.worktreeId ?? '')
      : null
    return {
      kind: 'local-task',
      value: `local-task:${task.id}`,
      task,
      disabled: blocked !== null || taken !== null,
      note: taken
    }
  })
  if (!blocked) {
    return rows
  }
  const notice: LocalTaskCreateSourceRow = {
    kind: 'local-task',
    value: 'local-task:notice',
    task: null,
    disabled: true,
    note: blocked
  }
  return [notice, ...rows]
}
