import { useAppStore } from '@/store'
import { activateLocalTaskSource } from './local-task-source-activation'
import { localTaskPageStore } from './local-task-page-store'
import { localTasksDomainStore } from './local-tasks-domain-store'

/** Opens the task page on the Local source; `taskId` lands on that task's detail. */
export function openLocalTaskPage(
  intent: { taskId?: string; create?: boolean; focusSearch?: boolean } = {}
): void {
  // Why no taskSource: passing one is how the page leaves Local (see bindLocalTaskSourceActivation).
  useAppStore.getState().openTaskPage()
  activateLocalTaskSource()
  const page = localTaskPageStore.getState()
  if (intent.taskId) {
    page.openDetail(intent.taskId)
  }
  if (intent.create) {
    page.openDetail(null)
    const scopeProjectId = localTasksDomainStore
      .getState()
      .projects.some((project) => project.id === page.scopeProjectId)
      ? page.scopeProjectId
      : null
    page.openCreate({ projectId: scopeProjectId })
  }
  if (intent.focusSearch) {
    page.openDetail(null)
    page.requestSearchFocus()
  }
}

export function openLocalTasksSettings(): void {
  const { openSettingsPage, openSettingsTarget } = useAppStore.getState()
  openSettingsTarget({ pane: 'local-tasks', repoId: null })
  openSettingsPage()
}
