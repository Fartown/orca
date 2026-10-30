import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeSession } from '../transport/mobile-endpoint-supervisor-test-fakes'
import { createLocalTasksApi } from './local-tasks-api'
import { createLocalTaskOperationIds } from './local-task-operation-ids'
import { startLocalTaskInNewWorkspace } from './local-task-agent-launch'
import { createWorktreeWithNameRetry } from '../tasks/worktree-create-retry'
import { readNewWorktreeRuntimeCapabilities } from '../tasks/worktree-create-capability'
import {
  AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_RUNTIME_CAPABILITY
} from '../../../src/shared/agent-launch-runtime-capability'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskLaunchMessage } from './local-task-launch-message'

const HOST_PANE = 'tab-1:6f1c2b0e-3d4a-4b5c-8d9e-0a1b2c3d4e5f'

vi.mock('../tasks/worktree-create-retry', () => ({ createWorktreeWithNameRetry: vi.fn() }))
vi.mock('../tasks/worktree-create-capability', () => ({
  readNewWorktreeRuntimeCapabilities: vi.fn()
}))
vi.mock('../tasks/replay-on-ambiguous-delivery', () => ({
  sendReplayingAmbiguousDelivery: vi.fn(async () => ({
    response: { id: 'launch', ok: true, result: {} },
    replayed: false
  }))
}))
vi.mock('../tasks/mobile-workspace-create-operations', () => ({
  agentLaunchReplayRun: {
    request: vi.fn(),
    interpret: vi.fn(() => ({
      worktreeId: 'repo::/shop-12',
      outcome: {
        kind: 'terminal',
        handle: 'term_1',
        paneKey: 'tab-1:6f1c2b0e-3d4a-4b5c-8d9e-0a1b2c3d4e5f'
      },
      receipt: { mode: 'terminal', preferred: 'terminal', reason: 'user_default', detail: '' }
    }))
  }
}))

describe('workspace-only Start', () => {
  beforeEach(() => {
    vi.mocked(readNewWorktreeRuntimeCapabilities).mockResolvedValue({
      tasksSupported: true,
      worktreeCreateIdempotency: { dedupeTtlMs: 60_000 },
      agentLaunch: false,
      hostPlatform: null
    })
    vi.mocked(createWorktreeWithNameRetry).mockResolvedValue({
      worktreeId: 'repo::/task',
      name: 'task'
    })
  })

  it('creates and links once without starting or recording an agent session', async () => {
    const launchClient = new FakeSession('connected')
    const api = createLocalTasksApi({
      sendRequest: async () => {
        throw new Error('unexpected RPC')
      }
    })
    const linkWorkspace = vi.spyOn(api, 'linkWorkspace').mockResolvedValue({
      kind: 'ok',
      value: {
        ok: true,
        workspace: {
          taskId: 'task',
          hostId: 'ssh:box',
          kind: 'git-worktree',
          instanceId: null,
          worktreeId: 'repo::/task',
          folderWorkspaceId: null,
          repoId: 'repo',
          branchSnapshot: null,
          nameSnapshot: 'task',
          hostLabelSnapshot: 'box',
          linkedVia: 'start',
          linkedAt: 1
        }
      }
    })
    const recordSession = vi.spyOn(api, 'recordSession')
    const result = await startLocalTaskInNewWorkspace({
      launchClient,
      hostCapabilities: [],
      api,
      ids: {
        link: createLocalTaskOperationIds(() => 'link-op'),
        record: createLocalTaskOperationIds(() => 'session-op')
      },
      workspaceTaskId: 'task',
      sessionTaskId: 'task',
      setup: { hostId: 'ssh:box', repoId: 'repo', label: 'box' },
      name: 'task',
      agent: null,
      prompt: { text: 'task', delivery: 'submit' }
    })
    expect(result).toEqual({ kind: 'workspace-created', worktreeId: 'repo::/task' })
    expect(createWorktreeWithNameRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        client: launchClient,
        worktreeCreateIdempotency: { dedupeTtlMs: 60_000 }
      })
    )
    expect(linkWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task',
        hostId: 'ssh:box',
        worktreeId: 'repo::/task',
        clientOperationId: 'link-op'
      })
    )
    expect(recordSession).not.toHaveBeenCalled()
    expect(launchClient.sendRequest).not.toHaveBeenCalled()
  })

  it('does not duplicate an ambiguous create or claim a session was started', async () => {
    vi.mocked(createWorktreeWithNameRetry).mockRejectedValueOnce(new Error('answer lost'))
    const api = createLocalTasksApi({
      sendRequest: async () => {
        throw new Error('unexpected RPC')
      }
    })
    const linkWorkspace = vi.spyOn(api, 'linkWorkspace')
    const result = await startLocalTaskInNewWorkspace({
      launchClient: new FakeSession('connected'),
      hostCapabilities: [],
      api,
      ids: { link: createLocalTaskOperationIds(), record: createLocalTaskOperationIds() },
      workspaceTaskId: 'task',
      sessionTaskId: 'task',
      setup: { hostId: 'local', repoId: 'repo', label: '' },
      name: 'task',
      agent: null,
      prompt: { text: 'task', delivery: 'submit' }
    })
    expect(result).toEqual({ kind: 'workspace-unconfirmed' })
    expect(linkWorkspace).not.toHaveBeenCalled()
  })
})

