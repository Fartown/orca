import type { ClaudeSessionActivity } from '../claude-session-ownership/claude-session-activity'

/** Pane-keyed caches of the session-ownership guards; they follow the hook listener's pane lifecycle. */
export type SessionOwnershipListenerCaches = {
  claudeSessionActivityByPaneKey: Map<string, ClaudeSessionActivity>
  codexTitleTaskSessionsByPaneKey: Map<string, Set<string>>
}

function paneMaps(caches: SessionOwnershipListenerCaches): Map<string, unknown>[] {
  return [caches.claudeSessionActivityByPaneKey, caches.codexTitleTaskSessionsByPaneKey]
}

export function create(): SessionOwnershipListenerCaches {
  return { claudeSessionActivityByPaneKey: new Map(), codexTitleTaskSessionsByPaneKey: new Map() }
}

export function clearPane(caches: SessionOwnershipListenerCaches, paneKey: string): void {
  for (const map of paneMaps(caches)) {
    map.delete(paneKey)
  }
}

export function movePane(
  caches: SessionOwnershipListenerCaches,
  fromPaneKey: string,
  toPaneKey: string
): void {
  for (const map of paneMaps(caches)) {
    if (map.has(fromPaneKey)) {
      map.set(toPaneKey, map.get(fromPaneKey))
      map.delete(fromPaneKey)
    }
  }
}

export function clearAll(caches: SessionOwnershipListenerCaches): void {
  for (const map of paneMaps(caches)) {
    map.clear()
  }
}
