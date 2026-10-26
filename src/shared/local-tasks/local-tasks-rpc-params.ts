import { z } from 'zod'
import {
  LOCAL_TASK_BATCH_MAX,
  LOCAL_TASK_COMMENT_MAX,
  LOCAL_TASK_CRITERIA_MAX,
  LOCAL_TASK_CRITERION_MAX,
  LOCAL_TASK_DESCRIPTION_MAX,
  LOCAL_TASK_LABEL_MAX,
  LOCAL_TASK_LABELS_MAX,
  LOCAL_TASK_PROJECT_NAME_MAX,
  LOCAL_TASK_STATUS_CATEGORIES,
  LOCAL_TASK_STATUS_COLORS,
  LOCAL_TASK_STATUS_NAME_MAX,
  LOCAL_TASK_TITLE_MAX
} from './local-task-model'

// Why: every write carries one so a phone that resends after a dropped socket gets the first result back.
const clientOperationId = z.string().min(1).max(128)
const id = z.string().min(1).max(128)
const title = z.string().trim().min(1).max(LOCAL_TASK_TITLE_MAX)
const description = z.string().max(LOCAL_TASK_DESCRIPTION_MAX)
const criteria = z
  .array(z.string().trim().min(1).max(LOCAL_TASK_CRITERION_MAX))
  .max(LOCAL_TASK_CRITERIA_MAX)
const labels = z
  .array(z.string().trim().min(1).max(LOCAL_TASK_LABEL_MAX))
  .max(LOCAL_TASK_LABELS_MAX)
const priority = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
const category = z.enum(LOCAL_TASK_STATUS_CATEGORIES)
const color = z.enum(LOCAL_TASK_STATUS_COLORS)
const projectName = z.string().trim().min(1).max(LOCAL_TASK_PROJECT_NAME_MAX)
const statusName = z.string().trim().min(1).max(LOCAL_TASK_STATUS_NAME_MAX)
const prefix = z.string().trim().min(1).max(10)
const hostId = z.string().min(1).max(512)

export const LocalTasksUnsubscribeChangesParams = z.object({ subscriptionId: id })

export const LocalTasksProjectsCreateParams = z.object({
  clientOperationId,
  name: projectName,
  prefix,
  orcaProjectId: id,
  defaultRepoId: id.nullable().optional(),
  lastExecutionHostId: hostId.nullable().optional(),
  /** Translated default status names from the creating client, keyed by category. */
  statusNames: z.partialRecord(category, statusName).optional()
})

export const LocalTasksProjectsUpdateParams = z.object({
  clientOperationId,
  projectId: id,
  expectedRevision: z.number().int().nonnegative().optional(),
  name: projectName.optional(),
  prefix: prefix.optional(),
  rules: z
    .object({
      startMovesToInProgress: z.boolean().optional(),
      prMergedCompletes: z.boolean().optional()
    })
    .optional(),
  defaultRepoId: id.nullable().optional(),
  lastExecutionHostId: hostId.nullable().optional()
})

export const LocalTasksProjectsRemoveParams = z.object({ clientOperationId, projectId: id })

export const LocalTasksStatusesUpsertParams = z.object({
  clientOperationId,
  projectId: id,
  /** Omit to create a status; a status never changes category once created. */
  statusId: id.optional(),
  category: category.optional(),
  name: statusName,
  color
})

export const LocalTasksStatusesReorderParams = z.object({
  clientOperationId,
  projectId: id,
  orderedStatusIds: z.array(id).min(1).max(200)
})

export const LocalTasksStatusesRemoveParams = z.object({
  clientOperationId,
  statusId: id,
  moveTasksToStatusId: id.optional()
})

export const LocalTasksTasksListParams = z.object({ projectId: id.optional() })

export const LocalTasksTasksGetParams = z.object({
  /** Task id, or a ref such as `SHOP-12` written with the current or an earlier prefix. */
  ref: z.string().trim().min(1).max(128)
})

