import { z } from 'zod'
import type {
  LocalTaskConversation,
  LocalTaskInbox,
  LocalTaskProposal,
  LocalTaskWatch
} from './local-task-dispatcher-types'
import { LocalTaskProposalItemSchema } from './local-task-dispatcher-rpc-params'

// Host write receipts and the CLI both read these shapes back (REQ-030, REQ-031).
export const conversationSchema: z.ZodType<LocalTaskConversation> = z.object({
  id: z.string(),
  paneKey: z.string(),
  agent: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number()
})

export const proposalSchema: z.ZodType<LocalTaskProposal> = z.object({
  id: z.string(),
  conversationId: z.string(),
  summary: z.string().nullable(),
  items: z.array(LocalTaskProposalItemSchema),
  status: z.enum(['pending', 'confirmed', 'dismissed', 'executed']),
  keptItemIndexes: z.array(z.number()).nullable(),
  results: z
    .array(
      z.object({
        index: z.number(),
        ok: z.boolean(),
        taskId: z.string().optional(),
        detail: z.string().optional()
      })
    )
    .nullable(),
  createdAt: z.number(),
  decidedAt: z.number().nullable(),
  decidedSource: z.enum(['desktop', 'mobile', 'cli', 'rule']).nullable()
})

export const watchSchema: z.ZodType<LocalTaskWatch> = z.object({
  taskId: z.string(),
  addedAt: z.number(),
  addedBy: z.enum(['proposal', 'dispatcher'])
})

export const inboxSchema: z.ZodType<LocalTaskInbox> = z.object({
  conversationId: z.string(),
  items: z.array(
    z.object({
      kind: z.enum(['progress', 'status', 'session', 'comment', 'needs-you', 'proposal']),
      at: z.number(),
      taskId: z.string().nullable(),
      taskRef: z.string().nullable(),
      summary: z.string(),
      needsYou: z.string().optional()
    })
  ),
  cursor: z.string(),
  more: z.boolean(),
  watchedTaskCount: z.number()
})
