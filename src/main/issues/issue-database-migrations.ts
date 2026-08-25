import type SyncDatabase from '../sqlite/sync-database'
import { ISSUE_DATABASE_CORE_SCHEMA } from './issue-database-core-schema'
import { ISSUE_DATABASE_ROUND_SCHEMA } from './issue-database-round-schema'

export const ISSUE_DATABASE_SCHEMA_VERSION = 1

export type IssueDatabaseMigrationHooks = {
  beforeVersionBump?: (targetVersion: number) => void
}

export function migrateIssueDatabase(
  database: SyncDatabase.Database,
  hooks: IssueDatabaseMigrationHooks = {}
): void {
  const storedVersion = Number(database.pragma('user_version', { simple: true }) ?? 0)
  if (storedVersion > ISSUE_DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `Issue database version ${storedVersion} is an unpublished schema; reset the development database.`
    )
  }
  if (storedVersion === ISSUE_DATABASE_SCHEMA_VERSION) {
    return
  }

  database.exec('BEGIN IMMEDIATE')
  try {
    database.exec(ISSUE_DATABASE_CORE_SCHEMA)
    database.exec(ISSUE_DATABASE_ROUND_SCHEMA)
    hooks.beforeVersionBump?.(ISSUE_DATABASE_SCHEMA_VERSION)
    database.pragma(`user_version = ${ISSUE_DATABASE_SCHEMA_VERSION}`)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
