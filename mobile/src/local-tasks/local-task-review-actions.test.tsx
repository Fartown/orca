import { createElement, type ReactNode } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { createLocalTasksApi, type LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoint'
import { sendLocalTaskReply } from './local-task-reply-send'
import { LocalTaskReviewActions } from './local-task-review-actions'
import type { LocalTasksLibrary } from './use-local-tasks-library'

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('lucide-react-native', () => ({
  Check: 'Check',
  CircleCheck: 'CircleCheck',
  Undo2: 'Undo2'
}))
vi.mock('../components/bottom-drawer/BottomDrawer', () => ({
  BottomDrawer: (props: { visible: boolean; children: ReactNode }) =>
    props.visible ? props.children : null
}))
vi.mock('./local-task-reply-send', () => ({ sendLocalTaskReply: vi.fn() }))

const project: LocalTaskProject = {
  id: 'p',
  name: 'P',
  prefix: 'P',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  statuses: [
    {
      id: 'doing',
      projectId: 'p',
      name: 'Doing',
      category: 'started',
      color: 'yellow',
      position: 0
    },
    {
      id: 'review',
      projectId: 'p',
      name: 'Review',
      category: 'review',
      color: 'green',
      position: 1
    },
    { id: 'done', projectId: 'p', name: 'Done', category: 'completed', color: 'blue', position: 2 }
  ],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

function task(id: string, statusId: string, parentId: string | null = null): LocalTask {
  return {
    id,
    projectId: 'p',
    number: 1,
    ref: id,
    title: id,
    description: '',
    criteria: [],
    statusId,
    priority: 0,
    labels: [],
    parentId,
    createdAt: 0,
    updatedAt: 0,
    revision: 0
  }
}

function session(id: string, taskId: string): LocalTaskSessionLink {
  return {
    id,
    taskId,
    hostId: 'local',
    worktreeId: 'repo::/wt',
    instanceId: null,
    surface: 'terminal',
    tabId: `tab-${id}`,
    paneKey: null,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 0
  }
}

const parent = task('parent', 'review')
const child = task('child', 'doing', 'parent')

function library(progress: LocalTaskProgressSnapshot): LocalTasksLibrary {
  return {
    api: null,
    status: null,
    projects: [project],
    tasks: [parent, child],
    loaded: true,
    error: null,
    eventsVersion: 0,
    live: true,
    streamEnded: false,
    reload: vi.fn(),
    retryFailed: vi.fn(),
    resubscribe: vi.fn(),
    acceptTasks: vi.fn(),
    work: {
      links: {
        workspaces: [],
        sessions: [session('s-parent', 'parent'), session('s-child', 'child')]
      },
      progress,
      error: null
    }
  }
}

function snapshot(states: Record<string, 'done' | 'working'>): LocalTaskProgressSnapshot {
  return {
    observedAt: 1,
    items: [],
    sessions: Object.entries(states).map(([taskSessionId, state]) => ({
      taskSessionId,
      state,
      lastMessage: null,
      stateSince: null,
      unread: false
    }))
  }
}

let renderer: ReactTestRenderer | null = null
const onError = vi.fn()
const addComment = vi.fn()

function render(progress: LocalTaskProgressSnapshot) {
  const api: LocalTasksApi = {
    ...createLocalTasksApi({
      sendRequest: async () => {
        throw new Error('unexpected RPC')
      }
    }),
    addComment
  }
  act(() => {
    renderer = create(
      createElement(LocalTaskReviewActions, {
        task: parent,
        project,
        api,
        site: {
          hostId: 'paired',
          pairedClient: null,
          endpoint: SELF_LOCAL_TASK_ENDPOINT,
          client: null,
          connState: 'connected',
          capabilities: [],
          label: 'minizc'
        },
        library: library(progress),
        copy: localTasksCopy(),
        readOnly: false,
        onUpdateStatus: async () => true,
        onError
      })
    )
  })
  const tree = renderer!
  act(() =>
    tree.root.findByProps({ children: localTasksCopy().rejectReview }).parent?.props.onPress()
  )
  act(() =>
    tree.root
      .findByProps({ testID: 'local-task-reply-input' })
      .props.onChangeText('The export drops the header row')
  )
  return tree
}

beforeEach(() => {
  vi.mocked(sendLocalTaskReply).mockReset().mockResolvedValue({ kind: 'delivered' })
  addComment.mockReset().mockResolvedValue({ kind: 'ok', value: {} })
  onError.mockReset()
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})

it('sends a reason once to every finished session of the task and its subtasks, however often Send is tapped', async () => {
  const tree = render(snapshot({ 's-parent': 'working', 's-child': 'done' }))
  const send = () => tree.root.findByProps({ testID: 'local-task-reply-send' }).props.onPress()
  await act(async () => {
    send()
    send()
  })
  expect(addComment).toHaveBeenCalledTimes(1)
  expect(sendLocalTaskReply).toHaveBeenCalledTimes(1)
  expect(vi.mocked(sendLocalTaskReply).mock.calls[0]?.[0]).toMatchObject({
    session: { id: 's-child' },
    text: 'The export drops the header row'
  })
})

it('says so when no session finished a turn instead of sending nothing silently', async () => {
  const tree = render(snapshot({ 's-parent': 'working', 's-child': 'working' }))
  await act(async () => {
    tree.root.findByProps({ testID: 'local-task-reply-send' }).props.onPress()
  })
  expect(sendLocalTaskReply).not.toHaveBeenCalled()
  expect(onError).toHaveBeenLastCalledWith(
    expect.stringContaining('No session has finished a turn')
  )
})
