import { describe, expect, it, vi } from 'vitest'
vi.mock('react-native', () => ({ AppState: { currentState: 'active' } }))
import {
  AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_RUNTIME_CAPABILITY
} from '../../../src/shared/agent-launch-runtime-capability'
import type { LocalTaskWorkspaceLink } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { FakeSession } from '../transport/mobile-endpoint-supervisor-test-fakes'
import { scopeRpcClientToExecutionHost } from '../transport/execution-host-scoped-rpc-client'
import type { RpcResponse } from '../transport/types'
import { createLocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskCreateCopy } from './local-task-create-copy'
import {
  kickOffCreatedLocalTask,
  localTaskCreateKickoffBlocked,
  type LocalTaskCreateKickoff
} from './local-task-create-kickoff'
import { SELF_LOCAL_TASK_ENDPOINT } from './local-task-endpoint'
import { createLocalTaskOperationIds } from './local-task-operation-ids'
import type { LocalTaskWorkspaceCandidate } from './local-task-workspace-candidates'

const PANE = 'tab-1:6f1c2b0e-3d4a-4b5c-8d9e-0a1b2c3d4e5f'
const CAPABILITIES = [
  AGENT_LAUNCH_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY
]
const words = { copy: localTasksCopy(), create: localTaskCreateCopy() }

function task(id: string, ref: string, parentId: string | null): LocalTask {
  return {
    id,
    projectId: 'shop',
    number: Number(ref.split('-')[1]),
    ref,
    title: 'Filter orders by refund state',
    description: 'Only refunding and refunded orders.',
    criteria: [],
    statusId: 'todo',
    priority: 0,
    labels: [],
    parentId,
    createdAt: 1,
    updatedAt: 1,
    revision: 1
  }
}

const parent = task('task-12', 'SHOP-12', null)
const created = task('task-16', 'SHOP-16', null)
const refund: LocalTaskWorkspaceCandidate = {
  worktreeId: 'repo-shop::/refund-webhook',
  repoId: 'repo-shop',
  hostId: 'ssh:minizc',
  displayName: 'refund-webhook',
  branch: 'refund-webhook',
  instanceId: null,
  folderWorkspaceId: null
}
const parentLink: LocalTaskWorkspaceLink = {
  taskId: parent.id,
  hostId: 'ssh:minizc',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: 'repo-shop::/shop-12-order-export',
  folderWorkspaceId: null,
  repoId: 'repo-shop',
  branchSnapshot: null,
  nameSnapshot: 'shop-12-order-export',
  hostLabelSnapshot: 'minizc',
  linkedVia: 'start',
  linkedAt: 1
}

function answer(method: string, params: Record<string, unknown>, linkRefused: boolean): unknown {
  switch (method) {
    case 'ssh.getState':
      return {
        state: { targetId: params.targetId, status: 'connected', error: null, reconnectAttempt: 0 }
      }
    case 'agent.launchReplay':
      return {
        worktreeId: 'repo-shop::/w/new',
        outcome: { kind: 'terminal', handle: 'term_1', paneKey: PANE },
        receipt: { mode: 'terminal', preferred: 'terminal', reason: 'user_default', detail: '' }
      }
    case 'localTasks.links.linkWorkspace':
      return linkRefused
        ? { ok: false, code: 'workspace_already_linked', detail: 'SHOP-9' }
        : { ok: true, workspace: { ...parentLink, ...params, taskId: params.taskId } }
    case 'localTasks.links.recordSession':
      return {
        ok: true,
        session: {
          id: 'session-1',
          taskId: params.taskId,
          hostId: params.hostId,
          worktreeId: params.worktreeId,
          instanceId: null,
          surface: 'terminal',
          tabId: params.tabId,
          paneKey: params.paneKey,
          sessionId: null,
          providerSession: null,
          agent: params.agent,
          linkedVia: 'start',
          openedAt: 1
        }
      }
    default:
      throw new Error(`unexpected ${method}`)
  }
}

function pairedHost(linkRefused = false) {
  const host = new FakeSession('connected')
  host.sendRequest.mockImplementation(
    async (method: string, params?: unknown): Promise<RpcResponse> => ({
      id: method,
      ok: true,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every call here sends an object.
      result: answer(method, (params ?? {}) as Record<string, unknown>, linkRefused)
    })
  )
  return host
}

function callsTo(host: FakeSession, method: string) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: vi.fn records the scoped view's third argument too.
  const calls = host.sendRequest.mock.calls as unknown as [
    string,
    Record<string, unknown>,
    { envelope?: { executionHost?: string } } | undefined
  ][]
  return calls.filter(([name]) => name === method)
}

function run(host: FakeSession, kickoff: LocalTaskCreateKickoff, newTask = created) {
  return kickOffCreatedLocalTask({
    client: host,
    capabilities: CAPABILITIES,
    api: createLocalTasksApi(host),
    ids: { link: createLocalTaskOperationIds(), record: createLocalTaskOperationIds() },
    task: newTask,
    tasks: [parent, newTask],
    brief: false,
    kickoff,
    words
  })
}

