import { z } from 'zod'

export const GoalAcceptanceDraftResult = z.object({
  draftId: z.string().uuid(),
  status: z.enum(['generating', 'ready', 'failed', 'cancelled']),
  objective: z.string(),
  judge: z.enum(['claude', 'codex']),
  workspace: z.string(),
  document: z.string().nullable(),
  error: z.string().nullable()
})

export type GoalAcceptanceDraft = z.infer<typeof GoalAcceptanceDraftResult>
