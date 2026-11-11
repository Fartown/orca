import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  LocalTaskSessionLink,
  LocalTaskSessionProgress,
  LocalTaskWorkspaceLink
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { Worktree } from '../../../shared/worktree/types'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'

const fixture = vi.hoisted(() => {
  const rows = (): unknown[] => []
  return {
    contact: new Set<string>(),
    rpc: vi.fn(),
    createTask: vi.fn(),
    addComment: vi.fn(),
    link: vi.fn(),
    record: vi.fn(),
    reply: vi.fn(),
    worktrees: new Map<string, unknown>(),
    domain: {
      tasks: rows(),
      projects: rows(),
      links: { workspaces: rows(), sessions: rows() },
      progress: { sessions: new Map<string, unknown>() },
      upsertTasks: vi.fn()
    }
  }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: fixture.rpc }))
vi.mock('@/runtime/agent-session-operation-id', () => ({
  createAgentSessionOperationId: () => 'operation'
}))
vi.mock('./local-task-host-contact', () => ({
  isLocalTaskHostInContact: (_state: unknown, hostId: string) => fixture.contact.has(hostId)
}))
vi.mock('./local-task-endpoints', () => ({
  localTaskEndpointForHost: () => 'local',
  localTaskEndpointTarget: () => ({ kind: 'local' }),
  localTaskIdEndpoint: () => 'local'
}))
vi.mock('./local-tasks-domain-store', () => ({
  isLocalTaskRowWritable: () => true,
  localTasksDomainStore: { getState: () => fixture.domain },
  useLocalTasksDomain: vi.fn()
}))
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { createTask: fixture.createTask, addComment: fixture.addComment }
}))
vi.mock('./local-task-workspace-linking', () => ({ linkLocalTaskWorkspace: fixture.link }))
vi.mock('./local-task-session-recording', () => ({
  recordLocalTaskSession: fixture.record,
  chatSessionIds: (tabId: string | null, sessionId: string) => ({
    surface: 'chat',
    tabId: tabId ?? undefined,
    sessionId
  })
}))
vi.mock('./local-task-session-reveal', () => ({ revealLocalTaskSession: vi.fn() }))
vi.mock('./local-task-needs-you-actions', () => ({ sendLocalTaskReply: fixture.reply }))
vi.mock('./local-task-dispatch-prompt', () => ({ localTaskDispatchPrompt: () => 'prompt' }))
vi.mock('./local-task-workspace-resolution', () => ({
  localTaskWorktreeHostId: (_state: unknown, worktree: { hostId: string }) => worktree.hostId,
  selectLocalTaskWorkspace: (_state: unknown, link: { worktreeId: string }) =>
    fixture.worktrees.get(link.worktreeId) ?? 'missing'
}))
vi.mock('./local-task-dispatch-project', () => ({ projectsForDispatchTarget: () => [project] }))

import { dispatchLocalTask } from './local-task-dispatch-launch'
import { dispatchLocalTaskToWorkspaces } from './local-task-dispatch-multiple'
import { finishLocalTaskDispatchRecord } from './local-task-dispatch-record'

const project: LocalTaskProject = {
  id: 'project',
  name: 'Project',
  prefix: 'P',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  statuses: [
    {
      id: 'doing',
      projectId: 'project',
      name: 'Doing',
      category: 'started',
      color: 'yellow',
      position: 0
    }
  ],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
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
    statusId: 'doing',
    priority: 0,
    labels: [],
    parentId,
    createdAt: 0,
    updatedAt: 0,
    revision: 0
  }
}

function worktree(id: string, hostId: ExecutionHostId = 'local'): Worktree {
  return makeWorktree({ id, repoId: 'repo', hostId, displayName: id })
}

