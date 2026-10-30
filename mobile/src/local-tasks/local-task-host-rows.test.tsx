import { createElement, Fragment } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalTaskWorkspaceLink } from '../../../src/shared/local-tasks/local-task-link-types'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { MOBILE_DESKTOP_RELAY_RUNTIME_CAPABILITY } from '../../../src/shared/mobile-desktop-relay-contract'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcEnvelopeFields } from '../transport/rpc-envelope-fields'
import type { ConnectionState, RpcResponse } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-types'

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => {
  const icons = [
    'CalendarClock',
    'CircleDot',
    'ExternalLink',
    'GitMerge',
    'GitPullRequest',
    'GitPullRequestClosed',
    'GitPullRequestDraft',
    'SquareTerminal',
    'StickyNote',
    'ChevronRight',
    'Check',
    'ListTodo'
  ]
  return Object.fromEntries(icons.map((name) => [name, name]))
})
vi.mock('../components/TaskProviderLogo', () => ({ TaskProviderLogo: 'TaskProviderLogo' }))
vi.mock('../components/MobileSwitch', () => ({ MobileSwitch: 'MobileSwitch' }))

import { WorkspaceDetailsSheet } from '../host-screen/workspace-details-sheet'
import { LocalTaskHostRowsProvider } from './LocalTaskHostRowsProvider'
import { LocalTaskWorkspaceGlyph } from './LocalTaskWorkspaceGlyph'

