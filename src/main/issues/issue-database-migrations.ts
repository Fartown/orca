import type SyncDatabase from '../sqlite/sync-database'
import { mintAgentSessionFallbackTitle } from '../../shared/agent-session-fallback-title'
import type { TuiAgent } from '../../shared/tui-agent'
import { ISSUE_DATABASE_CORE_SCHEMA } from './issue-database-core-schema'
import { ISSUE_DATABASE_ROUND_SCHEMA } from './issue-database-round-schema'

export const ISSUE_DATABASE_SCHEMA_VERSION = 3

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

function hasTitleSourceColumn(database: SyncDatabase.Database): boolean {
  const columns = database.prepare('PRAGMA table_info(conversations)').all() as { name: string }[]
  return columns.some((column) => column.name === 'title_source')
}

// Mint fallback names for legacy unnamed rows that have an active provider
// identity, picking the canonical identity per conversation. Pure in-memory
// work on rows already loaded — no IO inside the migration transaction.
function classifyAndMintTitles(database: SyncDatabase.Database): void {
  database.exec(ISSUE_DATABASE_V3_CLASSIFY_MANUAL_TITLES)
  const candidates = database
    .prepare(
      `SELECT c.id AS conversation_id, c.agent, c.host_partition_key, i.session_id
       FROM conversations c
       JOIN conversation_provider_identities i
         ON i.conversation_id = c.id AND i.retired_at IS NULL
       WHERE c.title IS NULL
       ORDER BY c.id, i.observed_at DESC, i.id`
    )
    .all() as {
    conversation_id: string
    agent: string
    host_partition_key: string
    session_id: string
  }[]
  const now = Date.now()
  const minted = new Set<string>()
  const touchedPartitions = new Set<string>()
  const update = database.prepare(
    `UPDATE conversations
     SET title = ?, title_source = 'minted',
         record_revision = record_revision + 1, updated_at = ?
     WHERE id = ?`
  )
  for (const candidate of candidates) {
    if (minted.has(candidate.conversation_id)) {
      continue
    }
    minted.add(candidate.conversation_id)
    touchedPartitions.add(candidate.host_partition_key)
    update.run(
      mintAgentSessionFallbackTitle(candidate.agent as TuiAgent, candidate.session_id),
      now,
      candidate.conversation_id
    )
  }
  for (const partition of touchedPartitions) {
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
  const leftover = database
    .prepare(
      `SELECT COUNT(*) AS count FROM conversations c
       WHERE c.title IS NULL AND EXISTS (
         SELECT 1 FROM conversation_provider_identities i
         WHERE i.conversation_id = c.id AND i.retired_at IS NULL
       )`
    )
    .get() as { count: number }
  if (leftover.count > 0) {
    console.error(`[issues] title backfill left ${leftover.count} identified rows unnamed`)
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
      classifyAndMintTitles(database)
    }
    hooks.beforeVersionBump?.(ISSUE_DATABASE_SCHEMA_VERSION)
    database.pragma(`user_version = ${ISSUE_DATABASE_SCHEMA_VERSION}`)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
