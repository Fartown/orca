import { localTasksClient } from './local-tasks-runtime-client'
import { localTasksDomainStore } from './local-tasks-domain-store'
import {
  LOCAL_TASK_GROUP_BYS,
  LOCAL_TASK_SORT_BYS,
  localTaskPageStore,
  type LocalTaskGroupBy,
  type LocalTaskSortBy
} from './local-task-page-store'
import { GROUP_BY_PREFERENCE_KEY, SORT_BY_PREFERENCE_KEY } from './local-task-preference-keys'

function persist(key: string, value: string | null): void {
  // Why swallow: a lost choice only means the list opens with the default grouping next time.
  void localTasksClient.setPreference(key, value).catch(() => {})
}

export function chooseLocalTaskGroupBy(groupBy: LocalTaskGroupBy): void {
  localTaskPageStore.getState().setGroupBy(groupBy)
  persist(GROUP_BY_PREFERENCE_KEY, groupBy === 'status' ? null : groupBy)
}

export function chooseLocalTaskSortBy(sortBy: LocalTaskSortBy): void {
  localTaskPageStore.getState().setSortBy(sortBy)
  persist(SORT_BY_PREFERENCE_KEY, sortBy === 'updated' ? null : sortBy)
}

/** Applies stored choices as they load; an unknown or missing value means the default. */
export function bindLocalTaskViewPreferences(): () => void {
  return localTasksDomainStore.subscribe((state, previous) => {
    const page = localTaskPageStore.getState()
    const groupBy = state.preferences[GROUP_BY_PREFERENCE_KEY]
    if (groupBy !== previous.preferences[GROUP_BY_PREFERENCE_KEY]) {
      page.setGroupBy(LOCAL_TASK_GROUP_BYS.find((option) => option === groupBy) ?? 'status')
    }
    const sortBy = state.preferences[SORT_BY_PREFERENCE_KEY]
    if (sortBy !== previous.preferences[SORT_BY_PREFERENCE_KEY]) {
      page.setSortBy(LOCAL_TASK_SORT_BYS.find((option) => option === sortBy) ?? 'updated')
    }
  })
}
