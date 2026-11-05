import { z } from 'zod'
import { LOCAL_TASK_TITLE_MAX } from './local-task-model'

// The dispatcher session (REQ-030, REQ-031): it proposes, a person decides, a desktop executes.
const clientOperationId = z.string().min(1).max(128)
const id = z.string().min(1).max(128)
const hostId = z.string().min(1).max(512)
/** The dispatcher's own pane: CLI calls name it so the host finds the conversation. */
const paneKey = z.string().min(1).max(256)
const title = z.string().trim().min(1).max(LOCAL_TASK_TITLE_MAX)
const prompt = z.string().trim().min(1).max(8000)
const agent = z.string().trim().min(1).max(64)
/** A task project by name or prefix; the executor asks when it cannot tell. */
const project = z.string().trim().min(1).max(64)
const worktree = z.object({ worktreeId: id, hostId: hostId.optional() })

export const LocalTaskProposalItemSchema = z.discriminatedUnion('kind', [
  // A new task with a session: in a workspace, or in a new workspace of a repo.
  z.object({
    kind: z.literal('start'),
    title,
    prompt,
    agent: agent.optional(),
    project: project.optional(),
    target: z.union([worktree, z.object({ repoId: id, hostId: hostId.optional() })])
  }),
  // A subtask with its own session in the parent's workspace.
  z.object({
    kind: z.literal('subtask'),
    parentTaskId: id,
    title,
    prompt,
    agent: agent.optional()
  }),
  // One more instruction for a session that finished a round.
  z.object({ kind: z.literal('append'), taskId: id, sessionLinkId: id, text: prompt }),
  // Always confirmed, even when proposals run without asking.
  z.object({
    kind: z.literal('stop'),
    taskId: id,
    sessionLinkId: id,
    reason: z.string().trim().min(1).max(500)
  }),
  z.object({ kind: z.literal('link'), taskId: id, target: worktree }),
  // A session no task owns becomes a task with its workspace.
  z.object({ kind: z.literal('record'), title, project: project.optional(), target: worktree })
])

export const LocalTasksDispatcherRegisterParams = z.object({
  clientOperationId,
  paneKey,
  agent: agent.optional(),
  /** The dispatcher's pane before it was reopened: its conversation, watches and inbox carry over. */
  previousPaneKey: paneKey.optional()
})

export const LocalTasksProposalsCreateParams = z.object({
  clientOperationId,
  paneKey,
  summary: z.string().trim().max(2000).optional(),
  items: z.array(LocalTaskProposalItemSchema).min(1).max(20)
})

export const LocalTasksProposalsListParams = z.object({
  conversationId: id.optional(),
  status: z.enum(['pending', 'confirmed', 'dismissed', 'executed']).optional()
})

export const LocalTasksProposalsDecideParams = z.object({
  clientOperationId,
  proposalId: id,
  decision: z.enum(['confirmed', 'dismissed']),
  /** Items the person kept; absent keeps every item. */
  keepItemIndexes: z.array(z.number().int().nonnegative()).max(20).optional()
})

export const LocalTasksProposalsRecordResultsParams = z.object({
  clientOperationId,
  proposalId: id,
  results: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        ok: z.boolean(),
        taskId: id.optional(),
        detail: z.string().max(500).optional()
      })
    )
    .max(20)
})

export const LocalTasksDispatcherWatchParams = z.object({ clientOperationId, paneKey, taskId: id })

export const LocalTasksDispatcherInboxParams = z.object({
  paneKey,
  limit: z.number().int().min(1).max(100).optional()
})

export const LocalTasksDispatcherAckParams = z.object({
  clientOperationId,
  paneKey,
  cursor: z.string().min(1).max(20_000)
})

export type LocalTaskProposalItem = z.infer<typeof LocalTaskProposalItemSchema>
export type LocalTasksDispatcherRegisterInput = z.infer<typeof LocalTasksDispatcherRegisterParams>
export type LocalTasksProposalsCreateInput = z.infer<typeof LocalTasksProposalsCreateParams>
export type LocalTasksProposalsDecideInput = z.infer<typeof LocalTasksProposalsDecideParams>
export type LocalTasksProposalsRecordResultsInput = z.infer<
  typeof LocalTasksProposalsRecordResultsParams
>
