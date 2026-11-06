import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTaskSite } from './local-task-endpoint'
import { SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoint'
import { createLocalTasksApi, type LocalTasksApi } from './local-tasks-api'
import type { LocalTasksLibrary } from './use-local-tasks-library'
import type { RpcClient } from '../transport/rpc-client'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  TextInput: 'TextInput',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles }
}))
vi.mock('lucide-react-native', () => ({ Send: 'Send' }))
vi.mock('./local-task-choice-sheet', () => ({ LocalTaskChoiceSheet: 'LocalTaskChoiceSheet' }))
vi.mock('./local-task-launch-sheet', () => ({
  LocalTaskLaunchSheet: () => null,
  localTaskHostLabel: (hostId: string) => hostId,
  localTaskSetupLabel: () => 'Local repo'
}))
const choices: { setups: Record<string, unknown>[]; workspaces: Record<string, unknown>[] } =
  vi.hoisted(() => ({ setups: [], workspaces: [] }))
vi.mock('./use-local-task-project-catalog', () => ({
  useLocalTaskProjectCatalog: () => ({
    state: 'ready',
    catalog: { repos: [], setups: choices.setups }
  })
}))
vi.mock('./use-local-task-workspace-candidates', () => ({
  useLocalTaskWorkspaceCandidates: () => ({ status: 'ready', candidates: choices.workspaces })
}))
vi.mock('./use-local-task-host-labels', () => ({ useLocalTaskHostLabels: () => new Map() }))
const sent = vi.hoisted(() => ({ reply: vi.fn(), open: vi.fn() }))
vi.mock('./local-task-reply-send', () => ({ sendLocalTaskReply: sent.reply }))
vi.mock('./use-local-task-launch', () => ({
  useLocalTaskLaunch: () => ({
    request: null,
    agents: { status: 'ready', agents: [] },
    busy: false,
    notice: null,
    open: sent.open,
    close: vi.fn(),
    chooseSetup: vi.fn(),
    launch: vi.fn()
  })
}))

import { LocalTaskDispatchInput } from './local-task-dispatch-input'

