import { useAppStore } from '@/store'
import { localTasksClient } from './local-tasks-runtime-client'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskPageStore } from './local-task-page-store'
import { LOCAL_ACTIVE_PREFERENCE_KEY } from './local-task-preference-keys'
import { subscribeLocalTaskAppStore } from './local-task-app-store-subscription'

function persist(active: boolean): void {
  // Why swallow: losing "last stayed on Local" only changes which source opens next time.
  void localTasksClient
    .setPreference(LOCAL_ACTIVE_PREFERENCE_KEY, active ? '1' : null)
    .catch(() => {})
}

// Why clear the upstream source: picking it again must read as a change, or Local never lets go.
function showLocalTaskSource(): void {
  const taskPageData = useAppStore.getState().taskPageData
  if (taskPageData.taskSource) {
    useAppStore.setState({ taskPageData: { ...taskPageData, taskSource: undefined } })
  }
  localTaskPageStore.getState().setLocalActive(true)
}

export function activateLocalTaskSource(): void {
  showLocalTaskSource()
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
    if (value === previous.preferences[LOCAL_ACTIVE_PREFERENCE_KEY]) {
      return
    }
    if (value === '1') {
      showLocalTaskSource()
    } else {
      localTaskPageStore.getState().setLocalActive(false)
    }
  })
  const stopUpstreamSource = subscribeLocalTaskAppStore('source activation', (state, previous) => {
    if (
      state.taskPageData.taskSource &&
      state.taskPageData.taskSource !== previous.taskPageData.taskSource
    ) {
      deactivateLocalTaskSource()
    }
  })
  return () => {
    stopPreference()
    stopUpstreamSource()
  }
}
