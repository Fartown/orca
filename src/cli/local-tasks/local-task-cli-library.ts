import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import { isExactLocalTaskRef } from '../../shared/local-tasks/local-task-grouping'
import { localTaskLinksReplySchema } from '../../shared/local-tasks/local-task-link-read-schemas'
import type { LocalTaskLinks } from '../../shared/local-tasks/local-task-link-types'
import {
  localTaskProjectsReplySchema,
  localTasksReplySchema,
  localTasksStatusSchema,
  localTaskWriteSchema,
  writeAnySuccess,
  writeTaskSuccess
} from '../../shared/local-tasks/local-task-read-schemas'
import type {
  LocalTask,
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../shared/local-tasks/local-task-types'
import type { RuntimeRpcSuccess } from '../../shared/runtime-rpc-envelope'
import { RuntimeClientError } from '../runtime/types'

/** The slice of the runtime client these commands use; the task library lives on that Orca. */
export type TaskLibraryRpc = {
  call: (method: string, params?: unknown) => Promise<RuntimeRpcSuccess<unknown>>
}

export type TaskLibrary = {
  projects: LocalTaskProject[]
  tasks: LocalTask[]
  links: LocalTaskLinks
  /** The tasks reply, so `--json` prints the runtime envelope like every other command. */
  envelope: RuntimeRpcSuccess<unknown>
}

const NO_LINKS: LocalTaskLinks = { workspaces: [], sessions: [] }

export type ResolvedTask = {
  task: LocalTask
  project: LocalTaskProject | undefined
  status: LocalTaskStatusDef | undefined
}

const UPDATE_HOST =
  'This Orca host has no local task library. Update Orca on that host to use orca task.'

function isMethodNotFound(error: unknown): boolean {
  return error instanceof RuntimeClientError && error.code === 'method_not_found'
}

async function callLibrary<T>(
  rpc: TaskLibraryRpc,
  method: string,
  params: unknown,
  schema: z.ZodType<T, unknown>
): Promise<{ value: T; envelope: RuntimeRpcSuccess<unknown> }> {
  let envelope: RuntimeRpcSuccess<unknown>
  try {
    envelope = await rpc.call(method, params)
  } catch (error) {
    // Why: hosts from before the task library answer method_not_found, which reads as a bug.
    if (isMethodNotFound(error)) {
      throw new RuntimeClientError('incompatible_runtime', UPDATE_HOST)
    }
    throw error
  }
  const parsed = schema.safeParse(envelope.result)
  if (!parsed.success) {
    throw new RuntimeClientError(
      'incompatible_runtime',
      `The Orca host sent a ${method} reply this CLI cannot read. Update the CLI or the host.`
    )
  }
  return { value: parsed.data, envelope }
}

/** Refuses up front when the host has no library, is still opening it, or (for writes) cannot write. */
export async function assertTaskLibraryOpen(
  rpc: TaskLibraryRpc,
  access: 'read' | 'write'
): Promise<void> {
  const { value: status } = await callLibrary(
    rpc,
    'localTasks.status',
    undefined,
    localTasksStatusSchema
  )
  if (!status.taskHost || status.state === 'not-task-host') {
    throw new RuntimeClientError('incompatible_runtime', 'This Orca does not host a task library.')
  }
  if (status.state === 'starting') {
    throw new RuntimeClientError(
      'runtime_unavailable',
      'The task library is still opening. Try again in a moment.'
    )
  }
  if (status.state === 'unavailable') {
    throw new RuntimeClientError(
      'runtime_unavailable',
      `The task library is not available${status.reason ? `: ${status.reason}` : '.'}`
    )
  }
  if (access === 'write' && status.state === 'read-only') {
    throw new RuntimeClientError(
      'read_only',
      'The task library was last written by a newer Orca, so this host opened it read-only.'
    )
  }
}

/** Status first, so an old or opening library gets its own message; then the reads in parallel. */
export async function readTaskLibrary(
  rpc: TaskLibraryRpc,
  options: { access?: 'read' | 'write'; links?: boolean } = {}
): Promise<TaskLibrary> {
  await assertTaskLibraryOpen(rpc, options.access ?? 'read')
  const [projects, tasks, links] = await Promise.all([
    callLibrary(rpc, 'localTasks.projects.list', undefined, localTaskProjectsReplySchema),
    callLibrary(rpc, 'localTasks.tasks.list', {}, localTasksReplySchema),
    options.links
      ? callLibrary(rpc, 'localTasks.links.list', undefined, localTaskLinksReplySchema)
      : null
  ])
  return {
    projects: projects.value,
    tasks: tasks.value,
    links: links?.value ?? NO_LINKS,
    envelope: tasks.envelope
  }
}

export function describeTask(library: TaskLibrary, task: LocalTask): ResolvedTask {
  const project = library.projects.find((candidate) => candidate.id === task.projectId)
  return {
    task,
    project,
    status: project?.statuses.find((status) => status.id === task.statusId)
  }
}

/** A ref as the task page reads it: the current one first, then earlier prefixes and moved refs. */
export function resolveTaskRef(library: TaskLibrary, ref: string): ResolvedTask {
  const query = ref.trim()
  const current = library.tasks.filter((task) => task.ref.toLowerCase() === query.toLowerCase())
  const matches = current.length
    ? current
    : library.tasks.filter((task) =>
        isExactLocalTaskRef(
          task,
          library.projects.find((project) => project.id === task.projectId),
          query
        )
      )
  if (matches.length === 1) {
    return describeTask(library, matches[0])
  }
  throw new RuntimeClientError(
    matches.length === 0 ? 'not_found' : 'selector_ambiguous',
    matches.length === 0
      ? `No task ${query}. Run orca task list to see the refs.`
      : `${query} names ${matches.length} tasks: ${matches.map((task) => task.ref).join(', ')}.`
  )
}

/** A status by its name in the task's project (any case), or by category such as `completed`. */
export function resolveTaskStatus(resolved: ResolvedTask, name: string): LocalTaskStatusDef {
  const statuses = resolved.project?.statuses ?? []
  const wanted = name.trim().toLowerCase()
  const status =
    statuses.find((candidate) => candidate.name.toLowerCase() === wanted) ??
    statuses.find((candidate) => candidate.category === wanted)
  if (status) {
    return status
  }
  throw new RuntimeClientError(
    'invalid_argument',
    `${resolved.project?.name ?? 'This project'} has no status "${name.trim()}". Statuses: ${statuses
      .map((candidate) => candidate.name)
      .join(', ')}.`
  )
}

const REFUSAL_MESSAGES: Record<string, string> = {
  not_found: 'The task no longer exists.',
  stale: 'The task changed while this command ran. Run it again.',
  read_only: 'The task library is read-only on this host.',
  status_invalid: 'That status does not belong to the task’s project.'
}

async function write<T extends object>(
  rpc: TaskLibraryRpc,
  method: string,
  params: Record<string, unknown>,
  success: z.ZodType<T, unknown>
): Promise<{ value: T; envelope: RuntimeRpcSuccess<unknown> }> {
  // Why one id per command: the host applies a retried write once.
  const { value, envelope } = await callLibrary(
    rpc,
    method,
    { clientOperationId: randomUUID(), ...params },
    localTaskWriteSchema(success)
  )
  if (value.ok === false) {
    throw new RuntimeClientError(
      value.code,
      REFUSAL_MESSAGES[value.code] ?? `The task library refused the change (${value.code}).`
    )
  }
  return { value, envelope }
}

export async function setTaskStatus(
  rpc: TaskLibraryRpc,
  resolved: ResolvedTask,
  status: LocalTaskStatusDef
): Promise<{ task: LocalTask; envelope: RuntimeRpcSuccess<unknown> }> {
  const { value, envelope } = await write(
    rpc,
    'localTasks.tasks.update',
    {
      taskId: resolved.task.id,
      expectedRevision: resolved.task.revision,
      patch: { statusId: status.id }
    },
    writeTaskSuccess
  )
  return { task: value.task, envelope }
}

export async function addTaskComment(
  rpc: TaskLibraryRpc,
  resolved: ResolvedTask,
  body: string
): Promise<RuntimeRpcSuccess<unknown>> {
  const { envelope } = await write(
    rpc,
    'localTasks.events.addComment',
    { taskId: resolved.task.id, body },
    writeAnySuccess
  )
  return envelope
}
