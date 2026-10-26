import { useAppStore } from '@/store'
import { localTasksClient } from './local-tasks-runtime-client'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskPageStore } from './local-task-page-store'
import { LOCAL_ACTIVE_PREFERENCE_KEY } from './local-task-preference-keys'

function persist(active: boolean): void {
  // Why swallow: losing "last stayed on Local" only changes which source opens next time.
  void localTasksClient
    .setPreference(LOCAL_ACTIVE_PREFERENCE_KEY, active ? '1' : null)
    .catch(() => {})
}

export function activateLocalTaskSource(): void {
  localTaskPageStore.getState().setLocalActive(true)
  persist(true)
}

export function deactivateLocalTaskSource(): void {
  if (!localTaskPageStore.getState().localActive) {
    return
  }
  localTaskPageStore.getState().setLocalActive(false)
  persist(false)
}

/**
 * Follows the stored preference, and leaves Local when the user explicitly picks an upstream
 * source: every such path calls `openTaskPage` with a `taskSource`, which the upstream
 * `defaultTaskSource` setting never sees from us.
 */
export function bindLocalTaskSourceActivation(): () => void {
  const stopPreference = localTasksDomainStore.subscribe((state, previous) => {
    const value = state.preferences[LOCAL_ACTIVE_PREFERENCE_KEY]
    if (value !== previous.preferences[LOCAL_ACTIVE_PREFERENCE_KEY]) {
      localTaskPageStore.getState().setLocalActive(value === '1')
    }
  })
  const stopUpstreamSource = useAppStore.subscribe((state, previous) => {
    if (state.taskPageData !== previous.taskPageData && state.taskPageData.taskSource) {
      deactivateLocalTaskSource()
    }
  })
  return () => {
    stopPreference()
    stopUpstreamSource()
  }
}
