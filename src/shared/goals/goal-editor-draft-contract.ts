import { z } from 'zod'
import { GoalAcceptanceDraftResult } from './goal-acceptance-draft-contract'

export const GoalCriterionSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1).max(8_000),
  command: z.string().min(1).max(16_000).optional()
})

// Incomplete form values must survive just like valid ones.
export const GoalDraftFieldsSchema = z.object({
  objective: z.string().max(64_000),
  criteria: z
    .array(
      GoalCriterionSchema.extend({
        description: z.string().max(8_000),
        command: z.string().max(16_000).optional()
      })
    )
    .max(100),
  acceptanceDocument: z.string().max(64_000),
  acceptanceText: z.string().max(64_000),
  extraChecks: z.string().max(64_000),
  checkAll: z.boolean(),
  onBlocked: z.enum(['ask', 'verify']),
  judge: z.enum(['none', 'claude', 'codex']),
  maxTurns: z.string().max(100),
  maxMinutes: z.string().max(100),
  checkTimeoutSeconds: z.string().max(100)
})
export type GoalDraftFields = z.infer<typeof GoalDraftFieldsSchema>

export const GoalEditorDraftContentSchema = z.object({
  fields: GoalDraftFieldsSchema,
  target: z.object({ worktreeId: z.string().nullable(), paneKey: z.string().nullable() }),
  goalId: z.string().uuid().nullable(),
  documentContext: z.string().max(70_000).nullable(),
  generation: z
    .object({
      draftId: z.string().uuid(),
      context: z.string().max(70_000),
      baseDocument: z.string().max(64_000),
      requestedAt: z.number(),
      applied: z.boolean(),
      request: z
        .object({
          worktree: z.string(),
          objective: z.string(),
          judge: z.enum(['claude', 'codex']),
          acceptanceContext: z.string().optional()
        })
        .optional()
    })
    .nullable(),
  operationId: z.string().uuid(),
  archived: z.boolean()
})
export const GoalEditorDraftRecordSchema = GoalEditorDraftContentSchema.extend({
  editorDraftId: z.string().uuid(),
  revision: z.number().int().positive(),
  createdAt: z.number(),
  updatedAt: z.number(),
  documentPath: z.string().optional()
})
export const GoalEditorDraftSaveSchema = z.object({
  editorDraftId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  content: GoalEditorDraftContentSchema
})
export const GoalEditorDraftSummarySchema = z.object({
  editorDraftId: z.string().uuid(),
  objectivePreview: z.string(),
  worktreeId: z.string().nullable(),
  goalId: z.string().nullable(),
  updatedAt: z.number(),
  hasDocument: z.boolean(),
  generation: GoalAcceptanceDraftResult.omit({ document: true }).nullable()
})
export const GoalEditorDraftListSchema = z.object({ items: z.array(GoalEditorDraftSummarySchema) })
export type GoalEditorDraftContent = z.infer<typeof GoalEditorDraftContentSchema>
export type GoalEditorDraftRecord = z.infer<typeof GoalEditorDraftRecordSchema>
export type GoalEditorDraftSave = z.infer<typeof GoalEditorDraftSaveSchema>
export type GoalEditorDraftSummary = z.infer<typeof GoalEditorDraftSummarySchema>

export function goalDraftContext(
  fields: Pick<GoalDraftFields, 'objective' | 'judge'>,
  workspace: string | null
): string {
  return JSON.stringify([fields.objective.trim(), fields.judge, workspace])
}

export function canApplyGeneratedDocument(
  draft: GoalEditorDraftContent,
  attemptId: string
): boolean {
  return Boolean(
    draft.generation &&
    draft.generation.draftId === attemptId &&
    !draft.generation.applied &&
    draft.generation.context === goalDraftContext(draft.fields, draft.target.worktreeId) &&
    draft.generation.baseDocument === draft.fields.acceptanceDocument
  )
}
