import { LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY } from '../../../shared/local-tasks/local-task-source-visibility'
import { localTasksClient } from './local-tasks-runtime-client'
import {
  localTasksDomainStore,
  useLocalTasksDomain,
  type LocalTasksDomainState
} from './local-tasks-domain-store'
import { deactivateLocalTaskSource } from './local-task-source-activation'

/** Local is shown until the user hides it in Settings → Task sources; an unread library shows it. */
export function selectLocalTaskSourceVisible(state: LocalTasksDomainState): boolean {
  return state.preferences[LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY] !== '1'
}

export function useLocalTaskSourceVisible(): boolean {
  return useLocalTasksDomain(selectLocalTaskSourceVisible)
}

/**
 * Hiding Local, like hiding an upstream provider, takes it out of the task page's sources, the
 * sidebar shortcuts and Cmd+J; links already shown on workspaces and sessions stay.
 */
export function chooseLocalTaskSourceVisible(visible: boolean): Promise<void> {
  const value = visible ? null : '1'
  const domain = localTasksDomainStore.getState()
  const previous = domain.preferences[LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY] ?? null
  if (previous === value) {
    return Promise.resolve()
  }
  domain.applyHomePreferences({ [LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY]: value })
  if (!visible) {
    deactivateLocalTaskSource()
  }
  return localTasksClient.setPreference(LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY, value).then(
    () => undefined,
    (error: unknown) => {
      localTasksDomainStore
        .getState()
        .applyHomePreferences({ [LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY]: previous })
      throw error
    }
  )
}
