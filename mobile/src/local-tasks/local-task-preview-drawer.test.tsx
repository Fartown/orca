import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { MOBILE_DESKTOP_RELAY_RUNTIME_CAPABILITY } from '../../../src/shared/mobile-desktop-relay-contract'
import { MOBILE_RELAY_HOSTS_LIST_METHOD } from '../../../src/shared/mobile-relay-hosts-contract'
import type { RpcClient } from '../transport/rpc-client'
import type * as HostProtocolGatesModule from '../components/host-protocol-gates-context'
import type { RpcResponse } from '../transport/types'

type Seen = { client: RpcClient | null; executionHost: string | undefined }
const probe = vi.hoisted((): { desktop: RpcClient | null; seen: Seen[] } => ({
  desktop: null,
  seen: []
}))

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles }
}))
vi.mock('lucide-react-native', () => ({
  ArrowUpRight: 'ArrowUpRight',
  ListTodo: 'ListTodo',
  MessageSquare: 'MessageSquare'
}))
vi.mock('../theme/themed-styles', () => ({ themedStyleSheet: () => ({}) }))
vi.mock('../theme/use-mobile-color-scheme', () => ({ useMobileColorScheme: () => 'dark' }))
vi.mock('../components/AgentStateDot', () => ({ AgentStateDot: () => null }))
vi.mock('../components/bottom-drawer/BottomDrawer', () => ({
  BottomDrawer: (props: { visible: boolean; children: ReactNode }) =>
    props.visible ? props.children : null
}))
vi.mock('../i18n/use-mobile-translation', () => ({
  useMobileTranslation: () => (_key: string, fallback: string) => fallback
}))
vi.mock('../session/MobileSessionActiveContent', () => ({ MobileSessionActiveContent: () => null }))
vi.mock('./use-local-task-session-acknowledge', () => ({ useAcknowledgeOpenSession: () => {} }))
vi.mock('../transport/host-status-gates', () => ({
  useHostStatusGates: () => ({ hostCapabilities: [], statusPending: false, statusReadable: true })
}))
vi.mock('../transport/host-client-hooks', () => ({
  useHostClient: () => ({ client: probe.desktop, clientId: 'desktop', state: 'connected' })
}))
vi.mock('../components/host-protocol-gates-context', async (original) => ({
  ...(await original<typeof HostProtocolGatesModule>()),
  useOptionalHostProtocolGates: () => ({
    hostCapabilities: [MOBILE_DESKTOP_RELAY_RUNTIME_CAPABILITY],
    statusPending: false,
    statusReadable: true
  })
}))
// The chat's controller, reduced to what decides where it reads: the route's client and host.
vi.mock('../session/use-mobile-session-controller', async () => {
  const { useWorkspaceClient } = await import('../transport/use-workspace-client')
  const { useWorkspaceExecutionHost } = await import('../navigation/workspace-execution-host')
  return {
    useMobileSessionController: (scope: { hostId: string }) => {
      const { client } = useWorkspaceClient(scope.hostId)
      probe.seen.push({ client, executionHost: useWorkspaceExecutionHost() })
      return {
        client,
        activeSessionTab: null,
        connState: 'connected',
        nativeChatController: { sessionViewReady: false, showNativeChat: false },
        showLoadingState: false,
        showEmptyState: false,
        showOfflineState: false
      }
    }
  }
})

import { createLocalTasksApi } from './local-tasks-api'
import { localTaskEndpointFor } from './local-task-endpoint'
import { LocalTaskPreviewDrawer } from './local-task-preview-drawer'
import type { LocalTasksLibrary } from './use-local-tasks-library'

const SERVER = 'runtime:vm'

/** The paired desktop, recording the host each call is routed to. */
function desktop() {
  const routed: { method: string; executionHost: string | undefined }[] = []
  const client: RpcClient = {
    sendRequest: async (method, _params, options): Promise<RpcResponse> => {
      const executionHost = options?.envelope?.executionHost
      routed.push({
        method,
        executionHost: typeof executionHost === 'string' ? executionHost : undefined
      })
      const result =
        method === MOBILE_RELAY_HOSTS_LIST_METHOD
          ? { hosts: [{ hostId: SERVER, label: 'dbox', health: 'available', relay: 'ready' }] }
          : {}
      return { id: method, ok: true, result }
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
  return { client, routed }
}

const task = {
  id: 'task-1',
  projectId: 'p',
  number: 1,
  ref: 'SHOP-1',
  title: 'Fix the export',
  description: '',
  criteria: [],
  statusId: 'started',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 1
} satisfies LocalTask
// Recorded by the library's own Orca: `local` is the server's own machine in a server's library.
const workspace = {
  taskId: task.id,
  hostId: 'local',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: 'wt-1',
  folderWorkspaceId: null,
  repoId: 'repo-1',
  branchSnapshot: null,
  nameSnapshot: 'fix-export',
  hostLabelSnapshot: null,
  linkedVia: 'start',
  linkedAt: 1
} satisfies LocalTaskWorkspaceLink
const session = {
  id: 'session-1',
  taskId: task.id,
  hostId: 'local',
  worktreeId: 'wt-1',
  instanceId: null,
  surface: 'chat',
  tabId: 'tab-1',
  paneKey: null,
  sessionId: 'agent-1',
  providerSession: null,
  agent: 'claude',
  linkedVia: 'start',
  openedAt: 2
} satisfies LocalTaskSessionLink

let renderer: ReactTestRenderer | null = null
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  probe.seen = []
})

async function preview(executionHost: string | undefined) {
  const { client, routed } = desktop()
  probe.desktop = client
  const library = {
    api: null,
    tasks: [task],
    projects: [],
    status: null,
    loaded: true,
    error: null,
    eventsVersion: 0,
    live: true,
    streamEnded: false,
    work: { links: { workspaces: [workspace], sessions: [session] }, progress: null, error: null },
    acceptTasks: () => {},
    reload: () => {},
    retryFailed: () => {},
    resubscribe: () => {}
  } satisfies LocalTasksLibrary
  await act(async () => {
    renderer = create(
      createElement(LocalTaskPreviewDrawer, {
        site: {
          hostId: 'mbp5',
          endpoint: localTaskEndpointFor(executionHost),
          connState: 'connected'
        },
        api: createLocalTasksApi(client),
        library,
        taskSessionId: session.id,
        now: 10,
        hostName: () => '',
        onOpenFull: () => {},
        onClose: () => {}
      })
    )
  })
  for (let turn = 0; turn < 6; turn += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
  const last = probe.seen.at(-1)
  if (!last?.client) {
    throw new Error('the chat read through no client')
  }
  routed.length = 0
  await last.client.sendRequest('agentSession.read', {})
  return { executionHost: last.executionHost, routedTo: routed[0]?.executionHost, client, last }
}

describe("previewing a task's chat in place", () => {
  it("reads a server library's chat on that server, not on the paired desktop", async () => {
    const seen = await preview(SERVER)
    expect(seen.executionHost).toBe(SERVER)
    expect(seen.routedTo).toBe(SERVER)
  })

  it("reads the paired host's own library's chat on the paired host", async () => {
    const seen = await preview(undefined)
    expect(seen.executionHost).toBeUndefined()
    expect(seen.last.client).toBe(seen.client)
    expect(seen.routedTo).toBeUndefined()
  })
})
