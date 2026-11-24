import type { ClaudeSessionActivity } from '../claude-session-ownership/claude-session-activity'
import { movePaneScopedMapEntries } from '../agent-hook-listener/pane-scoped-cache-entries'

/**
 * Pane-keyed caches of the session-ownership guards; they follow the hook listener's pane lifecycle.
 * The listener's own lead-session owner map rides along so the guards cost no lines in listener-state.
 */
export type SessionOwnershipListenerCaches = {
  /** Lead session_id changes retire replaced-conversation claims even without SessionStart (/clear/relaunch/resume). */
  claudeSessionOwnerByPaneKey: Map<string, string>
  claudeSessionActivityByPaneKey: Map<string, ClaudeSessionActivity>
  codexTitleTaskSessionsByPaneKey: Map<string, Set<string>>
}

function paneMaps(caches: SessionOwnershipListenerCaches): Map<string, unknown>[] {
  return [caches.claudeSessionActivityByPaneKey, caches.codexTitleTaskSessionsByPaneKey]
}

export function create(): SessionOwnershipListenerCaches {
  return {
    claudeSessionOwnerByPaneKey: new Map(),
    claudeSessionActivityByPaneKey: new Map(),
    codexTitleTaskSessionsByPaneKey: new Map()
  }
}

export function clearPane(state: SessionOwnershipListenerCaches, paneKey: string): void {
  state.claudeSessionOwnerByPaneKey.delete(paneKey)
  for (const map of paneMaps(state)) {
    map.delete(paneKey)
  }
}

export function movePane(
  state: SessionOwnershipListenerCaches,
  fromPaneKey: string,
  toPaneKey: string
): void {
  movePaneScopedMapEntries(state.claudeSessionOwnerByPaneKey, fromPaneKey, toPaneKey)
  for (const map of paneMaps(state)) {
    if (map.has(fromPaneKey)) {
      map.set(toPaneKey, map.get(fromPaneKey))
      map.delete(fromPaneKey)
    }
  }
}

export function clearAll(state: SessionOwnershipListenerCaches): void {
  state.claudeSessionOwnerByPaneKey.clear()
  for (const map of paneMaps(state)) {
    map.clear()
  }
}
