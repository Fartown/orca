import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { findLocalTaskWorkspaceLink } from './local-task-link-selectors'
import { localTaskPageStore } from './local-task-page-store'
import { selectLocalTaskSourceVisible } from './local-task-source-visibility'
import { buildLocalTaskComposerData } from './local-task-start-work'
import { selectLocalTaskStartState } from './local-task-work-actions'
import { localTasksDomainStore } from './local-tasks-domain-store'

/**
 * Cmd+N on an open local task starts it, as Cmd+N on a Linear issue does: the composer comes with
 * the task preselected. Null when no task is open, or Start could not run for it now.
 */
export function localTaskShortcutComposerData(
  state: Pick<AppState, 'activeView'>
): Record<string, unknown> | null {
  const page = localTaskPageStore.getState()
  if (state.activeView !== 'tasks' || !page.localActive || page.detailTaskId === null) {
    return null
  }
  const domain = localTasksDomainStore.getState()
  const task = domain.tasks.find((candidate) => candidate.id === page.detailTaskId)
  const project = task
    ? domain.projects.find((candidate) => candidate.id === task.projectId)
    : undefined
  if (!task || !project || !selectLocalTaskSourceVisible(domain)) {
    return null
  }
  const app = useAppStore.getState()
  const ownLink = findLocalTaskWorkspaceLink(domain.links, task.id)
  const start = selectLocalTaskStartState(app, project, ownLink)
  if (start.mode !== 'create' || start.reason) {
    return null
  }
  const data = buildLocalTaskComposerData(app, task, project, { replace: ownLink !== null })
  return data ? { ...data, telemetrySource: 'shortcut' } : null
}
