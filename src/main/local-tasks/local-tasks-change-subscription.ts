import type { LocalTaskChangeMessage } from '../../shared/local-tasks/local-task-types'
import { localTasksChangeFeed, type LocalTasksChangeFeed } from './local-tasks-change-feed'
import { localTasksReadiness, type LocalTasksReadinessRegistry } from './local-tasks-readiness'

type SubscriptionRegistry = {
  registerSubscriptionCleanup(
    subscriptionId: string,
    cleanup: () => void,
    connectionId?: string
  ): void
  cleanupSubscription(subscriptionId: string): void
}

export type LocalTasksChangeStreamContext = {
  runtime: SubscriptionRegistry
  connectionId?: string
  requestId?: string
  signal?: AbortSignal
}

let anonymousSubscriptionSeq = 0

// Why keyed by the caller's request id: a client can cancel before it has seen ready.
function subscriptionKey(connectionId: string | undefined, requestId: string): string {
  return `local-tasks-changes-${connectionId ?? 'inproc'}-${requestId}`
}

export async function streamLocalTaskChanges(
  context: LocalTasksChangeStreamContext,
  emit: (message: LocalTaskChangeMessage) => void,
  feed: LocalTasksChangeFeed = localTasksChangeFeed,
  readiness: LocalTasksReadinessRegistry = localTasksReadiness
): Promise<void> {
  await readiness.whenSettled(context.signal)
  return new Promise<void>((resolve) => {
    const requestId = context.requestId ?? `anonymous-${++anonymousSubscriptionSeq}`
    const subscriptionId = subscriptionKey(context.connectionId, requestId)
    const unsubscribeFeed = feed.subscribe((notice) => emit({ type: 'changed', ...notice }))
    // Why: open, read-only and failure transitions change what every view may show.
    const unsubscribeReadiness = readiness.onChange(() =>
      emit({ type: 'changed', revision: readiness.status().revision, scopes: null })
    )
    const onAbort = (): void => context.runtime.cleanupSubscription(subscriptionId)
    context.runtime.registerSubscriptionCleanup(
      subscriptionId,
      () => {
        unsubscribeFeed()
        unsubscribeReadiness()
        context.signal?.removeEventListener('abort', onAbort)
        emit({ type: 'end' })
        resolve()
      },
      context.connectionId
    )
    // Why: local desktop subscriptions end by abort; remote ones by cleanup request or socket close.
    if (context.signal?.aborted) {
      onAbort()
      return
    }
    context.signal?.addEventListener('abort', onAbort, { once: true })
    // Why listener-first: a change landing before ready is covered by the client's ready resync.
    const status = readiness.status()
    emit({
      type: 'ready',
      subscriptionId: requestId,
      revision: status.revision,
      state: status.state
    })
  })
}

export function cancelLocalTaskChanges(
  context: Pick<LocalTasksChangeStreamContext, 'runtime' | 'connectionId'>,
  requestId: string
): { unsubscribed: true } {
  context.runtime.cleanupSubscription(subscriptionKey(context.connectionId, requestId))
  return { unsubscribed: true }
}
