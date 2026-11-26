import type {
  AgentStatusEntry,
  AgentType
} from '../../../shared/agent-status/contracts/agent-status-types'
import type { ExecutionHostId } from '../../../shared/execution-host/execution-host'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import { agentPaneConversationForEntry } from '@/store/slices/agent-status/conversation/agent-pane-conversation'
import type { AppState } from '@/store/types'

/** Only a current row can use a retained pane identity for display. */
export function livePaneNameSession(
  state: AppState | undefined,
  entry: AgentStatusEntry,
  host: ExecutionHostId
) {
  return (
    entry.providerSession ??
    (state && !entry.sessionBoundary
      ? agentPaneConversationForEntry(state, entry, host)?.providerSession
      : undefined)
  )
}

export function sessionNameSlotForPane(
  tab: TerminalTab,
  agent: AgentType | null | undefined,
  sessionId?: string
) {
  const slot = tab.aiVaultTitle
  return slot && slot.agent === agent && slot.sessionId === sessionId ? slot : null
}
