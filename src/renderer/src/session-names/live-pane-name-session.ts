import type {
  AgentStatusEntry,
  AgentType
} from '../../../shared/agent-status/contracts/agent-status-types'
import {
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host/execution-host'
import { normalizeExecutionHostConnectionId } from '../../../shared/session-names/runtime-host-connection-owner'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { getExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { agentPaneConversationForEntry } from '@/store/slices/agent-status/conversation/agent-pane-conversation'
import type { AppState } from '@/store/types'

/** Only a current row can use a retained pane identity for display. */
export function livePaneNameSessionId(
  state: AppState | undefined,
  entry: AgentStatusEntry,
  host: ExecutionHostId,
  tab: TerminalTab
): string | undefined {
  if (entry.providerSession) {
    return entry.providerSession.id
  }
  if (!state || entry.sessionBoundary) {
    return undefined
  }
  const conversation = agentPaneConversationForEntry(state, entry, host)
  if (conversation?.providerSession) {
    return conversation.providerSession.id
  }
  if (state.agentConversationsByPaneKey?.[entry.paneKey] && !conversation) {
    return undefined
  }
  if (!entry.worktreeId || entry.worktreeId !== tab.worktreeId) {
    return undefined
  }
  const pane = parsePaneKey(entry.paneKey)
  if (
    !pane ||
    pane.tabId !== tab.id ||
    host !== getExecutionHostIdForWorktree(state, tab.worktreeId)
  ) {
    return undefined
  }
  const root = state.terminalLayoutsByTabId?.[tab.id]?.root
  if (
    root?.type === 'leaf' &&
    root.leafId === pane.leafId &&
    tab.sessionTitleFromHost &&
    tab.aiVaultTitle &&
    tab.aiVaultTitle.agent === entry.agentType
  ) {
    return tab.aiVaultTitle.sessionId
  }
  const sleeping = state.sleepingAgentSessionsByPaneKey?.[entry.paneKey]
  const owner = parseExecutionHostId(host)
  // Legacy sleep records have no paired-environment ID. Only their own local or SSH partition can attest them.
  if (
    entry.restoredUnconfirmed &&
    sleeping &&
    sleeping.agent === entry.agentType &&
    sleeping.paneKey === entry.paneKey &&
    sleeping.worktreeId === tab.worktreeId &&
    normalizeExecutionHostConnectionId(host, sleeping.connectionId) ===
      normalizeExecutionHostConnectionId(host, entry.connectionId) &&
    ((owner?.kind === 'local' && !sleeping.connectionId) ||
      (owner?.kind === 'ssh' && owner.targetId === sleeping.connectionId))
  ) {
    return sleeping.providerSession.id
  }
  return undefined
}

export function sessionNameSlotForPane(
  tab: TerminalTab,
  agent: AgentType | null | undefined,
  sessionId?: string
) {
  const slot = tab.aiVaultTitle
  return slot && slot.agent === agent && slot.sessionId === sessionId ? slot : null
}
