import { existsSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import SyncDatabase from '../sqlite/sync-database'
import {
  createIssueTestUserDataPath,
  openIssueTestDatabase,
  removeIssueTestDirectories
} from './issue-database.test-environment'
import { ensureIssueDatabaseDirectory } from './issue-database-file-permissions'
import { getIssueDatabasePath, IssueDatabase } from './issue-database'
import { ISSUE_DATABASE_SCHEMA_VERSION } from './issue-database-migrations'

afterEach(removeIssueTestDirectories)

describe('IssueDatabase', () => {
  it('opens every connection with the required pragmas and exact tables', () => {
    const userDataPath = createIssueTestUserDataPath('orca-issues-pragmas')
    const database = openIssueTestDatabase({ profileId: 'profile-a', userDataPath })

    expect(database.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(Number(database.pragma('synchronous', { simple: true }))).toBe(1)
    expect(Number(database.pragma('busy_timeout', { simple: true }))).toBe(5_000)
    expect(Number(database.pragma('foreign_keys', { simple: true }))).toBe(1)
    expect(Number(database.pragma('user_version', { simple: true }))).toBe(
      ISSUE_DATABASE_SCHEMA_VERSION
    )
    expect(tableNames(database)).toEqual([
      'conversation_launch_claims',
      'conversation_provider_identities',
      'conversations',
      'issue_authority_meta',
      'issue_host_state',
      'issue_mutation_receipts',
      'issues',
      'round_records',
      'round_refs'
    ])

    database.close()
  })

  it('rolls back a failed migration without bumping user_version or losing old data', () => {
    const userDataPath = createIssueTestUserDataPath('orca-issues-migration')
    const path = getIssueDatabasePath('profile-a', userDataPath)
    ensureIssueDatabaseDirectory(path)
    const seed = new SyncDatabase(path)
    seed.exec(
      "CREATE TABLE legacy_probe (value TEXT NOT NULL); INSERT INTO legacy_probe VALUES ('kept');"
    )
    seed.pragma('user_version = 0')
    seed.close()

    expect(() =>
      IssueDatabase.open({
        profileId: 'profile-a',
        userDataPath,
        migrationHooks: {
          beforeVersionBump: () => {
            throw new Error('injected migration failure')
          }
        }
      })
    ).toThrow('injected migration failure')

    const afterFailure = new SyncDatabase(path)
    expect(Number(afterFailure.pragma('user_version', { simple: true }))).toBe(0)
    expect(afterFailure.prepare('SELECT value FROM legacy_probe').get()).toEqual({ value: 'kept' })
    expect(
      afterFailure
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'issues'")
        .get()
    ).toBeUndefined()
    afterFailure.close()

    const recovered = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    expect(Number(recovered.pragma('user_version', { simple: true }))).toBe(
      ISSUE_DATABASE_SCHEMA_VERSION
    )
    expect(recovered.prepare('SELECT value FROM legacy_probe').get()).toEqual({ value: 'kept' })
    recovered.close()
  })

  it('repairs historical unresolved completions and removes obsolete reconciliation receipts', () => {
    const userDataPath = createIssueTestUserDataPath('orca-issues-v2-round-repair')
    const path = getIssueDatabasePath('profile-a', userDataPath)
    const database = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    database.exec(`
      INSERT INTO conversations (
        id, host_partition_key, execution_host_id, workspace_kind, workspace_id,
        workspace_name_snapshot, workspace_path_snapshot, agent, issue_id, title,
        created_at, updated_at, record_revision, launch_failure_message, launch_failed_at
      ) VALUES (
        'conversation-1', 'local', 'local', 'worktree', 'worktree-1',
        'Workspace', '/workspace', 'codex', NULL, NULL,
        1, 1, 1, NULL, NULL
      );
      INSERT INTO round_records (
        id, conversation_id, kind, waiting_reason, state_source, occurred_at, dedupe_key,
        user_input_preview, user_input_completeness, agent_output_preview, output_completeness,
        pending_question_preview, question_completeness, read_at, resolved_at, resolution, created_at
      ) VALUES
        ('round-1', 'conversation-1', 'completion', NULL, 'reconciled', 10, 'round-1',
         'first', 'reconciled-preview', 'answer-1', 'reconciled-preview',
         NULL, 'not-captured', NULL, NULL, NULL, 10),
        ('round-2', 'conversation-1', 'completion', NULL, 'reconciled', 20, 'round-2',
         'second', 'reconciled-preview', 'answer-2', 'reconciled-preview',
         NULL, 'not-captured', NULL, NULL, NULL, 20);
      INSERT INTO issue_mutation_receipts (
        caller_fingerprint, mutation_id, method, payload_hash, state,
        result_json, created_at, completed_at
      ) VALUES (
        'orca-round-transcript-reconciler', 'old-receipt', 'rounds.ingest', 'hash',
        'completed', '{}', 1, 1
      );
    `)
    database.pragma('user_version = 1')
    database.close()

    const migrated = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    expect(
      migrated
        .prepare('SELECT resolved_at, resolution FROM round_records WHERE id = ?')
        .get('round-1')
    ).toEqual({ resolved_at: 20, resolution: 'new-input' })
    expect(
      migrated
        .prepare('SELECT resolved_at, resolution FROM round_records WHERE id = ?')
        .get('round-2')
    ).toEqual({ resolved_at: null, resolution: null })
    expect(
      migrated
        .prepare('SELECT 1 FROM issue_mutation_receipts WHERE mutation_id = ?')
        .get('old-receipt')
    ).toBeUndefined()
    migrated.close()
    expect(existsSync(path)).toBe(true)
  })

  it('keeps profile databases isolated and private on POSIX', () => {
    const userDataPath = createIssueTestUserDataPath('orca-issues-profiles')
    const profileA = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    const profileB = IssueDatabase.open({ profileId: 'profile-b', userDataPath })
    profileA.exec("INSERT INTO issue_host_state VALUES ('local', 1, 0, 0, 1)")

    expect(
      (
        profileA.prepare('SELECT COUNT(*) AS count FROM issue_host_state').get() as {
          count: number
        }
      ).count
    ).toBe(1)
    expect(
      (
        profileB.prepare('SELECT COUNT(*) AS count FROM issue_host_state').get() as {
          count: number
        }
      ).count
    ).toBe(0)
    expect(Number(profileA.pragma('foreign_keys', { simple: true }))).toBe(1)
    expect(Number(profileB.pragma('foreign_keys', { simple: true }))).toBe(1)

    const paths = [profileA.path, profileB.path]
    profileA.close()
    profileB.close()
    expect(paths[0]).not.toBe(paths[1])
    for (const path of paths) {
      expect(existsSync(path)).toBe(true)
      if (process.platform !== 'win32') {
        expect(statSync(path).mode & 0o777).toBe(0o600)
        expect(statSync(dirname(path)).mode & 0o777).toBe(0o700)
      }
    }
  })

  it('has no deferred schema tables or columns', () => {
    const database = IssueDatabase.open({
      profileId: 'profile-a',
      userDataPath: createIssueTestUserDataPath('orca-issues-v1-shape')
    })
    const schema = (
      database
        .prepare("SELECT group_concat(sql, '\n') AS sql FROM sqlite_master WHERE sql IS NOT NULL")
        .get() as { sql: string }
    ).sql.toLowerCase()

    for (const forbidden of [
      'execution_chain',
      'supersedes',
      'digest',
      'issue_events',
      'search_fts',
      'body_revision',
      'body_deleted'
    ]) {
      expect(schema).not.toContain(forbidden)
    }
    database.close()
  })
})

function tableNames(database: IssueDatabase): string[] {
  return (
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[]
  ).map((row) => row.name)
}
