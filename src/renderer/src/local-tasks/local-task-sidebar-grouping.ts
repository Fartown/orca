import { createStore } from 'zustand/vanilla'
import { SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY } from './local-task-preference-keys'
import { localTasksClient } from './local-tasks-runtime-client'
import {
  localTasksDomainStore,
  useLocalTasksDomain,
  type LocalTasksDomainState
} from './local-tasks-domain-store'

/** `unavailable` until the library has loaded at least one project, its tasks and its links. */
export type LocalTaskSidebarGrouping = 'unavailable' | 'off' | 'on'

export function selectLocalTaskSidebarGrouping(
  state: LocalTasksDomainState
): LocalTaskSidebarGrouping {
  if (
    !state.projectsLoaded ||
    !state.tasksLoaded ||
    !state.linksLoaded ||
    state.projects.length === 0
  ) {
    return 'unavailable'
  }
  return state.preferences[SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY] === '1' ? 'on' : 'off'
}

export function useLocalTaskSidebarGrouping(): LocalTaskSidebarGrouping {
  return useLocalTasksDomain(selectLocalTaskSidebarGrouping)
}

export function chooseLocalTaskSidebarGrouping(on: boolean): void {
  const value = on ? '1' : null
  const domain = localTasksDomainStore.getState()
  if ((domain.preferences[SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY] ?? null) === value) {
    return
  }
  domain.applyHomePreferences({ [SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY]: value })
  // Why swallow: a lost choice only means the sidebar opens with the previous grouping next time.
  void localTasksClient.setPreference(SIDEBAR_GROUP_BY_TASK_PREFERENCE_KEY, value).catch(() => {})
}

type LocalTaskSidebarCollapseState = {
  collapsed: ReadonlySet<string>
  toggle: (key: string) => void
  expand: (key: string) => void
}

/** Task groups' collapse lives here, so upstream's persisted collapse set never learns fork keys. */
export const localTaskSidebarCollapseStore = createStore<LocalTaskSidebarCollapseState>((set) => ({
  collapsed: new Set(),
  toggle: (key) =>
    set((state) => {
      const collapsed = new Set(state.collapsed)
      if (!collapsed.delete(key)) {
        collapsed.add(key)
      }
      return { collapsed }
    }),
  expand: (key) =>
    set((state) => {
      if (!state.collapsed.has(key)) {
        return state
      }
      const collapsed = new Set(state.collapsed)
      collapsed.delete(key)
      return { collapsed }
    })
}))
