import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../shared/local-tasks/local-tasks-capability'
import { localTasksReadiness } from './local-tasks-readiness'

/**
 * Dynamic on purpose: every process that hosts a task library advertises it, while the library is
 * still opening or failed to open as well (`localTasks.status` tells which); orcad's browser sidecar
 * hosts none and never does.
 */
export function localTasksRuntimeCapabilities(): string[] {
  return localTasksReadiness.isTaskHost() ? [LOCAL_TASKS_RUNTIME_CAPABILITY] : []
}
