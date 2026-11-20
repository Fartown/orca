import * as z from 'zod'
import type { FolderWorkspace } from '../folder-workspaces/folder-workspace-types'
import { WorkspaceLinkedItemSchema } from '../workspace-attachments/workspace-linked-item-schema'
import { ProjectGroupSchema } from '../sidebar-list/catalog/project-section-catalog-schema'

export const LOCAL_TASK_DISPATCHER_SESSION_PREFERENCE_KEY = 'dispatcher.session.v1'
export const LOCAL_TASK_DISPATCHER_PANE_PREFERENCE_KEY = 'dispatcher.paneKey'

export const LocalTaskDispatcherSessionSchema = z.object({
  worktreeId: z.string().min(1).max(4096),
  paneKey: z.string().min(1).max(256)
})

const folderWorkspaceSchema = z.looseObject({
  id: z.string(),
  projectGroupId: z.string(),
  name: z.string(),
  folderPath: z.string(),
  connectionId: z.string().nullable().optional(),
  linkedTask: WorkspaceLinkedItemSchema.nullable(),
  comment: z.string(),
  isArchived: z.boolean(),
  isUnread: z.boolean(),
  isPinned: z.boolean(),
  sortOrder: z.number(),
  lastActivityAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number()
}) satisfies z.ZodType<FolderWorkspace, unknown>

export const LocalTaskDispatcherWorkspaceSchema = z.object({
  ok: z.literal(true),
  worktreeId: z.string().min(1),
  folderWorkspace: folderWorkspaceSchema,
  projectGroup: ProjectGroupSchema
})

export type LocalTaskDispatcherWorkspace = z.output<typeof LocalTaskDispatcherWorkspaceSchema>
