import { z } from 'zod'

export const GoalAcceptanceDraftResult = z.object({
  draftId: z.string().uuid(),
  status: z.enum(['generating', 'ready', 'failed', 'cancelled']),
  objective: z.string(),
  judge: z.enum(['claude', 'codex']),
  workspace: z.string(),
  document: z.string().nullable(),
  documentPath: z.string().optional(),
  error: z.string().nullable(),
  phase: z.enum(['starting', 'working', 'stopping', 'unverifiable', 'interrupted']).optional(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  lastActivityAt: z.number().optional(),
  activity: z.enum(['starting', 'connected', 'tool', 'tool_done', 'writing']).optional()
})

export type GoalAcceptanceDraft = z.infer<typeof GoalAcceptanceDraftResult>
