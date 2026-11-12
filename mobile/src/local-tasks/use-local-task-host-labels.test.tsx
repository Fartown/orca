import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios' }
}))

import { sshTargetSummaryHostId } from '../../../src/shared/worktree/host-context-labels'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import { useLocalTaskHostDirectory, useLocalTaskHostLabels } from './use-local-task-host-labels'

const MINI = sshTargetSummaryHostId('minizc')

/** The paired desktop: its word on the SSH host, the reads asked of it, and its notice stream. */
function desktop() {
  const state = { connected: true, reads: 0, streams: 0 }
  let notify: ((payload: unknown) => void) | null = null
  const client: RpcClient = {
    sendRequest: async (method): Promise<RpcResponse> => {
      if (method === 'ssh.listTargetSummaries') {
        state.reads += 1
      }
      return {
        id: method,
        ok: true,
        result: { targets: [{ id: 'minizc', label: 'minizc', connected: state.connected }] }
      }
    },
    subscribe: (_method, _params, onData) => {
      state.streams += 1
      notify = onData
      return () => {
        notify = null
      }
    },
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }
  return { client, state, notify: (payload: unknown) => notify?.(payload) }
}

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

async function settle() {
  for (let turn = 0; turn < 6; turn += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

async function watch(client: RpcClient) {
  const seen: { connected: boolean | undefined } = { connected: undefined }
  function Probe() {
    seen.connected = useLocalTaskHostDirectory(client, [MINI]).connected.get(MINI)
    return null
  }
  await act(async () => {
    renderer = create(createElement(Probe))
  })
  await settle()
  return seen
}

describe("a task page's word on the SSH hosts its workspaces run on", () => {
  it('follows the desktop as an SSH host drops and comes back, without asking again', async () => {
    const host = desktop()
    const seen = await watch(host.client)
    expect(seen.connected).toBe(true)
    host.notify({ type: 'ready', subscriptionId: 'events-1' })

    await act(async () =>
      host.notify({
        type: 'sshStateChanged',
        targetId: 'minizc',
        state: { status: 'disconnected' }
      })
    )
    expect(seen.connected).toBe(false)
    await act(async () =>
      host.notify({ type: 'sshStateChanged', targetId: 'minizc', state: { status: 'connected' } })
    )
    expect(seen.connected).toBe(true)
    expect(host.state.reads).toBe(1)
  })

  it('reads once more when contact comes back, for the notices missed meanwhile', async () => {
    const host = desktop()
    const seen = await watch(host.client)
    host.notify({ type: 'ready', subscriptionId: 'events-1' })
    // Out of contact: the SSH host drops and no notice reaches the phone.
    host.state.connected = false
    // Back in contact, the client replays the stream.
    host.notify({ type: 'ready', subscriptionId: 'events-2' })
    await settle()
    expect(seen.connected).toBe(false)
    expect(host.state.reads).toBe(2)
  })

  it('opens no notice stream for a page that only names hosts', async () => {
    const host = desktop()
    function Labels() {
      useLocalTaskHostLabels(host.client, [MINI])
      return null
    }
    await act(async () => {
      renderer = create(createElement(Labels))
    })
    await settle()
    expect(host.state.reads).toBe(1)
    expect(host.state.streams).toBe(0)
  })
})
