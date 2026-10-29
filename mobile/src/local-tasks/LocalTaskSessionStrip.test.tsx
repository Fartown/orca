import { createElement, Fragment } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTaskWorkspaceLink } from '../../../src/shared/local-tasks/local-task-link-types'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, RpcResponse } from '../transport/types'

type StripEnv = { state: ConnectionState; landscape: boolean; client: RpcClient | null }

const env = vi.hoisted((): StripEnv => ({ state: 'connected', landscape: false, client: null }))

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked' }))
vi.mock('lucide-react-native', () => ({ ClipboardList: 'ClipboardList' }))
vi.mock('../layout/responsive-layout', () => ({
  useResponsiveLayout: () => ({ isLandscapePhone: env.landscape })
}))
vi.mock('../navigation/workspace-execution-host', () => ({
  useWorkspaceExecutionHost: () => undefined
}))
vi.mock('../navigation/route-handoff', () => ({ useRouteHandoff: () => ({ push: () => {} }) }))
vi.mock('../transport/host-client-hooks', () => ({
  useHostClient: () => ({ client: env.client, clientId: 'c', state: env.state })
}))
vi.mock('../components/host-protocol-gates-context', async () => {
  const { LOCAL_TASKS_RUNTIME_CAPABILITY } =
    await import('../../../src/shared/local-tasks/local-tasks-capability')
  const gates = {
    hostCapabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY],
    statusPending: false,
    statusReadable: true
  }
  return { useOptionalHostProtocolGates: () => gates }
})
vi.mock('./use-local-task-session-acknowledge', () => ({ useAcknowledgeOpenSession: () => {} }))
vi.mock('./local-task-choice-sheet', () => ({ LocalTaskChoiceSheet: () => null }))

import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskSessionStrip } from './LocalTaskSessionStrip'

const WORKTREE = 'repo::/w/shop-13'

const link: LocalTaskWorkspaceLink = {
  taskId: 't13',
  hostId: 'local',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: WORKTREE,
  folderWorkspaceId: null,
  repoId: 'repo',
  branchSnapshot: null,
  nameSnapshot: null,
  hostLabelSnapshot: null,
  linkedVia: 'manual',
  linkedAt: 1
}

const task = {
  id: 't13',
  projectId: 'p',
  number: 13,
  ref: 'SHOP-13',
  title: 'Export API',
  description: '',
  criteria: [],
  statusId: 's',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}

/** A host's library: what it answers, and every call the strip made to it. */
function library(options: { projectCount: number; linked: boolean }) {
  const calls: string[] = []
  const feeds: ((payload: unknown) => void)[] = []
  const answers: Record<string, unknown> = {
    'localTasks.status': {
      taskHost: true,
      state: 'ready',
      reason: null,
      revision: 1,
      taskHostId: 'h',
      projectCount: options.projectCount
    },
    'localTasks.links.list': { workspaces: options.linked ? [link] : [], sessions: [] },
    'localTasks.tasks.list': { tasks: options.linked ? [task] : [] },
    'localTasks.attention.get': { observedAt: 1, sessions: [], items: [] },
    'localTasks.unsubscribeChanges': { unsubscribed: true }
  }
  const client: RpcClient = {
    sendRequest: async (method: string): Promise<RpcResponse> => {
      calls.push(method)
      return { id: method, ok: true, result: answers[method] ?? {} }
    },
    subscribe: (method, _params, onData) => {
      calls.push(method)
      feeds.push(onData)
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
  const ready = async () => {
    for (const feed of feeds.splice(0)) {
      feed({ type: 'ready', subscriptionId: `sub-${calls.length}`, revision: 1, state: 'ready' })
    }
    await settle()
  }
  return { client, calls, ready }
}

let renderer: ReactTestRenderer | null = null
beforeEach(() => {
  Object.assign(env, { state: 'connected', landscape: false, client: null })
})
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

function strip(hostId: string) {
  return createElement(LocalTaskSessionStrip, {
    controller: { hostId, worktreeId: WORKTREE, activeSessionTab: null }
  })
}

async function show(element: ReturnType<typeof strip>) {
  await act(async () => {
    if (renderer) {
      renderer.update(element)
    } else {
      renderer = create(element)
    }
  })
  await settle()
}

function texts(): string[] {
  return (renderer?.root.findAll((node) => String(node.type) === 'Text') ?? []).map((node) =>
    [node.props.children].flat().join('')
  )
}

function tree() {
  return renderer?.toJSON() ?? null
}

describe('the session header task strip', () => {
  it('keeps its row through a dropped connection, marked unverifiable', async () => {
    const host = library({ projectCount: 1, linked: true })
    env.client = host.client
    await show(strip('h-drop'))
    await host.ready()
    const unverifiable = localTasksCopy().work.sessionStates.unverifiable
    const row = tree()
    expect(texts()).toEqual(['SHOP-13 · Export API'])

    for (const state of ['reconnecting', 'disconnected', 'connected'] as const) {
      env.state = state
      await show(strip('h-drop'))
      const shown = tree()
      // Same row with the same frame: the terminal under the header is never refit.
      expect(shown).not.toBeNull()
      expect(!shown || Array.isArray(shown) ? null : shown.props.style).toEqual(
        !row || Array.isArray(row) ? undefined : row.props.style
      )
      // Still marked once connected: nothing is vouched for until the resubscription is ready.
      expect(texts()).toEqual(['SHOP-13 · Export API', unverifiable])
    }
    // Back in contact the feed resubscribes and its `ready` re-reads, which clears the mark.
    await host.ready()
    expect(texts()).toEqual(['SHOP-13 · Export API'])
  })

  it('renders nothing for an unlinked workspace, or on a sideways phone', async () => {
    const unlinked = library({ projectCount: 1, linked: false })
    env.client = unlinked.client
    await show(strip('h-unlinked'))
    await unlinked.ready()
    expect(unlinked.calls).toContain('localTasks.links.list')
    expect(tree()).toBeNull()
    act(() => renderer?.unmount())
    renderer = null

    const linked = library({ projectCount: 1, linked: true })
    env.client = linked.client
    env.landscape = true
    await show(strip('h-sideways'))
    await linked.ready()
    expect(tree()).toBeNull()
  })

  it('asks a library with no project only for its status, also across a reconnect', async () => {
    const host = library({ projectCount: 0, linked: false })
    env.client = host.client
    await show(strip('h-empty'))
    expect(host.calls).toEqual(['localTasks.status'])

    env.state = 'reconnecting'
    await show(strip('h-empty'))
    env.state = 'connected'
    await show(strip('h-empty'))
    // Contact coming back is the one moment it is asked again: the host never pushes the count.
    expect(host.calls).toEqual(['localTasks.status', 'localTasks.status'])
  })

  it('shares one subscription and one set of reads among the session screens of a host', async () => {
    const host = library({ projectCount: 2, linked: true })
    env.client = host.client
    await act(async () => {
      renderer = create(createElement(Fragment, null, strip('h-shared'), strip('h-shared')))
    })
    await settle()
    await host.ready()
    expect(host.calls.sort()).toEqual([
      'localTasks.attention.get',
      'localTasks.links.list',
      'localTasks.status',
      'localTasks.subscribeChanges',
      'localTasks.tasks.list'
    ])
    expect(texts()).toEqual(['SHOP-13 · Export API', 'SHOP-13 · Export API'])
  })
})
