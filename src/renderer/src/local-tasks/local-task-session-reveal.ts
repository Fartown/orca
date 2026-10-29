import { useAppStore } from '@/store'
import { revealTerminalPane } from '@/lib/reveal-terminal-pane'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { activateStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { acknowledgeLocalTaskItemOnce } from './local-task-seen-forwarding'
import { localTasksDomainStore } from './local-tasks-domain-store'

/**
 * Shows a linked session through Orca's own navigation: the pane for a terminal, the chat tab for a
 * structured session. Ids are already this client's (`local-task-client-rows.ts`). Returns false
 * when this window cannot place it.
 */
export function revealLocalTaskSession(link: LocalTaskSessionLink): boolean {
  const { worktreeId } = link
  if (!worktreeId) {
    return false
  }
  const executionHostId = parseExecutionHostId(link.hostId)?.id ?? null
  const chatTab = (useAppStore.getState().unifiedTabsByWorktree[worktreeId] ?? []).find(
    (tab) =>
      tab.contentType === 'agent-session' &&
      (tab.id === link.tabId || (link.sessionId !== null && tab.entityId === link.sessionId))
  )
  if (chatTab) {
    if (
      activateAndRevealWorkspace(worktreeId, executionHostId ? { executionHostId } : undefined) ===
      false
    ) {
      return false
    }
    return activateStructuredAgentSessionTab({ worktreeId, tabId: chatTab.id })
  }
  const pane = link.paneKey ? parsePaneKey(link.paneKey) : null
  const tabId = pane?.tabId ?? link.tabId
  if (!tabId) {
    return false
  }
  return revealTerminalPane({ worktreeId, tabId, leafId: pane?.leafId ?? null, executionHostId })
}

/** Opening a session is seeing it: its items are marked seen in its library. */
export function acknowledgeLocalTaskSessionItems(sessionLinkId: string): void {
  const items = (localTasksDomainStore.getState().progress?.items ?? []).filter(
    (item) => item.taskSessionId === sessionLinkId
  )
  for (const item of items) {
    acknowledgeLocalTaskItemOnce(item)
  }
}

/** Reveals the session and, once shown, marks what it waited for as seen. */
export function openLocalTaskSession(link: LocalTaskSessionLink): boolean {
  if (!revealLocalTaskSession(link)) {
    return false
  }
  acknowledgeLocalTaskSessionItems(link.id)
  return true
}
