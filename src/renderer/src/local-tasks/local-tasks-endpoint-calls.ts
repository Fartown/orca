import { z } from 'zod'
import { createNonSecureContextUuid as createBrowserUuid } from '../../../shared/identifiers/non-secure-context-uuid'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '../runtime/rpc/calls/runtime-rpc-call'
import {
  localTaskProjectsReplySchema,
  localTasksReplySchema,
  localTaskEventsReplySchema,
  localTasksStatusSchema
} from '../../../shared/local-tasks/local-task-read-schemas'
import {
  localTaskLinksReplySchema,
  localTaskProgressSnapshotSchema
} from '../../../shared/local-tasks/local-task-link-read-schemas'
import {
  localTaskEndpointTarget,
  localTaskOwnerId,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import type {
  LocalTaskFailure,
  LocalTaskFailureCode
} from '../../../shared/local-tasks/local-task-types'
import {
  localTaskOwnerHostId,
  toClientLocalTask,
  toClientLocalTaskEvent,
  toClientLocalTaskLinks,
  toClientLocalTaskProgress,
  toClientLocalTaskProject
} from './local-task-client-rows'

/** One `localTasks.*` call to one library, its answer checked against the shared schema. */
export async function callLocalTasks<TSchema extends z.ZodType>(
  endpoint: LocalTaskEndpointKey,
  method: string,
  params: unknown,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  return schema.parse(
    await callRuntimeRpc<unknown>(localTaskEndpointTarget(endpoint), method, params)
  )
}

/** A refusal decided here, before asking a library that could not hold the value. */
export function refusedLocalTaskWrite(code: LocalTaskFailureCode): LocalTaskFailure {
  return { ok: false, code }
}

/** `localTaskOwnerHostId` against the repo rows this window holds right now. */
export function localTaskOwnerHostNow(
  endpoint: LocalTaskEndpointKey,
  hostId: string,
  repoId: string | null
): string | null {
  return localTaskOwnerHostId(useAppStore.getState().repos ?? [], endpoint, hostId, repoId)
}

const failureEndpoints = new WeakMap<object, LocalTaskEndpointKey>()

/** The library that refused a write, so a re-read after it touches that library alone. */
export function localTaskFailureEndpoint(failure: LocalTaskFailure): LocalTaskEndpointKey | null {
  return failureEndpoints.get(failure) ?? null
}

/** Each write gets an operation id; callers retrying one operation may reuse its id. */
export async function writeLocalTasks<TSchema extends z.ZodType>(
  endpoint: LocalTaskEndpointKey,
  method: string,
  params: Record<string, unknown>,
  schema: TSchema,
  clientOperationId = createBrowserUuid()
): Promise<z.infer<TSchema>> {
  const result = await callLocalTasks(endpoint, method, { ...params, clientOperationId }, schema)
  if (typeof result === 'object' && result !== null && 'ok' in result && result.ok === false) {
    failureEndpoints.set(result, endpoint)
  }
  return result
}

/** Reads of one library, already in this client's ids; what each endpoint's sync calls. */
export function localTasksEndpointReads(endpoint: LocalTaskEndpointKey) {
  return {
    status: () => callLocalTasks(endpoint, 'localTasks.status', undefined, localTasksStatusSchema),
    listProjects: async () =>
      (
        await callLocalTasks(
          endpoint,
          'localTasks.projects.list',
          undefined,
          localTaskProjectsReplySchema
        )
      ).map((project) => toClientLocalTaskProject(endpoint, project)),
    listTasks: async () =>
      (await callLocalTasks(endpoint, 'localTasks.tasks.list', {}, localTasksReplySchema)).map(
        (task) => toClientLocalTask(endpoint, task)
      ),
    listEvents: async (taskId: string) =>
      (
        await callLocalTasks(
          endpoint,
          'localTasks.events.list',
          { taskId: localTaskOwnerId(taskId) },
          localTaskEventsReplySchema
        )
      ).map((event) => toClientLocalTaskEvent(endpoint, event)),
    getPreferences: async (keys: string[]) =>
      (
        await callLocalTasks(
          endpoint,
          'localTasks.preferences.get',
          { keys },
          z.object({ values: z.record(z.string(), z.string().nullable()) })
        )
      ).values,
    listLinks: async () =>
      toClientLocalTaskLinks(
        endpoint,
        await callLocalTasks(endpoint, 'localTasks.links.list', {}, localTaskLinksReplySchema)
      ),
    getProgress: async () =>
      toClientLocalTaskProgress(
        endpoint,
        await callLocalTasks(
          endpoint,
          'localTasks.attention.get',
          {},
          localTaskProgressSnapshotSchema
        )
      )
  }
}

export type LocalTasksEndpointReads = ReturnType<typeof localTasksEndpointReads>
