import { describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('../runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('../index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('../runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  listEnvironments: listEnvironmentsMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: vi.fn()
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('../index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { main } from '../index'
import { useWorktreeAwarenessEnvironment } from '../index-test-harness'
import { RuntimeClientError } from '../runtime/types'
import { buildWorktree, okFixture } from '../test-fixtures'

const statuses = [
  {
    id: 'todo',
    projectId: 'shop',
    category: 'unstarted',
    name: 'Todo',
    color: 'gray',
    position: 0
  },
  {
    id: 'doing',
    projectId: 'shop',
    category: 'started',
    name: 'In Progress',
    color: 'yellow',
    position: 1
  },
  {
    id: 'review',
    projectId: 'shop',
    category: 'review',
    name: 'In Review',
    color: 'blue',
    position: 2
  }
]

const project = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: ['STORE'],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses,
  createdAt: 0,
  updatedAt: 0,
  revision: 3
}

function task(number: number, title: string, statusId: string) {
  return {
    id: `task-${number}`,
    projectId: 'shop',
    number,
    ref: `SHOP-${number}`,
    title,
    description: number === 12 ? 'Shop owners need a file for their accountant.' : '',
    criteria: number === 12 ? ['Columns match the order table'] : [],
    statusId,
    priority: 2,
    labels: [],
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    revision: 7
  }
}

const tasks = [task(12, 'Export orders as CSV', 'doing'), task(13, 'Refund flow', 'todo')]
const checkout = buildWorktree('/repo/checkout', 'checkout')

const links = {
  workspaces: [
    {
      taskId: 'task-12',
      hostId: 'local',
      kind: 'git-worktree',
      instanceId: null,
      worktreeId: checkout.id,
      folderWorkspaceId: null,
      repoId: 'repo',
      branchSnapshot: 'checkout',
      nameSnapshot: 'checkout',
      hostLabelSnapshot: null,
      linkedVia: 'start',
      linkedAt: 0
    }
  ],
  sessions: []
}

function host(
  options: { state?: string; missing?: boolean; write?: (method: string) => unknown } = {}
) {
  callMock.mockImplementation(async (method: string) => {
    if (options.missing) {
      throw new RuntimeClientError('method_not_found', `Unknown method: ${method}`)
    }
    switch (method) {
      case 'localTasks.status':
        return okFixture('status', {
          taskHost: true,
          state: options.state ?? 'ready',
          reason: null,
          revision: 1,
          taskHostId: 'h1'
        })
      case 'localTasks.projects.list':
        return okFixture('projects', { projects: [project] })
      case 'localTasks.tasks.list':
        return okFixture('tasks', { tasks })
      case 'localTasks.links.list':
        return okFixture('links', links)
      case 'worktree.list':
        return okFixture('list', { worktrees: [checkout], totalCount: 1, truncated: false })
      case 'worktree.show':
        return okFixture('show', { worktree: checkout })
      default:
        return okFixture('write', options.write?.(method) ?? { ok: true })
    }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

function printed(): string {
  return vi
    .mocked(console.log)
    .mock.calls.map((call) => String(call[0]))
    .join('\n')
}

function writeParams(method: string): Record<string, unknown> | undefined {
  return callMock.mock.calls.find((call) => call[0] === method)?.[1]
}

describe('orca task', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  it('lists tasks title first, narrowed by project prefix and status category', async () => {
    host()
    await main(['task', 'list', '--project', 'shop', '--status', 'started'], '/repo')
    expect(printed()).toBe('Export orders as CSV\tSHOP-12 · In Progress · Shop')
  })

  it('shows a task by an earlier prefix with its description, criteria and workspace', async () => {
    host()
    await main(['task', 'show', 'store-12'], '/repo')
    expect(printed().split('\n')).toEqual([
      'Export orders as CSV',
      'SHOP-12 · In Progress · Shop',
      'Priority: High',
      'Workspace: checkout on local',
      '',
      'Shop owners need a file for their accountant.',
      '',
      'Done criteria:',
      '- Columns match the order table'
    ])
  })

  it('names the task of the workspace the current directory is in', async () => {
    host()
    await main(['task', 'current', '--json'], '/repo/checkout/src')
    const result = JSON.parse(printed()).result
    expect(result.worktree.id).toBe(checkout.id)
    expect(result.task).toMatchObject({ ref: 'SHOP-12', title: 'Export orders as CSV' })
  })

  it('comments with every word after the ref, as one idempotent write', async () => {
    host()
    await main(['task', 'comment', 'SHOP-12', 'Tests', 'pass', 'now'], '/repo')
    expect(writeParams('localTasks.events.addComment')).toMatchObject({
      taskId: 'task-12',
      body: 'Tests pass now',
      clientOperationId: expect.any(String)
    })
    expect(printed()).toBe('commented\tExport orders as CSV\tSHOP-12 · In Progress · Shop')
  })

  it('moves a task to a status named in any case, guarding against a concurrent edit', async () => {
    host({ write: () => ({ ok: true, task: { ...tasks[0], statusId: 'review', revision: 8 } }) })
    await main(['task', 'status', 'SHOP-12', 'in', 'review'], '/repo')
    expect(writeParams('localTasks.tasks.update')).toMatchObject({
      taskId: 'task-12',
      expectedRevision: 7,
      patch: { statusId: 'review' }
    })
    expect(printed()).toBe('updated\tExport orders as CSV\tSHOP-12 · In Review · Shop')
  })

  it('reports a status the project does not have, listing the ones it does', async () => {
    host()
    await main(['task', 'status', 'SHOP-12', 'Shipped'], '/repo')
    expect(writeParams('localTasks.tasks.update')).toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Statuses: Todo, In Progress, In Review')
    )
  })

  it('tells the user to update a host that predates the task library', async () => {
    host({ missing: true })
    await main(['task', 'list'], '/repo')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('has no local task library. Update Orca on that host')
    )
  })

  it('refuses to write to a library a newer Orca left read-only', async () => {
    host({ state: 'read-only' })
    await main(['task', 'comment', 'SHOP-12', 'hello'], '/repo')
    expect(writeParams('localTasks.events.addComment')).toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('read-only'))
  })
})
