import type { AuthorityHostPartitionKey, RoundRecord } from '../../shared/issues/types'

export type ConversationRoundOwnerRow = {
  host_partition_key: AuthorityHostPartitionKey
  issue_id: string | null
}

export type RoundRecordRow = {
  id: string
  conversation_id: string
  kind: RoundRecord['kind']
  waiting_reason: RoundRecord['waitingReason']
  state_source: RoundRecord['stateSource']
  occurred_at: number
  dedupe_key: string
  user_input_preview: string | null
  user_input_completeness: RoundRecord['userInput']['completeness']
  agent_output_preview: string | null
  output_completeness: RoundRecord['agentOutput']['completeness']
  pending_question_preview: string | null
  question_completeness: RoundRecord['pendingQuestion']['completeness']
  read_at: number | null
  resolved_at: number | null
  resolution: RoundRecord['resolution']
  created_at: number
}

export function roundRecordFromRow(row: RoundRecordRow): RoundRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    kind: row.kind,
    waitingReason: row.waiting_reason,
    stateSource: row.state_source,
    occurredAt: row.occurred_at,
    dedupeKey: row.dedupe_key,
    userInput: {
      text: row.user_input_preview,
      completeness: row.user_input_completeness
    },
    agentOutput: {
      text: row.agent_output_preview,
      completeness: row.output_completeness
    },
    pendingQuestion: {
      text: row.pending_question_preview,
      completeness: row.question_completeness
    },
    readAt: row.read_at,
    resolvedAt: row.resolved_at,
    resolution: row.resolution,
    createdAt: row.created_at
  }
}
