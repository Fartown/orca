import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IssueChangeStreamMessage } from '../../shared/issues/change-stream-schemas'
import { IssueChangeFeed, type IssueChangeNotice } from './issue-change-feed'
import { cancelIssueChanges, streamIssueChanges } from './issue-change-subscription'

afterEach(() => {
  vi.useRealTimers()
})

function registry() {
  const cleanups = new Map<string, { cleanup: () => void; connectionId?: string }>()
  return {
    cleanups,
    registerSubscriptionCleanup: (id: string, cleanup: () => void, connectionId?: string) => {
      cleanups.set(id, { cleanup, connectionId })
    },
    cleanupSubscription: (id: string) => {
      const entry = cleanups.get(id)
      cleanups.delete(id)
      entry?.cleanup()
    }
  }
}

describe('IssueChangeFeed', () => {
  it('collapses a burst into one notice and lets an all-partition change win', () => {
    vi.useFakeTimers()
    const feed = new IssueChangeFeed(250)
    const notices: IssueChangeNotice[] = []
    feed.subscribe((notice) => notices.push(notice))

    feed.publish('local')
    feed.publish('ssh:target-a')
    feed.publish('local')
    vi.advanceTimersByTime(250)
    feed.publish('local')
    feed.publish(null)
    feed.publish('ssh:target-a')
    vi.advanceTimersByTime(250)

    expect(notices).toEqual([
      { hostPartitionKeys: ['local', 'ssh:target-a'] },
      { hostPartitionKeys: null }
    ])
  })

  it('does not arm a timer while nobody listens', () => {
    vi.useFakeTimers()
    const feed = new IssueChangeFeed(250)
    feed.publish('local')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('issues.subscribeChanges stream', () => {
  it('attaches before ready, forwards notices, and ends on the client cleanup request', async () => {
    vi.useFakeTimers()
    const feed = new IssueChangeFeed(0)
    const runtime = registry()
    const messages: IssueChangeStreamMessage[] = []
    const done = streamIssueChanges(
      { runtime, connectionId: 'socket-a', requestId: 'request-1' },
      (message) => messages.push(message),
      feed
    )

    expect(messages).toEqual([{ type: 'ready', subscriptionId: 'request-1' }])
    feed.publish('local')
    vi.advanceTimersByTime(0)
    // A different socket cannot end this stream even with the same request id.
    cancelIssueChanges({ runtime, connectionId: 'socket-b' }, 'request-1')
    expect(runtime.cleanups.size).toBe(1)
    cancelIssueChanges({ runtime, connectionId: 'socket-a' }, 'request-1')
    await done

    expect(messages.slice(1)).toEqual([
      { type: 'changed', hostPartitionKeys: ['local'] },
      { type: 'end' }
    ])
    feed.publish('local')
    vi.advanceTimersByTime(0)
    expect(messages).toHaveLength(3)
  })

  it('ends a local desktop stream when its IPC subscription aborts', async () => {
    const runtime = registry()
    const controller = new AbortController()
    const messages: IssueChangeStreamMessage[] = []
    const done = streamIssueChanges(
      { runtime, requestId: 'desktop-1', signal: controller.signal },
      (message) => messages.push(message),
      new IssueChangeFeed(0)
    )

    controller.abort()
    await done

    expect(messages.map((message) => message.type)).toEqual(['ready', 'end'])
    expect(runtime.cleanups.size).toBe(0)
  })
})
