import { useStore } from 'zustand'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { structuredAgentSessionOwnerForTab } from '@/runtime/native-chat/session-ownership/structured-agent-session-owner'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/workspace/identity/floating-workspace-id'
import { LocalTaskDispatcherSessionSchema } from '../../../shared/local-tasks/local-task-dispatcher-workspace'
import { makePaneKey, parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { toWebTerminalSurfaceTabId } from '../../../shared/workspace-layout/terminal-surface-id'
import { useLocalTasksDomain } from './local-tasks-domain-store'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import type { LocalTaskEndpointKey } from './local-task-endpoints'
import {
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherPreferences,
  localTaskDispatcherStore
} from './local-task-dispatcher-source'
import {
  LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY,
  LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY
} from './local-task-preference-keys'

export { localTaskDispatcherStore } from './local-task-dispatcher-source'

function rememberedSession(endpoint: LocalTaskEndpointKey) {
  const text =
    getLocalTaskDispatcherPreferences(endpoint)[LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY]
  if (!text) {
    return null
  }
  try {
    const result = LocalTaskDispatcherSessionSchema.safeParse(JSON.parse(text))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function knownDispatcherWorktreeId(
  endpoint = getLocalTaskDispatcherEndpoint()
): string | null {
  const opened = localTaskDispatcherStore.getState()
  return (
    (opened.endpoint === endpoint ? opened.worktreeId : null) ??
    rememberedSession(endpoint)?.worktreeId ??
    (endpoint === 'local' ? FLOATING_TERMINAL_WORKTREE_ID : null)
  )
}

export function dispatcherPaneBelongsToSource(
  state: AppState,
  paneKey: string,
  endpoint = getLocalTaskDispatcherEndpoint()
): boolean {
  const pane = parsePaneKey(paneKey)
  const worktreeId = knownDispatcherWorktreeId(endpoint)
  if (!pane || !worktreeId) {
    return false
  }
  if (endpoint === 'local' && worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
    return true
  }
  const tabs = (state.unifiedTabsByWorktree[worktreeId] ?? []).filter(
    (tab) => tab.contentType === 'terminal' && tab.entityId === pane.tabId
  )
  return tabs.length === 1 && structuredAgentSessionOwnerForTab(state, tabs[0]) === endpoint
}

/** Preferences use owner IDs; resolve either of Orca's existing terminal mirror shapes. */
export function knownDispatcherPaneKey(
  endpoint = getLocalTaskDispatcherEndpoint(),
  state = useAppStore.getState()
): string | null {
  const opened = localTaskDispatcherStore.getState()
  if (opened.endpoint === endpoint && opened.paneKey) {
    return opened.paneKey
  }
  const raw =
    rememberedSession(endpoint)?.paneKey ??
    getLocalTaskDispatcherPreferences(endpoint)[LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY] ??
    null
  if (!raw || endpoint === 'local') {
    return raw
  }
  const pane = parsePaneKey(raw)
  if (!pane) {
    return null
  }
  const candidates = [pane.tabId, `${pane.tabId}::${pane.leafId}`].map((tabId) =>
    makePaneKey(toWebTerminalSurfaceTabId(tabId), pane.leafId)
  )
  return (
    candidates.find((key) => dispatcherPaneBelongsToSource(state, key, endpoint)) ?? candidates[0]
  )
}

export function liveDispatcherPaneKey(state: AppState = useAppStore.getState()): string | null {
  const endpoint = getLocalTaskDispatcherEndpoint()
  if (!isLocalTaskHostInContact(state, endpoint)) {
    return null
  }
  const key = knownDispatcherPaneKey(endpoint, state)
  const pane = key ? parsePaneKey(key) : null
  return key &&
    pane &&
    state.terminalLayoutsByTabId[pane.tabId] &&
    dispatcherPaneBelongsToSource(state, key, endpoint)
    ? key
    : null
}

export function useLocalTaskDispatcherPane(): {
  paneKey: string | null
  known: boolean
  live: boolean
} {
  useStore(localTaskDispatcherStore)
  useLocalTasksDomain((state) => state.preferences)
  const paneKey = useAppStore((state) =>
    knownDispatcherPaneKey(getLocalTaskDispatcherEndpoint(), state)
  )
  const live = useAppStore((state) => liveDispatcherPaneKey(state) !== null)
  return { paneKey, known: paneKey !== null, live }
}
