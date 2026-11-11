import { beforeEach, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type { Worktree } from '../../../shared/worktree/types'
import type { LocalTaskDispatchCandidate } from './local-task-dispatch-candidates'

const fixture = vi.hoisted(() => ({
  rpc: vi.fn(),
  link: vi.fn(async () => true),
  record: vi.fn(async () => true)
}))
vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: fixture.rpc }))
vi.mock('./local-task-workspace-linking', () => ({ linkLocalTaskWorkspace: fixture.link }))
vi.mock('./local-task-session-recording', () => ({
  recordLocalTaskSession: fixture.record,
  chatSessionIds: vi.fn()
}))

import { localTasksDomainStore } from './local-tasks-domain-store'
import { launchInNewWorkspace } from './local-task-dispatch-new-workspace'
import { launchInWorkspace } from './local-task-dispatch-launch'

const task: LocalTask = {
  id: 'task-1',
  projectId: 'project-1',
  number: 1,
  ref: 'TEST-1',
  title: 'Long initial request',
  description: 'Fix the build and explain the result.',
  criteria: [],
  statusId: 'started',
  priority: 2,
  labels: [],
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}

const target: Extract<LocalTaskDispatchCandidate, { kind: 'repo' }> = {
  kind: 'repo',
  id: 'repo:local:repo-1',
  label: 'Repo',
  detail: 'Local',
  hostId: 'local',
  available: true,
  repo: {
    id: 'repo-1',
    path: '/repo-1',
    displayName: 'Repo',
    badgeColor: 'gray',
    addedAt: 1,
    executionHostId: 'local'
  },
  orcaProjectId: 'orca-project-1'
}

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  fixture.rpc.mockReset().mockResolvedValue({
    worktreeId: 'repo-1::/new',
    outcome: { kind: 'terminal', handle: 'terminal-1', paneKey: null }
  })
  fixture.link.mockClear()
  fixture.record.mockClear()
})

it('sends the task ref, content, guide, and short-title instruction through agent.launchReplay', async () => {
  const receipt = await launchInNewWorkspace(task, target, task.description, 'claude', [])
  expect(receipt.kind).toBe('launched')
  const prompt = fixture.rpc.mock.calls[0][2].prompt
  expect(prompt.delivery).toBe('submit')
  expect(prompt.text).toContain('Task TEST-1: Long initial request')
  expect(prompt.text).toContain(task.description)
  expect(prompt.text).toContain('orca task guide')
  expect(prompt.text).toContain('orca task update TEST-1 --title')
})

it('keeps task content but omits work conventions when brief is disabled and honors draft delivery', async () => {
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyPreferences({ taskBrief: '0', sessionSend: 'draft' })
  const receipt = await launchInNewWorkspace(task, target, task.description, 'claude', [])
  expect(receipt.kind).toBe('launched')
  const prompt = fixture.rpc.mock.calls[0][2].prompt
  expect(prompt).toEqual({
    text: `Task TEST-1: Long initial request\n\n${task.description}`,
    delivery: 'draft'
  })
})

it('passes the same task-aware prompt into an existing workspace launch', async () => {
  const workspace: Extract<LocalTaskDispatchCandidate, { kind: 'workspace' }> = {
    kind: 'workspace',
    id: 'workspace:local:repo-1::/existing',
    label: 'Existing',
    detail: 'Local',
    hostId: 'local',
    available: true,
    worktree: {
      id: 'repo-1::/existing',
      repoId: 'repo-1',
      hostId: 'local',
      path: '/existing',
      head: 'HEAD',
      branch: 'main',
      isBare: false,
      isMainWorktree: false,
      displayName: 'Existing',
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0
    } satisfies Worktree
  }
  const receipt = await launchInWorkspace(task, workspace, task.description, 'claude', [])
  expect(receipt.kind).toBe('launched')
  const prompt = fixture.rpc.mock.calls[0][2].prompt
  expect(prompt.text).toContain('Task TEST-1: Long initial request')
  expect(prompt.text).toContain('orca task guide')
  expect(prompt.text).toContain('orca task update TEST-1 --title')
})
