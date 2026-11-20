import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import {
  collectLayoutLeafIdsInOrder,
  resolveRootlessTerminalLayoutLeafId
} from '../../../shared/workspace-layout/terminal-topology/terminal-pane-tree'
import type { useAppStore } from '@/store'

type RestoredTerminalLayoutState = {
  terminalLayoutsByTabId: ReturnType<typeof useAppStore.getState>['terminalLayoutsByTabId']
}

// Why: mirrors the parked-pane fallback (upstream keeps it private) so a leaf only counts when its layout still names a PTY.
function restoredLeafPtyId(
  tab: Pick<TerminalTab, 'id' | 'ptyId'>,
  leafId: string,
  state: RestoredTerminalLayoutState
): string | null {
  const layout = state.terminalLayoutsByTabId[tab.id]
  const rootLeafIds = collectLayoutLeafIdsInOrder(layout?.root)
  const rootlessLeafId = layout ? resolveRootlessTerminalLayoutLeafId(layout) : null
  const leafIds =
    rootLeafIds.length > 0 ? rootLeafIds : rootlessLeafId !== null ? [rootlessLeafId] : []
  if (!leafIds.includes(leafId)) {
    return null
  }
  return layout?.ptyIdsByLeafId?.[leafId] ?? (leafIds.length === 1 ? tab.ptyId : null)
}

export function shouldRevealRestoredTerminal(
  tab: TerminalTab,
  paneKey: string,
  entry: AgentStatusEntry | undefined,
  state: RestoredTerminalLayoutState
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
  return Boolean(target?.tabId === tab.id && restoredLeafPtyId(tab, target.leafId, state))
}
