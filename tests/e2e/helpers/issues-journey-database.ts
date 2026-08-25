import { DatabaseSync } from 'node:sqlite'

export function readConversationProviderSessionId(
  databasePath: string,
  conversationId: string
): string {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    database.exec('PRAGMA foreign_keys = ON')
    const row = database
      .prepare(
        `SELECT session_id FROM conversation_provider_identities
         WHERE conversation_id = ? ORDER BY observed_at DESC LIMIT 1`
      )
      .get(conversationId) as { session_id: string } | undefined
    if (!row) {
      throw new Error(`Conversation ${conversationId} has no provider identity`)
    }
    return row.session_id
  } finally {
    database.close()
  }
}
