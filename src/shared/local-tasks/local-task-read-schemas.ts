import { z } from 'zod'
import {
  LOCAL_TASK_STATUS_CATEGORIES,
  LOCAL_TASK_STATUS_COLORS,
  type LocalTaskPriority
} from './local-task-model'
import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskEventKind,
  LocalTaskEventSource,
  LocalTaskProject,
  LocalTaskStatusDef,
  LocalTasksHostState,
  LocalTasksStatus
} from './local-task-types'
import { hostUnionArms, openEnum, salvagedOptional, salvagingArray } from '../zod-salvage'

// Replies of `localTasks.*` (src/main/runtime/rpc/methods/local-tasks.ts), checked against the
// shared types. A row this build cannot read drops from its list instead of failing the read, so
// a newer desktop that adds a status category or an activity kind still shows everything else.

const STATE_ARMS = hostUnionArms<LocalTasksHostState>({
  'not-task-host': true,
  starting: true,
  ready: true,
  'read-only': true,
  unavailable: true
})
const EVENT_KIND_ARMS = hostUnionArms<LocalTaskEventKind>({
  comment: true,
  created: true,
  title: true,
  description: true,
  criteria: true,
  status: true,
  priority: true,
  labels: true,
  parent: true,
  moved: true,
  'workspace-linked': true,
  'workspace-unlinked': true,
  'workspace-host': true,
  'session-linked': true,
  'session-unlinked': true
})
const EVENT_SOURCE_ARMS = hostUnionArms<LocalTaskEventSource>({
  desktop: true,
  mobile: true,
  cli: true,
  rule: true
})

const priority: z.ZodType<LocalTaskPriority, unknown> = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4)
])

function withDefault<T>(name: string, schema: z.ZodType<T, unknown>, fallback: () => T) {
  return salvagedOptional(name, schema).transform((value) => value ?? fallback())
}

const statusDefSchema: z.ZodType<LocalTaskStatusDef, unknown> = z.object({
  id: z.string(),
  projectId: z.string(),
  // Why strict: a status of a category this build lacks has no column to sit in, so it drops.
  category: z.enum(LOCAL_TASK_STATUS_CATEGORIES),
  name: z.string(),
  color: openEnum(LOCAL_TASK_STATUS_COLORS, 'gray'),
  position: z.number()
})

export const localTaskProjectSchema: z.ZodType<LocalTaskProject, unknown> = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  aliases: withDefault('aliases', salvagingArray(z.string()), () => []),
  repos: withDefault('repos', salvagingArray(z.string()), () => []),
  defaultRepoId: withDefault('defaultRepoId', z.string().nullable(), () => null),
  lastExecutionHostId: withDefault('lastExecutionHostId', z.string().nullable(), () => null),
  rules: withDefault(
    'rules',
    z.object({ startMovesToInProgress: z.boolean(), prMergedCompletes: z.boolean() }),
    () => ({ startMovesToInProgress: true, prMergedCompletes: true })
  ),
  statuses: salvagingArray(statusDefSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  revision: z.number()
})

export const localTaskSchema: z.ZodType<LocalTask, unknown> = z.object({
  id: z.string(),
  projectId: z.string(),
  number: z.number(),
  ref: z.string(),
  title: z.string(),
  description: withDefault('description', z.string(), () => ''),
  criteria: withDefault('criteria', salvagingArray(z.string()), () => []),
  statusId: z.string(),
  priority: withDefault<LocalTaskPriority>('priority', priority, () => 0),
  labels: withDefault('labels', salvagingArray(z.string()), () => []),
  parentId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  revision: z.number(),
  // Why salvaged: a host from before moves were searchable sends none; a bad list only costs search.
  formerRefs: salvagedOptional('formerRefs', salvagingArray(z.string()))
})

const localTaskEventSchema: z.ZodType<LocalTaskEvent, unknown> = z.object({
  id: z.string(),
  taskId: z.string(),
  kind: z.enum(EVENT_KIND_ARMS),
  source: openEnum(EVENT_SOURCE_ARMS, 'cli'),
  body: withDefault('body', z.string().nullable(), () => null),
  payload: withDefault('payload', z.record(z.string(), z.unknown()).nullable(), () => null),
  createdAt: z.number(),
  editedAt: withDefault('editedAt', z.number().nullable(), () => null)
})

export const localTasksStatusSchema: z.ZodType<LocalTasksStatus, unknown> = z.object({
  taskHost: z.boolean(),
  inProgressCount: z.number().optional(),
  projectCount: z.number().optional(),
  sourceHidden: z.boolean().optional(),
  cardTaskHidden: z.boolean().optional(),
  state: openEnum(STATE_ARMS, 'unavailable'),
  reason: withDefault('reason', z.string().nullable(), () => null),
  revision: z.number(),
  taskHostId: withDefault('taskHostId', z.string().nullable(), () => null)
})

export const localTaskProjectsReplySchema = z
  .object({ projects: salvagingArray(localTaskProjectSchema) })
  .transform(({ projects }) => projects)

export const localTasksReplySchema = z
  .object({ tasks: salvagingArray(localTaskSchema) })
  .transform(({ tasks }) => tasks)

export const localTaskEventsReplySchema = z
  .object({ events: salvagingArray(localTaskEventSchema) })
  .transform(({ events }) => events)

/** A refused write: `code` stays open so a newer desktop's code still reaches the generic copy. */
export type LocalTaskWriteRefusal = { ok: false; code: string; detail: string | null }

const refusalSchema: z.ZodType<LocalTaskWriteRefusal, unknown> = z.object({
  ok: z.literal(false),
  code: z.string(),
  detail: withDefault('detail', z.string(), () => '').transform((detail) => detail || null)
})

/** A write's reply: the success shape a caller reads, or the business refusal. */
export function localTaskWriteSchema<T extends object>(success: z.ZodType<T, unknown>) {
  return z.union([z.object({ ok: z.literal(true) }).and(success), refusalSchema])
}

export const writeTaskSuccess = z.object({ task: localTaskSchema })
export const writeTasksSuccess = z.object({ tasks: salvagingArray(localTaskSchema) })
export const writeProjectSuccess = z.object({ project: localTaskProjectSchema })
// Why loose: these callers read nothing past `ok`, so a field the desktop adds or drops is moot.
export const writeAnySuccess = z.looseObject({})
