import type { TerminalPaneLayoutNode } from '../../../shared/workspace-layout/terminal-tab-types'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import type { AppState } from '../store/types'
import type { AiVaultTitleRequest } from '../lib/agent-session/history/title-sync/ai-vault-tab-title-requests'
import type { AgentType } from '../../../shared/agent-status/contracts/agent-status-types'

function containsLeaf(node: TerminalPaneLayoutNode, leaf: string): boolean {
  return node.type === 'leaf'
    ? node.leafId === leaf
    : containsLeaf(node.first, leaf) || containsLeaf(node.second, leaf)
}

export function sessionNamePaneWasReplaced(
  state: AppState,
  request: Pick<AiVaultTitleRequest, 'tabId' | 'paneKey' | 'providerSession'> & {
    agent: AgentType
  },
  requireFocusedPane = true
): boolean {
  const layout = state.terminalLayoutsByTabId[request.tabId]
  const leaf = request.paneKey && parsePaneKey(request.paneKey)?.leafId
  if (
    requireFocusedPane &&
    layout?.activeLeafId &&
    request.paneKey !== `${request.tabId}:${layout.activeLeafId}`
  ) {
    return true
  }
  if (layout?.root && leaf && !containsLeaf(layout.root, leaf)) {
    return true
  }
  const live = request.paneKey && state.agentStatusByPaneKey.get(request.paneKey)
  return Boolean(
    live &&
    live.agentType &&
    live.agentType !== 'unknown' &&
    live.providerSession?.id &&
    (live.agentType !== request.agent || live.providerSession.id !== request.providerSession.id)
  )
}

export function sessionNamePaneIsAmbiguous(state: AppState, tabId: string): boolean {
  const layout = state.terminalLayoutsByTabId[tabId]
  return layout?.root?.type === 'split' && !layout.activeLeafId
}
