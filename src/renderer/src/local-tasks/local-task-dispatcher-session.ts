import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { createNonSecureContextUuid as newAgentLaunchRequestId } from '../../../shared/identifiers/non-secure-context-uuid'
import { launchLocalTaskAgentTab } from './local-task-agent-tab-launch'
import { findActiveRuntimeTerminal } from '@/lib/agent-session/messaging/terminal/active-agent-note-target'
import { activateTerminalTabOnOwner } from '@/lib/workspace/tabs/terminal-tab-owner-activation'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/rpc/compatibility/runtime-capability-proof'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { makePaneKey, parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'
import { LOCAL_TASKS_DISPATCHER_HOST_CAPABILITY } from '../../../shared/local-tasks/local-tasks-capability'
import { localTaskDispatcherClientFor } from './local-task-dispatcher-client'
import { localTaskEndpointEnvironmentId, localTaskEndpointTarget } from './local-task-endpoints'
import {
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch,
  isLocalTaskDispatcherSourceCurrent,
  selectLocalTaskDispatcherEndpoint,
  applyLocalTaskDispatcherPreferences,
  getLocalTaskDispatcherPreferences
} from './local-task-dispatcher-source'
import {
  knownDispatcherPaneKey,
  knownDispatcherWorktreeId,
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

import {
  revealDispatcherPane,
  showDispatcherInitialView
} from './local-task-dispatcher-presentation'
export {
  bindLocalTaskDispatcherPresentation,
  dispatcherNeedsStartupTerminal,
  useLocalTaskDispatcherAgent
} from './local-task-dispatcher-presentation'
export { getLocalTaskDispatcherSendArgs } from './local-task-dispatcher-send'

export const LOCAL_TASK_DISPATCHER_OPENING_PROMPT =
  "You are the user's dispatcher in Orca. Run `orca task guide --dispatcher` now and follow it. Then tell the user in one sentence that you are ready."
const PANE_WAIT_MS = 30_000

function firstLeafPaneKey(state: AppState, tabId: string): string | null {
  const layout = state.terminalLayoutsByTabId[tabId]
  const leafId = layout?.activeLeafId ?? (layout?.root?.type === 'leaf' ? layout.root.leafId : null)
  return leafId ? makePaneKey(tabId, leafId) : null
}

function waitForPaneKey(
  tabId: string,
  current: () => boolean,
  remembered = false
): Promise<string | null> {
  const read = (state: AppState): string | null =>
    remembered ? liveDispatcherPaneKey(state) : firstLeafPaneKey(state, tabId)
  const found = read(useAppStore.getState())
  if (found) {
    return Promise.resolve(current() ? found : null)
  }
  return new Promise((resolve) => {
    const finish = (value: string | null): void => {
      clearTimeout(timeout)
      unsubscribe()
      resolve(value)
    }
    const timeout = setTimeout(() => finish(null), PANE_WAIT_MS)
    const unsubscribe = useAppStore.subscribe((state) => {
      if (!current()) {
        finish(null)
      } else {
        const key = read(state)
        if (key) {
          finish(key)
        }
      }
    })
  })
}

export async function openLocalTaskDispatcher(
  agent: TuiAgent,
  endpoint = getLocalTaskDispatcherEndpoint()
): Promise<boolean> {
  if (getLocalTaskDispatcherEndpoint() !== endpoint) {
    selectLocalTaskDispatcherEndpoint(endpoint)
  }
  const epoch = getLocalTaskDispatcherEpoch()
  const current = (): boolean => isLocalTaskDispatcherSourceCurrent(endpoint, epoch)
  if (!current()) {
    return false
  }
  const livePane = liveDispatcherPaneKey()
  if (livePane) {
    return revealDispatcherPane(livePane, knownDispatcherWorktreeId(endpoint)!, endpoint)
  }
  if (localTaskDispatcherStore.getState().opening) {
    return false
  }
  localTaskDispatcherStore.setState({ opening: true })
  const client = localTaskDispatcherClientFor(endpoint)
  try {
    const environmentId = localTaskEndpointEnvironmentId(endpoint)
    if (
      environmentId &&
      !(await runtimeEnvironmentSupportsCapability(
        environmentId,
        LOCAL_TASKS_DISPATCHER_HOST_CAPABILITY
      ))
    ) {
      if (current()) {
        toast.error(
          translate(
            'localTasks.dispatcher.hostUpgrade',
            'Update Orca on this host to run the dispatcher.'
          )
        )
      }
      return false
    }
    if (!current()) {
      return false
    }
    if (environmentId) {
      const preferences = await client.readPreferences()
      if (!current()) {
        return false
      }
      applyLocalTaskDispatcherPreferences(endpoint, preferences)
      await useAppStore
        .getState()
        .fetchProjectGroups({ runtimeEnvironmentId: environmentId, throwOnError: true })
      if (!current()) {
        return false
      }
      await useAppStore
        .getState()
        .fetchFolderWorkspaces({ runtimeEnvironmentId: environmentId, throwOnError: true })
      if (!current()) {
        return false
      }
    }
    const previousPaneKey = knownDispatcherPaneKey(endpoint)
    let worktreeId = knownDispatcherWorktreeId(endpoint)
    if (previousPaneKey && worktreeId) {
      const previous = parsePaneKey(previousPaneKey)
      if (!previous) {
        return false
      }
      const terminal = await findActiveRuntimeTerminal(
        localTaskEndpointTarget(endpoint),
        worktreeId,
        { tabId: previous.tabId, leafId: previous.leafId },
        PANE_WAIT_MS
      )
      if (!current()) {
        return false
      }
      if (terminal) {
        if (!revealDispatcherPane(previousPaneKey, worktreeId, endpoint) && environmentId) {
          activateTerminalTabOnOwner(worktreeId, previous.tabId, previous.leafId, environmentId)
        }
        const restored = await waitForPaneKey(previous.tabId, current, true)
        return Boolean(restored && revealDispatcherPane(restored, worktreeId, endpoint))
      }
    }
    if (environmentId) {
      const prepared = await client.prepareWorkspace()
      if (!current() || !prepared.ok) {
        return false
      }
      worktreeId = prepared.worktreeId
      await useAppStore
        .getState()
        .fetchProjectGroups({ runtimeEnvironmentId: environmentId, throwOnError: true })
      if (!current()) {
        return false
      }
      await useAppStore
        .getState()
        .fetchFolderWorkspaces({ runtimeEnvironmentId: environmentId, throwOnError: true })
      if (!current()) {
        return false
      }
    }
    if (!worktreeId) {
      return false
    }
    localTaskDispatcherStore.setState({ worktreeId })
    if (endpoint === 'local') {
      useAppStore.getState().setFloatingWorkspacePanelOpen(true)
    }
    const launched = launchLocalTaskAgentTab({
      requestId: newAgentLaunchRequestId(),
      agent,
      worktreeId,
      selectedExecutionHostId: endpoint,
      prompt: LOCAL_TASK_DISPATCHER_OPENING_PROMPT,
      promptDelivery: 'auto-submit',
      requestedSurface: 'terminal',
      launchSource: 'unknown',
      activate: false
    })
    const completion = await launched?.terminalCompletion
    const tabId =
      completion?.outcome.status === 'created'
        ? completion.tabId
        : launched?.surface.kind === 'local-terminal' && !launched.terminalCompletion
          ? launched.surface.tabId
          : null
    if (!current()) {
      return false
    }
    const paneKey = tabId ? await waitForPaneKey(tabId, current) : null
    if (!paneKey || !current()) {
      return false
    }
    const registered = await client.register(paneKey, agent, previousPaneKey, worktreeId)
    if (!current()) {
      return false
    }
    if (!registered.ok) {
      if (tabId) {
        useAppStore.getState().closeTab(tabId)
      }
      throw new Error(registered.code)
    }
    localTaskDispatcherStore.setState({ paneKey, worktreeId })
    if (environmentId) {
      const preferences = await client.readPreferences()
      if (!current()) {
        return false
      }
      applyLocalTaskDispatcherPreferences(endpoint, {
        ...getLocalTaskDispatcherPreferences(endpoint),
        ...preferences
      })
    }
    if (!current()) {
      return false
    }
    showDispatcherInitialView(paneKey, worktreeId)
    return revealDispatcherPane(paneKey, worktreeId, endpoint)
  } catch {
    if (current()) {
      toast.error(
        translate('localTasks.dispatcher.openFailed', 'Could not start the dispatcher session.')
      )
    }
    return false
  } finally {
    if (getLocalTaskDispatcherEndpoint() === endpoint && getLocalTaskDispatcherEpoch() === epoch) {
      localTaskDispatcherStore.setState({ opening: false })
    }
  }
}
