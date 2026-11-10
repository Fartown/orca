import { e2eConfig } from '@/lib/e2e-config'
import { useAppStore } from '@/store'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY } from '../../../shared/local-tasks/local-task-source-visibility'
import { openLocalTaskPage } from './local-task-navigation'

export function bindLocalTaskStartupPage(): () => void {
  // Why: upstream end-to-end specs start from the view the session restores; test builds keep it,
  // and specs that need the task page open it themselves. Packaged builds never set exposeStore.
  if (e2eConfig.exposeStore) {
    return () => {}
  }
  let settled = false
  const open = (): void => {
    if (settled) {
      return
    }
    const domain = localTasksDomainStore.getState()
    if (!useAppStore.getState().persistedUIReady || !domain.projectsLoaded || !domain.tasksLoaded) {
      return
    }
    settled = true
    if (
      domain.preferences.openTasksOnLaunch !== '0' &&
      domain.preferences[LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY] !== '1'
    ) {
      openLocalTaskPage()
    }
  }
  const stopDomain = localTasksDomainStore.subscribe(open)
  const stopApp = useAppStore.subscribe(open)
  open()
  return () => {
    stopDomain()
    stopApp()
  }
}
