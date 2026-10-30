import { describe, expect, it } from 'vitest'
import {
  AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_RUNTIME_CAPABILITY
} from '../../../src/shared/agent-launch-runtime-capability'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { FakeSession } from '../transport/mobile-endpoint-supervisor-test-fakes'
import { scopeRpcClientToExecutionHost } from '../transport/execution-host-scoped-rpc-client'
import type { RpcResponse } from '../transport/types'
import { localTasksCopy } from './local-tasks-copy'
import { createLocalTaskOperationIds } from './local-task-operation-ids'
import {
  createLocalTaskSourcedWorkspace,
  localTaskCreateOwner
} from './local-task-create-source-start'

const HOST_PANE = 'tab-1:6f1c2b0e-3d4a-4b5c-8d9e-0a1b2c3d4e5f'
const CAPABILITIES = [
  AGENT_LAUNCH_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY
]

const task: LocalTask = {
  id: 'task-12',
  projectId: 'project-shop',
  number: 12,
  ref: 'SHOP-12',
  title: 'Export orders as CSV',
  description: 'Add a CSV button to the orders page.',
  criteria: ['Downloads every visible column'],
  statusId: 'todo',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}

function result(method: string, params: Record<string, unknown>): unknown {
  switch (method) {
    case 'agent.launchReplay':
      return {
        worktreeId: 'repo-1::/w/shop-12',
        outcome: { kind: 'terminal', handle: 'term_1', paneKey: HOST_PANE },
        receipt: { mode: 'terminal', preferred: 'terminal', reason: 'user_default', detail: '' }
      }
    case 'localTasks.links.linkWorkspace':
      return {
        ok: true,
        workspace: {
          taskId: params.taskId,
          hostId: params.hostId,
          kind: 'git-worktree',
          instanceId: null,
          worktreeId: params.worktreeId,
          folderWorkspaceId: null,
          repoId: params.repoId,
          branchSnapshot: null,
          nameSnapshot: params.nameSnapshot,
          hostLabelSnapshot: null,
          linkedVia: 'start',
          linkedAt: 1
        }
      }
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

/** The paired Orca: it answers for itself and, through the envelope, for the server it relays to. */
function pairedHost() {
  const host = new FakeSession('connected')
  host.sendRequest.mockImplementation(
    async (method: string, params?: unknown): Promise<RpcResponse> => ({
      id: method,
      ok: true,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every call here sends an object.
      result: result(method, params as Record<string, unknown>)
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

describe('Create From → Local links the new workspace in the library of the Orca that owns it', () => {
  it.each([
    {
      where: "the paired Orca's own machine",
      repo: { id: 'repo-1' },
      library: 'self',
      ownerHostId: 'local',
      envelope: undefined
    },
    {
      where: 'an SSH target the paired Orca reaches over its relay',
      repo: { id: 'repo-1', connectionId: 'box' },
      library: 'self',
      ownerHostId: 'ssh:box',
      envelope: undefined
    },
    {
      where: 'a paired server, or an SSH host whose orcad serves it',
      repo: { id: 'repo-1', executionHostId: 'runtime:env-1' },
      library: 'runtime:env-1',
      ownerHostId: 'local',
      envelope: 'runtime:env-1'
    }
  ])('$where', async ({ repo, library, ownerHostId, envelope }) => {
    const owner = localTaskCreateOwner(repo)
    expect(owner?.endpoint.key).toBe(library)
    expect(owner?.ownerHostId).toBe(ownerHostId)

    const host = pairedHost()
    const client = owner?.endpoint.executionHost
      ? scopeRpcClientToExecutionHost(host, owner.endpoint.executionHost)
      : host
    const created = await createLocalTaskSourcedWorkspace({
      client,
      capabilities: CAPABILITIES,
      ids: { link: createLocalTaskOperationIds(), record: createLocalTaskOperationIds() },
      task,
      tasks: [task],
      repoId: repo.id,
      ownerHostId: owner?.ownerHostId ?? '',
      hostLabel: 'box',
      request: { name: '', agent: 'claude', setupDecision: 'skip', note: 'from the phone' },
      copy: localTasksCopy()
    })

    expect(created).toEqual({
      worktreeId: 'repo-1::/w/shop-12',
      name: 'shop-12-export-orders-as-csv'
    })
    const [launch] = callsTo(host, 'agent.launchReplay')
    expect(launch?.[2]?.envelope?.executionHost).toBe(envelope)
    expect(launch?.[1]).toMatchObject({
      target: {
        kind: 'create-worktree',
        create: { repo: 'id:repo-1', setupDecision: 'skip', comment: 'from the phone' }
      },
      prompt: {
        // A host never delivers a draft, so the phone sends the task as the first message.
        delivery: 'submit',
        text: expect.stringMatching(
          /Export orders as CSV[\s\S]*Add a CSV button to the orders page\.[\s\S]*- Downloads every visible column/
        )
      }
    })
    const links = callsTo(host, 'localTasks.links.linkWorkspace')
    expect(links).toHaveLength(1)
    expect(links[0]?.[2]?.envelope?.executionHost).toBe(envelope)
    expect(links[0]?.[1]).toMatchObject({
      taskId: 'task-12',
      hostId: ownerHostId,
      worktreeId: 'repo-1::/w/shop-12',
      linkedVia: 'start'
    })
  })
})