function workspaceLink(taskId: string, worktreeId: string): LocalTaskWorkspaceLink {
  return {
    taskId,
    hostId: 'local',
    kind: 'git-worktree',
    instanceId: null,
    worktreeId,
    folderWorkspaceId: null,
    repoId: 'repo',
    branchSnapshot: null,
    nameSnapshot: null,
    hostLabelSnapshot: null,
    linkedVia: 'start',
    linkedAt: 0
  }
}

function session(id: string, taskId: string, worktreeId = 'wt-parent'): LocalTaskSessionLink {
  return {
    id,
    taskId,
    hostId: 'local',
    worktreeId,
    instanceId: null,
    surface: 'terminal',
    tabId: `tab-${id}`,
    paneKey: null,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 0
  }
}

function progress(id: string, state: LocalTaskSessionProgress['state']): LocalTaskSessionProgress {
  return { taskSessionId: id, state, lastMessage: null, stateSince: null, unread: false }
}

const parent = task('parent')
const child = task('child', 'parent')

function taskTarget(target: LocalTask) {
  return {
    kind: 'task' as const,
    id: `task:${target.id}`,
    label: target.title,
    detail: '',
    hostId: 'local',
    available: true,
    task: target,
    workspaceName: 'wt-parent'
  }
}

beforeEach(() => {
  fixture.contact = new Set(['local'])
  fixture.worktrees = new Map([['wt-parent', worktree('wt-parent')]])
  fixture.domain.tasks = [parent, child]
  fixture.domain.projects = [project]
  fixture.domain.links = { workspaces: [workspaceLink('parent', 'wt-parent')], sessions: [] }
  fixture.domain.progress = { sessions: new Map() }
  fixture.rpc.mockReset().mockResolvedValue({
    worktreeId: 'wt-parent',
    outcome: { kind: 'terminal', handle: 'pty', paneKey: 'tab-new:leaf' },
    receipt: { mode: 'terminal', preferred: 'terminal', reason: 'user_default' }
  })
  let created = 0
  fixture.createTask.mockReset().mockImplementation(async (input: { parentId: string | null }) => {
    created += 1
    return { ok: true, task: task(`new-${created}`, input.parentId) }
  })
  fixture.addComment.mockReset().mockResolvedValue({ ok: true })
  fixture.link.mockReset().mockResolvedValue(true)
  fixture.record.mockReset().mockResolvedValue(true)
  fixture.reply.mockReset().mockResolvedValue({ status: 'sent' })
})

describe('@ a task (REQ-029, H3)', () => {
  it.each([
    ['its own', parent],
    ['an inherited', child]
  ])(
    'opens a subtask session in %s workspace without linking that workspace again',
    async (_, target) => {
      const receipt = await dispatchLocalTask({
        target: taskTarget(target),
        text: 'Check the start-up path',
        agent: 'claude'
      })
      expect(receipt.kind).toBe('launched')
      expect(fixture.createTask.mock.calls[0]?.[0].parentId).toBe(target.id)
      expect(fixture.link).not.toHaveBeenCalled()
      expect(fixture.rpc.mock.calls[0]?.[2].target).toEqual({
        kind: 'existing',
        worktree: 'id:wt-parent'
      })
      expect(fixture.record.mock.calls[0]?.[0]).toMatchObject({
        taskId: 'new-1',
        worktreeId: 'wt-parent'
      })
    }
  )

  it('refuses before creating anything when the host dropped after the pick', async () => {
    fixture.contact = new Set()
    const receipt = await dispatchLocalTask({
      target: taskTarget(parent),
      text: 'Check the start-up path',
      agent: 'claude'
    })
    expect(receipt).toMatchObject({ kind: 'failed', message: 'Host not connected' })
    expect(fixture.createTask).not.toHaveBeenCalled()
    expect(fixture.rpc).not.toHaveBeenCalled()
  })
})

