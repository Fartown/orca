import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import {
  suggestLocalTaskPrefix,
  takenLocalTaskPrefixes
} from '../../../shared/local-tasks/local-task-prefix-suggestion'
import { localTaskDefaultStatusNames } from './local-task-vocabulary-copy'
import { localTaskEndpointForHost, localTaskIdEndpoint } from './local-task-endpoints'
import { isLocalTasksWritable, localTasksDomainStore } from './local-tasks-domain-store'
import { localTasksClient } from './local-tasks-runtime-client'
import { orcaProjectIdsForWorktree } from './local-task-workspace-resolution'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'
import type { LocalTaskDispatchCandidate } from './local-task-dispatch-candidates'

export function projectsForDispatchTarget(
  state: AppState,
  target: LocalTaskDispatchCandidate,
  projects: readonly LocalTaskProject[]
): LocalTaskProject[] {
  if (target.kind === 'task') {
    return projects.filter((project) => project.id === target.task.projectId)
  }
  if (target.kind === 'workspace') {
    const domain = localTasksDomainStore.getState()
    const owner = findLocalTaskLinkForWorkspace(domain.links, {
      id: target.worktree.id,
      hostId: target.hostId,
      ...(target.worktree.instanceId ? { instanceId: target.worktree.instanceId } : {})
    })
    const task = owner ? domain.tasks.find((item) => item.id === owner.taskId) : null
    if (task) {
      return projects.filter((project) => project.id === task.projectId)
    }
  }
  const orcaIds =
    target.kind === 'repo'
      ? new Set([target.orcaProjectId])
      : target.kind === 'workspace'
        ? orcaProjectIdsForWorktree(state, target.worktree)
        : new Set<string>()
  return projects.filter(
    (project) =>
      orcaIds.size > 0 &&
      project.repos.some((id) => orcaIds.has(id)) &&
      (target.hostId
        ? localTaskIdEndpoint(project.id) === localTaskEndpointForHost(target.hostId)
        : false)
  )
}

export async function createDispatchProjectForRepo(
  target: Extract<LocalTaskDispatchCandidate, { kind: 'repo' }>
): Promise<LocalTaskProject | null> {
  const domain = localTasksDomainStore.getState()
  const endpoint = localTaskEndpointForHost(target.hostId)
  if (!endpoint || !isLocalTasksWritable(domain, endpoint)) {
    return null
  }
  const projectName =
    useAppStore.getState().projects.find((project) => project.id === target.orcaProjectId)
      ?.displayName ?? target.repo.displayName
  const prefix = suggestLocalTaskPrefix(projectName, takenLocalTaskPrefixes(domain.projects))
  const result = await localTasksClient.createProject(endpoint, {
    name: projectName,
    prefix,
    repos: [target.orcaProjectId],
    statusNames: localTaskDefaultStatusNames()
  })
  if (!result.ok) {
    return null
  }
  domain.upsertProject(result.project)
  return result.project
}
