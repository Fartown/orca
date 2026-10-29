import { createHash } from 'node:crypto'
import type { ZodType } from 'zod'
import type { LocalTaskFailure } from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowString } from './local-tasks-sqlite-row'

const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Replays the first outcome for a repeated client operation id. Runs inside the caller's write
 * transaction, so the receipt and the change it records commit together; a refused operation keeps
 * its receipt but none of its writes. The stored copy is parsed with the operation's result schema,
 * so a receipt written by another build cannot leak a bad shape.
 */
export function withLocalTaskReceipt<T extends { ok: boolean }>(
  db: LocalTasksDatabase,
  clientOperationId: string,
  method: string,
  params: unknown,
  resultSchema: ZodType<T>,
  operation: () => T,
  now: number
): T | LocalTaskFailure {
  const paramsHash = createHash('sha256').update(canonical(params)).digest('hex')
  const expired = db
    .prepare('DELETE FROM local_task_mutation_receipts WHERE created_at < ?')
    .run(now - RECEIPT_TTL_MS)
  if (expired.changes > 0) {
    db.prepare('PRAGMA incremental_vacuum(64)').run()
  }
  const stored = db
    .prepare(
      'SELECT method, params_hash, result FROM local_task_mutation_receipts WHERE client_operation_id = ?'
    )
    .get(clientOperationId)
  if (stored) {
    if (rowString(stored, 'method') !== method || rowString(stored, 'params_hash') !== paramsHash) {
      return { ok: false, code: 'invalid_argument' }
    }
    let decoded: unknown
    try {
      decoded = JSON.parse(rowString(stored, 'result'))
    } catch {
      return { ok: false, code: 'invalid_argument' }
    }
    const replay = resultSchema.safeParse(decoded)
    if (replay.success) {
      return replay.data
    }
    return { ok: false, code: 'invalid_argument' }
  }
  const result = db.savepoint(operation, (outcome) => outcome.ok)
  db.prepare(
    'INSERT INTO local_task_mutation_receipts (client_operation_id, method, params_hash, result, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(clientOperationId, method, paramsHash, JSON.stringify(result), now)
  return result
}

/** One receipted write: refused when read-only, otherwise one transaction with its receipt. */
export function runLocalTaskWrite<T extends { ok: boolean }>(
  db: LocalTasksDatabase,
  now: number,
  clientOperationId: string,
  method: string,
  params: unknown,
  resultSchema: ZodType<T>,
  operation: (now: number) => T
): T | LocalTaskFailure {
  if (db.readOnly) {
    return { ok: false, code: 'read_only' }
  }
  return db.transaction(() =>
    withLocalTaskReceipt(
      db,
      clientOperationId,
      method,
      params,
      resultSchema,
      () => operation(now),
      now
    )
  )
}
