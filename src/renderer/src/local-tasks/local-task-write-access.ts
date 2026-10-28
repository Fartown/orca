import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import {
  isLocalTaskRowWritable,
  useLocalTasksDomain,
  type LocalTasksDomainState
} from './local-tasks-domain-store'

/*
 * Page-wide write checks (D-008): the page lists rows from several libraries, so each action asks
 * the libraries that own its rows, not the page's own.
 */

type AccessState = Pick<LocalTasksDomainState, 'partitions' | 'home' | 'projects'>

/** Every row's own library takes writes now; nothing to write is not writable. */
export function canWriteLocalTaskRows(state: AccessState, ids: readonly string[]): boolean {
  return ids.length > 0 && ids.every((id) => isLocalTaskRowWritable(state, id))
}

export function useCanWriteLocalTaskRows(ids: readonly string[]): boolean {
  return useLocalTasksDomain((state) => canWriteLocalTaskRows(state, ids))
}

/** Projects a new task can go into now. */
export function writableLocalTaskProjects(
  state: AccessState,
  projects: readonly LocalTaskProject[]
): LocalTaskProject[] {
  return projects.filter((project) => isLocalTaskRowWritable(state, project.id))
}

/** New task opens in the scoped project when its library takes writes, else in any that does. */
export function canCreateLocalTask(state: AccessState, scopeProjectId: string | null): boolean {
  return scopeProjectId
    ? isLocalTaskRowWritable(state, scopeProjectId)
    : writableLocalTaskProjects(state, state.projects).length > 0
}

export function useCanCreateLocalTask(scopeProjectId: string | null): boolean {
  return useLocalTasksDomain((state) => canCreateLocalTask(state, scopeProjectId))
}