const project = {
  id: 'p',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: false, prMergedCompletes: false },
  statuses: [],
  createdAt: 0,
  updatedAt: 0,
  revision: 1
} satisfies LocalTaskProject
const parent = {
  id: 'parent',
  projectId: 'p',
  number: 1,
  ref: 'SHOP-1',
  title: 'Parent',
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
const child = { ...parent, id: 'child', number: 2, ref: 'SHOP-2', parentId: parent.id }
const workspace = {
  taskId: parent.id,
  hostId: 'local',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: 'wt-1',
  folderWorkspaceId: null,
  repoId: 'repo-1',
  branchSnapshot: null,
  nameSnapshot: 'Workspace',
  hostLabelSnapshot: null,
  linkedVia: 'start',
  linkedAt: 1
} satisfies LocalTaskWorkspaceLink
const session = {
  id: 'session-1',
  taskId: parent.id,
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
const client: RpcClient = {
  sendRequest: async () => ({ id: 'test', ok: true, result: {} }),
  subscribe: () => () => {},
  updateTerminalSubscriptionViewport: () => {},
  getState: () => 'connected',
  getReconnectAttempt: () => 0,
  getLastConnectedAt: () => null,
  onStateChange: () => () => {},
  notifyForeground: () => {},
  close: () => {}
}
const site: LocalTaskSite = {
  hostId: 'host-1',
  pairedClient: null,
  client,
  endpoint: SELF_LOCAL_TASK_ENDPOINT,
  connState: 'connected',
  capabilities: [],
  label: 'Desktop'
}

function mount(state: 'done' | 'working', createTask: LocalTasksApi['createTask'] = vi.fn()) {
  const library: LocalTasksLibrary = {
    api: null,
    tasks: [parent],
    projects: [project],
    status: null,
    loaded: true,
    error: null,
    eventsVersion: 0,
    live: true,
    streamEnded: false,
    work: {
      links: { workspaces: [workspace], sessions: [session] },
      progress: {
        observedAt: 1,
        sessions: [
          { taskSessionId: session.id, state, lastMessage: null, stateSince: 1, unread: false }
        ],
        items: []
      },
      error: null
    },
    acceptTasks: vi.fn(),
    reload: vi.fn(),
    retryFailed: vi.fn(),
    resubscribe: vi.fn()
  }
  const api: LocalTasksApi = { ...createLocalTasksApi(client), createTask }
  let tree!: ReactTestRenderer
  act(() => {
    tree = create(
      createElement(LocalTaskDispatchInput, { site, api, library, project, onNavigate: vi.fn() })
    )
  })
  return { tree, library }
}

async function chooseParentAndSend(tree: ReactTestRenderer) {
  await act(async () => {
    tree.root.findByType('TextInput').props.onChangeText('@SHOP-1')
  })
  const sheet = tree.root.findByType('LocalTaskChoiceSheet')
  await act(async () => {
    sheet.props.choices.find((choice: { key: string }) => choice.key === 'task:parent').onPress()
  })
  await act(async () => {
    tree.root.findByType('TextInput').props.onChangeText('Fix the export')
  })
  await act(async () => {
    tree.root
      .findAllByType('Pressable')
      .find((button) => button.props.accessibilityLabel === 'Start task')
      ?.props.onPress()
  })
}

beforeEach(() => {
  sent.reply.mockReset()
  sent.open.mockReset()
  sent.open.mockResolvedValue(undefined)
  choices.setups = []
  choices.workspaces = []
})

describe('direct dispatch to an existing task', () => {
  it('filters workspace choices by selected host and repository', async () => {
    choices.setups = [
      {
        id: 'a',
        projectId: 'repo-a',
        hostId: 'local',
        repoId: 'id:a',
        displayName: 'shop-a',
        setupMethod: 'cloned'
      },
      {
        id: 'b',
        projectId: 'repo-b',
        hostId: 'ssh:box',
        repoId: 'id:b',
        displayName: 'shop-b',
        setupMethod: 'cloned'
      }
    ]
    choices.workspaces = [
      {
        worktreeId: 'wt-a',
        repoId: 'id:a',
        hostId: 'local',
        displayName: 'work-a',
        branch: '',
        instanceId: null,
        folderWorkspaceId: null
      },
      {
        worktreeId: 'wt-b',
        repoId: 'id:b',
        hostId: 'ssh:box',
        displayName: 'work-b',
        branch: '',
        instanceId: null,
        folderWorkspaceId: null
      }
    ]
    const { tree } = mount('done')
    await act(async () => tree.root.findByType('TextInput').props.onChangeText('@'))
    let sheet = tree.root.findByType('LocalTaskChoiceSheet')
    expect(sheet.props.choices.map((choice: { key: string }) => choice.key)).toContain(
      'workspace:ssh:box:wt-b'
    )
    await act(async () => sheet.props.search.onChange('work-b'))
    sheet = tree.root.findByType('LocalTaskChoiceSheet')
    expect(sheet.props.choices.map((choice: { key: string }) => choice.key)).toContain(
      'workspace:ssh:box:wt-b'
    )
    expect(sheet.props.choices.map((choice: { key: string }) => choice.key)).not.toContain(
      'workspace:local:wt-a'
    )
    await act(async () => sheet.props.search.onChange(''))
    sheet = tree.root.findByType('LocalTaskChoiceSheet')
    await act(async () =>
      sheet.props.choices.find((choice: { key: string }) => choice.key === 'host:local').onPress()
    )
    sheet = tree.root.findByType('LocalTaskChoiceSheet')
    expect(sheet.props.choices.map((choice: { key: string }) => choice.key)).not.toContain(
      'workspace:ssh:box:wt-b'
    )
    await act(async () =>
      sheet.props.choices.find((choice: { key: string }) => choice.key === 'repo:id:a').onPress()
    )
    sheet = tree.root.findByType('LocalTaskChoiceSheet')
    expect(sheet.props.choices.map((choice: { key: string }) => choice.key)).toContain(
      'workspace:local:wt-a'
    )
  })
  it('sends into a completed turn without creating another task', async () => {
    sent.reply.mockResolvedValue({ kind: 'delivered' })
    const createTask = vi.fn()
    const { tree } = mount('done', createTask)
    await chooseParentAndSend(tree)
    expect(sent.reply).toHaveBeenCalledWith(
      expect.objectContaining({ session, text: 'Fix the export' })
    )
    expect(createTask).not.toHaveBeenCalled()
  })

  it('creates a child and opens a new session while the existing one works', async () => {
    const createTask = vi.fn().mockResolvedValue({ kind: 'ok', value: { ok: true, task: child } })
    const { tree } = mount('working', createTask)
    await chooseParentAndSend(tree)
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: parent.id, description: 'Fix the export' })
    )
    expect(sent.open).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'session', sessionTask: child, workspace }),
      expect.any(String)
    )
    expect(sent.reply).not.toHaveBeenCalled()
  })
})
