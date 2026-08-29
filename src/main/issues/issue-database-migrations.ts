import type SyncDatabase from '../sqlite/sync-database'
import { ISSUE_DATABASE_CORE_SCHEMA } from './issue-database-core-schema'
import { ISSUE_DATABASE_ROUND_SCHEMA } from './issue-database-round-schema'

export const ISSUE_DATABASE_SCHEMA_VERSION = 2

const ISSUE_DATABASE_V2_DATA_REPAIR = `
UPDATE round_records AS current
SET resolved_at = (
      SELECT MIN(later.occurred_at)
      FROM round_records AS later
      WHERE later.conversation_id = current.conversation_id
        AND later.user_input_preview IS NOT NULL
        AND TRIM(later.user_input_preview) <> ''
        AND later.occurred_at > current.occurred_at
    ),
    resolution = 'new-input'
WHERE current.kind = 'completion'
  AND current.resolved_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM round_records AS later
    WHERE later.conversation_id = current.conversation_id
      AND later.user_input_preview IS NOT NULL
      AND TRIM(later.user_input_preview) <> ''
      AND later.occurred_at > current.occurred_at
  );

DELETE FROM issue_mutation_receipts
WHERE caller_fingerprint = 'orca-round-transcript-reconciler'
  AND method = 'rounds.ingest';
`

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
    if (storedVersion < 1) {
      database.exec(ISSUE_DATABASE_CORE_SCHEMA)
      database.exec(ISSUE_DATABASE_ROUND_SCHEMA)
    }
    if (storedVersion < 2) {
      database.exec(ISSUE_DATABASE_V2_DATA_REPAIR)
    }
    hooks.beforeVersionBump?.(ISSUE_DATABASE_SCHEMA_VERSION)
    database.pragma(`user_version = ${ISSUE_DATABASE_SCHEMA_VERSION}`)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
