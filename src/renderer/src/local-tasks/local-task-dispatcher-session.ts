import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { makePaneKey, parsePaneKey } from '../../../shared/stable-pane-id'
import type { TuiAgent } from '../../../shared/tui-agent'
import { localTaskDispatcherClient } from './local-task-dispatcher-client'
import { localTasksClient } from './local-tasks-runtime-client'
import { localTasksDomainStore, useLocalTasksDomain } from './local-tasks-domain-store'
import { LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY } from './local-task-preference-keys'

export const LOCAL_TASK_DISPATCHER_OPENING_PROMPT =
  "You are the user's dispatcher in Orca. Run `orca task guide --dispatcher` now and follow it. Then tell the user in one sentence that you are ready."

type DispatcherState = { paneKey: string | null; opening: boolean }

export const localTaskDispatcherStore = createStore<DispatcherState>(() => ({
  paneKey: null,
  opening: false
}))

const PANE_WAIT_MS = 30_000

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

/** Opens the floating workspace on the dispatcher's tab and puts the cursor in it. */
function revealDispatcherPane(paneKey: string): void {
  const app = useAppStore.getState()
  const tabId = parsePaneKey(paneKey)?.tabId
  app.setFloatingWorkspacePanelOpen(true)
  const unified = (app.unifiedTabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []).find(
    (tab) => tab.contentType === 'terminal' && tab.entityId === tabId
  )
  if (tabId && unified) {
    app.activateTab(unified.id)
    app.setActiveTab(tabId)
    focusTerminalTabSurface(tabId)
  }
}

/** The dispatcher's pane as the page shows it: known once it was opened, live while its tab is. */
export function useLocalTaskDispatcherPane(): { known: boolean; live: boolean } {
  const opened = useStore(localTaskDispatcherStore, (state) => state.paneKey)
  const remembered = useLocalTasksDomain(
    (state) => state.preferences[LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY] ?? null
  )
  const paneKey = opened ?? remembered
  const live = useAppStore((state) => {
    const tabId = paneKey ? parsePaneKey(paneKey)?.tabId : undefined
    return Boolean(tabId && state.terminalLayoutsByTabId[tabId])
  })
  return { known: paneKey !== null, live }
}

function firstLeafPaneKey(state: AppState, tabId: string): string | null {
  const layout = state.terminalLayoutsByTabId[tabId]
  const leafId = layout?.activeLeafId ?? (layout?.root?.type === 'leaf' ? layout.root.leafId : null)
  return leafId ? makePaneKey(tabId, leafId) : null
}

/** Waits on the store, not a timer loop: the pane appears once the tab's layout is published. */
function waitForPaneKey(tabId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const found = firstLeafPaneKey(useAppStore.getState(), tabId)
    if (found) {
      resolve(found)
      return
    }
    const timeout = setTimeout(() => {
      unsubscribe()
      resolve(null)
    }, PANE_WAIT_MS)
    const unsubscribe = useAppStore.subscribe((state) => {
      const paneKey = firstLeafPaneKey(state, tabId)
      if (paneKey) {
        clearTimeout(timeout)
        unsubscribe()
        resolve(paneKey)
      }
    })
  })
}

/**
 * Shows the dispatcher, starting it first when its tab is gone (REQ-030). Claude runs as a terminal:
 * its structured chat goes through the Claude Agent SDK, which a claude.ai subscription may not use.
 */
export async function openLocalTaskDispatcher(agent: TuiAgent): Promise<boolean> {
  const app = useAppStore.getState()
  const livePaneKey = liveDispatcherPaneKey(app)
  if (livePaneKey) {
    revealDispatcherPane(livePaneKey)
    return true
  }
  if (localTaskDispatcherStore.getState().opening) {
    return false
  }
  localTaskDispatcherStore.setState({ opening: true })
  try {
    const previousPaneKey = knownDispatcherPaneKey()
    app.setFloatingWorkspacePanelOpen(true)
    const launched = launchAgentInNewTab({
      requestId: newAgentLaunchRequestId(),
      agent,
      worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      prompt: LOCAL_TASK_DISPATCHER_OPENING_PROMPT,
      promptDelivery: 'auto-submit',
      ...(agent === 'claude' ? { requestedSurface: 'terminal' as const } : {}),
      launchSource: 'unknown',
      activate: false
    })
    const tabId = launched?.surface.kind === 'local-terminal' ? launched.surface.tabId : null
    const paneKey = tabId ? await waitForPaneKey(tabId) : null
    if (!paneKey) {
      toast.error(
        translate('localTasks.dispatcher.openFailed', 'Could not start the dispatcher session.')
      )
      return false
    }
    const registered = await localTaskDispatcherClient.register(paneKey, agent, previousPaneKey)
    if (!registered.ok) {
      toast.error(
        translate('localTasks.dispatcher.openFailed', 'Could not start the dispatcher session.')
      )
      return false
    }
    localTaskDispatcherStore.setState({ paneKey })
    void localTasksClient.setPreference(LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY, paneKey)
    revealDispatcherPane(paneKey)
    return true
  } finally {
    localTaskDispatcherStore.setState({ opening: false })
  }
}
