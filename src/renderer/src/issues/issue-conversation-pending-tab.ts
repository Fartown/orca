import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { issueDomainStore } from '@/issues/issues-domain-store'
import { useAppStore } from '@/store'
import type { IssueRouteExecutionHostId } from '../../../shared/issues/types'

type PendingIssueConversationTab = {
  route: IssueRouteExecutionHostId
  conversationId: string
  workspaceKey: string
  tabId: string
}

export type PendingIssueConversationTabFocusOutcome =
  | 'focused-pane'
  | 'workspace-unavailable'
  | null

const pendingTabs = new Map<string, PendingIssueConversationTab>()

export function registerPendingIssueConversationTab(
  input: PendingIssueConversationTab
): () => void {
  const key = pendingTabKey(input.route, input.conversationId)
  pendingTabs.set(key, input)
  return () => {
    if (pendingTabs.get(key) === input) {
      pendingTabs.delete(key)
    }
  }
}

export async function focusPendingIssueConversationTab(
  conversationId: string,
  route: IssueRouteExecutionHostId
): Promise<PendingIssueConversationTabFocusOutcome> {
  const key = pendingTabKey(route, conversationId)
  const pending = pendingTabs.get(key)
  if (!pending) {
    return null
  }
  const tabExists = (useAppStore.getState().tabsByWorktree[pending.workspaceKey] ?? []).some(
    (tab) => tab.id === pending.tabId
  )
  if (!tabExists) {
    pendingTabs.delete(key)
    return null
  }
  if (!(await activateWorktreeFromSidebar(pending.workspaceKey, route))) {
    return 'workspace-unavailable'
  }
  const activatedTabExists = (
    useAppStore.getState().tabsByWorktree[pending.workspaceKey] ?? []
  ).some((tab) => tab.id === pending.tabId)
  if (!activatedTabExists) {
    pendingTabs.delete(key)
    return null
  }
  activateTabAndFocusPane(pending.tabId, null)
  issueDomainStore.getState().setActiveIssueRoute(null)
  return 'focused-pane'
}

function pendingTabKey(route: IssueRouteExecutionHostId, conversationId: string): string {
  return `${route}\0${conversationId}`
}
