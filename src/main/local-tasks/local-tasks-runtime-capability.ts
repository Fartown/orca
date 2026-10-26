import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../shared/local-tasks/local-tasks-capability'
import { localTasksReadiness } from './local-tasks-readiness'

/** Dynamic on purpose: orcad and `orca serve` share the static capability list but host no tasks. */
export function localTasksRuntimeCapabilities(): string[] {
  return localTasksReadiness.isTaskHost() ? [LOCAL_TASKS_RUNTIME_CAPABILITY] : []
}
