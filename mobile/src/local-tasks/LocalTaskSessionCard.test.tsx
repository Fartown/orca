import { createElement, Fragment, type ReactElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { MobileSessionTab } from '../session/tabs/mobile-session-tabs'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { ConnectionState } from '../transport/connection/connection-state'
import type { RpcResponse } from '../transport/rpc/rpc-wire-types'

type StripEnv = { state: ConnectionState; client: RpcClient | null }

const env = vi.hoisted((): StripEnv => ({ state: 'connected', client: null }))
const routePush = vi.hoisted(() => vi.fn())
const acknowledgeHook = vi.hoisted(() => vi.fn())
const focusCleanup = vi.hoisted((): { current: (() => void) | null } => ({ current: null }))

vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('expo-secure-store', () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked' }))
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | void) => {
    focusCleanup.current = effect() ?? null
  }
}))
vi.mock('lucide-react-native', () => ({
  ClipboardList: 'ClipboardList',
  ChevronRight: 'ChevronRight'
}))
vi.mock('../i18n/use-mobile-translation', () => ({
  useMobileTranslation: () => (_key: string, fallback: string) => fallback
}))
vi.mock('../navigation/workspace-execution-host', () => ({
  useWorkspaceExecutionHost: () => undefined
}))
vi.mock('../navigation/route-handoff', () => ({ useRouteHandoff: () => ({ push: routePush }) }))
vi.mock('../transport/connection/host-client-hooks', () => ({
  useHostClient: () => ({ client: env.client, clientId: 'c', state: env.state })
}))
vi.mock('../components/host-connection/host-protocol-gates-context', async () => {
  const { LOCAL_TASKS_RUNTIME_CAPABILITY } =
    await import('../../../src/shared/local-tasks/local-tasks-capability')
  const gates = {
    hostCapabilities: [LOCAL_TASKS_RUNTIME_CAPABILITY],
    statusPending: false,
    statusReadable: true
  }
  return { useOptionalHostProtocolGates: () => gates }
})
vi.mock('./use-local-task-session-acknowledge', () => ({
  useAcknowledgeOpenSession: acknowledgeHook
}))
vi.mock('./local-task-choice-sheet', () => ({ LocalTaskChoiceSheet: 'ChoiceSheet' }))
vi.mock('../agents/presentation/AgentStateDot', () => ({ AgentStateDot: () => null }))

import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskSessionCard } from './LocalTaskSessionCard'
import { LocalTaskSessionCardProvider } from './local-task-session-card-provider'
import {
  LocalTaskSessionCardMount,
  LocalTaskSessionReceiptMount,
  type SessionTaskReceiptController
} from './local-task-session-card-slot'
import { LocalTaskSessionReceipt } from './local-task-session-receipt'
import { localTaskStripLine, localTaskWorkspaceForRoute } from './use-local-task-session-strip'

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

