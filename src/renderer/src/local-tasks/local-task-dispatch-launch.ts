import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { createAgentSessionOperationId } from '@/runtime/agent-session-operation-id'
import { useAppStore } from '@/store'
import {
  getFolderWorkspaceWorktree,
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'
import { normalizeExecutionHostId } from '../../../shared/execution-host'
import type { AgentLaunchResult } from '../../../shared/agent-launch-intent'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { isFolderRepo } from '../../../shared/repo-kind'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { localTaskEndpointForHost, localTaskEndpointTarget } from './local-task-endpoints'
import { isLocalTaskRowWritable, localTasksDomainStore } from './local-tasks-domain-store'
import { localTasksClient } from './local-tasks-runtime-client'
import { linkLocalTaskWorkspace } from './local-task-workspace-linking'
import { launchInNewWorkspace } from './local-task-dispatch-new-workspace'
import { localTaskDispatchPrompt } from './local-task-dispatch-prompt'
import { createDispatchTask } from './local-task-dispatch-task'
import {
  findLocalTaskEffectiveWorkspace,
  findLocalTaskLinkForWorkspace
} from './local-task-link-selectors'
import {
  localTaskLinkWorkspaceId,
  localTaskWorktreeHostId
} from './local-task-workspace-resolution'
import { projectsForDispatchTarget } from './local-task-dispatch-project'
import { recordLocalTaskSession, chatSessionIds } from './local-task-session-recording'
import { sendLocalTaskReply } from './local-task-needs-you-actions'
import type { LocalTaskDispatchCandidate } from './local-task-dispatch-candidates'

export type LocalTaskDispatchReceipt = {
  kind: 'launched' | 'appended' | 'failed' | 'unconfirmed'
  taskId: string
  createdTaskIds: string[]
  target: LocalTaskDispatchCandidate
  text: string
  message: string | null
  launch?: { hostId: string; worktreeId: string; outcome: AgentLaunchResult['outcome'] }
}

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

function doneSession(taskId: string): LocalTaskSessionLink | null {
  const domain = localTasksDomainStore.getState()
  const completed = new Set(
    [...(domain.progress?.sessions.values() ?? [])]
      .filter((session) => session.state === 'done')
      .map((session) => session.taskSessionId)
  )
  return (
    domain.links.sessions.find(
      (session) => session.taskId === taskId && completed.has(session.id)
    ) ?? null
  )
}

export async function launchInWorkspace(
  task: LocalTask,
  target: Extract<LocalTaskDispatchCandidate, { kind: 'workspace' }>,
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
  const recorded = await recordLocalTaskSession(
    {
      taskId: task.id,
      hostId,
      worktreeId: result.worktreeId,
      instanceId: target.worktree.instanceId ?? null,
      agent,
      linkedVia: 'start'
    },
    result.outcome.kind === 'structured'
      ? chatSessionIds(result.outcome.tabId ?? null, result.outcome.sessionId)
      : {
          surface: 'terminal',
          paneKey: result.outcome.paneKey ?? undefined,
          tabId: result.outcome.paneKey ? parsePaneKey(result.outcome.paneKey)?.tabId : undefined
        }
  )
  if (!recorded) {
    return fail(
      translate('localTasks.dispatch.sessionLinkFailed', 'Session started but could not be linked')
    )
  }
  return {
    kind: 'launched',
    taskId: task.id,
    createdTaskIds,
    target,
    text,
    message:
      result.prompt?.outcome === 'not-delivered'
        ? translate(
            'localTasks.dispatch.promptNotDelivered',
            'Session started but prompt was not delivered'
          )
        : (result.warning ?? null),
    launch: { hostId, worktreeId: result.worktreeId, outcome: result.outcome }
  }
}

export async function dispatchLocalTask(args: {
  target: LocalTaskDispatchCandidate
  text: string
  agent: TuiAgent
  project?: LocalTaskProject
  existingTaskId?: string
  parentTaskId?: string
}): Promise<LocalTaskDispatchReceipt> {
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
  if (!text || target.kind === 'host' || !target.available) {
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
  let task = knownTask
  let parentId: string | null = args.parentTaskId ?? null
  let workspaceAlreadyOwned = false
  let workspaceTarget: Extract<LocalTaskDispatchCandidate, { kind: 'workspace' }> | null = null
  if (target.kind === 'task') {
    const byId = new Map(domain.tasks.map((item) => [item.id, item]))
    const link = findLocalTaskEffectiveWorkspace(domain.links, target.task, byId)
    const workspaceId = link ? localTaskLinkWorkspaceId(link) : null
    const worktree = workspaceId
      ? [
          ...Object.values(selectWorktreesByRepo(state)).flat(),
          ...selectFolderWorkspaces(state).map((folder) => getFolderWorkspaceWorktree(folder))
        ].find((item) => item.id === workspaceId)
      : null
    if (!worktree) {
      return fail(
        translate('localTasks.dispatch.chooseTaskWorkspace', 'Choose a workspace for this task')
      )
    }
    workspaceTarget = {
      kind: 'workspace',
      id: `workspace:${link?.hostId}:${worktree.id}`,
      label: worktree.displayName,
      detail: '',
      hostId: link!.hostId,
      available: isLocalTaskHostInContact(state, link!.hostId),
      worktree
    }
  } else if (target.kind === 'workspace') {
    workspaceTarget = target
    const owner = findLocalTaskLinkForWorkspace(domain.links, {
      id: target.worktree.id,
      hostId: target.hostId,
      ...(target.worktree.instanceId ? { instanceId: target.worktree.instanceId } : {})
    })
    if (owner && !task) {
      task = domain.tasks.find((item) => item.id === owner.taskId) ?? null
      workspaceAlreadyOwned = true
      project = task ? domain.projects.find((item) => item.id === task?.projectId) : project
    }
  }
  if (!project || !isLocalTaskRowWritable(domain, project.id)) {
    return fail(
      translate('localTasks.dispatch.writableProjectRequired', 'A writable project is required'),
      task?.id ?? ''
    )
  }
  if (task) {
    const done = doneSession(task.id)
    if (done) {
      if (!isLocalTaskHostInContact(state, done.hostId)) {
        return fail(
          translate('localTasks.dispatch.hostNotConnected', 'Host not connected'),
          task.id
        )
      }
      const sent = await sendLocalTaskReply(done, text)
      if (sent.status !== 'sent') {
        return fail(
          translate('localTasks.dispatch.appendFailed', 'Could not send to the finished session'),
          task.id
        )
      }
      await localTasksClient.addComment(task.id, text)
      return { kind: 'appended', taskId: task.id, createdTaskIds: [], target, text, message: null }
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
  if (workspaceTarget) {
    if (
      !workspaceAlreadyOwned &&
      !domain.links.workspaces.some((link) => link.taskId === task.id)
    ) {
      const linked = await linkLocalTaskWorkspace(state, {
        taskId: task.id,
        worktree: workspaceTarget.worktree,
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
    return launchInWorkspace(task, workspaceTarget, text, agent, createdTaskIds)
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