describe('a dispatch added to a task (REQ-029, H8)', () => {
  it('goes to every finished session of the task and its subtasks, with no new task', async () => {
    fixture.domain.links.sessions = [session('s-parent', 'parent'), session('s-child', 'child')]
    fixture.domain.progress = {
      sessions: new Map([
        ['s-parent', progress('s-parent', 'working')],
        ['s-child', progress('s-child', 'done')]
      ])
    }
    const receipt = await dispatchLocalTask({
      target: taskTarget(parent),
      text: 'Also cover the cold start',
      agent: 'claude'
    })
    expect(receipt).toMatchObject({ kind: 'appended', taskId: 'parent', message: null })
    expect(fixture.reply.mock.calls.map((call) => call[0].id)).toEqual(['s-child'])
    expect(fixture.createTask).not.toHaveBeenCalled()
    expect(fixture.addComment).toHaveBeenCalledWith('parent', 'Also cover the cold start')
  })

  it('names a workspace: only a finished session there takes the line', async () => {
    const target = {
      kind: 'workspace' as const,
      id: 'workspace:local:wt-parent',
      label: 'wt-parent',
      detail: '',
      hostId: 'local',
      available: true,
      worktree: worktree('wt-parent')
    }
    fixture.domain.links.sessions = [session('s-child', 'child', 'wt-child')]
    fixture.domain.progress = { sessions: new Map([['s-child', progress('s-child', 'done')]]) }
    const elsewhere = await dispatchLocalTask({ target, text: 'Trim the logs', agent: 'claude' })
    expect(elsewhere.kind).toBe('launched')
    expect(fixture.reply).not.toHaveBeenCalled()

    fixture.domain.links.sessions = [session('s-child', 'child')]
    const here = await dispatchLocalTask({ target, text: 'Trim the logs', agent: 'claude' })
    expect(here.kind).toBe('appended')
    expect(fixture.reply.mock.calls.map((call) => call[0].id)).toEqual(['s-child'])
  })

  it('reports a sent line whose comment failed, so the box clears instead of inviting a resend', async () => {
    fixture.domain.links.sessions = [session('s-parent', 'parent')]
    fixture.domain.progress = { sessions: new Map([['s-parent', progress('s-parent', 'done')]]) }
    fixture.addComment.mockRejectedValueOnce(new Error('library closed'))
    const receipt = await dispatchLocalTask({
      target: taskTarget(parent),
      text: 'Also cover the cold start',
      agent: 'claude'
    })
    expect(receipt).toMatchObject({
      kind: 'appended',
      message: 'Sent, but it could not be recorded on the task'
    })
  })
})

describe('a session that started but was not recorded', () => {
  it('offers to finish the record and never launches the agent again', async () => {
    fixture.record.mockResolvedValueOnce(false)
    const receipt = await dispatchLocalTask({
      target: taskTarget(parent),
      text: 'Check the start-up path',
      agent: 'claude'
    })
    expect(receipt).toMatchObject({
      kind: 'unrecorded',
      message: 'Session started but could not be linked'
    })
    const finished = await finishLocalTaskDispatchRecord(receipt)
    expect(finished.kind).toBe('launched')
    expect(fixture.record).toHaveBeenCalledTimes(2)
    expect(fixture.rpc).toHaveBeenCalledOnce()
    expect(fixture.createTask).toHaveBeenCalledOnce()
  })
})

describe('several workspaces', () => {
  it('refuses before the parent task when one host dropped after the pick', async () => {
    fixture.domain.links.workspaces = []
    const hosts: ExecutionHostId[] = ['local', 'ssh:box']
    const targets = hosts.map((hostId, at) => ({
      kind: 'workspace' as const,
      id: `workspace:${hostId}:wt-${at}`,
      label: `wt-${at}`,
      detail: '',
      hostId,
      available: true,
      worktree: worktree(`wt-${at}`, hostId)
    }))
    const batch = await dispatchLocalTaskToWorkspaces({
      targets,
      text: 'Bump the version',
      agent: 'claude',
      project
    })
    expect(batch).toMatchObject({ parentTaskId: null, message: 'Host not connected' })
    expect(fixture.createTask).not.toHaveBeenCalled()
  })
})
