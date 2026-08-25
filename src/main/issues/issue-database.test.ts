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

describe('IssueDatabase v1', () => {
  it('opens every connection with the required pragmas and exact v1 tables', () => {
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
    expect(Number(recovered.pragma('user_version', { simple: true }))).toBe(1)
    expect(recovered.prepare('SELECT value FROM legacy_probe').get()).toEqual({ value: 'kept' })
    recovered.close()
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
