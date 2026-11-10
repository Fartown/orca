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
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { localTaskDispatcherClient } from './local-task-dispatcher-client'
import { localTasksClient } from './local-tasks-runtime-client'
import { LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY } from './local-task-preference-keys'
import {
  knownDispatcherPaneKey,
  liveDispatcherPaneKey,
  localTaskDispatcherStore,
  useLocalTaskDispatcherPane
} from './local-task-dispatcher-pane'

export {
  knownDispatcherPaneKey,
  liveDispatcherPaneKey,
  localTaskDispatcherStore,
  useLocalTaskDispatcherPane
}

export const LOCAL_TASK_DISPATCHER_OPENING_PROMPT =
  "You are the user's dispatcher in Orca. Run `orca task guide --dispatcher` now and follow it. Then tell the user in one sentence that you are ready."

const PANE_WAIT_MS = 30_000

/** Opens the floating workspace on the dispatcher's tab and puts the cursor in it. */
function dispatcherUnifiedTab(state: AppState, tabId: string | undefined) {
  return (state.unifiedTabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []).find(
    (tab) => tab.contentType === 'terminal' && tab.entityId === tabId
  )
}

/**
 * A new dispatcher opens as a chat over its terminal session; the pane's header switches it back
 * to the terminal, and that choice is kept when the dispatcher is shown again (REQ-030).
 */
function showDispatcherAsChat(paneKey: string): void {
  const app = useAppStore.getState()
  const unified = dispatcherUnifiedTab(app, parsePaneKey(paneKey)?.tabId)
  if (unified && unified.viewMode !== 'chat') {
    app.setTabViewMode(unified.id, 'chat')
  }
}

/** Names the dispatcher's tab in the floating strip, unless the person already named it. */
function nameDispatcherTab(tabId: string): void {
  const app = useAppStore.getState()
  const tab = (app.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []).find(
    (candidate) => candidate.id === tabId
  )
  if (tab && !tab.customTitle) {
    app.setTabCustomTitle(tabId, translate('localTasks.dispatcher.title', 'Dispatcher'), {
      recordInteraction: false
    })
  }
}

function revealDispatcherPane(paneKey: string): void {
  const app = useAppStore.getState()
  const tabId = parsePaneKey(paneKey)?.tabId
  if (tabId) {
    nameDispatcherTab(tabId)
  }
  app.setFloatingWorkspacePanelOpen(true)
  const unified = dispatcherUnifiedTab(app, tabId)
  if (tabId && unified) {
    app.activateTab(unified.id)
    app.setActiveTab(tabId)
    focusTerminalTabSurface(tabId)
  }
}

/** The agent the dispatcher runs: what its pane reports, else what its tab was launched with. */
export function useLocalTaskDispatcherAgent(paneKey: string | null): TuiAgent | null {
  return useAppStore((state) => {
    if (!paneKey) {
      return null
    }
    const reported = state.agentStatusByPaneKey[paneKey]?.agentType
    if (isTuiAgent(reported)) {
      return reported
    }
    const tabId = parsePaneKey(paneKey)?.tabId
    return (
      (state.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []).find((tab) => tab.id === tabId)
        ?.launchAgent ?? null
    )
  })
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
      // Why every agent: waking pastes into a terminal, and the chat view sits on that terminal.
      requestedSurface: 'terminal',
      launchSource: 'unknown',
      activate: false
    })
    const tabId = launched?.surface.kind === 'local-terminal' ? launched.surface.tabId : null
    const paneKey = tabId ? await waitForPaneKey(tabId) : null
    const registered = paneKey
      ? await localTaskDispatcherClient.register(paneKey, agent, previousPaneKey).catch(() => null)
      : null
    if (!paneKey || !registered?.ok) {
      // Why close it: an unregistered session would run the opening prompt with no conversation.
      if (tabId) {
        useAppStore.getState().closeTab(tabId)
      }
      toast.error(
        translate('localTasks.dispatcher.openFailed', 'Could not start the dispatcher session.')
      )
      return false
    }
    localTaskDispatcherStore.setState({ paneKey })
    void localTasksClient.setPreference(LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY, paneKey)
    showDispatcherAsChat(paneKey)
    revealDispatcherPane(paneKey)
    return true
  } finally {
    localTaskDispatcherStore.setState({ opening: false })
  }
}
