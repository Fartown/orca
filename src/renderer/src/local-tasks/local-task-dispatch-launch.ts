import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { createAgentSessionOperationId } from '@/runtime/agent-session-operation-id'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { normalizeExecutionHostId } from '../../../shared/execution-host'
import type { AgentLaunchResult } from '../../../shared/agent-launch-intent'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { localTaskFinishedSessions } from '../../../shared/local-tasks/local-task-finished-sessions'
import { isFolderRepo } from '../../../shared/repo-kind'
import { worktreeIdsEqual } from '../../../shared/worktree/id'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { localTaskEndpointForHost, localTaskEndpointTarget } from './local-task-endpoints'
import {
  isLocalTaskRowWritable,
  localTasksDomainStore,
  type LocalTasksDomainState
} from './local-tasks-domain-store'
import { linkLocalTaskWorkspace } from './local-task-workspace-linking'
import { launchInNewWorkspace } from './local-task-dispatch-new-workspace'
import { localTaskDispatchPrompt } from './local-task-dispatch-prompt'
import {
  dispatchedSessionIds,
  settleDispatchLaunch,
  type LocalTaskDispatchRecord
} from './local-task-dispatch-record'
import { createDispatchTask } from './local-task-dispatch-task'
import {
  findLocalTaskEffectiveWorkspace,
  findLocalTaskLinkForWorkspace
} from './local-task-link-selectors'
import {
  localTaskWorktreeHostId,
  selectLocalTaskWorkspace
} from './local-task-workspace-resolution'
import { projectsForDispatchTarget } from './local-task-dispatch-project'
import { appendToFinishedSessions } from './local-task-dispatch-append'
import type { LocalTaskDispatchCandidate } from './local-task-dispatch-candidates'

export type LocalTaskDispatchReceipt = {
  /** `unrecorded`: the session started but its task does not list it yet; never launched again. */
  kind: 'launched' | 'appended' | 'failed' | 'unconfirmed' | 'unrecorded'
  taskId: string
  createdTaskIds: string[]
  target: LocalTaskDispatchCandidate
  text: string
  message: string | null
  launch?: { hostId: string; worktreeId: string; outcome: AgentLaunchResult['outcome'] }
  /** What `unrecorded` still has to write down. */
  record?: LocalTaskDispatchRecord
}

type WorkspaceTarget = Extract<LocalTaskDispatchCandidate, { kind: 'workspace' }>

export { dispatchTitle } from './local-task-dispatch-task'

function failed(
  taskId: string,
  createdTaskIds: string[],
  target: LocalTaskDispatchCandidate,
  text: string,
  message: string,
  kind: 'failed' | 'unconfirmed' = 'failed'
): LocalTaskDispatchReceipt {
  return { kind, taskId, createdTaskIds, target, text, message }
}

export async function launchInWorkspace(
  task: LocalTask,
  target: WorkspaceTarget,
  text: string,
  agent: TuiAgent,
  createdTaskIds: string[]
): Promise<LocalTaskDispatchReceipt> {
  const state = useAppStore.getState()
  const hostId = normalizeExecutionHostId(localTaskWorktreeHostId(state, target.worktree))
  const endpoint = hostId ? localTaskEndpointForHost(hostId) : null
  const fail = (message: string, kind: 'failed' | 'unconfirmed' = 'failed') =>
    failed(task.id, createdTaskIds, target, text, message, kind)
  if (!hostId || !endpoint || !isLocalTaskHostInContact(state, hostId)) {
    return fail(translate('localTasks.dispatch.hostNotConnected', 'Host not connected'))
  }
  let result: AgentLaunchResult
  try {
    result = await callRuntimeRpc<AgentLaunchResult>(
      localTaskEndpointTarget(endpoint),
      'agent.launchReplay',
      {
        agent,
        operationId: createAgentSessionOperationId(),
        target: { kind: 'existing', worktree: `id:${target.worktree.id}` },
        prompt: localTaskDispatchPrompt(task),
        launchSource: 'local-task',
        presentation: 'background'
      },
      { timeoutMs: 90_000 }
    )
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 'unconfirmed')
  }
  return settleDispatchLaunch({ taskId: task.id, createdTaskIds, target, text }, result, {
    workspace: null,
    session: {
      taskId: task.id,
      hostId,
      worktreeId: result.worktreeId,
      instanceId: target.worktree.instanceId ?? null,
      agent,
      linkedVia: 'start'
    },
    ids: dispatchedSessionIds(result.outcome)
  })
}

/** Where a target works now, read at submit time; `ownerTaskId` already holds that workspace. */
function resolveDispatchPlace(
  state: AppState,
  domain: LocalTasksDomainState,
  target: Exclude<LocalTaskDispatchCandidate, { kind: 'host' }>
): { hostId: string | null; workspace: WorkspaceTarget | null; ownerTaskId: string | null } {
  if (target.kind === 'repo') {
    return { hostId: target.hostId, workspace: null, ownerTaskId: null }
  }
  if (target.kind === 'workspace') {
    const owner = findLocalTaskLinkForWorkspace(domain.links, {
      id: target.worktree.id,
      hostId: target.hostId,
      ...(target.worktree.instanceId ? { instanceId: target.worktree.instanceId } : {})
    })
    return { hostId: target.hostId, workspace: target, ownerTaskId: owner?.taskId ?? null }
  }
  const link = findLocalTaskEffectiveWorkspace(
    domain.links,
    target.task,
    new Map(domain.tasks.map((item) => [item.id, item]))
  )
  if (!link) {
    return { hostId: null, workspace: null, ownerTaskId: null }
  }
  const located = selectLocalTaskWorkspace(state, link)
  if (typeof located === 'string') {
    return { hostId: link.hostId, workspace: null, ownerTaskId: link.taskId }
  }
  return {
    hostId: link.hostId,
    ownerTaskId: link.taskId,
    workspace: {
      kind: 'workspace',
      id: `workspace:${link.hostId}:${located.id}`,
      label: located.displayName,
      detail: '',
      hostId: link.hostId,
      available: isLocalTaskHostInContact(state, link.hostId),
      worktree: located
    }
  }
}

