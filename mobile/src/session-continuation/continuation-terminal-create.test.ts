import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcResponse } from '../transport/types'
import type { PendingSessionSelection } from '../session/pending-session-selection'
import {
  useMobileSessionTerminalCreateActions,
  type MobileTerminalCreateResult
} from '../session/use-mobile-session-terminal-create-actions'

vi.mock('../platform/haptics', () => ({ triggerSuccess: vi.fn(), triggerError: vi.fn() }))

// A host that can take `agent.launch`, so only the continuation bypass keeps the create off it.
const LAUNCH_CAPABILITIES = [
  'agent.launch.v2',
  'agent.launch.replay.v1',
  'agent.launch.replay-required.v1'
]

function createdTab(terminal?: string): RpcResponse {
  return {
    id: 'x',
    ok: true,
    result: {
      tab: {
        type: 'terminal',
        id: 'continued-tab',
        title: 'Claude',
        ...(terminal ? { terminal } : {}),
        isActive: true
      }
    },
    _meta: { runtimeId: 'r' }
  }
}

function scriptedClient(reply: RpcResponse) {
  const sendRequest = vi.fn(async (_method: string, _params?: unknown, _options?: unknown) => reply)
  const client: RpcClient = {
    sendRequest,
    subscribe: () => () => {},
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }
  return { client, sendRequest }
}

function scope(client: RpcClient) {
  return {
    worktreeId: 'workspace-1',
    client,
    hostCapabilities: LAUNCH_CAPABILITIES,
    connState: 'connected',
    setTerminals: vi.fn(),
    terminalsRef: { current: [] },
    setSessionTabs: vi.fn(),
    sessionTabsRef: { current: [] },
    defaultTerminalHandlesToLiveInput: vi.fn(),
    setActiveHandle: vi.fn(),
    activeSessionTabId: 'source-tab',
    setActiveSessionTabId: vi.fn(),
    setCreating: vi.fn(),
    creatingTerminalRef: { current: null as string | null },
    creatingBrowser: false,
    creatingMarkdown: false,
    setCreateError: vi.fn(),
    deviceTokenRef: { current: null },
    initializedHandlesRef: { current: new Set<string>() },
    activeHandleRef: { current: 'source-terminal' as string | null },
    activeSessionTabTypeRef: { current: 'terminal' },
    pendingSelectionRef: { current: null as PendingSessionSelection | null },
    scheduleDelayedAction: vi.fn(),
    showToast: vi.fn(),
    unsubscribeTerminal: vi.fn(),
    subscribeToTerminal: vi.fn(),
    fetchSessionTabs: vi.fn(async () => {})
  }
}

let renderer: ReactTestRenderer | undefined
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

async function createForContinuation(
  client: RpcClient,
  options: { cwd?: string; clientMutationId?: string }
): Promise<MobileTerminalCreateResult> {
  let actions: ReturnType<typeof useMobileSessionTerminalCreateActions> | undefined
  function Harness() {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the scope carries every member createTerminalWithResult reads; a missing one throws on use.
    actions = useMobileSessionTerminalCreateActions(scope(client) as never)
    return null
  }
  await act(async () => {
    renderer = create(createElement(Harness))
  })
  let result: MobileTerminalCreateResult = null
  await act(async () => {
    result = (await actions?.createTerminalWithResult('claude', options)) ?? null
  })
  return result
}

describe('session continuation terminal create', () => {
  it('creates the terminal in the source cwd and hands back its handle', async () => {
    const { client, sendRequest } = scriptedClient(createdTab('term_9'))

    const result = await createForContinuation(client, {
      cwd: '/work/repo',
      clientMutationId: 'c-1'
    })

    expect(result).toEqual({ kind: 'terminal', handle: 'term_9' })
    expect(sendRequest.mock.calls.map(([method]) => method)).toEqual([
      'session.tabs.createTerminal'
    ])
    expect(sendRequest.mock.calls[0]?.[1]).toMatchObject({
      worktree: 'id:workspace-1',
      clientMutationId: 'c-1',
      cwd: '/work/repo',
      agent: 'claude'
    })
  })

  it('keeps a retry key off the agent.launch path even without a cwd', async () => {
    const { client, sendRequest } = scriptedClient(createdTab('term_10'))

    const result = await createForContinuation(client, { clientMutationId: 'c-2' })

    expect(result).toEqual({ kind: 'terminal', handle: 'term_10' })
    expect(sendRequest.mock.calls.map(([method]) => method)).toEqual([
      'session.tabs.createTerminal'
    ])
  })

  it('reports a created tab whose reply carried no terminal handle', async () => {
    const { client } = scriptedClient(createdTab())

    const result = await createForContinuation(client, {
      cwd: '/work/repo',
      clientMutationId: 'c-3'
    })

    expect(result).toEqual({ kind: 'terminal-without-handle' })
  })
})