const task: LocalTask = {
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

/** The agent tab open on the session screen, linked to SHOP-13 as `session`. */
const agentTab: MobileSessionTab = {
  type: 'terminal',
  id: 'tab-1',
  title: 'Claude',
  terminal: null,
  isActive: true
}

const session: LocalTaskSessionLink = {
  id: 'session-1',
  taskId: 't13',
  hostId: 'local',
  worktreeId: WORKTREE,
  instanceId: null,
  surface: 'terminal',
  tabId: 'tab-1',
  paneKey: null,
  sessionId: null,
  providerSession: null,
  agent: 'claude',
  linkedVia: 'start',
  openedAt: 1
}

/** A host's library: what it answers, and every call the strip made to it. */
function library(options: {
  projectCount: number
  linked: boolean
  waiting?: boolean
  sessionTask?: boolean
  deferRecord?: boolean
}) {
  const calls: string[] = []
  const writes: unknown[] = []
  const pendingRecords: ((response: RpcResponse) => void)[] = []
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
    'localTasks.links.list': {
      workspaces: options.linked ? [link] : [],
      sessions: options.waiting ? [{ ...session, taskId: options.sessionTask ? 't99' : 't13' }] : []
    },
    'localTasks.tasks.list': {
      tasks: options.linked
        ? [
            task,
            ...(options.sessionTask
              ? [{ ...task, id: 't99', ref: 'SHOP-99', title: 'Inactive task' }]
              : [])
          ]
        : []
    },
    'localTasks.attention.get': {
      observedAt: 1,
      sessions: options.waiting
        ? [
            {
              taskSessionId: session.id,
              state: 'waiting',
              lastMessage: null,
              stateSince: 1,
              unread: false
            }
          ]
        : [],
      items: []
    },
    'localTasks.unsubscribeChanges': { unsubscribed: true }
  }
  const client: RpcClient = {
    sendRequest: async (method: string, params?: unknown): Promise<RpcResponse> => {
      calls.push(method)
      if (method === 'localTasks.links.recordSession') {
        writes.push(params)
        const record = params && typeof params === 'object' ? params : {}
        const response: RpcResponse = {
          id: method,
          ok: true,
          result: {
            ok: true,
            session: { ...session, ...record, id: 'session-linked', linkedVia: 'manual' }
          }
        }
        return options.deferRecord
          ? new Promise<RpcResponse>((resolve) => pendingRecords.push(resolve))
          : response
      }
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
  const settleRecord = async (index: number) => {
    const record = writes[index]
    const response: RpcResponse = {
      id: 'localTasks.links.recordSession',
      ok: true,
      result: {
        ok: true,
        session: {
          ...session,
          ...(record && typeof record === 'object' ? record : {}),
          id: 'session-linked',
          linkedVia: 'manual'
        }
      }
    }
    pendingRecords[index]?.(response)
    await settle()
  }
  return { client, calls, writes, ready, settleRecord }
}

let renderer: ReactTestRenderer | null = null
beforeEach(() => {
  Object.assign(env, { state: 'connected', client: null })
  routePush.mockClear()
  acknowledgeHook.mockClear()
  focusCleanup.current = null
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

function card(
  hostId: string,
  activeSessionTab: MobileSessionTab | null = null,
  onOpenTask?: () => void
) {
  return createElement(LocalTaskSessionCard, {
    controller: { hostId, worktreeId: WORKTREE, activeSessionTab },
    onOpenTask
  })
}

async function show(element: ReactElement<unknown>) {
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

describe('the session tab task detail card', () => {
  it('refuses an ambiguous workspace route while an exact session link still names its task', () => {
    const sshLink: LocalTaskWorkspaceLink = {
      ...link,
      hostId: 'ssh:mini',
      taskId: 't99'
    }
    const links = { workspaces: [link, sshLink], sessions: [session] }
    const tasks = [task, { ...task, id: 't99', title: 'Remote task', ref: 'SHOP-99' }]
    expect(localTaskWorkspaceForRoute(links.workspaces, WORKTREE)).toBeNull()
    expect(localTaskStripLine({ links, tasks, progress: null }, WORKTREE, null)).toBeNull()
    expect(localTaskStripLine({ links, tasks, progress: null }, WORKTREE, session)?.task.id).toBe(
      task.id
    )
  })

  it('keeps its task through a dropped connection, marked unverifiable', async () => {
    const host = library({ projectCount: 1, linked: true })
    env.client = host.client
    await show(card('h-drop'))
    await host.ready()
    const unverifiable = localTasksCopy().work.sessionStates.unverifiable
    const row = tree()
    expect(texts()).toEqual(['Export API', 'SHOP-13'])

    for (const state of ['reconnecting', 'disconnected', 'connected'] as const) {
      env.state = state
      await show(card('h-drop'))
      const shown = tree()
      // The card retains the last known task when the host loses contact.
      expect(shown).not.toBeNull()
      expect(!shown || Array.isArray(shown) ? null : shown.props.style).toEqual(
        !row || Array.isArray(row) ? undefined : row.props.style
      )
      // Still marked once connected: nothing is vouched for until the resubscription is ready.
      expect(texts()).toEqual(['Export API', 'SHOP-13', unverifiable])
    }
    // Back in contact the feed resubscribes and its `ready` re-reads, which clears the mark.
    await host.ready()
    expect(texts()).toEqual(['Export API', 'SHOP-13'])
  })

  it('says the open session waits for you, in the same frame as the plain line', async () => {
    const host = library({ projectCount: 1, linked: true, waiting: true })
    env.client = host.client
    await show(card('h-waiting'))
    await host.ready()
    const plain = tree()
    expect(texts()).toEqual(['Export API', 'SHOP-13'])

    await show(card('h-waiting', agentTab))
    const shown = tree()
    expect(texts()).toEqual(['Export API', 'SHOP-13', localTasksCopy().work.sessionStates.waiting])
    expect(!shown || Array.isArray(shown) ? null : shown.props.style).toEqual(
      !plain || Array.isArray(plain) ? undefined : plain.props.style
    )
  })

  it('renders nothing for an unlinked workspace', async () => {
    const unlinked = library({ projectCount: 1, linked: false })
    env.client = unlinked.client
    await show(card('h-unlinked'))
    await unlinked.ready()
    expect(unlinked.calls).toContain('localTasks.links.list')
    expect(tree()).toBeNull()
  })

  it('asks a library with no project only for its status, also across a reconnect', async () => {
    const host = library({ projectCount: 0, linked: false })
    env.client = host.client
    await show(card('h-empty'))
    expect(host.calls).toEqual(['localTasks.status'])

    env.state = 'reconnecting'
    await show(card('h-empty'))
    env.state = 'connected'
    await show(card('h-empty'))
    // Contact coming back is the one moment it is asked again: the host never pushes the count.
    expect(host.calls).toEqual(['localTasks.status', 'localTasks.status'])
  })

  it('shares one subscription and one set of reads among the session screens of a host', async () => {
    const host = library({ projectCount: 2, linked: true })
    env.client = host.client
    await act(async () => {
      renderer = create(createElement(Fragment, null, card('h-shared'), card('h-shared')))
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
    expect(texts()).toEqual(['Export API', 'SHOP-13', 'Export API', 'SHOP-13'])
  })

  it('uses the clicked inactive tab session over its workspace task, and closes before routing', async () => {
    const host = library({ projectCount: 1, linked: true, waiting: true, sessionTask: true })
    env.client = host.client
    const close = vi.fn()
    await show(card('h-inactive', { ...agentTab, isActive: false }, close))
    await host.ready()
    expect(texts()).toContain('Inactive task')
    expect(texts()).toContain('SHOP-99')
    expect(texts()).not.toContain('Export API')
    const open = renderer!.root.find(
      (node) =>
        String(node.type) === 'Pressable' &&
        node.props.accessibilityLabel === 'Inactive task, SHOP-99'
    )
    expect(open.props.accessibilityHint).toBe('Open task')
    act(() => open.props.onPress())
    expect(close).toHaveBeenCalledOnce()
    expect(routePush).toHaveBeenCalledWith('/h/h-inactive/local-tasks?taskId=t99')
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(routePush.mock.invocationCallOrder[0])
    expect(acknowledgeHook).not.toHaveBeenCalled()
  })

  it('keeps the session choice mounted after its card closes and records the clicked tab', async () => {
    const host = library({ projectCount: 1, linked: true })
    env.client = host.client
    const clicked = { ...agentTab, launchAgent: 'claude' as const, isActive: false }
    const receipt = () =>
      createElement(LocalTaskSessionReceiptMount, {
        controller: {
          hostId: 'h-link',
          worktreeId: WORKTREE,
          activeSessionTab: clicked,
          visibleTabs: [clicked],
          connState: 'connected',
          terminalsLoaded: true
        }
      })
    const detail = createElement(LocalTaskSessionCardMount, {
      controller: { hostId: 'h-link', worktreeId: WORKTREE, activeSessionTab: clicked },
      onOpenTask: vi.fn()
    })
    await show(createElement(LocalTaskSessionCardProvider, null, receipt(), detail))
    await host.ready()
    const linkButton = renderer!.root.find(
      (node) =>
        String(node.type) === 'Pressable' &&
        node.findAll(
          (child) =>
            String(child.type) === 'Text' &&
            child.props.children === localTasksCopy().work.linkSessionToTask
        ).length > 0
    )
    act(() => linkButton.props.onPress())
    expect(renderer!.root.find((node) => String(node.type) === 'ChoiceSheet').props.visible).toBe(
      true
    )

    await show(createElement(LocalTaskSessionCardProvider, null, receipt()))
    let sheet = renderer!.root.find((node) => String(node.type) === 'ChoiceSheet')
    expect(sheet.props.visible).toBe(true)
    env.state = 'disconnected'
    await show(createElement(LocalTaskSessionCardProvider, null, receipt()))
    sheet = renderer!.root.find((node) => String(node.type) === 'ChoiceSheet')
    expect(sheet.props.choices).toEqual([])
    expect(sheet.props.message).toBe(localTasksCopy().work.sessionStates.unverifiable)
    expect(host.writes).toHaveLength(0)

    env.state = 'connected'
    await show(createElement(LocalTaskSessionCardProvider, null, receipt()))
    await host.ready()
    sheet = renderer!.root.find((node) => String(node.type) === 'ChoiceSheet')
    expect(sheet.props.choices).toHaveLength(1)
    await act(async () => {
      sheet.props.choices[0].onPress()
      await Promise.resolve()
    })
    expect(host.writes).toHaveLength(1)
    expect(host.writes[0]).toMatchObject({
      hostId: 'local',
      worktreeId: WORKTREE,
      surface: 'terminal',
      tabId: 'tab-1',
      taskId: 't13',
      linkedVia: 'manual',
      clientOperationId: expect.any(String)
    })
    expect(renderer!.root.find((node) => String(node.type) === 'ChoiceSheet').props.visible).toBe(
      false
    )
  })

  it('rejects a pending session choice after its clicked tab leaves the route inventory', async () => {
    const host = library({ projectCount: 1, linked: true })
    env.client = host.client
    const clicked = { ...agentTab, launchAgent: 'claude' as const }
    const routeController: SessionTaskReceiptController = {
      hostId: 'h-removed',
      worktreeId: WORKTREE,
      activeSessionTab: clicked,
      visibleTabs: [clicked],
      connState: 'connected',
      terminalsLoaded: true
    }
    await show(
      createElement(
        LocalTaskSessionCardProvider,
        null,
        createElement(LocalTaskSessionReceiptMount, { controller: routeController }),
        createElement(LocalTaskSessionCardMount, {
          controller: routeController,
          onOpenTask: vi.fn()
        })
      )
    )
    await host.ready()
    const linkButton = renderer!.root.find(
      (node) =>
        String(node.type) === 'Pressable' &&
        node.findAll(
          (child) =>
            String(child.type) === 'Text' &&
            child.props.children === localTasksCopy().work.linkSessionToTask
        ).length > 0
    )
    act(() => linkButton.props.onPress())
    expect(renderer!.root.find((node) => String(node.type) === 'ChoiceSheet').props.visible).toBe(
      true
    )

    routeController.visibleTabs = []
    routeController.connState = 'disconnected'
    env.state = 'disconnected'
    await show(
      createElement(
        LocalTaskSessionCardProvider,
        null,
        createElement(LocalTaskSessionReceiptMount, { controller: routeController })
      )
    )
    let sheet = renderer!.root.find((node) => String(node.type) === 'ChoiceSheet')
    expect(sheet.props.visible).toBe(true)
    expect(sheet.props.choices).toEqual([])
    expect(sheet.props.message).toBe(localTasksCopy().work.sessionStates.unverifiable)

    routeController.connState = 'connected'
    env.state = 'connected'
    await show(
      createElement(
        LocalTaskSessionCardProvider,
        null,
        createElement(LocalTaskSessionReceiptMount, { controller: routeController })
      )
    )
    await host.ready()
    sheet = renderer!.root.find((node) => String(node.type) === 'ChoiceSheet')
    expect(sheet.props.visible).toBe(false)
    expect(host.writes).toHaveLength(0)
  })

  it('does not let an earlier write close a new choice, and scopes operation IDs to each opening', async () => {
    const host = library({ projectCount: 1, linked: true, deferRecord: true })
    env.client = host.client
    const clicked = { ...agentTab, launchAgent: 'claude' as const }
    const controller = { hostId: 'h-deferred', worktreeId: WORKTREE, activeSessionTab: clicked }
    await show(
      createElement(
        LocalTaskSessionCardProvider,
        null,
        createElement(LocalTaskSessionReceiptMount, {
          controller: {
            ...controller,
            visibleTabs: [clicked],
            connState: 'connected',
            terminalsLoaded: true
          }
        }),
        createElement(LocalTaskSessionCardMount, {
          controller,
          onOpenTask: vi.fn()
        })
      )
    )
    await host.ready()
    const linkButton = renderer!.root.find(
      (node) =>
        String(node.type) === 'Pressable' &&
        node.findAll(
          (child) =>
            String(child.type) === 'Text' &&
            child.props.children === localTasksCopy().work.linkSessionToTask
        ).length > 0
    )
    act(() => linkButton.props.onPress())
    let sheet = renderer!.root.find((node) => String(node.type) === 'ChoiceSheet')
    const oldChoice = sheet.props.choices[0].onPress
    act(() => sheet.props.choices[0].onPress())
    expect(host.writes).toHaveLength(1)
    act(() => sheet.props.onClose())
    act(() => linkButton.props.onPress())
    act(() => oldChoice())
    expect(host.writes).toHaveLength(1)
    sheet = renderer!.root.find((node) => String(node.type) === 'ChoiceSheet')
    act(() => sheet.props.choices[0].onPress())
    act(() => sheet.props.choices[0].onPress())
    expect(host.writes).toHaveLength(3)
    const operationId = (value: unknown) =>
      value && typeof value === 'object' && 'clientOperationId' in value
        ? value.clientOperationId
        : null
    expect(operationId(host.writes[0])).not.toBe(operationId(host.writes[1]))
    expect(operationId(host.writes[1])).toBe(operationId(host.writes[2]))

    await host.settleRecord(0)
    sheet = renderer!.root.find((node) => String(node.type) === 'ChoiceSheet')
    expect(sheet.props.visible).toBe(true)
    expect(sheet.props.error).toBeNull()
    expect(sheet.props.choices).toHaveLength(1)
    await host.settleRecord(1)
    await host.settleRecord(2)
    expect(renderer!.root.find((node) => String(node.type) === 'ChoiceSheet').props.visible).toBe(
      false
    )
  })

  it('clears a pending session choice when its route loses focus', async () => {
    const host = library({ projectCount: 1, linked: true })
    env.client = host.client
    const clicked = { ...agentTab, launchAgent: 'claude' as const }
    const controller = { hostId: 'h-blur', worktreeId: WORKTREE, activeSessionTab: clicked }
    await show(
      createElement(
        LocalTaskSessionCardProvider,
        null,
        createElement(LocalTaskSessionReceiptMount, {
          controller: {
            ...controller,
            visibleTabs: [clicked],
            connState: 'connected',
            terminalsLoaded: true
          }
        }),
        createElement(LocalTaskSessionCardMount, {
          controller,
          onOpenTask: vi.fn()
        })
      )
    )
    await host.ready()
    const linkButton = renderer!.root.find(
      (node) =>
        String(node.type) === 'Pressable' &&
        node.findAll(
          (child) =>
            String(child.type) === 'Text' &&
            child.props.children === localTasksCopy().work.linkSessionToTask
        ).length > 0
    )
    act(() => linkButton.props.onPress())
    const sheet = renderer!.root.find((node) => String(node.type) === 'ChoiceSheet')
    expect(sheet.props.visible).toBe(true)
    const oldChoice = sheet.props.choices[0].onPress
    act(() => focusCleanup.current?.())
    expect(renderer!.root.findAll((node) => String(node.type) === 'ChoiceSheet')).toHaveLength(0)
    act(() => oldChoice())
    expect(host.writes).toHaveLength(0)
  })

  it('keeps acknowledgement in the mounted receipt, never in the card', async () => {
    const host = library({ projectCount: 1, linked: true, waiting: true })
    env.client = host.client
    await show(
      createElement(
        Fragment,
        null,
        card('h-receipt', agentTab),
        createElement(LocalTaskSessionReceipt, {
          controller: {
            hostId: 'h-receipt',
            worktreeId: WORKTREE,
            activeSessionTab: agentTab,
            visibleTabs: [agentTab],
            connState: 'connected',
            terminalsLoaded: true
          }
        })
      )
    )
    await host.ready()
    expect(acknowledgeHook).toHaveBeenCalledWith(host.client, session.id, expect.anything())
  })
})
