import { hasClosedTerminalTabRecord } from '../../../shared/closed-terminal-tab-tombstones'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { isValidHostTerminalTabId } from '../../../shared/terminal-tab-id'
import { worktreeIdsEqual } from '../../../shared/worktree/id'
import type { LiveSurfaceAdoptionStore } from '../lib/worktree-agent-live-surface-adoption'
import type { LiveTerminalSurfaceOwner } from '../lib/worktree-live-terminal-surface-owners'

export function hasCompetingRecordedTerminalBinding(
  store: LiveSurfaceAdoptionStore,
  worktreeId: string,
  terminal: { tabId: string; ptyId: string }
): boolean {
  return Object.entries(store.ptyIdsByTabId).some(([tabId, ptyIds]) => {
    if (tabId === terminal.tabId || !ptyIds.includes(terminal.ptyId)) {
      return false
    }
    const owners = Object.entries(store.tabsByWorktree).filter(([, tabs]) =>
      tabs.some((tab) => tab.id === tabId)
    )
    // The host census scopes the live process; bare IDs cached in another workspace can be stale.
    return owners.length === 0 || owners.some(([owner]) => worktreeIdsEqual(owner, worktreeId))
  })
}

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