type DispatchArgs = {
  target: LocalTaskDispatchCandidate
  text: string
  agent: TuiAgent
  project?: LocalTaskProject
  existingTaskId?: string
  parentTaskId?: string
}

/** Never rejects: a throw midway may have reached a host, so it reads as unconfirmed, not failed. */
export function dispatchLocalTask(args: DispatchArgs): Promise<LocalTaskDispatchReceipt> {
  return dispatchOnce(args).catch((error: unknown) =>
    failed(
      args.existingTaskId ?? '',
      [],
      args.target,
      args.text.trim(),
      error instanceof Error ? error.message : String(error),
      'unconfirmed'
    )
  )
}

async function dispatchOnce(args: DispatchArgs): Promise<LocalTaskDispatchReceipt> {
  const { target, agent } = args
  const text = args.text.trim()
  const state = useAppStore.getState()
  const domain = localTasksDomainStore.getState()
  let project: LocalTaskProject | undefined =
    args.project ?? projectsForDispatchTarget(state, target, domain.projects)[0]
  const knownTask = args.existingTaskId
    ? domain.tasks.find((task) => task.id === args.existingTaskId)
    : target.kind === 'task'
      ? target.task
      : null
  const fail = (message: string, taskId = knownTask?.id ?? '', createdTaskIds: string[] = []) =>
    failed(taskId, createdTaskIds, target, text, message)
  if (!text || target.kind === 'host') {
    return fail(
      translate(
        'localTasks.dispatch.chooseConnectedTarget',
        'Choose a connected workspace, repository, or task'
      )
    )
  }
  if (target.kind === 'repo' && isFolderRepo(target.repo)) {
    return fail(
      translate('localTasks.dispatch.chooseFolderWorkspace', 'Choose an existing folder workspace')
    )
  }
  const place = resolveDispatchPlace(state, domain, target)
  if (place.hostId === null) {
    return fail(
      translate('localTasks.dispatch.chooseTaskWorkspace', 'Choose a workspace for this task')
    )
  }
  // Why read now: the pick was a snapshot; a host lost since then must refuse before any write.
  if (!isLocalTaskHostInContact(state, place.hostId)) {
    return fail(translate('localTasks.dispatch.hostNotConnected', 'Host not connected'))
  }
  if (target.kind === 'task' && !place.workspace) {
    return fail(
      translate('localTasks.dispatch.chooseTaskWorkspace', 'Choose a workspace for this task')
    )
  }
  let task = knownTask
  let parentId: string | null = args.parentTaskId ?? null
  if (target.kind === 'workspace' && place.ownerTaskId && !task) {
    task = domain.tasks.find((item) => item.id === place.ownerTaskId) ?? null
    project = task ? domain.projects.find((item) => item.id === task?.projectId) : project
  }
  if (!project || !isLocalTaskRowWritable(domain, project.id)) {
    return fail(
      translate('localTasks.dispatch.writableProjectRequired', 'A writable project is required'),
      task?.id ?? ''
    )
  }
  if (task) {
    const workspace = target.kind === 'workspace' ? target : null
    // Why only that workspace's when one was named: the line was meant for work there (REQ-029).
    const finished = localTaskFinishedSessions({
      taskId: task.id,
      tasks: domain.tasks,
      sessions: domain.links.sessions,
      stateOf: (sessionLinkId) => domain.progress?.sessions.get(sessionLinkId)?.state
    }).filter(
      (session) =>
        !workspace ||
        (workspace.worktree.instanceId !== undefined &&
          session.instanceId === workspace.worktree.instanceId) ||
        (session.hostId === workspace.hostId &&
          session.worktreeId !== null &&
          worktreeIdsEqual(session.worktreeId, workspace.worktree.id))
    )
    if (finished.length > 0) {
      return appendToFinishedSessions(task, finished, target, text)
    }
    if (!args.existingTaskId) {
      parentId = task.id
      task = null
    }
  }
  const createdTaskIds: string[] = []
  if (!task) {
    task = await createDispatchTask(project, text, parentId)
    if (!task) {
      return fail(translate('localTasks.dispatch.createTaskFailed', 'Could not create task'), '')
    }
    createdTaskIds.push(task.id)
  }
  if (place.workspace) {
    // Why not linked when owned: one workspace belongs to one task; a subtask works in its owner's.
    if (!place.ownerTaskId) {
      const linked = await linkLocalTaskWorkspace(state, {
        taskId: task.id,
        worktree: place.workspace.worktree,
        linkedVia: 'start'
      })
      if (!linked) {
        return fail(
          translate(
            'localTasks.dispatch.workspaceLinkFailed',
            'Task created but workspace link failed'
          ),
          task.id,
          createdTaskIds
        )
      }
    }
    return launchInWorkspace(task, place.workspace, text, agent, createdTaskIds)
  }
  if (target.kind === 'repo') {
    return launchInNewWorkspace(task, target, text, agent, createdTaskIds)
  }
  return fail(
    translate('localTasks.dispatch.chooseWorkspaceOrRepo', 'Choose a workspace or repository'),
    task.id,
    createdTaskIds
  )
}
