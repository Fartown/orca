import type { RoundRecord } from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { IssueRepositoryError } from './issue-repository-error'
import type { CreateRoundRecordInput } from './issue-repository-types'
import {
  preferStrongerRoundPreview,
  roundPreviewsEqual,
  type NormalizedRoundRecordInput
} from './round-record-text'

export function assertRoundRecordMergeable(
  existing: RoundRecord,
  input: CreateRoundRecordInput
): void {
  const kindMatches =
    existing.kind === input.kind || (existing.kind === 'waiting' && input.kind === 'completion')
  if (existing.conversationId !== input.conversationId || !kindMatches) {
    throw new IssueRepositoryError(
      'round_dedupe_conflict',
      'Round dedupe identity belongs to a different fact.'
    )
  }
}

export function mergeRoundRecord(
  database: IssueDatabase,
  existing: RoundRecord,
  incoming: NormalizedRoundRecordInput,
  input: CreateRoundRecordInput
): boolean {
  const userInput = preferStrongerRoundPreview(existing.userInput, incoming.userInput)
  const agentOutput = preferStrongerRoundPreview(existing.agentOutput, incoming.agentOutput)
  const pendingQuestion = preferStrongerRoundPreview(
    existing.pendingQuestion,
    incoming.pendingQuestion
  )
  const source =
    existing.stateSource === 'reconciled' || incoming.stateSource === 'reconciled'
      ? 'reconciled'
      : 'hook'
  const waitingReason = input.kind === 'waiting' ? (input.waitingReason ?? 'other') : null
  if (
    existing.kind === input.kind &&
    existing.waitingReason === waitingReason &&
    roundPreviewsEqual(existing.userInput, userInput) &&
    roundPreviewsEqual(existing.agentOutput, agentOutput) &&
    roundPreviewsEqual(existing.pendingQuestion, pendingQuestion) &&
    existing.stateSource === source
  ) {
    return false
  }
  database
    .prepare(
      `UPDATE round_records SET
         kind = ?, waiting_reason = ?, state_source = ?,
         user_input_preview = ?, user_input_completeness = ?,
         agent_output_preview = ?, output_completeness = ?,
         pending_question_preview = ?, question_completeness = ?
       WHERE id = ?`
    )
    .run(
      input.kind,
      waitingReason,
      source,
      userInput.text,
      userInput.completeness,
      agentOutput.text,
      agentOutput.completeness,
      pendingQuestion.text,
      pendingQuestion.completeness,
      existing.id
    )
  return true
}
