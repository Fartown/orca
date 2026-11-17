import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { fallbackParkedPaneCandidates } from '../components/terminal-pane/terminal-parked-watcher-reconciliation'

export function shouldRevealRestoredTerminal(
  tab: TerminalTab,
  paneKey: string,
  entry: AgentStatusEntry | undefined,
  state: Parameters<typeof fallbackParkedPaneCandidates>[1]
): boolean {
  if (
    tab.viewMode !== 'chat' ||
    entry?.paneKey !== paneKey ||
    entry.restoredUnconfirmed !== true ||
    entry.providerSession
  ) {
    return false
  }
  const target = parsePaneKey(paneKey)
  return Boolean(
    target?.tabId === tab.id &&
    fallbackParkedPaneCandidates(tab, state).find((pane) => pane.leafId === target.leafId)?.ptyId
  )
}
