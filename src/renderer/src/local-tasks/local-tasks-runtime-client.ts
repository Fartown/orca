import { z } from 'zod'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
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
  eventSchema,
  failureSchema,
  projectSchema,
  statusResultSchema,
  taskSchema,
  writeResultSchema
} from '../../../shared/local-tasks/local-task-result-schemas'

// Why fixed: the task library lives on this desktop, never on the focused execution host.
const LOCAL_TARGET = { kind: 'local' } as const

type WithoutOperation<T> = Omit<T, 'clientOperationId'>

async function read<TSchema extends z.ZodType>(
  method: string,
  params: unknown,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  return schema.parse(await callRuntimeRpc<unknown>(LOCAL_TARGET, method, params))
}

/** Every write gets a fresh operation id, so a replayed request returns the first result. */
function write<TSchema extends z.ZodType>(
  method: string,
  params: Record<string, unknown>,
  schema: TSchema
): Promise<z.infer<TSchema>> {
  return read(method, { ...params, clientOperationId: createBrowserUuid() }, schema)
}

const okOnly = writeResultSchema({})
const projectResult = writeResultSchema({ project: projectSchema })
const taskResult = writeResultSchema({ task: taskSchema })

export const localTasksClient = {
  status: () => read('localTasks.status', undefined, statusResultSchema),
  listProjects: async () =>
    (
      await read(
        'localTasks.projects.list',
        undefined,
        z.object({ projects: z.array(projectSchema) })
      )
    ).projects,
  listTasks: async () =>
    (await read('localTasks.tasks.list', {}, z.object({ tasks: z.array(taskSchema) }))).tasks,
  listEvents: async (taskId: string) =>
    (await read('localTasks.events.list', { taskId }, z.object({ events: z.array(eventSchema) })))
      .events,
  getPreferences: async (keys: string[]) =>
    (
      await read(
        'localTasks.preferences.get',
        { keys },
        z.object({ values: z.record(z.string(), z.string().nullable()) })
      )
    ).values,
  // Why no operation id: the host stores the last value per key, so a replay is harmless.
  setPreference: (key: string, value: string | null) =>
    read(
      'localTasks.preferences.set',
      { key, value },
      z.union([z.object({ ok: z.literal(true) }), failureSchema])
    ),

  createProject: (input: WithoutOperation<LocalTasksProjectsCreateInput>) =>
    write('localTasks.projects.create', input, projectResult),
  updateProject: (input: WithoutOperation<LocalTasksProjectsUpdateInput>) =>
    write('localTasks.projects.update', input, projectResult),
  removeProject: (projectId: string) => write('localTasks.projects.remove', { projectId }, okOnly),
  upsertStatus: (input: WithoutOperation<LocalTasksStatusesUpsertInput>) =>
    write('localTasks.statuses.upsert', input, writeResultSchema({ statusId: z.string() })),
  reorderStatuses: (input: WithoutOperation<LocalTasksStatusesReorderInput>) =>
    write('localTasks.statuses.reorder', input, okOnly),
  removeStatus: (input: WithoutOperation<LocalTasksStatusesRemoveInput>) =>
    write('localTasks.statuses.remove', input, okOnly),

  createTask: (input: WithoutOperation<LocalTasksTasksCreateInput>) =>
    write('localTasks.tasks.create', input, taskResult),
  createSubtasks: (input: WithoutOperation<LocalTasksTasksCreateSubtasksInput>) =>
    write(
      'localTasks.tasks.createSubtasks',
      input,
      writeResultSchema({ tasks: z.array(taskSchema) })
    ),
  updateTask: (input: WithoutOperation<LocalTasksTasksUpdateInput>) =>
    write('localTasks.tasks.update', input, taskResult),
  batchUpdateTasks: (input: WithoutOperation<LocalTasksTasksBatchUpdateInput>) =>
    write('localTasks.tasks.batchUpdate', input, writeResultSchema({ updated: z.number() })),
  moveTask: (input: WithoutOperation<LocalTasksTasksMoveInput>) =>
    write('localTasks.tasks.move', input, taskResult),
  removeTask: (taskId: string) =>
    write('localTasks.tasks.remove', { taskId }, writeResultSchema({ removed: z.number() })),

  addComment: (taskId: string, body: string) =>
    write(
      'localTasks.events.addComment',
      { taskId, body },
      writeResultSchema({ eventId: z.string() })
    ),
  editComment: (eventId: string, body: string) =>
    write('localTasks.events.editComment', { eventId, body }, okOnly),
  removeComment: (eventId: string) => write('localTasks.events.removeComment', { eventId }, okOnly)
}

export type LocalTasksClient = typeof localTasksClient