function task(id: string, ref: string, title: string): LocalTask {
  return {
    id,
    projectId: 'p',
    number: Number(ref.split('-')[1]),
    ref,
    title,
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
}

function workspaceLink(
  taskId: string,
  place: Pick<LocalTaskWorkspaceLink, 'hostId'> & Partial<LocalTaskWorkspaceLink>
): LocalTaskWorkspaceLink {
  return {
    taskId,
    kind: 'git-worktree',
    instanceId: null,
    worktreeId: null,
    folderWorkspaceId: null,
    repoId: 'repo',
    branchSnapshot: null,
    nameSnapshot: null,
    hostLabelSnapshot: null,
    linkedVia: 'manual',
    linkedAt: 1,
    ...place
  }
}

function row(overrides: Partial<Worktree>): Worktree {
  return {
    workspaceKind: 'git',
    worktreeId: 'repo::/w/shop-12',
    repoId: 'repo',
    repo: 'shop',
    branch: 'zc/shop-12',
    displayName: 'shop-12',
    path: '/w/shop-12',
    liveTerminalCount: 0,
    hasAttachedPty: false,
    unread: false,
    isPinned: false,
    linkedPR: null,
    ...overrides
  }
}

type LibraryAnswers = {
  projectCount: number
  sourceHidden?: boolean
  cardTaskHidden?: boolean
  workspaces: LocalTaskWorkspaceLink[]
  tasks: LocalTask[]
}

function answersFor(library: LibraryAnswers): Record<string, unknown> {
  return {
    'localTasks.status': {
      taskHost: true,
      state: 'ready',
      reason: null,
      revision: 1,
      taskHostId: 'h',
      projectCount: library.projectCount,
      ...(library.sourceHidden === undefined ? {} : { sourceHidden: library.sourceHidden }),
      ...(library.cardTaskHidden === undefined ? {} : { cardTaskHidden: library.cardTaskHidden })
    },
    'localTasks.links.list': { workspaces: library.workspaces, sessions: [] },
    'localTasks.tasks.list': { tasks: library.tasks },
    'localTasks.attention.get': { observedAt: 1, sessions: [], items: [] },
    'localTasks.unsubscribeChanges': { unsubscribed: true }
  }
}

/**
 * The paired desktop, and through it the servers it relays to: every call it gets is logged as
 * "host method", where host is `desktop` or the server the envelope names.
 */
function pairedDesktop(
  own: LibraryAnswers,
  servers: Record<string, { capabilities: string[]; library: LibraryAnswers }> = {}
) {
  const calls: string[] = []
  const feeds = new Map<string, ((payload: unknown) => void)[]>()
  const stateListeners = new Set<(state: ConnectionState) => void>()
  let state: ConnectionState = 'connected'
  let contact = 1
  const answer = (host: string, method: string): unknown => {
    if (host === 'desktop') {
      if (method === 'mobileRelay.hosts.list') {
        return {
          hosts: Object.keys(servers).map((hostId) => ({
            hostId,
            label: hostId,
            health: 'available',
            relay: 'ready'
          }))
        }
      }
      return answersFor(own)[method]
    }
    const server = servers[host]
    if (method === 'status.get') {
      return { capabilities: server?.capabilities ?? [] }
    }
    return server ? answersFor(server.library)[method] : undefined
  }
  const hostOf = (envelope: RpcEnvelopeFields | undefined): string => {
    const host = envelope?.executionHost
    return typeof host === 'string' ? host : 'desktop'
  }
  const client: RpcClient = {
    sendRequest: async (method, _params, options): Promise<RpcResponse> => {
      const host = hostOf(options?.envelope)
      calls.push(`${host} ${method}`)
      return { id: method, ok: true, result: answer(host, method) ?? {} }
    },
    subscribe: (method, _params, onData, options) => {
      const host = hostOf(options?.envelope)
      calls.push(`${host} ${method}`)
      feeds.set(host, [...(feeds.get(host) ?? []), onData])
      return () => {}
    },
    updateTerminalSubscriptionViewport: () => {},
    getState: () => state,
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => contact,
    carriesRpcEnvelope: () => true,
    onStateChange: (listener) => {
      stateListeners.add(listener)
      return () => {
        stateListeners.delete(listener)
      }
    },
    notifyForeground: () => {},
    close: () => {}
  }
  return {
    client,
    calls,
    /** The host answers each open change subscription with its `ready`. */
    ready: async () => {
      for (const [host, list] of feeds) {
        for (const feed of list.splice(0)) {
          feed({ type: 'ready', subscriptionId: `sub-${host}`, revision: 1, state: 'ready' })
        }
      }
      await settle()
    },
    setState: (next: ConnectionState) => {
      if (next === 'connected' && state !== 'connected') {
        contact += 1
      }
      state = next
      for (const listener of stateListeners) {
        listener(next)
      }
    }
  }
}

async function settle() {
  for (let turn = 0; turn < 10; turn += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

const navigateFromHostList = vi.fn()
const setActionTarget = vi.fn()
let renderer: ReactTestRenderer | null = null

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  navigateFromHostList.mockClear()
  setActionTarget.mockClear()
})

async function showHostList(args: {
  hostId: string
  client: RpcClient
  connState?: ConnectionState
  capabilities?: string[]
  rows: Worktree[]
  sheetFor?: Worktree
}) {
  const element = createElement(
    LocalTaskHostRowsProvider,
    {
      controller: {
        hostId: args.hostId,
        client: args.client,
        connState: args.connState ?? 'connected',
        hostCapabilities: args.capabilities ?? [LOCAL_TASKS_RUNTIME_CAPABILITY],
        actions: { navigateFromHostList },
        state: { setActionTarget }
      }
    },
    createElement(
      Fragment,
      null,
      ...args.rows.map((item) =>
        createElement(LocalTaskWorkspaceGlyph, { key: item.worktreeId, item })
      ),
      args.sheetFor
        ? createElement(WorkspaceDetailsSheet, { row: args.sheetFor, onOpenLink: () => {} })
        : null
    )
  )
  await act(async () => {
    if (renderer) {
      renderer.update(element)
    } else {
      renderer = create(element)
    }
  })
  await settle()
}

function glyphs(): string[] {
  return (renderer?.root.findAll((node) => String(node.type) === 'View') ?? [])
    .map((node) => node.props.accessibilityLabel)
    .filter((label): label is string => typeof label === 'string')
}

function texts(node: ReactTestInstance | undefined = renderer?.root): string[] {
  return (node?.findAll((child) => String(child.type) === 'Text') ?? []).map((child) =>
    child.children.map((part) => (typeof part === 'string' ? part : texts(part).join(''))).join('')
  )
}

const shop12 = task('t12', 'SHOP-12', 'Export API')

describe("the host list's local tasks", () => {
  it('names the task on the row and in its long-press sheet, after reviews and before other tasks', async () => {
    const desktop = pairedDesktop({
      projectCount: 1,
      workspaces: [workspaceLink('t12', { hostId: 'local', worktreeId: 'repo::/w/shop-12' })],
      tasks: [shop12]
    })
    const linked = row({
      hostId: 'local',
      linkedPR: { number: 7, state: 'open', title: 'Export endpoint' },
      linkedLinearIssue: 'ENG-7',
      comment: 'Ship on Friday'
    })
    await showHostList({
      hostId: 'h-sheet',
      client: desktop.client,
      rows: [linked],
      sheetFor: linked
    })
    await desktop.ready()

    expect(glyphs()).toContain('Local task: Export API')
    expect(texts().slice(2)).toEqual([
      'Export endpoint',
      'PR #7 · Open',
      'Export API',
      'SHOP-12 · Local task',
      'ENG-7',
      'Linear',
      'Ship on Friday'
    ])
    const open = renderer!.root.find(
      (node) => node.props.accessibilityLabel === 'Open local task Export API'
    )
    act(() => open.props.onPress())
    expect(setActionTarget).toHaveBeenCalledWith(null)
    expect(navigateFromHostList).toHaveBeenCalledWith('/h/h-sheet/local-tasks?taskId=t12')
  })

  it("drops the row's task icon when the desktop's Display properties hide it, keeping the sheet row", async () => {
    const desktop = pairedDesktop({
      projectCount: 1,
      cardTaskHidden: true,
      workspaces: [workspaceLink('t12', { hostId: 'local', worktreeId: 'repo::/w/shop-12' })],
      tasks: [shop12]
    })
    const linked = row({ hostId: 'local' })
    await showHostList({
      hostId: 'h-glyph',
      client: desktop.client,
      rows: [linked],
      sheetFor: linked
    })
    await desktop.ready()
    expect(glyphs()).not.toContain('Local task: Export API')
    expect(texts()).toContain('Export API')
  })

  it("matches the paired host's SSH and folder workspaces, and not a recreated worktree", async () => {
    const desktop = pairedDesktop({
      projectCount: 1,
      workspaces: [
        workspaceLink('t1', { hostId: 'ssh:box', worktreeId: 'repo::/srv/a', instanceId: 'i-a' }),
        workspaceLink('t2', { hostId: 'local', kind: 'folder', folderWorkspaceId: 'f1' }),
        workspaceLink('t3', { hostId: 'local', worktreeId: 'repo::/w/c', instanceId: 'i-old' })
      ],
      tasks: [
        task('t1', 'SHOP-1', 'On the box'),
        task('t2', 'SHOP-2', 'In a folder'),
        task('t3', 'SHOP-3', 'Gone')
      ]
    })
    await showHostList({
      hostId: 'h-places',
      client: desktop.client,
      rows: [
        row({ hostId: 'ssh:box', worktreeId: 'repo::/srv/a', worktreeInstanceId: 'i-a' }),
        row({ hostId: 'local', workspaceKind: 'folder-workspace', worktreeId: 'folder:f1' }),
        row({ hostId: 'local', worktreeId: 'repo::/w/c', worktreeInstanceId: 'i-new' }),
        row({ hostId: 'ssh:other', worktreeId: 'repo::/srv/a' })
      ]
    })
    await desktop.ready()
    expect(glyphs()).toEqual(['Local task: On the box', 'Local task: In a folder'])
  })

  it('asks nothing of a host without local tasks, and a library with no project only its status', async () => {
    const linked = row({ hostId: 'local' })
    const library = {
      workspaces: [workspaceLink('t12', { hostId: 'local', worktreeId: linked.worktreeId })],
      tasks: [shop12]
    }
    const older = pairedDesktop({ projectCount: 1, ...library })
    await showHostList({
      hostId: 'h-older',
      client: older.client,
      capabilities: [],
      rows: [linked]
    })
    expect(older.calls).toEqual([])
    act(() => renderer?.unmount())
    renderer = null

    const desktop = pairedDesktop({ projectCount: 0, ...library })
    await showHostList({
      hostId: 'h-quiet',
      client: desktop.client,
      rows: [linked],
      sheetFor: linked
    })
    await desktop.ready()
    expect(desktop.calls).toEqual(['desktop localTasks.status'])
    expect(glyphs()).toEqual([])
    expect(texts()).not.toContain('Export API')
  })

  it("keeps a linked workspace's task on its row and sheet after local tasks are hidden, as on the desktop", async () => {
    const desktop = pairedDesktop({
      projectCount: 1,
      sourceHidden: true,
      workspaces: [workspaceLink('t12', { hostId: 'local', worktreeId: 'repo::/w/shop-12' })],
      tasks: [shop12]
    })
    const linked = row({ hostId: 'local' })
    await showHostList({
      hostId: 'h-hidden',
      client: desktop.client,
      rows: [linked],
      sheetFor: linked
    })
    await desktop.ready()
    expect(glyphs()).toContain('Local task: Export API')
    expect(texts()).toContain('Export API')
  })

  it("keeps the last read out of contact as can't confirm, and reads again only once contact is back", async () => {
    const linked = row({ hostId: 'local' })
    const desktop = pairedDesktop({
      projectCount: 1,
      workspaces: [workspaceLink('t12', { hostId: 'local', worktreeId: linked.worktreeId })],
      tasks: [shop12]
    })
    await showHostList({
      hostId: 'h-drop',
      client: desktop.client,
      rows: [linked],
      sheetFor: linked
    })
    await desktop.ready()
    const readsInContact = desktop.calls.length

    desktop.setState('disconnected')
    await showHostList({
      hostId: 'h-drop',
      client: desktop.client,
      connState: 'disconnected',
      rows: [linked],
      sheetFor: linked
    })
    expect(glyphs()).toContain('Local task: Export API')
    expect(texts()).toContain("SHOP-12 · Can't confirm")
    // Only the shared watch releasing its subscription; nothing is read.
    expect(desktop.calls.slice(readsInContact)).toEqual(['desktop localTasks.unsubscribeChanges'])
    const readsOutOfContact = desktop.calls.length

    desktop.setState('connected')
    await showHostList({
      hostId: 'h-drop',
      client: desktop.client,
      rows: [linked],
      sheetFor: linked
    })
    await desktop.ready()
    expect(desktop.calls.slice(readsOutOfContact)).toEqual(
      expect.arrayContaining(['desktop localTasks.status', 'desktop localTasks.links.list'])
    )
    expect(texts()).toContain('SHOP-12 · Local task')
  })

  it("reads a server's workspace from the server's own library, through the paired host", async () => {
    const serverRow = row({ hostId: 'runtime:vm', worktreeId: 'repo::/home/a' })
    const oldServerRow = row({ hostId: 'runtime:old', worktreeId: 'repo::/home/b' })
    const desktop = pairedDesktop(
      { projectCount: 0, workspaces: [], tasks: [] },
      {
        'runtime:vm': {
          capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY],
          library: {
            projectCount: 1,
            workspaces: [workspaceLink('t9', { hostId: 'ssh:lab', worktreeId: 'repo::/home/a' })],
            tasks: [task('t9', 'OPS-9', 'Rotate keys')]
          }
        },
        'runtime:old': {
          capabilities: [],
          library: { projectCount: 1, workspaces: [], tasks: [] }
        }
      }
    )
    await showHostList({
      hostId: 'h-relay',
      client: desktop.client,
      capabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY, MOBILE_DESKTOP_RELAY_RUNTIME_CAPABILITY],
      rows: [serverRow, oldServerRow],
      sheetFor: serverRow
    })
    await desktop.ready()

    expect(glyphs()).toEqual(['Local task: Rotate keys'])
    expect(texts()).toContain('OPS-9 · Local task')
    expect(desktop.calls.filter((call) => call.startsWith('runtime:old'))).toEqual([
      'runtime:old status.get'
    ])
    const open = renderer!.root.find(
      (node) => node.props.accessibilityLabel === 'Open local task Rotate keys'
    )
    act(() => open.props.onPress())
    expect(navigateFromHostList).toHaveBeenCalledWith(
      '/h/h-relay/local-tasks?taskId=t9&executionHost=runtime%3Avm'
    )
  })
})
