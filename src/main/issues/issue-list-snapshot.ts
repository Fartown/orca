import { encodeIssueQueryCursor, type IssueQueryCursor } from './issue-query-cursor'

export function sliceIssueSnapshotPage<T>(params: {
  records: readonly T[]
  offset: number
  limit: number
  cursor: Omit<IssueQueryCursor, 'offset'>
}): { records: T[]; nextCursor: string | null } {
  const records = params.records.slice(params.offset, params.offset + params.limit)
  const nextOffset = params.offset + records.length
  return {
    records,
    nextCursor:
      nextOffset < params.records.length
        ? encodeIssueQueryCursor({ ...params.cursor, offset: nextOffset })
        : null
  }
}
