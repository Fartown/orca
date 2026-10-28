import type { z } from 'zod'
import { z as schema } from 'zod'
import { defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'
import type { RpcMethodName } from '../transport/rpc-params-contract'
import {
  localTaskEventsReplySchema,
  localTaskLinksReplySchema,
  localTaskProgressSnapshotSchema,
  localTaskProjectsReplySchema,
  localTaskSessionLinkSchema,
  localTasksReplySchema,
  localTasksStatusSchema,
  localTaskWorkspaceLinkSchema,
  localTaskWriteSchema,
  writeAnySuccess,
  writeProjectSuccess,
  writeTasksSuccess,
  writeTaskSuccess
} from './local-tasks-reply-schema'

// Every `localTasks.*` call the phone makes. Each runs on the Orca whose library it reads: the
// paired host itself, or one of its servers when the client's envelope names `executionHost`.
//
// One policy for all: a transport refusal (the service not running) throws, and a business
// conflict arrives as `{ ok: false, code }` in the result, which the write schema keeps.

function read<Method extends RpcMethodName, Value>(
  method: Method,
  variant: string,
  schema: z.ZodType<Value, unknown>
) {
  return defineRpcOperation({
    name: `${method}-required`,
    method,
    acceptance: 'require-result-or-throw',
    barrier: 'on-settle',
    read: rpcResultVariant(variant, schema)
  })
}

function write<Method extends RpcMethodName, Success extends object>(
  method: Method,
  success: z.ZodType<Success, unknown>
) {
  return read(method, 'local-task-write', localTaskWriteSchema(success))
}

export const localTasksStatusRead = read(
  'localTasks.status',
  'local-tasks-status',
  localTasksStatusSchema
)
export const localTaskChangesUnsubscribe = read(
  'localTasks.unsubscribeChanges',
  'local-task-change-unsubscribe',
  schema.object({ unsubscribed: schema.literal(true) })
)
export const localTaskProjectsRead = read(
  'localTasks.projects.list',
  'local-task-projects',
  localTaskProjectsReplySchema
)
export const localTasksListRead = read(
  'localTasks.tasks.list',
  'local-tasks',
  localTasksReplySchema
)
export const localTaskEventsRead = read(
  'localTasks.events.list',
  'local-task-events',
  localTaskEventsReplySchema
)

export const localTaskProjectCreate = write('localTasks.projects.create', writeProjectSuccess)
export const localTaskProjectUpdate = write('localTasks.projects.update', writeProjectSuccess)
export const localTaskProjectRemove = write('localTasks.projects.remove', writeAnySuccess)
export const localTaskStatusUpsert = write('localTasks.statuses.upsert', writeAnySuccess)
export const localTaskStatusReorder = write('localTasks.statuses.reorder', writeAnySuccess)
export const localTaskStatusRemove = write('localTasks.statuses.remove', writeAnySuccess)
export const localTaskCreate = write('localTasks.tasks.create', writeTaskSuccess)
export const localTaskSubtasksCreate = write('localTasks.tasks.createSubtasks', writeTasksSuccess)
export const localTaskUpdate = write('localTasks.tasks.update', writeTaskSuccess)
export const localTaskBatchUpdate = write('localTasks.tasks.batchUpdate', writeAnySuccess)
export const localTaskMove = write('localTasks.tasks.move', writeTaskSuccess)
export const localTaskRemove = write('localTasks.tasks.remove', writeAnySuccess)
export const localTaskCommentAdd = write('localTasks.events.addComment', writeAnySuccess)
export const localTaskCommentEdit = write('localTasks.events.editComment', writeAnySuccess)
export const localTaskCommentRemove = write('localTasks.events.removeComment', writeAnySuccess)

// Links and the library host's live "Needs you" judgement; the phone never derives a session state.
export const localTaskLinksRead = read(
  'localTasks.links.list',
  'local-task-links',
  localTaskLinksReplySchema
)
export const localTaskProgressRead = read(
  'localTasks.attention.get',
  'local-task-progress',
  localTaskProgressSnapshotSchema
)

const workspaceSuccess = schema.object({ workspace: localTaskWorkspaceLinkSchema })
const sessionSuccess = schema.object({ session: localTaskSessionLinkSchema })

export const localTaskWorkspaceLink = write('localTasks.links.linkWorkspace', workspaceSuccess)
export const localTaskWorkspaceUnlink = write('localTasks.links.unlinkWorkspace', writeAnySuccess)
export const localTaskSessionRecord = write('localTasks.links.recordSession', sessionSuccess)
export const localTaskSessionUnlink = write('localTasks.links.unlinkSession', writeAnySuccess)
export const localTaskAttentionAcknowledge = write(
  'localTasks.attention.acknowledge',
  writeAnySuccess
)
export const localTaskAttentionSnooze = write('localTasks.attention.snooze', writeAnySuccess)
