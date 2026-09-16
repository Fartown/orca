import { z } from 'zod'

/** Only host observations consumed by Goal admission and liveness projection cross this boundary. */
export const GoalTerminalSnapshotSchema = z.object({
  handle: z.string(),
  incarnationId: z.string().nullable().optional(),
  ptyId: z.string().nullable(),
  worktreeId: z.string(),
  worktreePath: z.string(),
  tabId: z.string(),
  leafId: z.string(),
  connected: z.boolean(),
  writable: z.boolean(),
  executionHostId: z.string().optional(),
  exitCause: z.object({ kind: z.string() }).optional()
})

export type GoalTerminalSnapshot = z.infer<typeof GoalTerminalSnapshotSchema>

export const GoalHostFactsRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('terminal'), handle: z.string().min(1) }),
  z.object({ kind: z.literal('workspace'), selector: z.string().min(1) })
])
