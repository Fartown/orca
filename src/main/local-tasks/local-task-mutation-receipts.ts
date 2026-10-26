import type { ZodType } from 'zod'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowString } from './local-tasks-sqlite-row'

const RECEIPT_LIMIT = 1000

/**
 * Replays the first outcome for a repeated client operation id. Runs inside the caller's write
 * transaction, so the receipt and the change it records commit together. The stored copy is parsed
 * with the operation's result schema, so a receipt written by another build cannot leak a bad shape.
 */
export function withLocalTaskReceipt<T>(
  db: LocalTasksDatabase,
  clientOperationId: string,
  resultSchema: ZodType<T>,
  operation: () => T,
  now: number
): T {
  const stored = db
    .prepare('SELECT result FROM local_task_mutation_receipts WHERE client_operation_id = ?')
    .get(clientOperationId)
  if (stored) {
    const replay = resultSchema.safeParse(JSON.parse(rowString(stored, 'result')))
    if (replay.success) {
      return replay.data
    }
    db.prepare('DELETE FROM local_task_mutation_receipts WHERE client_operation_id = ?').run(
      clientOperationId
    )
  }
  const result = operation()
  db.prepare(
    'INSERT INTO local_task_mutation_receipts (client_operation_id, result, created_at) VALUES (?, ?, ?)'
  ).run(clientOperationId, JSON.stringify(result), now)
  db.prepare(
    `DELETE FROM local_task_mutation_receipts WHERE client_operation_id NOT IN (
       SELECT client_operation_id FROM local_task_mutation_receipts
       ORDER BY created_at DESC, rowid DESC LIMIT ?)`
  ).run(RECEIPT_LIMIT)
  return result
}
