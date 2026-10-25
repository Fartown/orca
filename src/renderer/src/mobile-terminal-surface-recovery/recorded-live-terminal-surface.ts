import { hasClosedTerminalTabRecord } from '../../../shared/closed-terminal-tab-tombstones'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { isValidHostTerminalTabId } from '../../../shared/terminal-tab-id'
import type { LiveSurfaceAdoptionStore } from '../lib/worktree-agent-live-surface-adoption'
import type { LiveTerminalSurfaceOwner } from '../lib/worktree-live-terminal-surface-owners'

export function restoreRecordedLiveTerminalSurface(
  getState: () => LiveSurfaceAdoptionStore,
  worktreeId: string,
  recorded: LiveTerminalSurfaceOwner,
  adoptExactSurface: () => boolean
): boolean {
  const pane = parsePaneKey(recorded.paneKey)
  const store = getState()
  if (
    !pane ||
    pane.tabId !== recorded.tabId ||
    !isValidHostTerminalTabId(recorded.tabId) ||
    Object.values(store.tabsByWorktree).some((tabs) =>
      tabs.some((tab) => tab.id === recorded.tabId)
    ) ||
    hasClosedTerminalTabRecord(
      store.closedTerminalTabTombstonesByTabId,
      recorded.tabId,
      worktreeId
    ) ||
    store.recentlyClosedAgentStatusTabIds?.[recorded.tabId] === true
  ) {
    return false
  }
  return adoptExactSurface()
}
