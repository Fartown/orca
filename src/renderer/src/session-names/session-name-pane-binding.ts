import type { TerminalPaneLayoutNode } from '../../../shared/terminal-tab-types'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { AppState } from '../store/types'
import type { AiVaultTitleRequest } from '../lib/ai-vault-tab-title-requests'

function containsLeaf(node: TerminalPaneLayoutNode, leaf: string): boolean {
  return node.type === 'leaf'
    ? node.leafId === leaf
    : containsLeaf(node.first, leaf) || containsLeaf(node.second, leaf)
}

export function sessionNamePaneWasReplaced(
  state: AppState,
  request: Pick<AiVaultTitleRequest, 'tabId' | 'paneKey' | 'agent' | 'providerSession'>
): boolean {
  const layout = state.terminalLayoutsByTabId[request.tabId]
  const leaf = request.paneKey && parsePaneKey(request.paneKey)?.leafId
  if (layout?.activeLeafId && request.paneKey !== `${request.tabId}:${layout.activeLeafId}`) {
    return true
  }
  if (layout?.root && leaf && !containsLeaf(layout.root, leaf)) {
    return true
  }
  const live = request.paneKey && state.agentStatusByPaneKey[request.paneKey]
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
