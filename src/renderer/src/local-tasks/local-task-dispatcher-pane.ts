import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { localTasksDomainStore, useLocalTasksDomain } from './local-tasks-domain-store'
import { LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY } from './local-task-preference-keys'

// Why its own module: hosts mount the dispatcher's dock on every chat pane, and reading which pane
// is the dispatcher's must not load the launch path upstream panes never use.
type DispatcherState = { paneKey: string | null; opening: boolean }

export const localTaskDispatcherStore = createStore<DispatcherState>(() => ({
  paneKey: null,
  opening: false
}))

/** The pane the dispatcher last ran in, open or not; null when this library never had one. */
export function knownDispatcherPaneKey(): string | null {
  return (
    localTaskDispatcherStore.getState().paneKey ??
    localTasksDomainStore.getState().preferences[LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY] ??
    null
  )
}

/** The pane the dispatcher runs in, when its tab is still open in this window. */
export function liveDispatcherPaneKey(state: AppState = useAppStore.getState()): string | null {
  const paneKey = knownDispatcherPaneKey()
  const pane = paneKey ? parsePaneKey(paneKey) : null
  return pane && state.terminalLayoutsByTabId[pane.tabId] ? paneKey : null
}

/** The dispatcher's pane as the page shows it: known once it was opened, live while its tab is. */
export function useLocalTaskDispatcherPane(): {
  paneKey: string | null
  known: boolean
  live: boolean
} {
  const opened = useStore(localTaskDispatcherStore, (state) => state.paneKey)
  const remembered = useLocalTasksDomain(
    (state) => state.preferences[LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY] ?? null
  )
  const paneKey = opened ?? remembered
  const live = useAppStore((state) => {
    const tabId = paneKey ? parsePaneKey(paneKey)?.tabId : undefined
    return Boolean(tabId && state.terminalLayoutsByTabId[tabId])
  })
  return { paneKey, known: paneKey !== null, live }
}
