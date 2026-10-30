import { CARD_SHOW_LOCAL_TASK_PREFERENCE_KEY } from './local-task-preference-keys'
import { localTasksClient } from './local-tasks-runtime-client'
import {
  localTasksDomainStore,
  useLocalTasksDomain,
  type LocalTasksDomainState
} from './local-tasks-domain-store'

/** The sidebar card's task chip, on until "Show properties → Local task" turns it off (REQ-016). */
export function selectLocalTaskCardChipShown(state: LocalTasksDomainState): boolean {
  return state.preferences[CARD_SHOW_LOCAL_TASK_PREFERENCE_KEY] !== '0'
}

export function useLocalTaskCardChipShown(): boolean {
  return useLocalTasksDomain(selectLocalTaskCardChipShown)
}

/** Offered once the library has a project, the same moment the chip can first appear. */
export function useLocalTaskCardChipOffered(): boolean {
  return useLocalTasksDomain((state) => state.projectsLoaded && state.projects.length > 0)
}

export function chooseLocalTaskCardChipShown(shown: boolean): void {
  const value = shown ? null : '0'
  const domain = localTasksDomainStore.getState()
  if ((domain.preferences[CARD_SHOW_LOCAL_TASK_PREFERENCE_KEY] ?? null) === value) {
    return
  }
  domain.applyHomePreferences({ [CARD_SHOW_LOCAL_TASK_PREFERENCE_KEY]: value })
  // Why swallow: a lost choice only means the cards show the previous setting next time.
  void localTasksClient.setPreference(CARD_SHOW_LOCAL_TASK_PREFERENCE_KEY, value).catch(() => {})
}
