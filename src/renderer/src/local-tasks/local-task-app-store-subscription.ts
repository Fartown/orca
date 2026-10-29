import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'

/**
 * An app store listener of this feature that can only fail itself. The store notifies every
 * listener in one loop, so a throw that escaped here would starve the listeners after it.
 */
export function subscribeLocalTaskAppStore(
  label: string,
  listener: (state: AppState, previous: AppState) => void
): () => void {
  return useAppStore.subscribe((state, previous) => {
    try {
      listener(state, previous)
    } catch (error) {
      console.error(`local tasks: ${label} failed`, error)
    }
  })
}
