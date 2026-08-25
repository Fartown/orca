import { createHash } from 'node:crypto'
import type { IssueMutationIdentity } from '../../shared/issues/types'
import type { IssueDatabase } from './issue-database'
import { IssueRepositoryError } from './issue-repository-error'

type MutationReceiptRow = {
  method: string
  payload_hash: string
  state: 'pending' | 'completed'
  result_json: string | null
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)])
  )
}

export function hashIssueMutationPayload(payload: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex')
}

export function executeIssueMutation<Result>(params: {
  database: IssueDatabase
  identity: IssueMutationIdentity
  method: string
  payload: unknown
  operation: () => Result
}): Result {
  return executeIssueMutationWithReceipt(params).result
}

export function executeIssueMutationWithReceipt<Result>(params: {
  database: IssueDatabase
  identity: IssueMutationIdentity
  method: string
  payload: unknown
  operation: () => Result
}): { result: Result; replayed: boolean } {
  const payloadHash = hashIssueMutationPayload(params.payload)
  return params.database.transaction(() => {
    const existing = params.database
      .prepare(
        `SELECT method, payload_hash, state, result_json
         FROM issue_mutation_receipts
         WHERE caller_fingerprint = ? AND mutation_id = ?`
      )
      .get(params.identity.callerFingerprint, params.identity.mutationId) as
      | MutationReceiptRow
      | undefined
    if (existing) {
      assertMatchingReceipt(existing, params.method, payloadHash, params.identity.mutationId)
      if (existing.state !== 'completed' || existing.result_json === null) {
        throw new IssueRepositoryError(
          'mutation_pending',
          `Issue mutation ${params.identity.mutationId} is still pending.`
        )
      }
      return { result: JSON.parse(existing.result_json) as Result, replayed: true }
    }

    const now = Date.now()
    params.database
      .prepare(
        `INSERT INTO issue_mutation_receipts (
           caller_fingerprint, mutation_id, method, payload_hash,
           state, result_json, created_at, completed_at
         ) VALUES (?, ?, ?, ?, 'pending', NULL, ?, NULL)`
      )
      .run(
        params.identity.callerFingerprint,
        params.identity.mutationId,
        params.method,
        payloadHash,
        now
      )
    const result = params.operation()
    const update = params.database
      .prepare(
        `UPDATE issue_mutation_receipts
         SET state = 'completed', result_json = ?, completed_at = ?
         WHERE caller_fingerprint = ? AND mutation_id = ? AND state = 'pending'`
      )
      .run(
        JSON.stringify(result),
        Date.now(),
        params.identity.callerFingerprint,
        params.identity.mutationId
      )
    if (update.changes !== 1) {
      throw new Error(`Issue mutation ${params.identity.mutationId} lost its receipt.`)
    }
    return { result, replayed: false }
  })
}

function assertMatchingReceipt(
  existing: MutationReceiptRow,
  method: string,
  payloadHash: string,
  mutationId: string
): void {
  if (existing.method === method && existing.payload_hash === payloadHash) {
    return
  }
  throw new IssueRepositoryError(
    'mutation_receipt_conflict',
    `Issue mutation ${mutationId} was already used with different input.`
  )
}
