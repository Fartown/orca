import { z } from 'zod'

const clientOperationId = z.string().min(1).max(128)
const id = z.string().min(1).max(128)
const hostId = z.string().min(1).max(512)
const worktreeId = z.string().min(1).max(4096)
const snapshot = z.string().max(512)
const linkedVia = z.enum(['start', 'manual'])
const surface = z.enum(['terminal', 'chat'])

export const LocalTasksLinksListParams = z.object({})

// Every `hostId`, `tabId` and `paneKey` below is in the library owner's own form, never a client's.
export const LocalTasksLinksLinkWorkspaceParams = z
  .object({
    clientOperationId,
    taskId: id,
    hostId,
    kind: z.enum(['git-worktree', 'folder']),
    instanceId: id.optional(),
    worktreeId: worktreeId.optional(),
    folderWorkspaceId: id.optional(),
    repoId: id.optional(),
    branchSnapshot: snapshot.optional(),
    nameSnapshot: snapshot.optional(),
    hostLabelSnapshot: snapshot.optional(),
    linkedVia,
    /** Restart on a task whose workspace was deleted replaces the old link. */
    replace: z.boolean().optional()
  })
  .refine(
    (params) => (params.kind === 'folder' ? !!params.folderWorkspaceId : !!params.worktreeId),
    {
      message: 'A worktree link needs worktreeId; a folder link needs folderWorkspaceId'
    }
  )

export const LocalTasksLinksResolveWorkspaceParams = z.object({
  clientOperationId,
  taskId: id,
  hostId: hostId.optional(),
  instanceId: id.optional(),
  worktreeId: worktreeId.optional(),
  branchSnapshot: snapshot.optional(),
  nameSnapshot: snapshot.optional(),
  hostLabelSnapshot: snapshot.optional()
})

export const LocalTasksLinksUnlinkWorkspaceParams = z.object({ clientOperationId, taskId: id })

export const LocalTasksLinksRecordSessionParams = z
  .object({
    clientOperationId,
    taskId: id,
    hostId,
    worktreeId: worktreeId.optional(),
    instanceId: id.optional(),
    surface,
    tabId: id.optional(),
    paneKey: z.string().min(1).max(512).optional(),
    sessionId: id.optional(),
    providerSession: id.optional(),
    agent: z.string().min(1).max(64).optional(),
    linkedVia
  })
  .refine((params) => !!(params.tabId || params.paneKey || params.sessionId), {
    message: 'A session link needs a tabId, paneKey or sessionId'
  })

export const LocalTasksLinksUnlinkSessionParams = z.object({ clientOperationId, sessionLinkId: id })

export const LocalTasksAttentionGetParams = z.object({})

/** Marks that item seen in this library; clients also send it when the user opens the session. */
export const LocalTasksAttentionAcknowledgeParams = z.object({
  clientOperationId,
  itemKey: z.string().min(1).max(640),
  taskSessionId: id
})

export const LocalTasksAttentionSnoozeParams = z.object({
  clientOperationId,
  itemKey: z.string().min(1).max(640),
  taskSessionId: id,
  until: z.number().int().positive()
})

export const LocalTasksRulesApplyPrMergedParams = z.object({
  clientOperationId,
  taskId: id,
  provider: z.string().min(1).max(32),
  prNumber: z.number().int().positive(),
  headSha: z.string().min(1).max(128)
})

export type LocalTasksLinksLinkWorkspaceInput = z.infer<typeof LocalTasksLinksLinkWorkspaceParams>
export type LocalTasksLinksResolveWorkspaceInput = z.infer<
  typeof LocalTasksLinksResolveWorkspaceParams
>
export type LocalTasksLinksRecordSessionInput = z.infer<typeof LocalTasksLinksRecordSessionParams>
export type LocalTasksAttentionSnoozeInput = z.infer<typeof LocalTasksAttentionSnoozeParams>
export type LocalTasksRulesApplyPrMergedInput = z.infer<typeof LocalTasksRulesApplyPrMergedParams>
