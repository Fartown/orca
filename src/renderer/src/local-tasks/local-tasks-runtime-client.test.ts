import { beforeEach, describe, expect, it, vi } from 'vitest'

type RepoRow = { id: string; executionHostId: string; connectionId: string | null }

const host = vi.hoisted(() => {
  const repos: RepoRow[] = []
  return {
    call: vi.fn<(target: unknown, method: string, params: unknown) => Promise<unknown>>(),
    repos
  }
})
vi.mock('../runtime/runtime-rpc-client', () => ({ callRuntimeRpc: host.call }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ repos: host.repos }) } }))

import { toWebTerminalSurfaceTabId } from '../../../shared/terminal-surface-id'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { localTasksEndpointReads } from './local-tasks-endpoint-calls'
import { localTasksClient } from './local-tasks-runtime-client'

const SERVER = { kind: 'environment', environmentId: 'env-1' }
const LEAF = '11111111-1111-4111-8111-111111111111'

function rawTask(id: string): LocalTask {
  return {
    id,
    projectId: 'p1',
    number: 3,
    ref: 'SRV-3',
    title: 'On the server',
    description: '',
    criteria: [],
    statusId: 's2',
    priority: 0,
    labels: [],
    parentId: 't0',
    createdAt: 1,
    updatedAt: 1,
    revision: 3
  }
}

function sentTo(index = 0): { target: unknown; method: unknown; params: unknown } {
  const [target, method, params] = host.call.mock.calls[index] ?? []
  return { target, method, params }
}

beforeEach(() => {
  host.call.mockReset()
  host.repos = []
})

describe('writes go to the library that owns the row (D-008)', () => {
  it('sends a paired server’s task in the server’s own ids and returns this client’s ids', async () => {
    host.call.mockResolvedValue({ ok: true, task: rawTask('t1') })
    const result = await localTasksClient.updateTask({
      taskId: 'runtime:env-1/t1',
      expectedRevision: 2,
      patch: { statusId: 'runtime:env-1/s2', parentId: 'runtime:env-1/t0' }
    })
    expect(sentTo()).toMatchObject({
      target: SERVER,
      method: 'localTasks.tasks.update',
      params: { taskId: 't1', patch: { statusId: 's2', parentId: 't0' } }
    })
    expect(result).toMatchObject({
      ok: true,
      task: {
        id: 'runtime:env-1/t1',
        projectId: 'runtime:env-1/p1',
        statusId: 'runtime:env-1/s2',
        parentId: 'runtime:env-1/t0'
      }
    })
  })

  it('keeps this app’s own rows on this app, under their own ids', async () => {
    host.call.mockResolvedValue({ ok: true })
    await localTasksClient.removeComment('event-1')
    expect(sentTo()).toMatchObject({
      target: { kind: 'local' },
      params: { eventId: 'event-1' }
    })
  })

  it('records a server session under the server’s host and tab, not this client’s mirror', async () => {
    host.repos = [{ id: 'repo1', executionHostId: 'runtime:env-1', connectionId: 'minizc' }]
    const mirroredTab = toWebTerminalSurfaceTabId('tab-1')
    host.call.mockResolvedValue({
      ok: true,
      session: {
        id: 'link-1',
        taskId: 't1',
        hostId: 'ssh:minizc',
        worktreeId: 'repo1::/w',
        instanceId: null,
        surface: 'terminal',
        tabId: 'tab-1',
        paneKey: `tab-1:${LEAF}`,
        sessionId: null,
        providerSession: null,
        agent: 'claude',
        linkedVia: 'start',
        openedAt: 1
      }
    })
    const result = await localTasksClient.recordSession({
      taskId: 'runtime:env-1/t1',
      hostId: 'runtime:env-1',
      worktreeId: 'repo1::/w',
      surface: 'terminal',
      tabId: mirroredTab,
      paneKey: `${mirroredTab}:${LEAF}`,
      linkedVia: 'start'
    })
    expect(sentTo()).toMatchObject({
      target: SERVER,
      params: { taskId: 't1', hostId: 'ssh:minizc', tabId: 'tab-1', paneKey: `tab-1:${LEAF}` }
    })
    expect(result).toMatchObject({
      ok: true,
      session: {
        id: 'runtime:env-1/link-1',
        hostId: 'runtime:env-1',
        tabId: mirroredTab,
        paneKey: `${mirroredTab}:${LEAF}`
      }
    })
  })

  it('refuses, without asking, to link a server’s workspace to a task this app keeps', async () => {
    const result = await localTasksClient.linkWorkspace({
      taskId: 't1',
      hostId: 'runtime:env-1',
      kind: 'git-worktree',
      worktreeId: 'repo1::/w',
      linkedVia: 'manual'
    })
    expect(result).toEqual({ ok: false, code: 'host_not_owned' })
    expect(host.call).not.toHaveBeenCalled()
  })

  it('marks an item seen in the library of its session, under the host’s own item key', async () => {
    host.call.mockResolvedValue({ ok: true })
    await localTasksClient.acknowledgeAttention(`tab-1:${LEAF}@5`, 'runtime:env-1/s1')
    expect(sentTo()).toMatchObject({
      target: SERVER,
      method: 'localTasks.attention.acknowledge',
      params: { itemKey: `tab-1:${LEAF}@5`, taskSessionId: 's1' }
    })
  })

  it('splits a batch across libraries into one request each', async () => {
    host.call.mockResolvedValue({ ok: true, updated: 1 })
    const result = await localTasksClient.batchUpdateTasks({
      taskIds: ['t-own', 'runtime:env-1/t-srv'],
      patch: { priority: 2 }
    })
    expect(host.call.mock.calls.map(([target, , params]) => [target, params])).toEqual([
      [{ kind: 'local' }, expect.objectContaining({ taskIds: ['t-own'] })],
      [SERVER, expect.objectContaining({ taskIds: ['t-srv'] })]
    ])
    expect(result).toEqual({ ok: true, updated: 2 })
  })
})

it('reads a server’s links as this client sees them: its host, its terminal mirror', async () => {
  host.call.mockResolvedValue({
    workspaces: [
      {
        taskId: 't1',
        hostId: 'local',
        kind: 'git-worktree',
        instanceId: null,
        worktreeId: 'repo1::/w',
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
  const links = await localTasksEndpointReads('runtime:env-1').listLinks()
  expect(sentTo().target).toEqual(SERVER)
  expect(links.workspaces[0]).toMatchObject({
    taskId: 'runtime:env-1/t1',
    hostId: 'runtime:env-1',
    worktreeId: 'repo1::/w'
  })
})
