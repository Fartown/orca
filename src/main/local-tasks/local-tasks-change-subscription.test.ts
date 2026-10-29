import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalTasksChangeFeed } from './local-tasks-change-feed'
import { cancelLocalTaskChanges, streamLocalTaskChanges } from './local-tasks-change-subscription'
import { LocalTasksReadinessRegistry } from './local-tasks-readiness'

class SubscriptionRegistry {
  readonly cleanups = new Map<string, () => void>()
  readonly connections = new Map<string, Set<string>>()
  registerSubscriptionCleanup(id: string, cleanup: () => void, connectionId?: string): void {
    this.cleanups.set(id, cleanup)
    if (connectionId) {
      const keys = this.connections.get(connectionId) ?? new Set<string>()
      keys.add(id)
      this.connections.set(connectionId, keys)
    }
  }
  cleanupSubscription(id: string): void {
    this.cleanups.get(id)?.()
    this.cleanups.delete(id)
  }
  disconnect(connectionId: string): void {
    for (const id of this.connections.get(connectionId) ?? []) {
      this.cleanupSubscription(id)
    }
    this.connections.delete(connectionId)
  }
}

afterEach(() => vi.useRealTimers())

describe('local task change subscription', () => {
  it('coalesces for 100ms, makes null scopes dominant, and drops notices without a listener', () => {
    vi.useFakeTimers()
    const feed = new LocalTasksChangeFeed()
    feed.publish(1, ['tasks'])
    const notices: unknown[] = []
    const stop = feed.subscribe((notice) => notices.push(notice))
    feed.publish(2, ['tasks'])
    feed.publish(3, ['projects'])
    feed.publish(4, null)
    vi.advanceTimersByTime(99)
    expect(notices).toEqual([])
    vi.advanceTimersByTime(1)
    expect(notices).toEqual([{ revision: 4, scopes: null }])
    stop()
    feed.publish(5, ['events'])
    vi.advanceTimersByTime(100)
    expect(notices).toHaveLength(1)
  })

  it('ends on abort and cancels only the specified connection and request', async () => {
    const registry = new SubscriptionRegistry()
    const feed = new LocalTasksChangeFeed(0)
    const readiness = new LocalTasksReadinessRegistry()
    const abort = new AbortController()
    const first: string[] = []
    const second: string[] = []
    const firstDone = streamLocalTaskChanges(
      { runtime: registry, connectionId: 'one', requestId: 'r', signal: abort.signal },
      (message) => first.push(message.type),
      feed,
      readiness
    )
    const secondDone = streamLocalTaskChanges(
      { runtime: registry, connectionId: 'two', requestId: 'r' },
      (message) => second.push(message.type),
      feed,
      readiness
    )
    await Promise.resolve()
    expect(first).toEqual(['ready'])
    expect(second).toEqual(['ready'])
    abort.abort()
    await firstDone
    expect(first).toEqual(['ready', 'end'])
    expect(second).toEqual(['ready'])
    cancelLocalTaskChanges({ runtime: registry, connectionId: 'two' }, 'r')
    await secondDone
    expect(second).toEqual(['ready', 'end'])
    expect(registry.cleanups.size).toBe(0)
  })

  it('emits null scopes for readiness changes and ends when a connection closes', async () => {
    const registry = new SubscriptionRegistry()
    const readiness = new LocalTasksReadinessRegistry()
    const messages: unknown[] = []
    const done = streamLocalTaskChanges(
      { runtime: registry, connectionId: 'remote', requestId: 'status' },
      (message) => messages.push(message),
      new LocalTasksChangeFeed(),
      readiness
    )
    await Promise.resolve()
    readiness.setUnavailable('test')
    expect(messages).toContainEqual({ type: 'changed', revision: 0, scopes: null })
    registry.disconnect('remote')
    await done
    expect(messages.at(-1)).toEqual({ type: 'end' })
  })
})
