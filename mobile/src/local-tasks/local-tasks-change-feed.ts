import type { LocalTaskChangeScope } from '../../../src/shared/local-tasks/local-task-types'
import type { RpcClient } from '../transport/rpc-client'

const KNOWN_SCOPES: ReadonlySet<string> = new Set<LocalTaskChangeScope>([
  'projects',
  'tasks',
  'events',
  'preferences'
])

// React Native's AppState, narrowed to what this reads so it also runs off the device.
type FeedAppState = {
  addEventListener: (type: 'change', listener: (state: string) => void) => { remove: () => void }
}

type LocalTasksChangeFeedArgs = {
  client: Pick<RpcClient, 'subscribe'>
  appState: FeedAppState
  /** Every view re-reads: a `ready` (first or replayed after a reconnect), or back in front. */
  onFullReload: () => void
  onScopes: (scopes: LocalTaskChangeScope[]) => void
  onLiveChange?: (live: boolean) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Follows `localTasks.subscribeChanges` while a page is open.
 *
 * The desktop queues nothing for a dropped socket, so each `ready` re-reads everything; a `changed`
 * re-reads only the scopes it names, and `null` scopes mean everything. No timer backs this up:
 * a missed notice is covered by the next `ready` or by coming back to the foreground.
 */
export function startLocalTasksChangeFeed(args: LocalTasksChangeFeedArgs): () => void {
  let stopped = false
  const appStateSubscription = args.appState.addEventListener('change', (state) => {
    if (!stopped && state === 'active') {
      args.onFullReload()
    }
  })
  const unsubscribe = args.client.subscribe('localTasks.subscribeChanges', null, (payload) => {
    if (stopped || !isRecord(payload)) {
      return
    }
    if (payload.type === 'ready') {
      args.onLiveChange?.(true)
      args.onFullReload()
      return
    }
    if (payload.type === 'changed') {
      const scopes = payload.scopes
      if (!Array.isArray(scopes)) {
        args.onFullReload()
        return
      }
      const known = scopes.filter(
        (scope): scope is LocalTaskChangeScope =>
          typeof scope === 'string' && KNOWN_SCOPES.has(scope)
      )
      // Why: a scope this build cannot name may cover anything, so it reads as "everything".
      if (known.length < scopes.length) {
        args.onFullReload()
      } else if (known.length > 0) {
        args.onScopes(known)
      }
      return
    }
    if (payload.type === 'end') {
      args.onLiveChange?.(false)
      return
    }
    if (payload.type === 'error') {
      // Why one read: a refused stream would otherwise leave the page empty until the next ready.
      args.onLiveChange?.(false)
      args.onFullReload()
    }
  })
  return () => {
    stopped = true
    appStateSubscription.remove()
    unsubscribe()
  }
}
