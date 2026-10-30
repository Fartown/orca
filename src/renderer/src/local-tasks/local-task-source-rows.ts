import { translate } from '@/i18n/i18n'
import { LOCAL_TASK_STATUS_CATEGORIES } from '../../../shared/local-tasks/local-task-model'
import {
  isExactLocalTaskRef,
  matchesLocalTaskQuery
} from '../../../shared/local-tasks/local-task-grouping'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { localTaskIdEndpoint } from './local-task-endpoints'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'
import { localTaskEndpointOwnsHost } from './local-task-workspace-resolution'
import type { LocalTasksPartition } from './local-tasks-partition'

/** A row of the Local tasks tab in Orca's work-item search (workspace details and the composer). */
export type LocalTaskSourceRow = {
  kind: 'local-task'
  value: string
  /** Null for the notice row, which only says why nothing can be linked now. */
  task: LocalTask | null
  disabled: boolean
  /** Muted text after the title: the workspace the task already has, or the notice itself. */
  note: string | null
}

export function isLocalTaskSourceRow(row: { kind: string }): row is LocalTaskSourceRow {
  return row.kind === 'local-task'
}

export function isLocalTaskSourceRowUnavailable(row: { kind: string }): boolean {
  return isLocalTaskSourceRow(row) && row.disabled
}

export type LocalTaskTaskChoice = {
  task: LocalTask
  /** Name of the workspace this task already has; such a task is shown but disabled. */
  linkedWorkspace: string | null
  /** Its project links the workspace's Orca project. */
  related: boolean
}

/**
 * Tasks of any level a workspace may join (REQ-011, D-008), from the library of the Orca serving
 * its host only: those of task projects linking the workspace's Orca project first, then the rest;
 * within each, open categories first, newest first.
 */
export function listLocalTaskChoicesForWorkspace(
  projectIds: ReadonlySet<string>,
  hostId: string,
  projects: readonly LocalTaskProject[],
  tasks: readonly LocalTask[],
  links: LocalTaskLinks
): LocalTaskTaskChoice[] {
  const eligible = new Map(
    projects
      .filter((project) => localTaskEndpointOwnsHost(localTaskIdEndpoint(project.id), hostId))
      .map((p) => [p.id, p])
  )
  const isRelated = (task: LocalTask): boolean =>
    eligible.get(task.projectId)?.repos.some((repoId) => projectIds.has(repoId)) === true
  const categoryRank = (task: LocalTask): number => {
    const category = eligible
      .get(task.projectId)
      ?.statuses.find((s) => s.id === task.statusId)?.category
    return category
      ? LOCAL_TASK_STATUS_CATEGORIES.indexOf(category)
      : LOCAL_TASK_STATUS_CATEGORIES.length
  }
  return tasks
    .filter((task) => eligible.has(task.projectId))
    .map((task) => {
      const link = links.workspaces.find((candidate) => candidate.taskId === task.id)
      return {
        task,
        linkedWorkspace: link
          ? (link.nameSnapshot ?? link.branchSnapshot ?? link.worktreeId ?? '')
          : null,
        related: isRelated(task)
      }
    })
    .sort(
      (left, right) =>
        Number(right.related) - Number(left.related) ||
        categoryRank(left.task) - categoryRank(right.task) ||
        right.task.number - left.task.number
    )
}

const SOURCE_ROW_MAX = 50

export type LocalTaskSourceScope = {
  /** The client host id of the workspace, or of the one about to be created. */
  hostId: string
  /** Orca projects whose task projects rank first. */
  orcaProjectIds: readonly string[]
  /** The workspace being edited: its own task is not taken by "another" workspace. */
  workspace: { id: string; hostId: string; instanceId?: string } | null
}

/**
 * The tab's rows: tasks matching the query by title or any ref, the exact ref first. With
 * `blocked` set every row is greyed and a notice row first says why.
 */
export function buildLocalTaskSourceRows(input: {
  scope: LocalTaskSourceScope
  projects: readonly LocalTaskProject[]
  tasks: readonly LocalTask[]
  links: LocalTaskLinks
  query: string
  blocked: string | null
}): LocalTaskSourceRow[] {
  const { scope, projects, links, query, blocked } = input
  const ownTaskId = scope.workspace
    ? (findLocalTaskLinkForWorkspace(links, scope.workspace)?.taskId ?? null)
    : null
  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const matches = listLocalTaskChoicesForWorkspace(
    new Set(scope.orcaProjectIds),
    scope.hostId,
    projects,
    input.tasks,
    links
  ).filter((choice) =>
    matchesLocalTaskQuery(choice.task, projectsById.get(choice.task.projectId), query)
  )
  const exact = (choice: LocalTaskTaskChoice): boolean =>
    isExactLocalTaskRef(choice.task, projectsById.get(choice.task.projectId), query)
  const rows = [...matches.filter(exact), ...matches.filter((choice) => !exact(choice))]
    .slice(0, SOURCE_ROW_MAX)
    .map((choice): LocalTaskSourceRow => {
      const taken = choice.linkedWorkspace !== null && choice.task.id !== ownTaskId
      return {
        kind: 'local-task',
        value: `local-task:${choice.task.id}`,
        task: choice.task,
        disabled: blocked !== null || taken,
        note: taken
          ? translate('localTasks.links.hasWorkspace', 'Has {{name}}', {
              name: choice.linkedWorkspace
            })
          : null
      }
    })
  return blocked
    ? [
        {
          kind: 'local-task',
          value: 'local-task:notice',
          task: null,
          disabled: true,
          note: blocked
        },
        ...rows
      ]
    : rows
}

/** Why the library cannot take a link now, by the shared contact verdict; null when it can. */
export function localTaskSourceBlockedReason(
  partition: Pick<LocalTasksPartition, 'inContact' | 'connection' | 'hostState'> | undefined,
  libraryLabel: string
): string | null {
  if (!partition) {
    return translate('localTasks.sourceTab.unavailable', 'The task library is not available now.')
  }
  if (!partition.inContact) {
    return translate(
      'localTasks.sourceTab.offline',
      '{{host}} is not connected, so tasks cannot be linked now.',
      { host: libraryLabel }
    )
  }
  if (partition.hostState === 'read-only') {
    return translate(
      'localTasks.sourceTab.readOnly',
      'This task library is read-only here. Update Orca to link tasks.'
    )
  }
  if (partition.connection !== 'live' || partition.hostState !== 'ready') {
    return translate('localTasks.sourceTab.unavailable', 'The task library is not available now.')
  }
  return null
}
