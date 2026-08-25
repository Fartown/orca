import { createHash } from 'node:crypto'

export type IssueQueryCursor = {
  kind: 'issues' | 'conversations' | 'rounds'
  scopeHash: string
  offset: number
  factsRevision: number
  treeRevision?: number
  runtimeRevision?: number
}

export function encodeIssueQueryCursor(cursor: IssueQueryCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeIssueQueryCursor(
  encoded: string,
  expected: Omit<IssueQueryCursor, 'offset'>
): IssueQueryCursor {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    throw new Error('issue_cursor_invalid')
  }
  if (!isCursor(parsed) || !sameCursorScope(parsed, expected)) {
    throw new Error('issue_cursor_invalid')
  }
  return parsed
}

export function issueQueryScopeHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url').slice(0, 22)
}

function isCursor(value: unknown): value is IssueQueryCursor {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as Record<string, unknown>
  return (
    (row.kind === 'issues' || row.kind === 'conversations' || row.kind === 'rounds') &&
    typeof row.scopeHash === 'string' &&
    Number.isSafeInteger(row.offset) &&
    Number(row.offset) >= 0 &&
    Number.isSafeInteger(row.factsRevision) &&
    Number(row.factsRevision) >= 0 &&
    (row.treeRevision === undefined ||
      (Number.isSafeInteger(row.treeRevision) && Number(row.treeRevision) >= 0)) &&
    (row.runtimeRevision === undefined ||
      (Number.isSafeInteger(row.runtimeRevision) && Number(row.runtimeRevision) >= 0))
  )
}

function sameCursorScope(
  actual: IssueQueryCursor,
  expected: Omit<IssueQueryCursor, 'offset'>
): boolean {
  return (
    actual.kind === expected.kind &&
    actual.scopeHash === expected.scopeHash &&
    actual.factsRevision === expected.factsRevision &&
    actual.treeRevision === expected.treeRevision &&
    actual.runtimeRevision === expected.runtimeRevision
  )
}
