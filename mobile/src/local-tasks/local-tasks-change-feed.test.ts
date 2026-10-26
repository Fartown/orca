import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startLocalTasksChangeFeed } from './local-tasks-change-feed'

describe('the local tasks change feed', () => {
  let frame: (payload: unknown) => void
  let foreground: (state: string) => void
  const unsubscribe = vi.fn()
  const removeAppState = vi.fn()
  const onFullReload = vi.fn()
  const onScopes = vi.fn()
  let stop: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    const client = {
      subscribe: vi.fn((method: string, _params: unknown, listener: (payload: unknown) => void) => {
        expect(method).toBe('localTasks.subscribeChanges')
        frame = listener
        return unsubscribe
      })
    }
    const appState = {
      addEventListener: (_type: 'change', listener: (state: string) => void) => {
        foreground = listener
        return { remove: removeAppState }
      }
    }
    stop = startLocalTasksChangeFeed({ client, appState, onFullReload, onScopes })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-reads everything on each ready, which is also how a reconnect catches up', () => {
    frame({ type: 'ready', subscriptionId: 'r1', revision: 3, state: 'ready' })
    frame({ type: 'end' })
    frame({ type: 'ready', subscriptionId: 'r2', revision: 9, state: 'ready' })
    expect(onFullReload).toHaveBeenCalledTimes(2)
  })

  it('re-reads only the named scopes, and everything for null or a scope it does not know', () => {
    frame({ type: 'changed', revision: 4, scopes: ['tasks', 'events'] })
    expect(onScopes).toHaveBeenLastCalledWith(['tasks', 'events'])
    expect(onFullReload).not.toHaveBeenCalled()
    frame({ type: 'changed', revision: 5, scopes: null })
    frame({ type: 'changed', revision: 6, scopes: ['tasks', 'workspaces'] })
    expect(onFullReload).toHaveBeenCalledTimes(2)
  })

  it('re-reads when the app comes back to the foreground, and keeps no timer of its own', () => {
    foreground('background')
    expect(onFullReload).not.toHaveBeenCalled()
    foreground('active')
    expect(onFullReload).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops listening and releases the stream when the page closes', () => {
    stop()
    frame({ type: 'ready', subscriptionId: 'r1', revision: 1, state: 'ready' })
    foreground('active')
    expect(onFullReload).not.toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(removeAppState).toHaveBeenCalledTimes(1)
  })
})