export const LocalTasksTasksSearchParams = z.object({
  query: z.string().trim().min(1).max(200),
  limit: z.number().int().min(1).max(100).optional()
})

export const LocalTasksTasksCreateParams = z.object({
  clientOperationId,
  projectId: id,
  title,
  description: description.optional(),
  criteria: criteria.optional(),
  statusId: id.optional(),
  priority: priority.optional(),
  labels: labels.optional(),
  parentId: id.nullable().optional()
})

export const LocalTasksTasksCreateSubtasksParams = z.object({
  clientOperationId,
  parentId: id,
  titles: z.array(title).min(1).max(LOCAL_TASK_BATCH_MAX)
})

export const LocalTasksTasksUpdateParams = z.object({
  clientOperationId,
  taskId: id,
  expectedRevision: z.number().int().nonnegative().optional(),
  patch: z.object({
    title: title.optional(),
    description: description.optional(),
    criteria: criteria.optional(),
    statusId: id.optional(),
    priority: priority.optional(),
    labels: labels.optional(),
    parentId: id.nullable().optional()
  })
})

export const LocalTasksTasksBatchUpdateParams = z.object({
  clientOperationId,
  taskIds: z.array(id).min(1).max(LOCAL_TASK_BATCH_MAX),
  patch: z.object({
    statusId: id.optional(),
    priority: priority.optional(),
    addLabels: labels.optional(),
    removeLabels: labels.optional()
  })
})

export const LocalTasksTasksMoveParams = z.object({
  clientOperationId,
  taskId: id,
  targetProjectId: id
})

export const LocalTasksTasksRemoveParams = z.object({ clientOperationId, taskId: id })

export const LocalTasksEventsListParams = z.object({ taskId: id })

export const LocalTasksEventsAddCommentParams = z.object({
  clientOperationId,
  taskId: id,
  body: z.string().trim().min(1).max(LOCAL_TASK_COMMENT_MAX)
})

export const LocalTasksEventsEditCommentParams = z.object({
  clientOperationId,
  eventId: id,
  body: z.string().trim().min(1).max(LOCAL_TASK_COMMENT_MAX)
})

export const LocalTasksEventsRemoveCommentParams = z.object({ clientOperationId, eventId: id })

const preferenceKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9.]{0,63}$/)

export const LocalTasksPreferencesGetParams = z.object({
  keys: z.array(preferenceKey).min(1).max(50)
})

export const LocalTasksPreferencesSetParams = z.object({
  key: preferenceKey,
  value: z.string().max(4096).nullable()
})

export type LocalTasksProjectsCreateInput = z.infer<typeof LocalTasksProjectsCreateParams>
export type LocalTasksProjectsUpdateInput = z.infer<typeof LocalTasksProjectsUpdateParams>
export type LocalTasksStatusesUpsertInput = z.infer<typeof LocalTasksStatusesUpsertParams>
export type LocalTasksStatusesReorderInput = z.infer<typeof LocalTasksStatusesReorderParams>
export type LocalTasksStatusesRemoveInput = z.infer<typeof LocalTasksStatusesRemoveParams>
export type LocalTasksTasksCreateInput = z.infer<typeof LocalTasksTasksCreateParams>
export type LocalTasksTasksCreateSubtasksInput = z.infer<typeof LocalTasksTasksCreateSubtasksParams>
export type LocalTasksTasksUpdateInput = z.infer<typeof LocalTasksTasksUpdateParams>
export type LocalTasksTasksBatchUpdateInput = z.infer<typeof LocalTasksTasksBatchUpdateParams>
export type LocalTasksTasksMoveInput = z.infer<typeof LocalTasksTasksMoveParams>
export type LocalTasksEventsAddCommentInput = z.infer<typeof LocalTasksEventsAddCommentParams>
export type LocalTasksEventsEditCommentInput = z.infer<typeof LocalTasksEventsEditCommentParams>
