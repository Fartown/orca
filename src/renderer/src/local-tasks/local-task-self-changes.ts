import type { LocalTaskChangeScope } from '../../../shared/local-tasks/local-task-types'

/** `null` after a resync, when every scope may have changed. */
type SelfChangeListener = (scopes: readonly LocalTaskChangeScope[] | null) => void

const listeners = new Set<SelfChangeListener>()

/**
 * Change notices from this window's own library, for readers the synced store does not hold
 * (the dispatcher's proposals and inbox). Follows the host's notices only; nothing here polls.
 */
export function subscribeSelfLocalTaskChanges(listener: SelfChangeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishSelfLocalTaskChanges(scopes: readonly LocalTaskChangeScope[] | null): void {
  for (const listener of listeners) {
    try {
      listener(scopes)
    } catch (error) {
      console.error('local tasks: a change listener failed', error)
    }
  }
}
