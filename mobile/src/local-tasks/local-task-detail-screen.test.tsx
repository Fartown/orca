import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import { SELF_LOCAL_TASK_ENDPOINT, type LocalTaskSite } from './local-task-endpoint'
import { createLocalTasksApi } from './local-tasks-api'
import type { LocalTaskDetailProps } from './local-task-detail-view'
import type { LocalTasksLibrary } from './use-local-tasks-library'

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 })
}))
vi.mock('lucide-react-native', () => ({
  ChevronDown: 'ChevronDown',
  ChevronLeft: 'ChevronLeft',
  Ellipsis: 'Ellipsis',
  Layers: 'Layers',
  Pencil: 'Pencil',
  Trash2: 'Trash2'
}))
vi.mock('../components/sheets/ActionSheetModal', () => ({ ActionSheetModal: () => null }))
vi.mock('../components/sheets/ConfirmModal', () => ({ ConfirmModal: () => null }))
vi.mock('./local-task-activity-section', () => ({ LocalTaskActivitySection: () => null }))
vi.mock('./local-task-detail-head', () => ({
  LocalTaskAncestorPath: () => null,
  LocalTaskDetailWhere: () => null
}))
vi.mock('./local-task-detail-sections', () => ({ LocalTaskDetailSections: () => null }))
vi.mock('./local-task-pickers', () => ({
  LocalTaskPriorityPicker: () => null,
  LocalTaskStatusPicker: () => null
}))
vi.mock('./local-task-now-card', () => ({ LocalTaskNowCard: () => null }))
vi.mock('./local-task-preview-drawer', () => ({ LocalTaskPreviewDrawer: () => null }))
vi.mock('./local-task-review-actions', () => ({ LocalTaskReviewActions: () => null }))
vi.mock('./local-tasks-visuals', () => ({
  LocalTaskPriorityIcon: () => null,
  LocalTaskStatusIcon: () => null
}))
vi.mock('./use-local-task-card-context', () => ({
  useLocalTaskCardContext: () => ({
    context: { hostName: () => '', hostConnected: () => true, reviewDetail: () => null }
  })
}))
vi.mock('./local-task-card-facts', () => ({ localTaskCardFacts: () => ({ workspace: null }) }))
vi.mock('./use-local-tasks-library', () => ({ useLocalTaskEvents: () => ({ events: [] }) }))
vi.mock('./local-task-work-section', () => ({
  useLocalTaskWorkControls: () => ({
    primary: null,
    notices: null,
    menuActions: [],
    sheets: null,
    requestUnlinkSession: null
  })
}))

import { LocalTaskDetailScreen } from './local-task-detail-screen'

const task: LocalTask = {
  id: 'task-4',
  projectId: 'project-1',
  number: 4,
  ref: 'ORCA-4',
  title: 'Improve the task details on a narrow phone',
  description: '',
  criteria: [],
  statusId: 'todo',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}
const project: LocalTaskProject = {
  id: task.projectId,
  name: 'A very long project name for a narrow phone',
  prefix: 'ORCA',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [],
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}

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
const api = createLocalTasksApi(client)
const site = {
  hostId: 'host-1',
  pairedClient: client,
  client,
  endpoint: SELF_LOCAL_TASK_ENDPOINT,
  connState: 'connected',
  capabilities: [],
  label: 'Desktop'
} satisfies LocalTaskSite
const library = {
  api,
  tasks: [task],
  projects: [project],
  status: null,
  loaded: true,
  error: null,
  eventsVersion: 0,
  live: true,
  streamEnded: false,
  work: { links: { workspaces: [], sessions: [] }, progress: null, error: null },
  acceptTasks: () => {},
  reload: () => {},
  retryFailed: () => {},
  resubscribe: () => {}
} satisfies LocalTasksLibrary

let tree: ReactTestRenderer | null = null
afterEach(() => {
  act(() => tree?.unmount())
  tree = null
})

it('names the task before its secondary reference while keeping both visible', () => {
  const props = {
    task,
    taskId: task.id,
    library,
    api,
    site,
    now: 1,
    readOnly: false,
    canRead: true,
    onBack: () => {},
    onOpenTask: () => {},
    onEdit: () => {},
    onAddSubtask: () => {},
    onOpenSession: () => null,
    onNavigate: () => {}
  } satisfies LocalTaskDetailProps & { task: LocalTask }
  act(() => {
    tree = create(createElement(LocalTaskDetailScreen, props))
  })
  const labels = tree!.root
    .findAll((node) => String(node.type) === 'Text')
    .map((node) => node.props.children)
  expect(labels).toContain(task.title)
  expect(labels).toContain(task.ref)
  expect(labels.indexOf(task.title)).toBeLessThan(labels.indexOf(task.ref))
  expect(tree!.root.findByProps({ testID: 'local-task-detail-title' }).props.numberOfLines).toBe(
    undefined
  )
  const meta = tree!.root.findByProps({ testID: 'local-task-detail-meta' })
  const refProject = meta.findByProps({ testID: 'local-task-detail-ref-project' })
  expect(refProject.props.numberOfLines).toBe(1)
  expect(refProject.props.children[1]).toContain(project.name)
  const updated = meta.findByProps({ testID: 'local-task-detail-updated' })
  expect(updated.props.numberOfLines).toBe(1)
  expect(updated.props.children).toContain('Updated')
  const attributes = tree!.root.findByProps({ testID: 'local-task-detail-attributes' })
  const actions = attributes.findAll((node) => String(node.type) === 'Pressable')
  expect(actions.map((action) => action.props.accessibilityLabel)).toEqual([
    expect.stringContaining('Status:'),
    expect.stringContaining('Priority:')
  ])
  expect(
    actions.every((action) => !action.props.disabled && typeof action.props.onPress === 'function')
  ).toBe(true)
  expect(attributes.findAll((node) => String(node.type) === 'ChevronDown')).toHaveLength(2)
})
