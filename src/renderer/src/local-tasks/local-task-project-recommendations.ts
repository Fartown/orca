import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { Project } from '../../../shared/project-types'
import {
  SELF_LOCAL_TASK_ENDPOINT,
  localTaskEndpointForHost,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import {
  suggestLocalTaskPrefix,
  takenLocalTaskPrefixes
} from '../../../shared/local-tasks/local-task-prefix-suggestion'
export {
  suggestLocalTaskPrefix,
  takenLocalTaskPrefixes
} from '../../../shared/local-tasks/local-task-prefix-suggestion'

export type LocalTaskProjectRecommendation = { project: Project; prefix: string }

/** Orca projects no task project links yet, each with a prefix no other row or project uses. */
export function recommendLocalTaskProjects(
  orcaProjects: readonly Project[],
  taskProjects: readonly LocalTaskProject[]
): LocalTaskProjectRecommendation[] {
  const linked = new Set(taskProjects.flatMap((project) => project.repos))
  const taken = takenLocalTaskPrefixes(taskProjects)
  const recommendations: LocalTaskProjectRecommendation[] = []
  for (const project of orcaProjects) {
    if (linked.has(project.id)) {
      continue
    }
    const prefix = suggestLocalTaskPrefix(project.displayName, taken)
    taken.add(prefix)
    recommendations.push({ project, prefix })
  }
  return recommendations
}

/**
 * The library a new task project for this Orca project goes to: the Orca serving one of the hosts
 * it is set up on (this app for local and its own SSH hosts, a paired server for its runtime).
 * This app's own library first; a host picker is the creation dialog's to add.
 */
export function localTaskEndpointForOrcaProject(
  hostIds: readonly string[],
  writable: (endpoint: LocalTaskEndpointKey) => boolean
): LocalTaskEndpointKey | null {
  const endpoints = hostIds
    .map(localTaskEndpointForHost)
    .filter((endpoint): endpoint is LocalTaskEndpointKey => endpoint !== null && writable(endpoint))
  return endpoints.includes(SELF_LOCAL_TASK_ENDPOINT)
    ? SELF_LOCAL_TASK_ENDPOINT
    : (endpoints[0] ?? null)
}
