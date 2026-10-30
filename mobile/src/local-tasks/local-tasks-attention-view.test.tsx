import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  LocalTaskAttentionItem,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { ConnectionState } from '../transport/types'
import { createLocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTasksAttentionView } from './local-tasks-attention-view'
import { localTaskAttentionRows } from './local-task-progress-projection'
import { sendLocalTaskReply } from './local-task-reply-send'
import type { LocalTasksLibrary } from './use-local-tasks-library'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('../components/ActionSheetModal', () => ({ ActionSheetModal: 'ActionSheetModal' }))
vi.mock('../components/BottomDrawer', () => ({
  BottomDrawer: (props: { visible: boolean; children: ReactNode }) =>
    props.visible ? props.children : null
}))
vi.mock('./local-task-reply-send', () => ({ sendLocalTaskReply: vi.fn() }))

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

const done: LocalTaskAttentionItem = {
  key: 'tab-1:leaf@1000',
  taskId: task.id,
  taskSessionId: 'session-1',
  kind: 'unread-done',
  agent: 'Claude',
  lastMessage: 'Done with the export',
  since: 1_000,
  replyable: true
}

const session: LocalTaskSessionLink = {
  id: 'session-1',
  taskId: task.id,
  hostId: 'local',
  worktreeId: 'repo::/shop-13',
  instanceId: null,
  surface: 'terminal',
  tabId: 'tab-1',
  paneKey: 'tab-1:leaf',
  sessionId: null,
  providerSession: null,
  agent: 'claude',
  linkedVia: 'start',
  openedAt: 1
}

const snapshot: LocalTaskProgressSnapshot = { observedAt: 2_000, sessions: [], items: [done] }

function library(progress: LocalTaskProgressSnapshot = snapshot): LocalTasksLibrary {
  return {
    api: null,
    status: null,
    projects: [],
    tasks: [task],
    loaded: true,
    error: null,
    eventsVersion: 0,
    live: true,
    streamEnded: false,
    reload: vi.fn(),
    retryFailed: vi.fn(),
    resubscribe: vi.fn(),
    acceptTasks: vi.fn(),
    work: { links: { workspaces: [], sessions: [session] }, progress, error: null }
  }
}

let renderer: ReactTestRenderer | null = null
beforeEach(() => {
  vi.mocked(sendLocalTaskReply).mockReset()
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

function render(connState: ConnectionState, progress: LocalTaskProgressSnapshot = snapshot) {
  act(() => {
    renderer = create(
      createElement(LocalTasksAttentionView, {
        library: library(progress),
        api: createLocalTasksApi({
          sendRequest: async () => {
            throw new Error('unexpected RPC')
          }
        }),
        site: { client: null, connState, label: 'minizc' },
        rows: localTaskAttentionRows({ snapshot: progress, tasks: [task], projectId: null }),
        now: 60_000,
        canWrite: connState === 'connected',
        bottomInset: 0,
        onOpenTask: vi.fn(),
        onOpenSession: vi.fn()
      })
    )
  })
  return renderer!
}

function openReply(tree: ReactTestRenderer) {
  act(() => tree.root.findByProps({ testID: `reply-${done.key}` }).props.onPress())
}

function input(tree: ReactTestRenderer) {
  return tree.root.findByProps({ testID: 'local-task-reply-input' })
}

async function send(tree: ReactTestRenderer, text: string) {
  act(() => input(tree).props.onChangeText(text))
  await act(async () => {
    tree.root.findByProps({ testID: 'local-task-reply-send' }).props.onPress()
  })
}

describe('replying from "Needs you"', () => {
  it('keeps the reply box disabled and says it is reconnecting while the host is out of contact', () => {
    const tree = render('reconnecting')
    openReply(tree)
    expect(input(tree).props.editable).toBe(false)
    expect(input(tree).props.placeholder).toBe(localTasksCopy().work.replyReconnecting)
    expect(tree.root.findByProps({ testID: 'local-task-reply-send' }).props.disabled).toBe(true)
    expect(tree.root.findByProps({ testID: 'local-task-reply-offline' }).props.children).toBe(
      localTasksCopy().work.replyDisconnected('minizc')
    )
  })

  it('puts the text back when nothing reached the agent, and sends only once', async () => {
    vi.mocked(sendLocalTaskReply).mockResolvedValue({ kind: 'not-sent', reason: 'input locked' })
    const tree = render('connected')
    openReply(tree)
    await send(tree, 'run the tests next')
    expect(sendLocalTaskReply).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendLocalTaskReply).mock.calls[0]?.[0]).toMatchObject({
      session,
      text: 'run the tests next'
    })
    openReply(tree)
    expect(input(tree).props.value).toBe('run the tests next')
    expect(tree.root.findByProps({ testID: `reply-state-${done.key}` }).props.children).toBe(
      localTasksCopy().work.replyNotSentBecause('input locked')
    )
  })

  it('neither resends nor restores a reply whose answer was lost', async () => {
    vi.mocked(sendLocalTaskReply).mockResolvedValue({ kind: 'unconfirmed' })
    const tree = render('connected')
    openReply(tree)
    await send(tree, 'ship it')
    openReply(tree)
    expect(input(tree).props.value).toBe('')
    expect(sendLocalTaskReply).toHaveBeenCalledTimes(1)
    expect(tree.root.findByProps({ testID: `reply-state-${done.key}` }).props.children).toBe(
      localTasksCopy().work.replyStates.unconfirmed
    )
  })
})

describe('an empty "Needs you"', () => {
  const message = (tree: ReactTestRenderer) =>
    tree.root.findByProps({ testID: 'local-tasks-attention-message' }).props.children

  it('does not call it empty while a session runs on a host the library cannot reach', () => {
    const unreachable: LocalTaskProgressSnapshot = {
      observedAt: 2_000,
      sessions: [
        {
          taskSessionId: session.id,
          state: 'unverifiable',
          lastMessage: null,
          stateSince: null,
          unread: false
        }
      ],
      items: []
    }
    expect(message(render('connected', unreachable))).toBe(
      localTasksCopy().work.attentionUnverifiableHosts
    )
  })

  it('is empty only when every session it reads can be confirmed', () => {
    const quiet: LocalTaskProgressSnapshot = { observedAt: 2_000, sessions: [], items: [] }
    expect(message(render('connected', quiet))).toBe(localTasksCopy().work.attentionEmpty)
  })
})
