import type { LocalTaskChangeScope } from '../../../src/shared/local-tasks/local-task-types'
import { changeMessageSchema } from '../../../src/shared/local-tasks/local-task-result-schemas'
import type { RpcClient } from '../transport/rpc-client'
import { runRpcOperation } from '../transport/rpc-operation'
import { localTaskChangesUnsubscribe } from './local-tasks-operations'

// React Native's AppState, narrowed to what this reads so it also runs off the device.
type FeedAppState = {
  addEventListener: (type: 'change', listener: (state: string) => void) => { remove: () => void }
}

type LocalTasksChangeFeedArgs = {
  client: Pick<RpcClient, 'subscribe' | 'sendRequest'>
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
 * The host queues nothing for a dropped socket, so each `ready` re-reads everything; a `changed`
 * re-reads only the scopes it names, and `null` scopes mean everything. No timer backs this up:
 * a missed notice is covered by the next `ready` or by coming back to the foreground.
 */
export function startLocalTasksChangeFeed(args: LocalTasksChangeFeedArgs): () => void {
  let stopped = false
  let subscriptionId: string | null = null
  const released = new Set<string>()
  const release = (id: string): void => {
    if (released.has(id)) {
      return
    }
    released.add(id)
    void runRpcOperation(args.client, localTaskChangesUnsubscribe, { subscriptionId: id }).catch(
      () => {}
    )
  }
  const appStateSubscription = args.appState.addEventListener('change', (state) => {
    if (!stopped && state === 'active') {
      args.onFullReload()
    }
  })
  const unsubscribe = args.client.subscribe('localTasks.subscribeChanges', null, (payload) => {
    const parsed = changeMessageSchema.safeParse(payload)
    if (stopped) {
      // Why: an older transport keeps delivering after release, so a late `ready` names a
      // registration only this feed can still free.
      if (parsed.success && parsed.data.type === 'ready') {
        release(parsed.data.subscriptionId)
      }
      return
    }
    if (!parsed.success) {
      if (isRecord(payload) && payload.type === 'changed') {
        args.onFullReload()
      }
      if (isRecord(payload) && payload.type === 'error') {
        args.onLiveChange?.(false)
        args.onFullReload()
      }
      return
    }
    const message = parsed.data
    if (message.type === 'ready') {
      subscriptionId = message.subscriptionId
      args.onLiveChange?.(true)
      args.onFullReload()
      return
    }
    if (message.type === 'changed') {
      if (message.scopes === null) {
        args.onFullReload()
        return
      }
      if (message.scopes.length > 0) {
        args.onScopes(message.scopes)
      }
      return
    }
    if (message.type === 'end') {
      subscriptionId = null
      args.onLiveChange?.(false)
    }
  })
  return () => {
    if (stopped) {
      return
    }
    stopped = true
    appStateSubscription.remove()
    unsubscribe()
    if (subscriptionId) {
      release(subscriptionId)
    }
  }
}
