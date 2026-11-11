import { afterEach, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import type { ProjectHostSetup } from '../../../shared/project-types'
import type { Repo } from '../../../shared/repo-types'
import { localTaskDispatchCandidates } from './local-task-dispatch-candidates'

const remoteRepo: Repo = {
  id: 'remote-repo',
  path: '/srv/remote-repo',
  displayName: 'Remote repo',
  badgeColor: 'gray',
  addedAt: 1,
  executionHostId: 'ssh:offline'
}

function task(id: string, parentId: string | null = null): LocalTask {
  return {
    id,
    projectId: 'project',
    number: 1,
    ref: id,
    title: id,
    description: '',
    criteria: [],
    statusId: 'started',
    priority: 2,
    labels: [],
    parentId,
    createdAt: 1,
    updatedAt: 1,
    revision: 1
  }
}

afterEach(() => vi.unstubAllGlobals())

it('uses the effective workspace host and library write verdict for task mentions without reading an offline host', () => {
  const hostRead = vi.fn()
  vi.stubGlobal('window', { api: { runtime: { call: hostRead } } })
  const store = createTestStore()
  const parent = task('parent')
  const child = task('child', parent.id)
  const unwritable = task('runtime:env-1/t-1')
  const links: LocalTaskLinks = {
    workspaces: [
      {
        taskId: parent.id,
        hostId: 'ssh:offline',
        kind: 'git-worktree',
        instanceId: null,
        worktreeId: 'remote-repo::/srv/work',
        folderWorkspaceId: null,
        repoId: remoteRepo.id,
        branchSnapshot: null,
        nameSnapshot: null,
        hostLabelSnapshot: null,
        linkedVia: 'start',
        linkedAt: 1
      },
      {
        taskId: unwritable.id,
        hostId: 'local',
        kind: 'git-worktree',
        instanceId: null,
        worktreeId: 'local-repo::/local',
        folderWorkspaceId: null,
        repoId: 'local-repo',
        branchSnapshot: null,
        nameSnapshot: null,
        hostLabelSnapshot: null,
        linkedVia: 'start',
        linkedAt: 1
      }
    ],
    sessions: []
  }
  const candidates = localTaskDispatchCandidates(
    store.getState(),
    [parent, child, unwritable],
    [{ id: 'ssh:offline', label: 'Offline', detail: '' }],
    links,
    ['local']
  )
  const taskRows = candidates.filter((candidate) => candidate.kind === 'task')
  expect(taskRows).toHaveLength(3)
  expect(
    taskRows.map((candidate) => ({ hostId: candidate.hostId, available: candidate.available }))
  ).toEqual([
    { hostId: 'ssh:offline', available: false },
    { hostId: 'ssh:offline', available: false },
    { hostId: 'local', available: false }
  ])
  expect(taskRows.filter((candidate) => candidate.hostId === 'ssh:offline')).toHaveLength(2)
  expect(hostRead).not.toHaveBeenCalled()
})

it('includes ready setup git repos once and excludes folder repos from new-workspace dispatch', () => {
  const store = createTestStore()
  const setup = (repo: Repo, kind: 'git' | 'folder', ready = true): ProjectHostSetup => ({
    id: `setup-${repo.id}`,
    projectId: 'orca-project',
    hostId: 'local',
    repoId: repo.id,
    path: repo.path,
    displayName: repo.displayName,
    kind,
    setupState: ready ? 'ready' : 'not-set-up',
    setupMethod: 'legacy-repo',
    createdAt: 1,
    updatedAt: 1
  })
  const readyGit = { ...remoteRepo, id: 'ready', path: '/ready', executionHostId: 'local' as const }
  const readyOnly = {
    ...remoteRepo,
    id: 'ready-only',
    path: '/ready-only',
    executionHostId: 'local' as const
  }
  const folder = { ...remoteRepo, id: 'folder', path: '/folder', executionHostId: 'local' as const }
  const waiting = {
    ...remoteRepo,
    id: 'waiting',
    path: '/waiting',
    executionHostId: 'local' as const
  }
  store.setState({
    repos: [readyGit, { ...folder, kind: 'folder' }],
    projects: [
      {
        id: 'orca-project',
        displayName: 'Project',
        badgeColor: 'gray',
        sourceRepoIds: [],
        createdAt: 1,
        updatedAt: 1
      }
    ],
    projectHostSetups: [
      setup(readyGit, 'git'),
      setup(readyOnly, 'git'),
      setup(folder, 'folder'),
      setup(waiting, 'git', false)
    ]
  })
  const rows = localTaskDispatchCandidates(
    store.getState(),
    [],
    [{ id: 'local', label: 'Local', detail: '' }],
    { workspaces: [], sessions: [] },
    ['local']
  ).filter((candidate) => candidate.kind === 'repo')
  expect(rows.map((row) => row.repo.id)).toEqual(['ready', 'ready-only'])
})
