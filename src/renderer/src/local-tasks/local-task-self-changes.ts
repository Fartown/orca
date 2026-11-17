import type { LocalTaskChangeScope } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskEndpointKey } from './local-task-endpoints'

/** `null` after a resync, when every scope may have changed. */
type SelfChangeListener = (scopes: readonly LocalTaskChangeScope[] | null) => void

const listeners = new Map<LocalTaskEndpointKey, Set<SelfChangeListener>>()

export function subscribeLocalTaskChanges(
  endpoint: LocalTaskEndpointKey,
  listener: SelfChangeListener
): () => void {
  const group = listeners.get(endpoint) ?? new Set<SelfChangeListener>()
  listeners.set(endpoint, group)
  group.add(listener)
  return () => {
    group.delete(listener)
    if (group.size === 0) {
      listeners.delete(endpoint)
    }
  }
}

/**
 * Change notices from this window's own library, for readers the synced store does not hold
 * (the dispatcher's proposals and inbox). Follows the host's notices only; nothing here polls.
 */
export function subscribeSelfLocalTaskChanges(listener: SelfChangeListener): () => void {
  return subscribeLocalTaskChanges('local', listener)
}

export function publishSelfLocalTaskChanges(scopes: readonly LocalTaskChangeScope[] | null): void {
  publishLocalTaskChanges('local', scopes)
}

export function publishLocalTaskChanges(
  endpoint: LocalTaskEndpointKey,
  scopes: readonly LocalTaskChangeScope[] | null
): void {
  for (const listener of listeners.get(endpoint) ?? []) {
    try {
      listener(scopes)
    } catch (error) {
      console.error('local tasks: a change listener failed', error)
    }
  }
}
