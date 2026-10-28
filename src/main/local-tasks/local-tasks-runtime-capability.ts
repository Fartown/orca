import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../shared/local-tasks/local-tasks-capability'
import { localTasksReadiness } from './local-tasks-readiness'

/** Dynamic on purpose: only a process whose library opened advertises it (not orcad's browser sidecar). */
export function localTasksRuntimeCapabilities(): string[] {
  return localTasksReadiness.isTaskHost() ? [LOCAL_TASKS_RUNTIME_CAPABILITY] : []
}
