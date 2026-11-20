import { translate } from '@/i18n/i18n'
import { focusTerminalTabSurface } from '@/components/terminal-pane/input/focus/focus-terminal-tab-surface'
import { revealTerminalPane } from '@/lib/workspace/activation/reveal-terminal-pane'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/workspace/identity/floating-workspace-id'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'
import { isTuiAgent } from '../../../shared/agent-launch/catalog/tui-agent-config'
import type { LocalTaskEndpointKey } from './local-task-endpoints'
import {
  localTaskDispatcherStore,
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch
} from './local-task-dispatcher-source'
import { localTasksDomainStore } from './local-tasks-domain-store'
import {
  knownDispatcherPaneKey,
  knownDispatcherWorktreeId,
  liveDispatcherPaneKey,
  dispatcherPaneBelongsToSource
} from './local-task-dispatcher-pane'

function dispatcherUnifiedTab(state: AppState, paneKey: string, worktreeId: string) {
  const tabId = parsePaneKey(paneKey)?.tabId
  return (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (tab) => tab.contentType === 'terminal' && tab.entityId === tabId
  )
}

export function dispatcherNeedsStartupTerminal(state: AppState, paneKey: string): boolean {
  const status = state.agentStatusByPaneKey.get(paneKey)
  return Boolean(
    status &&
    (status.state === 'waiting' || status.state === 'blocked') &&
    !status.providerSession &&
    !status.interactivePrompt
  )
}

export function showDispatcherInitialView(paneKey: string, worktreeId: string): void {
  const app = useAppStore.getState()
  const tab = dispatcherUnifiedTab(app, paneKey, worktreeId)
  if (tab) {
    app.setTabViewMode(tab.id, dispatcherNeedsStartupTerminal(app, paneKey) ? 'terminal' : 'chat')
  }
}

/** A pre-hook CLI prompt has no chat transcript; show the same terminal once that wait arrives. */
export function bindLocalTaskDispatcherPresentation(): () => void {
  let handledWait: string | null = null
  const update = (state: AppState): void => {
    const paneKey = liveDispatcherPaneKey(state)
    const worktreeId = knownDispatcherWorktreeId()
    if (!paneKey || !worktreeId || !dispatcherNeedsStartupTerminal(state, paneKey)) {
      handledWait = null
      return
    }
    const wait = `${getLocalTaskDispatcherEndpoint()}:${getLocalTaskDispatcherEpoch()}:${paneKey}:${state.agentStatusByPaneKey.get(paneKey)?.stateStartedAt}`
    if (wait === handledWait) {
      return
    }
    const tab = dispatcherUnifiedTab(state, paneKey, worktreeId)
    if (!tab) {
      return
    }
    handledWait = wait
    if (tab.viewMode === 'chat') {
      state.setTabViewMode(tab.id, 'terminal')
    }
  }
  update(useAppStore.getState())
  const stopApp = useAppStore.subscribe((state, previous) => {
    if (
      state.agentStatusByPaneKey !== previous.agentStatusByPaneKey ||
      state.terminalLayoutsByTabId !== previous.terminalLayoutsByTabId ||
      state.unifiedTabsByWorktree !== previous.unifiedTabsByWorktree
    ) {
      update(state)
    }
  })
  const stopSource = localTaskDispatcherStore.subscribe(() => update(useAppStore.getState()))
  const stopPreferences = localTasksDomainStore.subscribe((state, previous) => {
    if (state.preferences !== previous.preferences) {
      update(useAppStore.getState())
    }
  })
  return () => {
    stopApp()
    stopSource()
    stopPreferences()
  }
}

export function revealDispatcherPane(
  paneKey: string,
  worktreeId: string,
  endpoint: LocalTaskEndpointKey
): boolean {
  const app = useAppStore.getState()
  const pane = parsePaneKey(paneKey)
  if (!pane || !dispatcherPaneBelongsToSource(app, paneKey, endpoint)) {
    return false
  }
  const tab = (app.tabsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === pane.tabId
  )
  if (tab && !tab.customTitle) {
    app.setTabCustomTitle(pane.tabId, translate('localTasks.dispatcher.title', 'Dispatcher'), {
      recordInteraction: false
    })
  }
  if (dispatcherNeedsStartupTerminal(app, paneKey)) {
    const unified = dispatcherUnifiedTab(app, paneKey, worktreeId)
    if (unified) {
      app.setTabViewMode(unified.id, 'terminal')
    }
  }
  if (worktreeId !== FLOATING_TERMINAL_WORKTREE_ID) {
    const revealed = revealTerminalPane({
      worktreeId,
      tabId: pane.tabId,
      leafId: pane.leafId,
      executionHostId: endpoint
    })
    const localPane = knownDispatcherPaneKey('local')
    const localTabId = localPane ? parsePaneKey(localPane)?.tabId : undefined
    if (
      revealed &&
      app.floatingWorkspacePanelOpen &&
      localTabId &&
      app.activeTabIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID] === localTabId
    ) {
      app.setFloatingWorkspacePanelOpen(false)
    }
    return revealed
  }
  app.setFloatingWorkspacePanelOpen(true)
  const unified = dispatcherUnifiedTab(app, paneKey, worktreeId)
  if (!unified) {
    return false
  }
  app.activateTab(unified.id)
  app.setActiveTab(pane.tabId)
  focusTerminalTabSurface(pane.tabId)
  return true
}

export function useLocalTaskDispatcherAgent(paneKey: string | null): TuiAgent | null {
  return useAppStore((state) => {
    if (!paneKey) {
      return null
    }
    const reported = state.agentStatusByPaneKey.get(paneKey)?.agentType
    if (isTuiAgent(reported)) {
      return reported
    }
    return (
      (state.tabsByWorktree[knownDispatcherWorktreeId() ?? ''] ?? []).find(
        (tab) => tab.id === parsePaneKey(paneKey)?.tabId
      )?.launchAgent ?? null
    )
  })
}
