import type { AppState } from '@/store/types'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { LocalTasksProjectsUpdateInput } from '../../../shared/local-tasks/local-tasks-rpc-params'
import {
  SELF_LOCAL_TASK_ENDPOINT,
  localTaskEndpointForHost,
  localTaskIdEndpoint,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import { orcaProjectHostIds } from './local-task-workspace-resolution'

export type LocalTaskRepoEdit = { kind: 'add' | 'remove' | 'default'; repoId: string }

/**
 * The `projects.update` patch for one edit of a project's repos (REQ-001): the list goes whole,
 * and the host keeps the default while it is still listed, else takes the first.
 */
export function localTaskReposPatch(
  project: Pick<LocalTaskProject, 'repos' | 'defaultRepoId'>,
  edit: LocalTaskRepoEdit
): Pick<LocalTasksProjectsUpdateInput, 'repos' | 'defaultRepoId'> | null {
  const listed = project.repos.includes(edit.repoId)
  switch (edit.kind) {
    case 'add':
      return listed ? null : { repos: [...project.repos, edit.repoId] }
    case 'remove':
      return listed ? { repos: project.repos.filter((repo) => repo !== edit.repoId) } : null
    case 'default':
      return listed && project.defaultRepoId !== edit.repoId ? { defaultRepoId: edit.repoId } : null
  }
}

export type LocalTaskRepoCandidate = {
  orcaProjectId: string
  label: string
  /** Other task projects of the same library that already link it; a hint, never a block. */
  alsoIn: string[]
}

/**
 * Orca projects a task project may link: the ones set up on a host its own library's Orca serves
 * (D-008), so Start and the pickers can reach them. Already linked ones are left out.
 */
export function localTaskRepoCandidates(
  state: Pick<AppState, 'projects' | 'repos' | 'projectHostSetups'>,
  project: LocalTaskProject,
  taskProjects: readonly LocalTaskProject[]
): LocalTaskRepoCandidate[] {
  const endpoint = localTaskIdEndpoint(project.id)
  return state.projects
    .filter(
      (orcaProject) =>
        !project.repos.includes(orcaProject.id) &&
        orcaProjectHostIds(state, orcaProject.id).some(
          (hostId) => localTaskEndpointForHost(hostId) === endpoint
        )
    )
    .map((orcaProject) => ({
      orcaProjectId: orcaProject.id,
      label: orcaProject.displayName,
      alsoIn: taskProjects
        .filter(
          (other) =>
            other.id !== project.id &&
            localTaskIdEndpoint(other.id) === endpoint &&
            other.repos.includes(orcaProject.id)
        )
        .map((other) => other.name)
    }))
}

/**
 * Where a new project without repos goes, the order the new-workspace composer takes a run
 * location in: the host the sidebar is scoped to, then this app's own library, then the first that
 * takes writes. Only libraries in contact that take writes are offered.
 */
export function defaultLocalTaskEndpoint(
  workspaceHostScope: string | undefined,
  writable: readonly LocalTaskEndpointKey[]
): LocalTaskEndpointKey | null {
  const focused = workspaceHostScope ? localTaskEndpointForHost(workspaceHostScope) : null
  if (focused && writable.includes(focused)) {
    return focused
  }
  return writable.includes(SELF_LOCAL_TASK_ENDPOINT)
    ? SELF_LOCAL_TASK_ENDPOINT
    : (writable[0] ?? null)
}
