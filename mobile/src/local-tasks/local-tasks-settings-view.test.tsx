import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { createLocalTasksApi, type LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTasksSettingsView } from './local-tasks-settings-view'
import type { LocalTasksLibrary } from './use-local-tasks-library'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Switch: 'Switch',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 }
}))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 })
}))
vi.mock('lucide-react-native', () => ({
  ChevronLeft: 'ChevronLeft',
  ChevronRight: 'ChevronRight',
  Layers: 'Layers',
  Plus: 'Plus',
  Trash2: 'Trash2'
}))
vi.mock('../components/ConfirmModal', () => ({ ConfirmModal: 'ConfirmModal' }))
vi.mock('../components/TextInputModal', () => ({ TextInputModal: 'TextInputModal' }))
vi.mock('./local-tasks-status-section', () => ({ LocalTasksStatusSection: () => null }))
vi.mock('./local-task-repos-section', () => ({ LocalTaskReposSection: () => null }))
vi.mock('./local-task-form-fields', () => ({
  LocalTaskFormPrompts: () => null,
  LocalTaskPropertyRow: ({ children }: { children: React.ReactNode }) => children
}))

const project: LocalTaskProject = {
  id: 'p',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  repos: ['orca'],
  defaultRepoId: 'orca',
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: false, prMergedCompletes: false },
  statuses: [],
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}

const task: LocalTask = {
  id: 't',
  projectId: 'p',
  number: 1,
  ref: 'SHOP-1',
  title: 'Task',
  description: '',
  criteria: [],
  statusId: 's',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

function testApi(overrides: Partial<LocalTasksApi>): LocalTasksApi {
  const base = createLocalTasksApi({
    sendRequest: async () => {
      throw new Error('unexpected RPC')
    }
  })
  return { ...base, ...overrides }
}

function testLibrary(overrides: Partial<LocalTasksLibrary>): LocalTasksLibrary {
  return {
    api: null,
    status: null,
    projects: [],
    tasks: [],
    loaded: true,
    error: null,
    eventsVersion: 0,
    live: true,
    streamEnded: false,
    retryFailed: vi.fn(),
    resubscribe: vi.fn(),
    reload: vi.fn(),
    acceptTasks: vi.fn(),
    work: { links: { workspaces: [], sessions: [] }, progress: null, error: null },
    ...overrides
  }
}

describe('mobile project deletion', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(async () => {
    await act(async () => renderer?.unmount())
    renderer = null
  })

  it('confirms record count and reuses the operation id after an unknown reply', async () => {
    const removeProject = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'unknown' })
      .mockResolvedValueOnce({ kind: 'ok', value: {} })
    const onDeletedProject = vi.fn()
    const reload = vi.fn()
    const library = testLibrary({ projects: [project], tasks: [task], reload })
    const props = {
      api: testApi({ removeProject }),
      library,
      orcaProjects: { state: 'unavailable' as const },
      projectId: 'p',
      readOnly: false,
      onBack: vi.fn(),
      onOpenProject: vi.fn(),
      onCreateProject: vi.fn(),
      onDeletedProject
    }
    await act(async () => {
      renderer = create(createElement(LocalTasksSettingsView, props))
    })
    const deleteButton = () =>
      renderer?.root.findAll(
        (node) =>
          String(node.type) === 'Pressable' &&
          node.findAll(
            (child) =>
              String(child.type) === 'Text' &&
              child.children.includes(localTasksCopy().deleteProject)
          ).length > 0
      )[0]
    await act(async () => deleteButton()?.props.onPress())
    let confirm = renderer?.root.findAll(
      (node) => String(node.type) === 'ConfirmModal' && node.props.visible
    )[0]
    expect(confirm?.props.message).toContain('Its tasks (1)')
    await act(async () => {
      confirm?.props.onConfirm()
      confirm?.props.onCancel()
    })
    expect(onDeletedProject).not.toHaveBeenCalled()
    await act(async () => deleteButton()?.props.onPress())
    confirm = renderer?.root.findAll(
      (node) => String(node.type) === 'ConfirmModal' && node.props.visible
    )[0]
    await act(async () => {
      confirm?.props.onConfirm()
      confirm?.props.onCancel()
    })
    expect(removeProject).toHaveBeenCalledTimes(2)
    expect(removeProject.mock.calls[0]?.[0].clientOperationId).toBe(
      removeProject.mock.calls[1]?.[0].clientOperationId
    )
    expect(onDeletedProject).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledWith(['projects', 'tasks'])
  })

  it('disables deletion in read-only libraries', async () => {
    const removeProject = vi.fn()
    const props = {
      api: testApi({ removeProject }),
      library: testLibrary({ projects: [project] }),
      orcaProjects: { state: 'unavailable' as const },
      projectId: 'p',
      readOnly: true,
      onBack: vi.fn(),
      onOpenProject: vi.fn(),
      onCreateProject: vi.fn(),
      onDeletedProject: vi.fn()
    }
    await act(async () => {
      renderer = create(createElement(LocalTasksSettingsView, props))
    })
    const deleteButton = renderer?.root.findAll(
      (node) =>
        String(node.type) === 'Pressable' &&
        node.props.disabled &&
        node.findAll(
          (child) =>
            String(child.type) === 'Text' && child.children.includes(localTasksCopy().deleteProject)
        ).length > 0
    )[0]
    expect(deleteButton).toBeDefined()
    expect(removeProject).not.toHaveBeenCalled()
  })
})
