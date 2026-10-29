import { isRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import { runRpcOperation } from '../transport/rpc-operation'
import type { RpcSendParams } from '../transport/rpc-params-contract'
import type { UnvalidatedRpcRequestPort } from '../transport/unvalidated-rpc-request-port'
import {
  localTaskCommentAdd,
  localTaskCommentEdit,
  localTaskCommentRemove,
  localTaskCreate,
  localTaskEventsRead,
  localTaskMove,
  localTaskProjectCreate,
  localTaskProjectRemove,
  localTaskProjectUpdate,
  localTaskProjectsRead,
  localTaskRemove,
  localTasksListRead,
  localTasksStatusRead,
  localTaskStatusRemove,
  localTaskStatusReorder,
  localTaskStatusUpsert,
  localTaskSubtasksCreate,
  localTaskUpdate,
  localTaskBatchUpdate,
  localTaskAttentionAcknowledge,
  localTaskAttentionSnooze,
  localTaskLinksRead,
  localTaskProgressRead,
  localTaskSessionRecord,
  localTaskSessionUnlink,
  localTaskWorkspaceLink,
  localTaskWorkspaceUnlink
} from './local-tasks-operations'
import type { LocalTaskWriteRefusal } from '../../../src/shared/local-tasks/local-task-read-schemas'

/**
 * What a write came to. `unknown` is the one a caller must not call a failure: the request
 * reached the wire and the answer was lost, so the host may have applied it. Retrying with the
 * same `clientOperationId` returns the first result instead of applying it twice.
 */
export type LocalTaskWriteOutcome<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'refused'; code: string; detail: string | null }
  | { kind: 'unknown' }
  | { kind: 'error'; message: string }

export async function settleLocalTaskWrite<T extends object>(
  reply: Promise<({ ok: true } & T) | LocalTaskWriteRefusal>
): Promise<LocalTaskWriteOutcome<T>> {
  try {
    const result = await reply
    if (result.ok) {
      return { kind: 'ok', value: result }
    }
    return { kind: 'refused', code: result.code, detail: result.detail }
  } catch (error) {
    if (isRpcDeliveryUnknown(error)) {
      return { kind: 'unknown' }
    }
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}

/** The phone's whole surface on one Orca's task library, bound to the client that reaches it. */
export function createLocalTasksApi(client: UnvalidatedRpcRequestPort) {
  return {
    status: () => runRpcOperation(client, localTasksStatusRead),
    projects: () => runRpcOperation(client, localTaskProjectsRead),
    tasks: () => runRpcOperation(client, localTasksListRead, {}),
    events: (taskId: string) => runRpcOperation(client, localTaskEventsRead, { taskId }),
    createProject: (params: RpcSendParams<'localTasks.projects.create'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskProjectCreate, params)),
    updateProject: (params: RpcSendParams<'localTasks.projects.update'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskProjectUpdate, params)),
    removeProject: (params: RpcSendParams<'localTasks.projects.remove'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskProjectRemove, params)),
    upsertStatus: (params: RpcSendParams<'localTasks.statuses.upsert'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskStatusUpsert, params)),
    reorderStatuses: (params: RpcSendParams<'localTasks.statuses.reorder'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskStatusReorder, params)),
    removeStatus: (params: RpcSendParams<'localTasks.statuses.remove'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskStatusRemove, params)),
    createTask: (params: RpcSendParams<'localTasks.tasks.create'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskCreate, params)),
    createSubtasks: (params: RpcSendParams<'localTasks.tasks.createSubtasks'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskSubtasksCreate, params)),
    updateTask: (params: RpcSendParams<'localTasks.tasks.update'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskUpdate, params)),
    batchUpdate: (params: RpcSendParams<'localTasks.tasks.batchUpdate'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskBatchUpdate, params)),
    moveTask: (params: RpcSendParams<'localTasks.tasks.move'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskMove, params)),
    removeTask: (params: RpcSendParams<'localTasks.tasks.remove'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskRemove, params)),
    addComment: (params: RpcSendParams<'localTasks.events.addComment'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskCommentAdd, params)),
    editComment: (params: RpcSendParams<'localTasks.events.editComment'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskCommentEdit, params)),
    removeComment: (params: RpcSendParams<'localTasks.events.removeComment'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskCommentRemove, params)),
    links: () => runRpcOperation(client, localTaskLinksRead, {}),
    progress: () => runRpcOperation(client, localTaskProgressRead, {}),
    linkWorkspace: (params: RpcSendParams<'localTasks.links.linkWorkspace'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskWorkspaceLink, params)),
    unlinkWorkspace: (params: RpcSendParams<'localTasks.links.unlinkWorkspace'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskWorkspaceUnlink, params)),
    recordSession: (params: RpcSendParams<'localTasks.links.recordSession'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskSessionRecord, params)),
    unlinkSession: (params: RpcSendParams<'localTasks.links.unlinkSession'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskSessionUnlink, params)),
    acknowledge: (params: RpcSendParams<'localTasks.attention.acknowledge'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskAttentionAcknowledge, params)),
    snooze: (params: RpcSendParams<'localTasks.attention.snooze'>) =>
      settleLocalTaskWrite(runRpcOperation(client, localTaskAttentionSnooze, params))
  }
}

export type LocalTasksApi = ReturnType<typeof createLocalTasksApi>
