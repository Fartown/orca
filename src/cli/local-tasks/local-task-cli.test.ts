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
  },
  {
    id: 'done',
    projectId: 'shop',
    category: 'completed',
    name: 'Done',
    color: 'green',
    position: 3
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
  sessions: [
    {
      id: 'link-12',
      taskId: 'task-12',
      hostId: 'local',
      worktreeId: checkout.id,
      instanceId: null,
      surface: 'terminal',
      tabId: 'tab-1',
      paneKey: 'tab-1:pane-a',
      sessionId: null,
      providerSession: null,
      agent: 'claude',
      linkedVia: 'start',
      openedAt: 0
    }
  ]
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
      expect.stringContaining('Statuses: Todo, In Progress, In Review, Done')
    )
  })

  it('tells the user to update a host that predates the task library', async () => {
    host({ missing: true })
    await main(['task', 'list'], '/repo')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('has no local task library. Update Orca on that host')
    )
  })

  it('writes back progress tied to the session it runs in, with what it needs', async () => {
    host()
    process.env.ORCA_PANE_KEY = 'tab-1:pane-a'
    try {
      await main(
        [
          'task',
          'progress',
          'SHOP-12',
          '--body',
          'Found the retry loop',
          '--needs-you',
          'Pick a timeout'
        ],
        '/repo'
      )
    } finally {
      delete process.env.ORCA_PANE_KEY
    }
    expect(writeParams('localTasks.events.addComment')).toMatchObject({
      taskId: 'task-12',
      body: 'Found the retry loop',
      progress: { sessionLinkId: 'link-12', needsYou: 'Pick a timeout' }
    })
    expect(printed()).toBe('progress\tExport orders as CSV\tSHOP-12 · In Progress · Shop')
  })

  it('writes back without a session link outside a session of the task', async () => {
    host()
    await main(['task', 'progress', 'SHOP-13', '--body', 'Looked at refunds'], '/repo')
    expect(writeParams('localTasks.events.addComment')).toMatchObject({
      taskId: 'task-13',
      progress: {}
    })
  })

  it('refuses an empty writeback before touching the library', async () => {
    host()
    await main(['task', 'progress', 'SHOP-12', '--body', '   '], '/repo')
    expect(writeParams('localTasks.events.addComment')).toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('empty'))
  })

  it('refuses to complete a task, telling the agent what to do instead', async () => {
    host()
    await main(['task', 'status', 'SHOP-12', 'completed'], '/repo')
    expect(writeParams('localTasks.tasks.update')).toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Only the user completes a task')
    )
  })

  it('prints the worker guide, and the dispatcher guide on request', async () => {
    host()
    await main(['task', 'guide'], '/repo')
    expect(printed()).toContain('orca task progress <ref> --body-file <file>')
    vi.mocked(console.log).mockClear()
    await main(['task', 'guide', '--dispatcher'], '/repo')
    expect(printed()).toContain('orca task propose --body-file <proposal.json>')
  })

  describe('dispatcher commands', () => {
    const PANE = 'tab-d:pane-d'
    const proposalReply = (items: unknown[]) => ({
      ok: true,
      proposal: {
        id: 'p1',
        conversationId: 'c1',
        summary: 'Follow PRs',
        items,
        status: 'pending',
        keptItemIndexes: null,
        results: null,
        createdAt: 1,
        decidedAt: null,
        decidedSource: null
      }
    })
    async function inPane(run: () => Promise<void>) {
      process.env.ORCA_PANE_KEY = PANE
      try {
        await run()
      } finally {
        delete process.env.ORCA_PANE_KEY
      }
    }

    it('proposes items named by ref, resolved to task ids, from the dispatcher pane', async () => {
      const items = [
        { kind: 'append', taskId: 'SHOP-12', sessionLinkId: 'link-12', text: 'Write the repro' },
        { kind: 'subtask', parentTaskId: 'store-12', title: 'Backend', prompt: 'Do it' }
      ]
      host({ write: () => proposalReply([]) })
      await inPane(() =>
        main(
          ['task', 'propose', '--body', JSON.stringify({ summary: 'Follow PRs', items })],
          '/repo'
        )
      )
      expect(writeParams('localTasks.proposals.create')).toMatchObject({
        paneKey: PANE,
        summary: 'Follow PRs',
        items: [
          { kind: 'append', taskId: 'task-12' },
          { kind: 'subtask', parentTaskId: 'task-12' }
        ]
      })
      expect(printed()).toContain('The user confirms or dismisses it in Orca')
    })

    it('explains a malformed proposal and never sends it', async () => {
      host()
      await inPane(() =>
        main(['task', 'propose', '--body', '[{"kind":"start","title":"x"}]'], '/repo')
      )
      expect(writeParams('localTasks.proposals.create')).toBeUndefined()
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('orca task guide --dispatcher')
      )
    })

    it('refuses dispatcher commands outside a session Orca started', async () => {
      host()
      await main(['task', 'inbox'], '/repo')
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ORCA_PANE_KEY'))
    })

    it('prints the inbox with its cursor, and acks that cursor', async () => {
      host({
        write: (method) =>
          method === 'localTasks.dispatcher.inbox'
            ? {
                ok: true,
                inbox: {
                  conversationId: 'c1',
                  items: [
                    {
                      kind: 'progress',
                      at: Date.UTC(2026, 10, 5, 9, 30),
                      taskId: 'task-12',
                      taskRef: 'SHOP-12',
                      summary: 'Export orders as CSV: Found the loop',
                      needsYou: 'Pick a timeout'
                    }
                  ],
                  cursor: 'CUR',
                  more: false,
                  watchedTaskCount: 1
                }
              }
            : { ok: true }
      })
      await inPane(() => main(['task', 'inbox'], '/repo'))
      expect(printed().split('\n')).toEqual([
        '2026-11-05 09:30Z  progress  SHOP-12  Export orders as CSV: Found the loop',
        '      needs the user: Pick a timeout',
        'When handled: orca task inbox --ack CUR'
      ])
      await inPane(() => main(['task', 'inbox', '--ack', 'CUR'], '/repo'))
      expect(writeParams('localTasks.dispatcher.ack')).toMatchObject({
        paneKey: PANE,
        cursor: 'CUR'
      })
    })

    it('watches a task by ref', async () => {
      host()
      await inPane(() => main(['task', 'watch', 'SHOP-13'], '/repo'))
      expect(writeParams('localTasks.dispatcher.watch')).toMatchObject({
        paneKey: PANE,
        taskId: 'task-13'
      })
    })

    it('lists sessions waiting for the user and tasks waiting for review together', async () => {
      host({
        write: (method) =>
          method === 'localTasks.attention.get'
            ? {
                observedAt: 1,
                sessions: [],
                items: [
                  {
                    key: 'k',
                    taskId: 'task-13',
                    taskSessionId: 's',
                    kind: 'approval',
                    agent: 'codex',
                    lastMessage: 'Allow npm install?',
                    since: 1,
                    replyable: false
                  }
                ]
              }
            : { ok: true }
      })
      await main(['task', 'needs-you'], '/repo')
      expect(printed()).toBe('SHOP-13  Refund flow: codex waits to approve — Allow npm install?')
    })
  })

  it('refuses to write to a library a newer Orca left read-only', async () => {
    host({ state: 'read-only' })
    await main(['task', 'comment', 'SHOP-12', 'hello'], '/repo')
    expect(writeParams('localTasks.events.addComment')).toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('read-only'))
  })
})
