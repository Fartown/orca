import { z } from 'zod'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import { writeResultSchema } from '../../../shared/local-tasks/local-task-result-schemas'
import type {
  LocalTasksAttentionSnoozeInput,
  LocalTasksLinksLinkWorkspaceInput,
  LocalTasksLinksRecordSessionInput,
  LocalTasksLinksResolveWorkspaceInput,
  LocalTasksRulesApplyPrMergedInput
} from '../../../shared/local-tasks/local-tasks-link-rpc-params'
import {
  localTaskSessionLinkSchema,
  localTaskWorkspaceLinkSchema
} from '../../../shared/local-tasks/local-task-link-read-schemas'
import { localTaskIdEndpoint, localTaskOwnerId } from './local-task-endpoints'
import {
  localTaskOwnerSessionTabIds,
  toClientLocalTaskSessionLink,
  toClientLocalTaskWorkspaceLink
} from './local-task-client-rows'
import {
  localTaskOwnerHostNow,
  refusedLocalTaskWrite,
  writeLocalTasks
} from './local-tasks-endpoint-calls'

type WithoutOperation<T> = Omit<T, 'clientOperationId'>

const okOnly = writeResultSchema({})
const workspaceResult = writeResultSchema({ workspace: localTaskWorkspaceLinkSchema })
const sessionResult = writeResultSchema({ session: localTaskSessionLinkSchema })

/**
 * Workspace and session links, attention marks and rules, written in the library of the task or
 * session they name; hosts and terminal tabs go out as that library's Orca names them (§2.2).
 */
export const localTaskLinksClient = {
  linkWorkspace: async (input: WithoutOperation<LocalTasksLinksLinkWorkspaceInput>) => {
    const endpoint = localTaskIdEndpoint(input.taskId)
    const hostId = localTaskOwnerHostNow(endpoint, input.hostId, input.repoId ?? null)
    if (!hostId) {
      return refusedLocalTaskWrite('host_not_owned')
    }
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.links.linkWorkspace',
      { ...input, taskId: localTaskOwnerId(input.taskId), hostId },
      workspaceResult
    )
    return result.ok
      ? { ...result, workspace: toClientLocalTaskWorkspaceLink(endpoint, result.workspace) }
      : result
  },
  /** `repoId` names the repo row behind a moved host, which says whether it is a nested SSH target. */
  resolveWorkspace: async (
    input: WithoutOperation<LocalTasksLinksResolveWorkspaceInput>,
    repoId: string | null
  ) => {
    const endpoint = localTaskIdEndpoint(input.taskId)
    const hostId = input.hostId ? localTaskOwnerHostNow(endpoint, input.hostId, repoId) : undefined
    if (hostId === null) {
      return refusedLocalTaskWrite('host_not_owned')
    }
    return writeLocalTasks(
      endpoint,
      'localTasks.links.resolveWorkspace',
      { ...input, taskId: localTaskOwnerId(input.taskId), ...(hostId ? { hostId } : {}) },
      workspaceResult
    )
  },
  unlinkWorkspace: (taskId: string) =>
    writeLocalTasks(
      localTaskIdEndpoint(taskId),
      'localTasks.links.unlinkWorkspace',
      { taskId: localTaskOwnerId(taskId) },
      okOnly
    ),
  recordSession: async (input: WithoutOperation<LocalTasksLinksRecordSessionInput>) => {
    const endpoint = localTaskIdEndpoint(input.taskId)
    const repoId = input.worktreeId ? getRepoIdFromWorktreeId(input.worktreeId) : null
    const hostId = localTaskOwnerHostNow(endpoint, input.hostId, repoId)
    if (!hostId) {
      return refusedLocalTaskWrite('host_not_owned')
    }
    const tabs = localTaskOwnerSessionTabIds(endpoint, {
      surface: input.surface,
      tabId: input.tabId ?? null,
      paneKey: input.paneKey ?? null
    })
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.links.recordSession',
      {
        ...input,
        taskId: localTaskOwnerId(input.taskId),
        hostId,
        tabId: tabs.tabId ?? undefined,
        paneKey: tabs.paneKey ?? undefined
      },
      sessionResult
    )
    return result.ok
      ? { ...result, session: toClientLocalTaskSessionLink(endpoint, result.session) }
      : result
  },
  unlinkSession: (sessionLinkId: string) =>
    writeLocalTasks(
      localTaskIdEndpoint(sessionLinkId),
      'localTasks.links.unlinkSession',
      { sessionLinkId: localTaskOwnerId(sessionLinkId) },
      okOnly
    ),

  /** Seen in any client is seen everywhere: the mark lives in the session host's library. */
  acknowledgeAttention: (itemKey: string, taskSessionId: string) =>
    writeLocalTasks(
      localTaskIdEndpoint(taskSessionId),
      'localTasks.attention.acknowledge',
      { itemKey, taskSessionId: localTaskOwnerId(taskSessionId) },
      okOnly
    ),
  snoozeAttention: (input: WithoutOperation<LocalTasksAttentionSnoozeInput>) =>
    writeLocalTasks(
      localTaskIdEndpoint(input.taskSessionId),
      'localTasks.attention.snooze',
      { ...input, taskSessionId: localTaskOwnerId(input.taskSessionId) },
      okOnly
    ),

  applyPrMerged: (input: WithoutOperation<LocalTasksRulesApplyPrMergedInput>) =>
    writeLocalTasks(
      localTaskIdEndpoint(input.taskId),
      'localTasks.rules.applyPrMerged',
      { ...input, taskId: localTaskOwnerId(input.taskId) },
      writeResultSchema({ applied: z.boolean() })
    )
}
