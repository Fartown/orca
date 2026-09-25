import type { IssueChangeStreamMessage } from '../../shared/issues/change-stream-schemas'
import { issueChangeFeed, type IssueChangeFeed } from './issue-change-feed'

type SubscriptionRegistry = {
  registerSubscriptionCleanup(
    subscriptionId: string,
    cleanup: () => void,
    connectionId?: string
  ): void
  cleanupSubscription(subscriptionId: string): void
}

export type IssueChangeStreamContext = {
  runtime: SubscriptionRegistry
  connectionId?: string
  requestId?: string
  signal?: AbortSignal
}

let anonymousSubscriptionSeq = 0

// Keyed by the caller's request id so a client can cancel before it has seen ready.
function subscriptionKey(connectionId: string | undefined, requestId: string): string {
  return `issues-changes-${connectionId ?? 'inproc'}-${requestId}`
}

export function streamIssueChanges(
  context: IssueChangeStreamContext,
  emit: (message: IssueChangeStreamMessage) => void,
  feed: IssueChangeFeed = issueChangeFeed
): Promise<void> {
  return new Promise<void>((resolve) => {
    const requestId = context.requestId ?? `anonymous-${++anonymousSubscriptionSeq}`
    const subscriptionId = subscriptionKey(context.connectionId, requestId)
    const unsubscribe = feed.subscribe((notice) => emit({ type: 'changed', ...notice }))
    const onAbort = (): void => context.runtime.cleanupSubscription(subscriptionId)
    context.runtime.registerSubscriptionCleanup(
      subscriptionId,
      () => {
        unsubscribe()
        context.signal?.removeEventListener('abort', onAbort)
        emit({ type: 'end' })
        resolve()
      },
      context.connectionId
    )
    // Local desktop subscriptions end by abort; remote ones by cleanup request or socket close.
    if (context.signal?.aborted) {
      onAbort()
      return
    }
    context.signal?.addEventListener('abort', onAbort, { once: true })
    // Listener-first: a change landing before ready is covered by the client's ready resync.
    emit({ type: 'ready', subscriptionId: requestId })
  })
}

export function cancelIssueChanges(
  context: Pick<IssueChangeStreamContext, 'runtime' | 'connectionId'>,
  requestId: string
): { unsubscribed: true } {
  context.runtime.cleanupSubscription(subscriptionKey(context.connectionId, requestId))
  return { unsubscribed: true }
}
