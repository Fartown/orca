import { z } from 'zod'
import type {
  LocalTasksProjectsCreateInput,
  LocalTasksProjectsUpdateInput,
  LocalTasksStatusesRemoveInput,
  LocalTasksStatusesReorderInput,
  LocalTasksStatusesUpsertInput,
  LocalTasksTasksBatchUpdateInput,
  LocalTasksTasksCreateInput,
  LocalTasksTasksCreateSubtasksInput,
  LocalTasksTasksMoveInput,
  LocalTasksTasksUpdateInput
} from '../../../shared/local-tasks/local-tasks-rpc-params'
import {
  failureSchema,
  projectSchema,
  taskSchema,
  writeResultSchema
} from '../../../shared/local-tasks/local-task-result-schemas'
import type { LocalTaskFailure } from '../../../shared/local-tasks/local-task-types'
import {
  localTaskClientId,
  localTaskIdEndpoint,
  localTaskOwnerId,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import { toClientLocalTask, toClientLocalTaskProject } from './local-task-client-rows'
import {
  callLocalTasks,
  localTaskOwnerHostNow,
  refusedLocalTaskWrite,
  writeLocalTasks
} from './local-tasks-endpoint-calls'
import { localTaskLinksClient } from './local-tasks-link-client'
import { localTasksDomainStore } from './local-tasks-domain-store'

type WithoutOperation<T> = Omit<T, 'clientOperationId'>

/** The one library all these ids belong to; null when they span libraries. */
function sharedEndpoint(ids: readonly string[]): LocalTaskEndpointKey | null {
  const endpoints = new Set(ids.map(localTaskIdEndpoint))
  const [only] = endpoints
  return endpoints.size === 1 && only ? only : null
}

const ownerIdOrNull = (id: string | null | undefined): string | null | undefined =>
  id ? localTaskOwnerId(id) : id

const okOnly = writeResultSchema({})
const projectResult = writeResultSchema({ project: projectSchema })
const taskResult = writeResultSchema({ task: taskSchema })

/**
 * Writes take this client's ids and go to the library that owns them, so a row is always written
 * where it lives; ids, hosts and terminal tabs go out in the owner's own spelling (CONTRACT §2.2).
 */
export const localTasksClient = {
  /** UI choices follow the library this window opens first: its own, or the paired host's. */
  setPreference: (key: string, value: string | null) => {
    const { home } = localTasksDomainStore.getState()
    if (!home) {
      return Promise.reject(new Error('No task library is open'))
    }
    // Why no operation id: the host stores the last value per key, so a replay is harmless.
    return callLocalTasks(
      home,
      'localTasks.preferences.set',
      { key, value },
      z.union([z.object({ ok: z.literal(true) }), failureSchema])
    )
  },

  createProject: async (
    endpoint: LocalTaskEndpointKey,
    input: WithoutOperation<LocalTasksProjectsCreateInput>
  ) => {
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.projects.create',
      input,
      projectResult
    )
    return result.ok
      ? { ...result, project: toClientLocalTaskProject(endpoint, result.project) }
      : result
  },
  updateProject: async (input: WithoutOperation<LocalTasksProjectsUpdateInput>) => {
    const endpoint = localTaskIdEndpoint(input.projectId)
    const lastHost = input.lastExecutionHostId
      ? localTaskOwnerHostNow(endpoint, input.lastExecutionHostId, null)
      : input.lastExecutionHostId
    if (lastHost === null && input.lastExecutionHostId) {
      return refusedLocalTaskWrite('host_not_owned')
    }
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.projects.update',
      {
        ...input,
        projectId: localTaskOwnerId(input.projectId),
        ...(input.lastExecutionHostId === undefined ? {} : { lastExecutionHostId: lastHost })
      },
      projectResult
    )
    return result.ok
      ? { ...result, project: toClientLocalTaskProject(endpoint, result.project) }
      : result
  },
  removeProject: (projectId: string) =>
    writeLocalTasks(
      localTaskIdEndpoint(projectId),
      'localTasks.projects.remove',
      { projectId: localTaskOwnerId(projectId) },
      okOnly
    ),
  upsertStatus: async (input: WithoutOperation<LocalTasksStatusesUpsertInput>) => {
    const endpoint = localTaskIdEndpoint(input.projectId)
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.statuses.upsert',
      {
        ...input,
        projectId: localTaskOwnerId(input.projectId),
        ...(input.statusId ? { statusId: localTaskOwnerId(input.statusId) } : {})
      },
      writeResultSchema({ statusId: z.string() })
    )
    return result.ok
      ? { ...result, statusId: localTaskClientId(endpoint, result.statusId) }
      : result
  },
  reorderStatuses: (input: WithoutOperation<LocalTasksStatusesReorderInput>) =>
    writeLocalTasks(
      localTaskIdEndpoint(input.projectId),
      'localTasks.statuses.reorder',
      {
        projectId: localTaskOwnerId(input.projectId),
        orderedStatusIds: input.orderedStatusIds.map(localTaskOwnerId)
      },
      okOnly
    ),
  removeStatus: (input: WithoutOperation<LocalTasksStatusesRemoveInput>) =>
    writeLocalTasks(
      localTaskIdEndpoint(input.statusId),
      'localTasks.statuses.remove',
      {
        statusId: localTaskOwnerId(input.statusId),
        ...(input.moveTasksToStatusId
          ? { moveTasksToStatusId: localTaskOwnerId(input.moveTasksToStatusId) }
          : {})
      },
      okOnly
    ),

  createTask: async (input: WithoutOperation<LocalTasksTasksCreateInput>) => {
    const endpoint = localTaskIdEndpoint(input.projectId)
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.tasks.create',
      {
        ...input,
        projectId: localTaskOwnerId(input.projectId),
        ...(input.statusId ? { statusId: localTaskOwnerId(input.statusId) } : {}),
        ...(input.parentId === undefined ? {} : { parentId: ownerIdOrNull(input.parentId) })
      },
      taskResult
    )
    return result.ok ? { ...result, task: toClientLocalTask(endpoint, result.task) } : result
  },
  createSubtasks: async (input: WithoutOperation<LocalTasksTasksCreateSubtasksInput>) => {
    const endpoint = localTaskIdEndpoint(input.parentId)
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.tasks.createSubtasks',
      { ...input, parentId: localTaskOwnerId(input.parentId) },
      writeResultSchema({ tasks: z.array(taskSchema) })
    )
    return result.ok
      ? { ...result, tasks: result.tasks.map((task) => toClientLocalTask(endpoint, task)) }
      : result
  },
  updateTask: async (input: WithoutOperation<LocalTasksTasksUpdateInput>) => {
    const endpoint = localTaskIdEndpoint(input.taskId)
    const { patch } = input
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.tasks.update',
      {
        ...input,
        taskId: localTaskOwnerId(input.taskId),
        patch: {
          ...patch,
          ...(patch.statusId ? { statusId: localTaskOwnerId(patch.statusId) } : {}),
          ...(patch.parentId === undefined ? {} : { parentId: ownerIdOrNull(patch.parentId) })
        }
      },
      taskResult
    )
    return result.ok ? { ...result, task: toClientLocalTask(endpoint, result.task) } : result
  },
  /** One request per library; a status belongs to one project, so it never spans libraries. */
  batchUpdateTasks: async (
    input: WithoutOperation<LocalTasksTasksBatchUpdateInput>
  ): Promise<{ ok: true; updated: number } | LocalTaskFailure> => {
    const byEndpoint = new Map<LocalTaskEndpointKey, string[]>()
    for (const taskId of input.taskIds) {
      const endpoint = localTaskIdEndpoint(taskId)
      byEndpoint.set(endpoint, [...(byEndpoint.get(endpoint) ?? []), localTaskOwnerId(taskId)])
    }
    const { patch } = input
    let updated = 0
    for (const [endpoint, taskIds] of byEndpoint) {
      if (patch.statusId && localTaskIdEndpoint(patch.statusId) !== endpoint) {
        return refusedLocalTaskWrite('status_invalid')
      }
      const result = await writeLocalTasks(
        endpoint,
        'localTasks.tasks.batchUpdate',
        {
          taskIds,
          patch: patch.statusId ? { ...patch, statusId: localTaskOwnerId(patch.statusId) } : patch
        },
        writeResultSchema({ updated: z.number() })
      )
      if (!result.ok) {
        return result
      }
      updated += result.updated
    }
    return { ok: true, updated }
  },
  /** Moving between two Orcas' libraries is not a move; each host numbers its own tasks. */
  moveTask: async (input: WithoutOperation<LocalTasksTasksMoveInput>) => {
    const endpoint = sharedEndpoint([input.taskId, input.targetProjectId])
    if (!endpoint) {
      return refusedLocalTaskWrite('parent_invalid')
    }
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.tasks.move',
      {
        taskId: localTaskOwnerId(input.taskId),
        targetProjectId: localTaskOwnerId(input.targetProjectId)
      },
      taskResult
    )
    return result.ok ? { ...result, task: toClientLocalTask(endpoint, result.task) } : result
  },
  removeTask: (taskId: string) =>
    writeLocalTasks(
      localTaskIdEndpoint(taskId),
      'localTasks.tasks.remove',
      { taskId: localTaskOwnerId(taskId) },
      writeResultSchema({ removed: z.number() })
    ),

  addComment: async (taskId: string, body: string) => {
    const endpoint = localTaskIdEndpoint(taskId)
    const result = await writeLocalTasks(
      endpoint,
      'localTasks.events.addComment',
      { taskId: localTaskOwnerId(taskId), body },
      writeResultSchema({ eventId: z.string() })
    )
    return result.ok ? { ...result, eventId: localTaskClientId(endpoint, result.eventId) } : result
  },
  editComment: (eventId: string, body: string) =>
    writeLocalTasks(
      localTaskIdEndpoint(eventId),
      'localTasks.events.editComment',
      { eventId: localTaskOwnerId(eventId), body },
      okOnly
    ),
  removeComment: (eventId: string) =>
    writeLocalTasks(
      localTaskIdEndpoint(eventId),
      'localTasks.events.removeComment',
      { eventId: localTaskOwnerId(eventId) },
      okOnly
    ),
  ...localTaskLinksClient
}

export type LocalTasksClient = typeof localTasksClient
