import type SyncDatabase from '../sqlite/sync-database'
import { ISSUE_DATABASE_CORE_SCHEMA } from './issue-database-core-schema'
import { ISSUE_DATABASE_ROUND_SCHEMA } from './issue-database-round-schema'

export const ISSUE_DATABASE_SCHEMA_VERSION = 4

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

const ISSUE_DATABASE_V3_ADD_TITLE_SOURCE = `
ALTER TABLE conversations ADD COLUMN title_source TEXT CHECK(
  title_source IS NULL OR
  title_source IN ('minted', 'provider', 'user')
);
`

// Why: every historical insert wrote title = NULL, so a non-empty title can
// only have come from a manual rename (verified against all current callers).
const ISSUE_DATABASE_V3_CLASSIFY_MANUAL_TITLES = `
UPDATE conversations SET title_source = 'user'
WHERE title IS NOT NULL AND title_source IS NULL;
`

const ISSUE_DATABASE_V4_ADD_PROVIDER_TITLE = `
ALTER TABLE conversations ADD COLUMN provider_title TEXT;
`

function hasTitleSourceColumn(database: SyncDatabase.Database): boolean {
  const columns = database.prepare('PRAGMA table_info(conversations)').all() as { name: string }[]
  return columns.some((column) => column.name === 'title_source')
}

function hasProviderTitleColumn(database: SyncDatabase.Database): boolean {
  const columns = database.prepare('PRAGMA table_info(conversations)').all() as { name: string }[]
  return columns.some((column) => column.name === 'provider_title')
}

// v4 restores the pre-v3 meaning of `title` as a user override and keeps the
// last meaningful automatic name in its own slot. Minted values are derivable
// from identity and therefore carry no durable information.
function splitLegacyTitleSlots(database: SyncDatabase.Database): void {
  const affectedPartitions = database
    .prepare(
      `SELECT DISTINCT host_partition_key
       FROM conversations
       WHERE title_source IN ('minted', 'provider')
          OR (title IS NOT NULL AND title_source IS NULL)`
    )
    .all() as { host_partition_key: string }[]
  if (affectedPartitions.length === 0) {
    return
  }

  const now = Date.now()
  database
    .prepare(
      `UPDATE conversations
       SET provider_title = CASE
             WHEN title_source = 'provider' THEN title
             ELSE provider_title
           END,
           title = CASE
             WHEN title_source IN ('minted', 'provider') THEN NULL
             ELSE title
           END,
           title_source = CASE
             WHEN title_source IN ('minted', 'provider') THEN NULL
             WHEN title IS NOT NULL AND title_source IS NULL THEN 'user'
             ELSE title_source
           END,
           record_revision = record_revision + 1,
           updated_at = ?
       WHERE title_source IN ('minted', 'provider')
          OR (title IS NOT NULL AND title_source IS NULL)`
    )
    .run(now)

  for (const { host_partition_key: partition } of affectedPartitions) {
    database
      .prepare(
        `INSERT OR IGNORE INTO issue_host_state (
           host_partition_key, next_local_issue_number, facts_revision, tree_revision, updated_at
         ) VALUES (?, 1, 0, 0, ?)`
      )
      .run(partition, now)
    database
      .prepare(
        `UPDATE issue_host_state
         SET facts_revision = facts_revision + 1, updated_at = ?
         WHERE host_partition_key = ?`
      )
      .run(now, partition)
  }
}

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
    if (storedVersion >= 1 && storedVersion < 3 && !hasTitleSourceColumn(database)) {
      // Fresh databases get the column from the core schema above; the column
      // probe keeps the ALTER idempotent for intermediate dev snapshots.
      database.exec(ISSUE_DATABASE_V3_ADD_TITLE_SOURCE)
    }
    if (storedVersion < 3) {
      database.exec(ISSUE_DATABASE_V3_CLASSIFY_MANUAL_TITLES)
    }
    if (storedVersion < 4 && !hasProviderTitleColumn(database)) {
      database.exec(ISSUE_DATABASE_V4_ADD_PROVIDER_TITLE)
    }
    if (storedVersion < 4) {
      splitLegacyTitleSlots(database)
    }
    hooks.beforeVersionBump?.(ISSUE_DATABASE_SCHEMA_VERSION)
    database.pragma(`user_version = ${ISSUE_DATABASE_SCHEMA_VERSION}`)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
