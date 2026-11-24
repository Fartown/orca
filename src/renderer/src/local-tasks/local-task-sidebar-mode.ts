import { LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY } from '../../../shared/local-tasks/local-task-source-visibility'
import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT } from '@/lib/workspace/navigation/scroll-to-current-workspace-status'
import { localTasksClient } from './local-tasks-runtime-client'
import {
  localTasksDomainStore,
  useLocalTasksDomain,
  type LocalTasksDomainState
} from './local-tasks-domain-store'

export const SIDEBAR_TASK_MODE_PREFERENCE_KEY = 'sidebarTaskMode'

export function selectLocalTaskSidebarMode(
  state: Pick<LocalTasksDomainState, 'preferences'>
): boolean {
  return (
    state.preferences[SIDEBAR_TASK_MODE_PREFERENCE_KEY] === '1' &&
    state.preferences[LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY] !== '1'
  )
}

export function useLocalTaskSidebarMode(): boolean {
  return useLocalTasksDomain(selectLocalTaskSidebarMode)
}

export function chooseLocalTaskSidebarMode(enabled: boolean): void {
  const value = enabled ? '1' : null
  localTasksDomainStore
    .getState()
    .applyHomePreferences({ [SIDEBAR_TASK_MODE_PREFERENCE_KEY]: value })
  if (enabled) {
    useAppStore.getState().setSidebarBody?.('workspaces')
  }
  void localTasksClient.setPreference(SIDEBAR_TASK_MODE_PREFERENCE_KEY, value).catch(() => {})
}

export function useLocalTaskSidebarRevealRedirect(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    const reveal = (): void => chooseLocalTaskSidebarMode(false)
    window.addEventListener(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, reveal)
    return () =>
      window.removeEventListener(SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT, reveal)
  }, [enabled])
}
