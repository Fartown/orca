import { z } from 'zod'
import { LOCAL_TASK_STATUS_CATEGORIES, LOCAL_TASK_STATUS_COLORS } from './local-task-model'
import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskEventKind,
  LocalTaskEventSource,
  LocalTaskFailure,
  LocalTaskFailureCode,
  LocalTaskProject,
  LocalTaskStatusDef,
  LocalTasksHostState,
  LocalTasksStatus
} from './local-task-types'

/** Lists every member of `T`; leaving one out is a type error. */
function everyMember<T extends string>() {
  return <const A extends readonly T[]>(
    values: A & ([Exclude<T, A[number]>] extends [never] ? unknown : never)
  ): A => values
}

// Why tuples here: the shared vocabulary is type-only, and clients must reject shapes they cannot render.
const FAILURE_CODES = everyMember<LocalTaskFailureCode>()([
  'not_found',
  'stale',
  'read_only',
  'prefix_taken',
  'prefix_invalid',
  'orca_project_linked',
  'parent_invalid',
  'status_invalid',
  'status_in_use',
  'last_status_in_category',
  'comment_not_editable',
  'workspace_linked'
])

const EVENT_KINDS = everyMember<LocalTaskEventKind>()([
  'comment',
  'created',
  'title',
  'description',
  'criteria',
  'status',
  'priority',
  'labels',
  'parent',
  'moved'
])

const EVENT_SOURCES = everyMember<LocalTaskEventSource>()(['desktop', 'mobile', 'cli', 'rule'])

const HOST_STATES = everyMember<LocalTasksHostState>()([
  'not-task-host',
  'starting',
  'ready',
  'read-only',
  'unavailable'
])

export const hostStateSchema = z.enum(HOST_STATES)

export const statusResultSchema: z.ZodType<LocalTasksStatus> = z.object({
  taskHost: z.boolean(),
  state: hostStateSchema,
  reason: z.string().nullable(),
  revision: z.number(),
  taskHostId: z.string().nullable()
})

const statusDefSchema: z.ZodType<LocalTaskStatusDef> = z.object({
  id: z.string(),
  projectId: z.string(),
  category: z.enum(LOCAL_TASK_STATUS_CATEGORIES),
  name: z.string(),
  color: z.enum(LOCAL_TASK_STATUS_COLORS),
  position: z.number()
})

export const projectSchema: z.ZodType<LocalTaskProject> = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  aliases: z.array(z.string()),
  orcaProjectId: z.string(),
  defaultRepoId: z.string().nullable(),
  lastExecutionHostId: z.string().nullable(),
  rules: z.object({ startMovesToInProgress: z.boolean(), prMergedCompletes: z.boolean() }),
  statuses: z.array(statusDefSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  revision: z.number()
})

export const taskSchema: z.ZodType<LocalTask> = z.object({
  id: z.string(),
  projectId: z.string(),
  number: z.number(),
  ref: z.string(),
  title: z.string(),
  description: z.string(),
  criteria: z.array(z.string()),
  statusId: z.string(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  labels: z.array(z.string()),
  parentId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  revision: z.number()
})

export const eventSchema: z.ZodType<LocalTaskEvent> = z.object({
  id: z.string(),
  taskId: z.string(),
  kind: z.enum(EVENT_KINDS),
  source: z.enum(EVENT_SOURCES),
  body: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.number(),
  editedAt: z.number().nullable()
})

export const failureSchema: z.ZodType<LocalTaskFailure> = z.object({
  ok: z.literal(false),
  code: z.enum(FAILURE_CODES),
  detail: z.string().optional()
})

/** A write either succeeds with `shape` or fails with a business code; anything else is a broken host. */
export function writeResultSchema<T extends z.ZodRawShape>(shape: T) {
  return z.union([z.object({ ok: z.literal(true), ...shape }), failureSchema])
}

export const changeMessageSchema = z.union([
  z.object({
    type: z.literal('ready'),
    subscriptionId: z.string(),
    revision: z.number(),
    state: hostStateSchema
  }),
  z.object({
    type: z.literal('changed'),
    revision: z.number(),
    scopes: z.array(z.enum(['projects', 'tasks', 'events', 'preferences'])).nullable()
  }),
  z.object({ type: z.literal('end') })
])
