import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, HostProfile, RpcResponse } from '../transport/types'

type HomeEnv = {
  catalog: HostProfile[]
  clients: { hostId: string; client: RpcClient }[]
  states: Record<string, ConnectionState>
}

const env = vi.hoisted((): HomeEnv => ({ catalog: [], clients: [], states: {} }))

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked' }))
vi.mock('lucide-react-native', () => ({
  ChevronRight: 'ChevronRight',
  ClipboardList: 'ClipboardList',
  Monitor: 'Monitor'
}))
// Home in view from the first render, as the stack reports it.
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react')
  return { useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]) }
})
vi.mock('../components/PickerModal', () => ({ PickerModal: () => null }))
vi.mock('../components/use-connected-host-picker', () => ({
  useConnectedHostPicker: () => ({ pickHost: () => {}, pickerProps: {} })
}))
vi.mock('../navigation/use-open-host-stack-route', () => ({
  useOpenHostStackRoute: () => () => {}
}))
vi.mock('../transport/host-store', () => ({ loadHosts: async () => env.catalog }))
vi.mock('../transport/client-context', () => {
  const ctx = {
    getAllClients: () => env.clients,
    getKnownState: (hostId: string) => env.states[hostId] ?? null
  }
  return { useRpcClientContext: () => ctx }
})

import { localTasksCopy } from './local-tasks-copy'
import { MobileHomeLocalTasksCard } from './MobileHomeLocalTasksCard'

function host(id: string): HostProfile {
  return {
    id,
    name: id,
    lastKnownMachineName: id,
    endpoint: 'ws://x',
    deviceToken: 't',
    publicKeyB64: 'k',
    lastConnected: 0
  }
}

/** One paired desktop with local tasks, counting what home asked it. */
function desktop(id: string, projectCount: number, sourceHidden?: boolean) {
  const calls: string[] = []
  const answers: Record<string, unknown> = {
    'status.get': { capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY] },
    'localTasks.status': {
      taskHost: true,
      state: 'ready',
      reason: null,
      revision: 1,
      taskHostId: id,
      inProgressCount: 3,
      projectCount,
      ...(sourceHidden === undefined ? {} : { sourceHidden })
    },
    'localTasks.attention.get': { observedAt: 1, sessions: [], items: [] }
  }
  const client: RpcClient = {
    sendRequest: async (method: string): Promise<RpcResponse> => {
      calls.push(method)
      return { id: method, ok: true, result: answers[method] ?? {} }
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
  env.clients.push({ hostId: id, client })
  env.catalog.push(host(id))
  env.states[id] = 'connected'
  return calls
}

let renderer: ReactTestRenderer | null = null
beforeEach(() => {
  env.catalog = []
  env.clients = []
  env.states = {}
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function show(connected: string[]) {
  const element = createElement(MobileHomeLocalTasksCard, {
    connectedHosts: connected.map(host)
  })
  await act(async () => {
    if (renderer) {
      renderer.update(element)
    } else {
      renderer = create(element)
    }
  })
  for (let turn = 0; turn < 8; turn += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

function texts(): string[] {
  return (renderer?.root.findAll((node) => String(node.type) === 'Text') ?? []).map((node) =>
    [node.props.children].flat().join('')
  )
}

function tree() {
  return renderer?.toJSON() ?? null
}

describe('the home local tasks card', () => {
  it('reads each host once on focus, and then only a host that connects', async () => {
    const a = desktop('home-a', 1)
    const b = desktop('home-b', 1)
    const c = desktop('home-c', 1)
    await show(['home-a', 'home-b'])
    const counted = () => [a, b, c].map((calls) => calls.filter((m) => m === 'status.get').length)
    expect(counted()).toEqual([1, 1, 0])

    await show(['home-a', 'home-b', 'home-c'])
    expect(counted()).toEqual([1, 1, 1])
    env.states['home-b'] = 'disconnected'
    await show(['home-a', 'home-c'])
    expect(counted()).toEqual([1, 1, 1])
  })

  it('stays away, after one status read, from a host with no project', async () => {
    const calls = desktop('home-empty', 0)
    await show(['home-empty'])
    expect(tree()).toBeNull()
    expect(calls).toEqual(['status.get', 'localTasks.status'])
  })

  it('leaves out a host whose desktop hides local tasks, and counts one too old to say', async () => {
    const copy = localTasksCopy()
    const hidden = desktop('home-hidden', 2, true)
    desktop('home-older', 1)
    await show(['home-hidden', 'home-older'])
    expect(hidden).toEqual(['status.get', 'localTasks.status'])
    // Only the older host's 3 in progress: the hidden library is neither read further nor counted.
    expect(texts()).toEqual([
      copy.homeCardTitle,
      `${copy.work.homeNeedsYou(0)} · ${copy.homeCardInProgress(3)}`
    ])

    // Out of contact later, a hidden library is no "cannot connect" line either.
    env.states['home-hidden'] = 'disconnected'
    await show(['home-older'])
    expect(texts()).not.toContain(copy.desktopDisconnected('home-hidden'))
  })

  it('never calls an unreachable host closed, and says nothing while it reconnects', async () => {
    desktop('home-mbp', 1)
    await show(['home-mbp'])
    const copy = localTasksCopy()
    expect(texts()[0]).toBe(copy.homeCardTitle)

    env.states['home-mbp'] = 'reconnecting'
    await show([])
    expect(tree()).toBeNull()

    env.states['home-mbp'] = 'disconnected'
    await show([])
    expect(texts()).toEqual([copy.desktopDisconnected('home-mbp')])

    env.states['home-mbp'] = 'auth-failed'
    await show([])
    expect(texts()).toEqual([copy.desktopDisconnected('home-mbp'), copy.pairingInvalid])
  })
})
