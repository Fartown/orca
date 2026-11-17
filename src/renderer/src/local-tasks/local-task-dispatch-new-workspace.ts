import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { createAgentSessionOperationId } from '@/runtime/agent-session-operation-id'
import { useAppStore } from '@/store'
import { getRepoExecutionHostId, normalizeExecutionHostId } from '../../../shared/execution-host'
import type { AgentLaunchResult } from '../../../shared/agent-launch-intent'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { getClientWorktreeCreateCandidate } from '../../../shared/new-workspace/worktree-create-retry-policy'
import { suggestLocalTaskWorkspaceName } from '../../../shared/local-tasks/local-task-model'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { localTaskEndpointForHost, localTaskEndpointTarget } from './local-task-endpoints'
import { dispatchedSessionIds, settleDispatchLaunch } from './local-task-dispatch-record'
import type { LocalTaskDispatchCandidate } from './local-task-dispatch-candidates'
import type { LocalTaskDispatchReceipt } from './local-task-dispatch-launch'
import { localTaskDispatchPrompt } from './local-task-dispatch-prompt'

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

export async function launchInNewWorkspace(
  task: LocalTask,
  target: Extract<LocalTaskDispatchCandidate, { kind: 'repo' }>,
  text: string,
  agent: TuiAgent,
  createdTaskIds: string[]
): Promise<LocalTaskDispatchReceipt> {
  const state = useAppStore.getState()
  const hostId = normalizeExecutionHostId(getRepoExecutionHostId(target.repo))
  const endpoint = hostId ? localTaskEndpointForHost(hostId) : null
  if (!hostId || !endpoint || !isLocalTaskHostInContact(state, hostId)) {
    return failed(
      task.id,
      createdTaskIds,
      target,
      text,
      translate('localTasks.dispatch.hostNotConnected', 'Host not connected')
    )
  }
  const baseName = suggestLocalTaskWorkspaceName(task.ref, task.title)
  let result: AgentLaunchResult | null = null
  let usedName = baseName
  for (let attempt = 0; attempt < 4; attempt += 1) {
    usedName = getClientWorktreeCreateCandidate(baseName, attempt)
    try {
      result = await callRuntimeRpc<AgentLaunchResult>(
        localTaskEndpointTarget(endpoint),
        'agent.launchReplay',
        {
          agent,
          operationId: createAgentSessionOperationId(),
          target: {
            kind: 'create-worktree',
            create: {
              repo: `id:${target.repo.id}`,
              repoHostId: hostId,
              name: usedName,
              displayName: usedName,
              displayNameKind: 'user'
            }
          },
          prompt: localTaskDispatchPrompt(task),
          launchSource: 'local-task',
          presentation: 'background'
        },
        { timeoutMs: 90_000 }
      )
      break
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'worktree_create_collision'
      ) {
        continue
      }
      return failed(
        task.id,
        createdTaskIds,
        target,
        text,
        error instanceof Error ? error.message : String(error),
        'unconfirmed'
      )
    }
  }
  if (!result) {
    return failed(
      task.id,
      createdTaskIds,
      target,
      text,
      translate('localTasks.dispatch.workspaceNameTaken', 'Workspace name is already in use')
    )
  }
  // Why recorded as one step: past this point the workspace and session exist, so a failure
  // offers to finish the record, never to launch again.
  return settleDispatchLaunch({ taskId: task.id, createdTaskIds, target, text }, result, {
    workspace: {
      worktree: { id: result.worktreeId, repoId: target.repo.id, displayName: usedName, hostId },
      hostId
    },
    session: {
      taskId: task.id,
      hostId,
      worktreeId: result.worktreeId,
      instanceId: null,
      agent,
      linkedVia: 'start'
    },
    ids: dispatchedSessionIds(result.outcome)
  })
}
