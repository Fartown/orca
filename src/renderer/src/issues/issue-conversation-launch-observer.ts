import { recordPreparedIssueConversationLaunchFailure } from '@/issues/issue-conversation-launch-failure'
import { registerPendingIssueConversationTab } from '@/issues/issue-conversation-pending-tab'
import type { IssueRuntimeClient } from '@/issues/issue-runtime-client'
import { useAppStore, type AppState } from '@/store'
import { CONVERSATION_LAUNCH_CLAIM_TTL_MS } from '../../../shared/issues/constants'
import type {
  ConversationLaunchPreparation,
  IssueRouteExecutionHostId
} from '../../../shared/issues/types'
import { parsePaneKey } from '../../../shared/stable-pane-id'

/** Keeps the real tab addressable until hook identity replaces launch-time evidence. */
export function observePreparedIssueConversationLocalLaunch(
  client: Pick<IssueRuntimeClient, 'mutate'>,
  preparation: ConversationLaunchPreparation,
  route: IssueRouteExecutionHostId,
  launched: { worktreeId: string; tabId: string }
): void {
  const releasePendingTab = registerPendingIssueConversationTab({
    route,
    conversationId: preparation.conversation.id,
    workspaceKey: launched.worktreeId,
    tabId: launched.tabId
  })
  let observationStopped = false
  let launchConfirmed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let unsubscribe = (): void => undefined
  const stopObserving = (): void => {
    if (observationStopped) {
      return
    }
    observationStopped = true
    unsubscribe()
  }
  const release = (): void => {
    stopObserving()
    releasePendingTab()
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  type ObservedState = Pick<
    AppState,
    'tabsByWorktree' | 'agentStatusByPaneKey' | 'sleepingAgentSessionsByPaneKey'
  >
  const inspect = (state: ObservedState, previous?: ObservedState): void => {
    if (
      !previous ||
      state.agentStatusByPaneKey !== previous.agentStatusByPaneKey ||
      state.sleepingAgentSessionsByPaneKey !== previous.sleepingAgentSessionsByPaneKey
    ) {
      const confirmedByLiveStatus = Object.values(state.agentStatusByPaneKey).some(
        (entry) =>
          Boolean(entry.providerSession) &&
          (entry.tabId ?? parsePaneKey(entry.paneKey)?.tabId) === launched.tabId
      )
      const confirmedByProviderSession = Object.values(state.sleepingAgentSessionsByPaneKey).some(
        (entry) => Boolean(entry.providerSession) && entry.tabId === launched.tabId
      )
      if (confirmedByLiveStatus || confirmedByProviderSession) {
        launchConfirmed = true
        // Why: keep tab focus available across the short renderer-to-Issue projection gap.
        stopObserving()
        return
      }
    }
    if (previous && state.tabsByWorktree === previous.tabsByWorktree) {
      return
    }
    const tabExists = (state.tabsByWorktree[launched.worktreeId] ?? []).some(
      (tab) => tab.id === launched.tabId
    )
    if (tabExists) {
      return
    }
    release()
    // Why: a remote tab disappearing is not evidence that its host-side process exited.
    if (route !== 'local') {
      return
    }
    void recordPreparedIssueConversationLaunchFailure(
      client,
      preparation,
      'The terminal closed before the agent session was confirmed.'
    ).catch(() => undefined)
  }
  unsubscribe = useAppStore.subscribe(inspect)
  timer = setTimeout(() => {
    release()
    if (launchConfirmed || route !== 'local') {
      return
    }
    void recordPreparedIssueConversationLaunchFailure(
      client,
      preparation,
      'The agent session did not start before the launch timeout.'
    ).catch(() => undefined)
  }, CONVERSATION_LAUNCH_CLAIM_TTL_MS)
  inspect(useAppStore.getState())
}