describe('New task starts work where the user picked (m8)', () => {
  it('links a free workspace on an SSH host, then opens the session with the first line first', async () => {
    const host = pairedHost()
    const kickoff: LocalTaskCreateKickoff = {
      target: { kind: 'existing', candidate: refund, holder: null, hostLabel: 'minizc' },
      agent: 'claude',
      firstLine: 'Start from the task description'
    }
    expect(
      await localTaskCreateKickoffBlocked({
        client: host,
        endpoint: SELF_LOCAL_TASK_ENDPOINT,
        kickoff,
        words
      })
    ).toBeNull()
    expect(await run(host, kickoff)).toBeNull()

    expect(callsTo(host, 'ssh.getState')[0]?.[1]).toMatchObject({ targetId: 'minizc' })
    expect(callsTo(host, 'localTasks.links.linkWorkspace')[0]?.[1]).toMatchObject({
      taskId: created.id,
      hostId: 'ssh:minizc',
      worktreeId: refund.worktreeId,
      hostLabelSnapshot: 'minizc',
      linkedVia: 'manual'
    })
    expect(callsTo(host, 'agent.launchReplay')[0]?.[1]).toMatchObject({
      target: { kind: 'existing', worktree: `id:${refund.worktreeId}` },
      prompt: {
        delivery: 'submit',
        text: expect.stringMatching(/^Start from the task description\n\nTask SHOP-16: Filter/)
      }
    })
    expect(callsTo(host, 'localTasks.links.recordSession')[0]?.[1]).toMatchObject({
      taskId: created.id,
      hostId: 'ssh:minizc'
    })
  })

  it('works in a held workspace as its task’s subtask: no new link, the session goes there', async () => {
    const host = pairedHost()
    const subtask = task('task-17', 'SHOP-17', parent.id)
    const message = await run(
      host,
      {
        target: { kind: 'existing', candidate: refund, holder: parentLink, hostLabel: 'minizc' },
        agent: 'codex',
        firstLine: ''
      },
      subtask
    )
    expect(message).toBeNull()
    expect(callsTo(host, 'localTasks.links.linkWorkspace')).toHaveLength(0)
    expect(callsTo(host, 'agent.launchReplay')[0]?.[1]).toMatchObject({
      target: { kind: 'existing', worktree: `id:${parentLink.worktreeId}` },
      prompt: { text: expect.stringContaining('This is a subtask of SHOP-12') }
    })
  })

  it('creates the new workspace in a paired server’s own library, named after the task', async () => {
    const host = pairedHost()
    const server = scopeRpcClientToExecutionHost(host, 'runtime:vm')
    const message = await kickOffCreatedLocalTask({
      client: server,
      capabilities: CAPABILITIES,
      api: createLocalTasksApi(server),
      ids: { link: createLocalTaskOperationIds(), record: createLocalTaskOperationIds() },
      task: created,
      tasks: [created],
      brief: true,
      kickoff: {
        target: {
          kind: 'new',
          ownerHostId: 'local',
          repoId: 'repo-shop',
          name: '',
          hostLabel: 'vm'
        },
        agent: 'claude',
        firstLine: 'Start from the task description'
      },
      words
    })
    expect(message).toBeNull()
    const [launch] = callsTo(host, 'agent.launchReplay')
    expect(launch?.[2]?.envelope?.executionHost).toBe('runtime:vm')
    expect(launch?.[1]).toMatchObject({
      target: {
        kind: 'create-worktree',
        create: { repo: 'id:repo-shop', name: 'shop-16-filter-orders-by-refund-state' }
      }
    })
    const [link] = callsTo(host, 'localTasks.links.linkWorkspace')
    expect(link?.[2]?.envelope?.executionHost).toBe('runtime:vm')
    expect(link?.[1]).toMatchObject({
      hostId: 'local',
      hostLabelSnapshot: 'vm',
      linkedVia: 'start'
    })
  })

  it('creates nothing when the SSH host is out of contact, and says so', async () => {
    const host = new FakeSession('connected')
    host.sendRequest.mockResolvedValue({
      id: 'state',
      ok: true,
      result: {
        state: { targetId: 'minizc', status: 'disconnected', error: null, reconnectAttempt: 0 }
      }
    })
    const blocked = await localTaskCreateKickoffBlocked({
      client: host,
      endpoint: SELF_LOCAL_TASK_ENDPOINT,
      kickoff: {
        target: { kind: 'existing', candidate: refund, holder: null, hostLabel: 'minizc' },
        agent: 'claude',
        firstLine: ''
      },
      words
    })
    expect(blocked).toBe(words.create.nothingCreated(words.copy.work.hostOffline('minizc')))
    expect(host.sendRequest).toHaveBeenCalledTimes(1)
  })

  it('keeps the task and opens no session when the workspace was taken meanwhile', async () => {
    const host = pairedHost(true)
    const message = await run(host, {
      target: { kind: 'existing', candidate: refund, holder: null, hostLabel: 'minizc' },
      agent: 'claude',
      firstLine: ''
    })
    expect(message).toContain('SHOP-16')
    expect(message).toContain('refund-webhook')
    expect(callsTo(host, 'agent.launchReplay')).toHaveLength(0)
  })
})
