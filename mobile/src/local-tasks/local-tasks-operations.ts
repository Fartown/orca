import type { z } from 'zod'
import { defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'
import type { RpcMethodName } from '../transport/rpc-params-contract'
import {
  localTaskEventsReplySchema,
  localTaskProjectsReplySchema,
  localTasksReplySchema,
  localTasksStatusSchema,
  localTaskWriteSchema,
  writeAnySuccess,
  writeProjectSuccess,
  writeTasksSuccess,
  writeTaskSuccess
} from './local-tasks-reply-schema'

// Every `localTasks.*` call the phone makes. All of them run on the paired desktop itself (the
// fork's mobile allowlist), which is the task host; none is routed to an execution host.
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
