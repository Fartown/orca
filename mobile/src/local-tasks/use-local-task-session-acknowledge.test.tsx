import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  LocalTaskAttentionItem,
  LocalTaskProgressSnapshot
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { RpcClient } from '../transport/rpc-client'
import { useAcknowledgeOpenSession } from './use-local-task-session-acknowledge'

const screen = vi.hoisted(() => {
  const state: {
    focused: boolean
    appState: string
    onAppState: ((next: string) => void) | null
  } = { focused: true, appState: 'active', onAppState: null }
  return state
})
// Focus events as the stack sends them: the effect runs on focus, its cleanup on blur.
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react')
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = screen.focused
      useEffect(() => (focused ? effect() : undefined), [effect, focused])
    }
  }
})
vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return screen.appState
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      screen.onAppState = listener
      return { remove: () => {} }
    }
  }
}))

function item(key: string, since: number, taskSessionId = 's1'): LocalTaskAttentionItem {
  return {
    key,
    taskId: 't1',
    taskSessionId,
    kind: 'approval',
    agent: 'claude',
    lastMessage: null,
    since,
    replyable: false
  }
}

function snapshot(items: LocalTaskAttentionItem[]): LocalTaskProgressSnapshot {
  return { observedAt: 0, sessions: [], items }
}

const acknowledged: string[] = []
const client: RpcClient = {
  sendRequest: async (method, params) => {
    if (
      method === 'localTasks.attention.acknowledge' &&
      typeof params === 'object' &&
      params !== null &&
      'itemKey' in params &&
      typeof params.itemKey === 'string'
    ) {
      acknowledged.push(params.itemKey)
    }
    return { id: method, ok: true, result: { ok: true } }
  },
  subscribe: () => () => {},
  updateTerminalSubscriptionViewport: () => {},
  getState: () => 'connected',
  getReconnectAttempt: () => 0,
  getLastConnectedAt: () => null,
  onStateChange: () => () => {},
  notifyForeground: () => {},
  close: () => {}
}

function Probe(props: { taskSessionId: string; progress: LocalTaskProgressSnapshot }) {
  useAcknowledgeOpenSession(client, props.taskSessionId, props.progress)
  return null
}

let renderer: ReactTestRenderer | null = null
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  acknowledged.length = 0
  Object.assign(screen, { focused: true, appState: 'active', onAppState: null })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  vi.useRealTimers()
})

async function show(progress: LocalTaskProgressSnapshot, taskSessionId = 's1') {
  const element = createElement(Probe, { taskSessionId, progress })
  await act(async () => {
    if (renderer) {
      renderer.update(element)
    } else {
      renderer = create(element)
    }
  })
}

describe('opening a linked session marks its "Needs you" items seen', () => {
  it('marks nothing while a screen pushed over the session keeps it mounted', async () => {
    vi.setSystemTime(1_000)
    screen.focused = false
    await show(snapshot([item('a', 500)]))
    expect(acknowledged).toEqual([])

    screen.focused = true
    await show(snapshot([item('a', 500), item('other', 500, 's2')]))
    expect(acknowledged).toEqual(['a'])
  })

  it('leaves an item that appears after the session came into view for the next time it does', async () => {
    vi.setSystemTime(1_000)
    await show(snapshot([item('a', 500)]))
    vi.setSystemTime(2_000)
    await show(snapshot([item('a', 500), item('b', 1_500)]))
    expect(acknowledged).toEqual(['a'])

    await act(async () => screen.onAppState?.('background'))
    vi.setSystemTime(3_000)
    await act(async () => screen.onAppState?.('active'))
    expect(acknowledged).toEqual(['a', 'b'])
  })

  it('counts switching to another session tab on the same screen as coming into view', async () => {
    vi.setSystemTime(1_000)
    await show(snapshot([]))
    const waiting = snapshot([item('s2-old', 1_500, 's2')])
    vi.setSystemTime(2_000)
    await show(waiting)
    expect(acknowledged).toEqual([])

    await show(waiting, 's2')
    expect(acknowledged).toEqual(['s2-old'])
    vi.setSystemTime(3_000)
    await show(snapshot([item('s2-old', 1_500, 's2'), item('s2-new', 2_500, 's2')]), 's2')
    expect(acknowledged).toEqual(['s2-old'])
  })

  it('marks nothing while the app is in the background', async () => {
    vi.setSystemTime(1_000)
    screen.appState = 'background'
    await show(snapshot([item('a', 500)]))
    expect(acknowledged).toEqual([])
  })
})
