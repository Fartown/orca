import type { IssueDatabase } from './issue-database'
import type { IssueRepository } from './issue-repository'

export function readUnresolvedRoundCounts(
  database: IssueDatabase,
  conversationIds: readonly string[]
): Map<string, number> {
  const counts = new Map<string, number>()
  if (conversationIds.length === 0) {
    return counts
  }
  const rows = database
    .prepare(
      `SELECT conversation_id, COUNT(*) AS unresolved_count FROM round_records
       WHERE resolved_at IS NULL AND conversation_id IN (SELECT value FROM json_each(?))
       GROUP BY conversation_id`
    )
    .all(JSON.stringify(conversationIds))
  for (const row of rows) {
    if (
      typeof row.conversation_id !== 'string' ||
      typeof row.unresolved_count !== 'number' ||
      !Number.isSafeInteger(row.unresolved_count) ||
      row.unresolved_count < 0
    ) {
      throw new Error('Invalid unresolved round count.')
    }
    counts.set(row.conversation_id, row.unresolved_count)
  }
  return counts
}

export function readLatestConversationRound(repository: IssueRepository, conversationId: string) {
  const row = repository.database
    .prepare(
      `SELECT id FROM round_records WHERE conversation_id = ?
       ORDER BY occurred_at DESC, id DESC LIMIT 1`
    )
    .get(conversationId)
  if (!row) {
    return undefined
  }
  if (typeof row.id !== 'string') {
    throw new Error('Invalid latest round identity.')
  }
  return repository.rounds.get(row.id)
}
