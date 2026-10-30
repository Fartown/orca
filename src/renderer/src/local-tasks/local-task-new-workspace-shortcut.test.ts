import { beforeEach, expect, it, vi } from 'vitest'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})

import { useAppStore } from '@/store'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { openNewWorkspaceFromShortcut } from '@/hooks/ipc-events/new-workspace-command'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskPageStore } from './local-task-page-store'
import { LOCAL_TASK_COMPOSER_KEY } from './local-task-start-work'

const WORKTREE_ID = 'repo1::/repo1/shop-12'
const project: LocalTaskProject = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
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
const task: LocalTask = {
  id: 't12',
  projectId: 'shop',
  number: 12,
  ref: 'SHOP-12',
  title: 'Order export',
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

function pressCmdN(): Record<string, unknown> | undefined {
  const openModal = vi.fn()
  openNewWorkspaceFromShortcut({
    activeModal: 'none',
    activeView: 'tasks',
    taskPageData: {},
    openModal
  })
  expect(openModal).toHaveBeenCalledWith('new-workspace-composer', expect.anything())
  return openModal.mock.calls[0][1]
}

beforeEach(() => {
  useAppStore.setState({
    repos: [{ id: 'repo1', path: '/repo1', displayName: 'Shop', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: {},
    projectHostSetups: []
  })
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  const library = localTasksDomainStore.getState().writer('local')
  library.applyProjects([project])
  library.applyTasks([task])
  library.applyLinks({ workspaces: [], sessions: [] })
  localTaskPageStore.getState().setLocalActive(true)
  localTaskPageStore.getState().openDetail('t12')
})

it('starts the open local task when Cmd+N is pressed on its detail page', () => {
  expect(pressCmdN()).toMatchObject({
    telemetrySource: 'shortcut',
    initialRepoId: 'repo1',
    prefilledName: 'shop-12-order-export',
    [LOCAL_TASK_COMPOSER_KEY]: { taskId: 't12', replace: false }
  })
})

it('opens the plain composer when no task is open or the task already has its workspace', () => {
  localTaskPageStore.getState().openDetail(null)
  expect(pressCmdN()).toEqual({ telemetrySource: 'shortcut' })
  localTaskPageStore.getState().openDetail('t12')
  useAppStore.setState({
    worktreesByRepo: { repo1: [makeWorktree({ id: WORKTREE_ID, repoId: 'repo1' })] }
  })
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyLinks({
      workspaces: [
        {
          taskId: 't12',
          hostId: 'local',
          kind: 'git-worktree',
          instanceId: null,
          worktreeId: WORKTREE_ID,
          folderWorkspaceId: null,
          repoId: 'repo1',
          branchSnapshot: null,
          nameSnapshot: null,
          hostLabelSnapshot: null,
          linkedVia: 'start',
          linkedAt: 1
        }
      ],
      sessions: []
    })
  expect(pressCmdN()).toEqual({ telemetrySource: 'shortcut' })
})
