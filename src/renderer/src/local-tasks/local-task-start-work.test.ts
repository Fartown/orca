import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type { WorktreeCreationCompleted } from './local-task-creation-events'

const fixture = vi.hoisted(() => ({
  linkWorkspace: vi.fn(),
  recordSession: vi.fn()
}))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: {
    linkWorkspace: fixture.linkWorkspace,
    recordSession: fixture.recordSession
  }
}))

import { useAppStore } from '@/store'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { notifyWorktreeCreationCompleted } from './local-task-creation-events'
import { localTasksDomainStore } from './local-tasks-domain-store'
import {
  bindLocalTaskStartWork,
  rememberLocalTaskStartForTests,
  resetLocalTaskStartWorkForTests
} from './local-task-start-work'

const WORKTREE_ID = 'repo1::/repo1/shop-12'

const task: LocalTask = {
  id: 'task-12',
  projectId: 'p',
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

function completed(overrides: Partial<WorktreeCreationCompleted> = {}): WorktreeCreationCompleted {
  return {
    creationId: 'creation-1',
    request: { agent: 'claude', executionHostId: 'local', workspaceRunContext: null },
    worktreeId: WORKTREE_ID,
    structuredLaunchAccepted: false,
    primaryTabId: 'tab-agent',
    backendSpawned: false,
    ...overrides
  }
}

let unbind: () => void = () => {}

beforeEach(() => {
  useAppStore.setState({
    repos: [{ id: 'repo1', path: '/repo1', displayName: 'Shop', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: {
      repo1: [
        makeWorktree({
          id: WORKTREE_ID,
          repoId: 'repo1',
          projectId: 'orca-shop',
          instanceId: 'i-12'
        })
      ]
    }
  })
  localTasksDomainStore.getState().openEndpoint('local')
  localTasksDomainStore.getState().writer('local').applyTasks([task])
  fixture.linkWorkspace.mockResolvedValue({ ok: true, workspace: {} })
  fixture.recordSession.mockResolvedValue({ ok: true, session: {} })
  rememberLocalTaskStartForTests('creation-1', {
    taskId: 'task-12',
    sessionTaskId: 'task-12',
    orcaProjectIds: ['orca-shop'],
    replace: false
  })
  unbind = bindLocalTaskStartWork()
})

afterEach(() => {
  unbind()
  resetLocalTaskStartWorkForTests()
  fixture.linkWorkspace.mockReset()
  fixture.recordSession.mockReset()
})

it('links the created workspace and records the agent tab once creation completes', async () => {
  notifyWorktreeCreationCompleted(completed())
  await vi.waitFor(() => expect(fixture.recordSession).toHaveBeenCalledOnce())
  expect(fixture.linkWorkspace.mock.calls[0][0]).toEqual(
    expect.objectContaining({
      taskId: 'task-12',
      hostId: 'local',
      kind: 'git-worktree',
      worktreeId: WORKTREE_ID,
      instanceId: 'i-12',
      linkedVia: 'start'
    })
  )
  expect(fixture.recordSession.mock.calls[0][0]).toEqual(
    expect.objectContaining({ taskId: 'task-12', surface: 'terminal', tabId: 'tab-agent' })
  )
})

it('writes nothing for a creation it did not start, as when one failed or was cancelled', async () => {
  notifyWorktreeCreationCompleted(completed({ creationId: 'someone-else' }))
  await Promise.resolve()
  expect(fixture.linkWorkspace).not.toHaveBeenCalled()
})

it('links but records no session when the chat launch settled with nothing', async () => {
  notifyWorktreeCreationCompleted(
    completed({
      structuredLaunchAccepted: true,
      structuredSessionOutcome: Promise.resolve({ kind: 'none' })
    })
  )
  await vi.waitFor(() => expect(fixture.linkWorkspace).toHaveBeenCalledOnce())
  await Promise.resolve()
  await Promise.resolve()
  expect(fixture.recordSession).not.toHaveBeenCalled()
})

it('does not link a workspace the composer created in another project', async () => {
  resetLocalTaskStartWorkForTests()
  rememberLocalTaskStartForTests('creation-1', {
    taskId: 'task-12',
    sessionTaskId: 'task-12',
    orcaProjectIds: ['orca-other'],
    replace: false
  })
  notifyWorktreeCreationCompleted(completed())
  await Promise.resolve()
  expect(fixture.linkWorkspace).not.toHaveBeenCalled()
})

it('links whatever repo the composer used when the task project links none', async () => {
  resetLocalTaskStartWorkForTests()
  rememberLocalTaskStartForTests('creation-1', {
    taskId: 'task-12',
    sessionTaskId: 'task-12',
    orcaProjectIds: [],
    replace: false
  })
  notifyWorktreeCreationCompleted(completed())
  await vi.waitFor(() => expect(fixture.linkWorkspace).toHaveBeenCalledOnce())
  expect(fixture.linkWorkspace.mock.calls[0][0]).toEqual(
    expect.objectContaining({ taskId: 'task-12', worktreeId: WORKTREE_ID })
  )
})
