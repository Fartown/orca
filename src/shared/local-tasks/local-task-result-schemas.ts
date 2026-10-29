import { z } from 'zod'
import { LOCAL_TASK_STATUS_CATEGORIES, LOCAL_TASK_STATUS_COLORS } from './local-task-model'
import type {
  LocalTask,
  LocalTaskChangeScope,
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
import type {
  LocalTaskLinkOrigin,
  LocalTaskSessionLink,
  LocalTaskSessionSurface,
  LocalTaskWorkspaceKind,
  LocalTaskWorkspaceLink
} from './local-task-link-types'

/** Lists every member of `T`; leaving one out is a type error. */
function everyMember<T extends string>() {
  return <const A extends readonly T[]>(
    values: A & ([Exclude<T, A[number]>] extends [never] ? unknown : never)
  ): A => values
}

// Why tuples here: the shared vocabulary is type-only, and clients must reject shapes they cannot render.
const FAILURE_CODES = everyMember<LocalTaskFailureCode>()([
  'invalid_argument',
  'not_found',
  'stale',
  'read_only',
  'prefix_taken',
  'prefix_history_in_project',
  'prefix_invalid',
  'parent_invalid',
  'status_invalid',
  'status_in_use',
  'last_status_in_category',
  'comment_not_editable',
  'workspace_already_linked',
  'task_has_workspace',
  'workspace_required',
  'session_already_linked',
  'host_not_owned',
  'desktop_only',
  'attention_item_mismatch'
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
  'moved',
  'workspace-linked',
  'workspace-unlinked',
  'workspace-host',
  'session-linked',
  'session-unlinked'
])

const EVENT_SOURCES = everyMember<LocalTaskEventSource>()(['desktop', 'mobile', 'cli', 'rule'])

const CHANGE_SCOPES = everyMember<LocalTaskChangeScope>()([
  'projects',
  'tasks',
  'events',
  'preferences',
  'links',
  'attention'
])

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
  taskHostId: z.string().nullable(),
  inProgressCount: z.number().int().nonnegative().optional()
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
  repos: z.array(z.string()),
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
  revision: z.number(),
  formerRefs: z.array(z.string()).optional()
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

const linkedVia = z.enum(everyMember<LocalTaskLinkOrigin>()(['start', 'manual']))

export const workspaceLinkSchema: z.ZodType<LocalTaskWorkspaceLink> = z.object({
  taskId: z.string(),
  hostId: z.string(),
  kind: z.enum(everyMember<LocalTaskWorkspaceKind>()(['git-worktree', 'folder'])),
  instanceId: z.string().nullable(),
  worktreeId: z.string().nullable(),
  folderWorkspaceId: z.string().nullable(),
  repoId: z.string().nullable(),
  branchSnapshot: z.string().nullable(),
  nameSnapshot: z.string().nullable(),
  hostLabelSnapshot: z.string().nullable(),
  linkedVia,
  linkedAt: z.number()
})

export const sessionLinkSchema: z.ZodType<LocalTaskSessionLink> = z.object({
  id: z.string(),
  taskId: z.string(),
  hostId: z.string(),
  worktreeId: z.string().nullable(),
  instanceId: z.string().nullable(),
  surface: z.enum(everyMember<LocalTaskSessionSurface>()(['terminal', 'chat'])),
  tabId: z.string().nullable(),
  paneKey: z.string().nullable(),
  sessionId: z.string().nullable(),
  providerSession: z.string().nullable(),
  agent: z.string().nullable(),
  linkedVia,
  openedAt: z.number()
})

/** A write either succeeds with `successFields` or fails with a business code; anything else is a broken host. */
export function writeResultSchema<T extends Record<string, z.ZodType>>(successFields: T) {
  return z.union([z.object({ ok: z.literal(true), ...successFields }), failureSchema])
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
    scopes: z.array(z.enum(CHANGE_SCOPES)).nullable()
  }),
  z.object({ type: z.literal('end') })
])