describe('Start with an agent', () => {
  it('leaves no link and says so when the link step after the launch is lost', async () => {
    const api = createLocalTasksApi({
      sendRequest: async () => {
        throw new Error('unexpected RPC')
      }
    })
    // The desktop may or may not have written the link; the phone does not guess either way.
    const linkWorkspace = vi.spyOn(api, 'linkWorkspace').mockResolvedValue({ kind: 'unknown' })
    const recordSession = vi.spyOn(api, 'recordSession')
    const result = await startLocalTaskInNewWorkspace({
      launchClient: new FakeSession('connected'),
      hostCapabilities: [
        AGENT_LAUNCH_RUNTIME_CAPABILITY,
        AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY
      ],
      api,
      ids: { link: createLocalTaskOperationIds(), record: createLocalTaskOperationIds() },
      workspaceTaskId: 'shop-12',
      sessionTaskId: 'shop-12',
      setup: { hostId: 'local', repoId: 'repo', label: '' },
      name: 'shop-12-order-export',
      agent: 'claude',
      prompt: { text: 'Task SHOP-12: Order export', delivery: 'submit' }
    })
    expect(result).toMatchObject({ kind: 'not-linked', worktreeId: 'repo::/shop-12' })
    expect(linkWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'shop-12',
        linkedVia: 'start',
        worktreeId: 'repo::/shop-12'
      })
    )
    expect(recordSession).not.toHaveBeenCalled()
    expect(localTaskLaunchMessage(localTasksCopy(), result)).toContain(
      localTasksCopy().work.startedNotLinked
    )
  })

  // The launch answers with the library host's own pane, which is the form its library keeps
  // (D-008); a server's library is reached through the paired host and still records `local`.
  it.each([
    ['local', { surface: 'terminal', tabId: 'tab-1', paneKey: HOST_PANE }],
    ['ssh:box', { surface: 'terminal', tabId: 'tab-1', paneKey: HOST_PANE }]
  ])("records a %s session under the host's own tab and pane", async (hostId, recorded) => {
    const api = createLocalTasksApi({
      sendRequest: async () => {
        throw new Error('unexpected RPC')
      }
    })
    vi.spyOn(api, 'linkWorkspace').mockResolvedValue({
      kind: 'ok',
      value: {
        ok: true,
        workspace: {
          taskId: 'shop-12',
          hostId,
          kind: 'git-worktree',
          instanceId: null,
          worktreeId: 'repo::/shop-12',
          folderWorkspaceId: null,
          repoId: 'repo',
          branchSnapshot: null,
          nameSnapshot: 'shop-12',
          hostLabelSnapshot: null,
          linkedVia: 'start',
          linkedAt: 1
        }
      }
    })
    const recordSession = vi.spyOn(api, 'recordSession').mockResolvedValue({ kind: 'unknown' })
    const result = await startLocalTaskInNewWorkspace({
      launchClient: new FakeSession('connected'),
      hostCapabilities: [
        AGENT_LAUNCH_RUNTIME_CAPABILITY,
        AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY
      ],
      api,
      ids: { link: createLocalTaskOperationIds(), record: createLocalTaskOperationIds() },
      workspaceTaskId: 'shop-12',
      sessionTaskId: 'shop-12',
      setup: { hostId, repoId: 'repo', label: '' },
      name: 'shop-12',
      agent: 'claude',
      prompt: { text: 'Task SHOP-12', delivery: 'submit' }
    })
    const params = recordSession.mock.calls[0]?.[0]
    expect({
      surface: params?.surface,
      tabId: params?.tabId,
      ...(params?.paneKey ? { paneKey: params.paneKey } : {})
    }).toEqual(recorded)
    // The phone still opens the pane by the host's own key.
    expect(result).toEqual({
      kind: 'session-not-recorded',
      worktreeId: 'repo::/shop-12',
      paneKey: HOST_PANE
    })
  })

  it('says so when the agent started but the task text was not delivered', async () => {
    const { agentLaunchReplayRun } = await import('../tasks/mobile-workspace-create-operations')
    vi.mocked(agentLaunchReplayRun.interpret).mockReturnValueOnce({
      worktreeId: 'repo::/shop-12',
      outcome: { kind: 'terminal', handle: 'term_1', paneKey: HOST_PANE },
      receipt: { mode: 'terminal', preferred: 'terminal', reason: 'user_default', detail: '' },
      // A submit the agent never took, e.g. while its own trust prompt held the terminal.
      prompt: { delivery: 'submit', outcome: 'not-delivered' }
    })
    const api = createLocalTasksApi({
      sendRequest: async () => {
        throw new Error('unexpected RPC')
      }
    })
    vi.spyOn(api, 'linkWorkspace').mockResolvedValue({
      kind: 'ok',
      value: {
        ok: true,
        workspace: {
          taskId: 'shop-12',
          hostId: 'local',
          kind: 'git-worktree',
          instanceId: null,
          worktreeId: 'repo::/shop-12',
          folderWorkspaceId: null,
          repoId: 'repo',
          branchSnapshot: null,
          nameSnapshot: 'shop-12',
          hostLabelSnapshot: null,
          linkedVia: 'start',
          linkedAt: 1
        }
      }
    })
    vi.spyOn(api, 'recordSession').mockResolvedValue({ kind: 'unknown' })
    const result = await startLocalTaskInNewWorkspace({
      launchClient: new FakeSession('connected'),
      hostCapabilities: [
        AGENT_LAUNCH_RUNTIME_CAPABILITY,
        AGENT_LAUNCH_REPLAY_REQUIRED_RUNTIME_CAPABILITY
      ],
      api,
      ids: { link: createLocalTaskOperationIds(), record: createLocalTaskOperationIds() },
      workspaceTaskId: 'shop-12',
      sessionTaskId: 'shop-12',
      setup: { hostId: 'local', repoId: 'repo', label: '' },
      name: 'shop-12',
      agent: 'claude',
      prompt: { text: 'Task SHOP-12', delivery: 'submit' }
    })
    expect(result).toMatchObject({ promptNotDelivered: true })
    expect(localTaskLaunchMessage(localTasksCopy(), result)).toContain(
      localTasksCopy().work.promptNotDelivered
    )
  })
})
