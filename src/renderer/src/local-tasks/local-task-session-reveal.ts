import { useAppStore } from '@/store'
import { revealTerminalPane } from '@/lib/reveal-terminal-pane'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { activateStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { localTaskAttentionClearsOnView } from '../../../shared/local-tasks/local-task-attention-rules'
import { acknowledgeLocalTaskItemOnce } from './local-task-seen-forwarding'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskSessionPanelStore } from './local-task-session-panel-store'
import { localTaskPageStore } from './local-task-page-store'
import { openLocalTaskPage } from './local-task-navigation'
import { resolveAutoAckTabTargets } from '@/hooks/agent-auto-ack-targets'

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

/** A confirmed visible session reads its finished turn; what it waits on stays until handled (REQ-014). */
export function acknowledgeLocalTaskSessionItems(sessionLinkId: string): void {
  const items = (localTasksDomainStore.getState().progress?.items ?? []).filter(
    (item) => item.taskSessionId === sessionLinkId && localTaskAttentionClearsOnView(item)
  )
  for (const item of items) {
    acknowledgeLocalTaskItemOnce(item)
  }
}

/** Opens the session beside its task. The mounted surface owns the seen acknowledgement. */
export function openLocalTaskSession(link: LocalTaskSessionLink): boolean {
  if (!link.worktreeId || !(link.tabId || link.paneKey || link.sessionId)) {
    return false
  }
  const state = useAppStore.getState()
  const pane = link.paneKey ? parsePaneKey(link.paneKey) : null
  const visibleTabId = pane?.tabId ?? link.tabId
  if (
    state.activeView === 'terminal' &&
    state.activeWorktreeId === link.worktreeId &&
    visibleTabId &&
    resolveAutoAckTabTargets(state).some(
      (target) => target.worktreeId === link.worktreeId && target.tabId === visibleTabId
    )
  ) {
    localTaskSessionPanelStore.getState().close()
    return revealLocalTaskSession(link)
  }
  if (state.activeView !== 'tasks' || !localTaskPageStore.getState().localActive) {
    openLocalTaskPage({ taskId: link.taskId })
  }
  localTaskPageStore.getState().setPreviewOpen(false)
  localTaskSessionPanelStore.getState().open(link)
  return true
}
