import type { SqliteRow } from '../sqlite/sqlite-statement'

/** Checked column reads: a schema drift fails loudly instead of leaking a wrong type to clients. */
export function rowString(row: SqliteRow, column: string): string {
  const value = row[column]
  if (typeof value !== 'string') {
    throw new Error(`local tasks: column ${column} is not text`)
  }
  return value
}

export function rowNullableString(row: SqliteRow, column: string): string | null {
  const value = row[column]
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    throw new Error(`local tasks: column ${column} is not text`)
  }
  return value
}

export function rowNumber(row: SqliteRow, column: string): number {
  const value = row[column]
  if (typeof value === 'bigint') {
    return Number(value)
  }
  if (typeof value !== 'number') {
    throw new Error(`local tasks: column ${column} is not a number`)
  }
  return value
}

export function rowNullableNumber(row: SqliteRow, column: string): number | null {
  const value = row[column]
  return value === null || value === undefined ? null : rowNumber(row, column)
}

export function rowStringArray(row: SqliteRow, column: string): string[] {
  const parsed: unknown = JSON.parse(rowString(row, column))
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error(`local tasks: column ${column} is not a string list`)
  }
  return parsed
}

export function rowJsonObject(row: SqliteRow, column: string): Record<string, unknown> | null {
  const text = rowNullableString(row, column)
  if (text === null) {
    return null
  }
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`local tasks: column ${column} is not an object`)
  }
  return Object.fromEntries(Object.entries(parsed))
}
