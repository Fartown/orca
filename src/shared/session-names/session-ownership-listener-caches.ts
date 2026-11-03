import type { ClaudeSessionActivity } from '../claude-session-ownership/claude-session-activity'
import { movePaneScopedMapEntries } from '../agent-hook-listener/pane-scoped-cache-entries'

/** Pane-keyed caches of the session-ownership guards; they follow the hook listener's pane lifecycle. */
export type SessionOwnershipListenerCaches = {
  claudeSessionActivityByPaneKey: Map<string, ClaudeSessionActivity>
  codexTitleTaskSessionsByPaneKey: Map<string, Set<string>>
}

/**
 * The listener's own lead-session owner map rides along: listener-state hands its lifecycle line for
 * that map to these functions, so the guards cost no extra lines in that upstream file.
 */
type ListenerSessionOwnership = SessionOwnershipListenerCaches & {
  claudeSessionOwnerByPaneKey: Map<string, string>
}

function paneMaps(caches: SessionOwnershipListenerCaches): Map<string, unknown>[] {
  return [caches.claudeSessionActivityByPaneKey, caches.codexTitleTaskSessionsByPaneKey]
}

export function create(): SessionOwnershipListenerCaches {
  return { claudeSessionActivityByPaneKey: new Map(), codexTitleTaskSessionsByPaneKey: new Map() }
}

export function clearPane(state: ListenerSessionOwnership, paneKey: string): void {
  state.claudeSessionOwnerByPaneKey.delete(paneKey)
  for (const map of paneMaps(state)) {
    map.delete(paneKey)
  }
}

export function movePane(
  state: ListenerSessionOwnership,
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

export function clearAll(state: ListenerSessionOwnership): void {
  state.claudeSessionOwnerByPaneKey.clear()
  for (const map of paneMaps(state)) {
    map.clear()
  }
}
