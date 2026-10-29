import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios' }
}))
vi.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked' }))

import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import { MOBILE_DESKTOP_RELAY_RUNTIME_CAPABILITY } from '../../../src/shared/mobile-desktop-relay-contract'
import { MOBILE_RELAY_HOSTS_LIST_METHOD } from '../../../src/shared/mobile-relay-hosts-contract'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import { localTaskEndpointFor, type LocalTaskEndpoint } from './local-task-endpoint'
import { useLocalTaskEndpoints } from './use-local-task-endpoints'
import { useLocalTasksLibrary } from './use-local-tasks-library'

const SERVER = 'runtime:vm'
const OLD_SERVER = 'runtime:old'
// Stable like the host route's gates: the server clients are keyed on them.
const DESKTOP_GATES = {
  hostCapabilities: [MOBILE_DESKTOP_RELAY_RUNTIME_CAPABILITY, LOCAL_TASKS_RUNTIME_CAPABILITY],
  statusPending: false,
  statusReadable: true
}

type Envelope = { envelope?: { executionHost?: string } }

function reply(result: unknown): RpcResponse {
  return { id: 'reply', ok: true, result, _meta: { runtimeId: 'desktop' } }
}

const LIBRARY_ANSWERS: Record<string, unknown> = {
  'localTasks.status': {
    taskHost: true,
    state: 'ready',
    reason: null,
    revision: 1,
    taskHostId: 'vm'
  },
  'localTasks.projects.list': { projects: [] },
  'localTasks.tasks.list': { tasks: [] },
  'localTasks.links.list': { workspaces: [], sessions: [] },
  'localTasks.attention.get': { observedAt: 1, sessions: [], items: [] },
  'localTasks.unsubscribeChanges': { unsubscribed: true }
}

/** A paired desktop relaying to one current server and one that predates local tasks. */
function desktop() {
  const taskCalls: { method: string; executionHost: string | undefined }[] = []
  let emit: ((payload: unknown) => void) | null = null
  const session: RpcClient = {
    sendRequest: async (method: string, _params?: unknown, options?: Envelope) => {
      const executionHost = options?.envelope?.executionHost
      if (method === MOBILE_RELAY_HOSTS_LIST_METHOD) {
        return reply({
          hosts: [
            { hostId: SERVER, label: 'dbox', health: 'available', relay: 'ready' },
            { hostId: OLD_SERVER, label: 'old', health: 'available', relay: 'ready' }
          ]
        })
      }
      if (method === 'status.get') {
        return reply({
          capabilities: executionHost === OLD_SERVER ? [] : [LOCAL_TASKS_RUNTIME_CAPABILITY]
        })
      }
      if (method.startsWith('localTasks.')) {
        taskCalls.push({ method, executionHost })
      }
      return reply(LIBRARY_ANSWERS[method] ?? {})
    },
    subscribe: (method, _params, onData, options) => {
      const executionHost = options?.envelope?.executionHost
      taskCalls.push({
        method,
        executionHost: typeof executionHost === 'string' ? executionHost : undefined
      })
      emit = onData
      return () => {}
    },
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }
  return { session, taskCalls, emit: (payload: unknown) => emit?.(payload) }
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function settle() {
  for (let turn = 0; turn < 8; turn += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function open(session: RpcClient, active: LocalTaskEndpoint) {
  const seen: { choices: string[]; access: string } = { choices: [], access: '' }
  function Probe() {
    const { choices, active: reach } = useLocalTaskEndpoints({
      client: session,
      connState: 'connected',
      gates: DESKTOP_GATES,
      machineName: 'mbp5',
      active
    })
    useLocalTasksLibrary(reach.client, reach.access === 'ready', active.key)
    seen.choices = choices.map((choice) => `${choice.endpoint.key}=${choice.label}`)
    seen.access = reach.access
    return null
  }
  await act(async () => {
    renderer = create(createElement(Probe))
  })
  await settle()
  return seen
}

describe("a server's task library through the paired host (D-008)", () => {
  it('lists only servers that advertise local tasks beside the host itself', async () => {
    const { session } = desktop()
    const seen = await open(session, localTaskEndpointFor(undefined))
    expect(seen.choices).toEqual(['self=mbp5', `${SERVER}=dbox`])
  })

  it('names the server in every read, the change subscription and its release', async () => {
    const { session, taskCalls, emit } = desktop()
    const seen = await open(session, localTaskEndpointFor(SERVER))
    expect(seen.access).toBe('ready')
    emit({ type: 'ready', subscriptionId: 'sub-1', revision: 1, state: 'ready' })
    await settle()
    act(() => renderer?.unmount())
    renderer = null
    await settle()
    const methods = taskCalls.map((call) => call.method)
    expect(methods).toEqual(
      expect.arrayContaining([
        'localTasks.subscribeChanges',
        'localTasks.status',
        'localTasks.tasks.list',
        'localTasks.attention.get',
        'localTasks.unsubscribeChanges'
      ])
    )
    expect(taskCalls.filter((call) => call.executionHost !== SERVER)).toEqual([])
  })
})
