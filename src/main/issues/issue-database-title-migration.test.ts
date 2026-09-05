import { describe, expect, it } from 'vitest'
import { createIssueTestUserDataPath } from './issue-database.test-environment'
import { IssueDatabase } from './issue-database'
import { ISSUE_DATABASE_SCHEMA_VERSION } from './issue-database-migrations'

function conversationRow(
  id: string,
  title: string | null,
  titleSource?: 'minted' | 'provider' | 'user' | null
): string {
  const sourceColumn = titleSource === undefined ? '' : ', title_source'
  const sourceValue =
    titleSource === undefined ? '' : `, ${titleSource === null ? 'NULL' : `'${titleSource}'`}`
  return `
    INSERT INTO conversations (
      id, host_partition_key, execution_host_id, workspace_kind, workspace_id,
      workspace_name_snapshot, workspace_path_snapshot, agent, issue_id, title${sourceColumn},
      created_at, updated_at, record_revision, launch_failure_message, launch_failed_at
    ) VALUES (
      '${id}', 'local', 'local', 'worktree', 'worktree-1',
      'Workspace', '/workspace', 'codex', NULL, ${title === null ? 'NULL' : `'${title}'`}${sourceValue},
      1, 1, 1, NULL, NULL
    );`
}

function identityRow(id: string, conversationId: string, retiredAt: number | null): string {
  return `
    INSERT INTO conversation_provider_identities (
      id, conversation_id, host_partition_key, agent, session_key, session_id,
      transcript_path, identity_fingerprint, resume_locator, observed_at, retired_at
    ) VALUES (
      '${id}', '${conversationId}', 'local', 'codex', 'session_id', '${id}-session',
      NULL, 'fp-${id}', NULL, ${id.endsWith('new') ? 20 : 10}, ${retiredAt ?? 'NULL'}
    );`
}

describe('issue database v4 title migration', () => {
  it('preserves pre-v3 manual names without ever minting identified rows', () => {
    const userDataPath = createIssueTestUserDataPath('orca-issues-v4-from-v2')
    const database = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    database.exec('ALTER TABLE conversations DROP COLUMN provider_title')
    database.exec('ALTER TABLE conversations DROP COLUMN title_source')
    database.exec(conversationRow('manual', 'My manual name'))
    database.exec(conversationRow('identified', null))
    database.exec(identityRow('older', 'identified', null))
    database.exec(identityRow('id-new', 'identified', null))
    database.pragma('user_version = 2')
    database.close()

    const migrated = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    expect(Number(migrated.pragma('user_version', { simple: true }))).toBe(
      ISSUE_DATABASE_SCHEMA_VERSION
    )
    expect(
      migrated
        .prepare('SELECT title, title_source, provider_title FROM conversations WHERE id = ?')
        .get('manual')
    ).toEqual({ title: 'My manual name', title_source: 'user', provider_title: null })
    expect(
      migrated
        .prepare(
          'SELECT title, title_source, provider_title, record_revision FROM conversations WHERE id = ?'
        )
        .get('identified')
    ).toEqual({ title: null, title_source: null, provider_title: null, record_revision: 1 })
    migrated.close()

    const reopened = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    expect(
      reopened
        .prepare(
          'SELECT title, title_source, provider_title, record_revision FROM conversations WHERE id = ?'
        )
        .get('identified')
    ).toEqual({ title: null, title_source: null, provider_title: null, record_revision: 1 })
    reopened.close()
  })

  it('splits v3 user, Provider, minted, and unclassified titles without deleting rows', () => {
    const userDataPath = createIssueTestUserDataPath('orca-issues-v4-from-v3')
    const database = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    database.exec('ALTER TABLE conversations DROP COLUMN provider_title')
    database.exec(conversationRow('user', 'My name', 'user'))
    database.exec(conversationRow('provider', 'Provider name', 'provider'))
    database.exec(conversationRow('minted', 'Codex minted00', 'minted'))
    database.exec(conversationRow('legacy', 'Legacy manual name', null))
    database.pragma('user_version = 3')
    database.close()

    const migrated = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    const rows = migrated
      .prepare(
        `SELECT id, title, title_source, provider_title, record_revision
         FROM conversations ORDER BY id`
      )
      .all()
    expect(rows).toEqual([
      {
        id: 'legacy',
        title: 'Legacy manual name',
        title_source: 'user',
        provider_title: null,
        record_revision: 2
      },
      {
        id: 'minted',
        title: null,
        title_source: null,
        provider_title: null,
        record_revision: 2
      },
      {
        id: 'provider',
        title: null,
        title_source: null,
        provider_title: 'Provider name',
        record_revision: 2
      },
      {
        id: 'user',
        title: 'My name',
        title_source: 'user',
        provider_title: null,
        record_revision: 1
      }
    ])
    migrated.close()
  })

  it('demotes a production-shaped batch of minted fallbacks in one migration', () => {
    const userDataPath = createIssueTestUserDataPath('orca-issues-v4-minted-batch')
    const database = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    database.exec('ALTER TABLE conversations DROP COLUMN provider_title')
    for (let index = 0; index < 48; index += 1) {
      database.exec(
        conversationRow(
          `minted-${index}`,
          `Codex session${String(index).padStart(2, '0')}`,
          'minted'
        )
      )
    }
    database.pragma('user_version = 3')
    database.close()

    const migrated = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    expect(
      migrated
        .prepare(
          `SELECT COUNT(*) AS count
           FROM conversations
           WHERE title IS NULL AND title_source IS NULL AND provider_title IS NULL`
        )
        .get()
    ).toEqual({ count: 48 })
    expect(
      migrated
        .prepare(
          'SELECT MIN(record_revision) AS min, MAX(record_revision) AS max FROM conversations'
        )
        .get()
    ).toEqual({ min: 2, max: 2 })
    migrated.close()
  })
})
