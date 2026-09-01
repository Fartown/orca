import { describe, expect, it } from 'vitest'
import { createIssueTestUserDataPath } from './issue-database.test-environment'
import { IssueDatabase } from './issue-database'
import { ISSUE_DATABASE_SCHEMA_VERSION } from './issue-database-migrations'

function conversationRow(id: string, title: string | null): string {
  return `
    INSERT INTO conversations (
      id, host_partition_key, execution_host_id, workspace_kind, workspace_id,
      workspace_name_snapshot, workspace_path_snapshot, agent, issue_id, title,
      created_at, updated_at, record_revision, launch_failure_message, launch_failed_at
    ) VALUES (
      '${id}', 'local', 'local', 'worktree', 'worktree-1',
      'Workspace', '/workspace', 'codex', NULL, ${title === null ? 'NULL' : `'${title}'`},
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

describe('issue database v3 title migration', () => {
  it('classifies manual names, mints identified rows deterministically, and stays idempotent', () => {
    const userDataPath = createIssueTestUserDataPath('orca-issues-v3-title')
    const database = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    // Rebuild the pre-v3 shape: the column did not exist yet.
    database.exec('ALTER TABLE conversations DROP COLUMN title_source')
    database.exec(conversationRow('manual', 'My manual name'))
    database.exec(conversationRow('identified', null))
    database.exec(identityRow('older', 'identified', null))
    database.exec(identityRow('id-new', 'identified', null))
    database.exec(conversationRow('retired-only', null))
    database.exec(identityRow('gone', 'retired-only', 99))
    database.pragma('user_version = 2')
    database.close()

    const migrated = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    expect(Number(migrated.pragma('user_version', { simple: true }))).toBe(
      ISSUE_DATABASE_SCHEMA_VERSION
    )
    expect(
      migrated.prepare('SELECT title, title_source FROM conversations WHERE id = ?').get('manual')
    ).toEqual({ title: 'My manual name', title_source: 'user' })
    // The canonical identity (latest observed_at) supplies the session id.
    expect(
      migrated
        .prepare('SELECT title, title_source, record_revision FROM conversations WHERE id = ?')
        .get('identified')
    ).toEqual({ title: 'Codex id-new-s', title_source: 'minted', record_revision: 2 })
    expect(
      migrated
        .prepare('SELECT title, title_source FROM conversations WHERE id = ?')
        .get('retired-only')
    ).toEqual({ title: null, title_source: null })
    const facts = migrated
      .prepare('SELECT facts_revision FROM issue_host_state WHERE host_partition_key = ?')
      .get('local') as { facts_revision: number }
    expect(facts.facts_revision).toBeGreaterThan(0)
    migrated.close()

    const reopened = IssueDatabase.open({ profileId: 'profile-a', userDataPath })
    expect(
      reopened
        .prepare('SELECT title, title_source, record_revision FROM conversations WHERE id = ?')
        .get('identified')
    ).toEqual({ title: 'Codex id-new-s', title_source: 'minted', record_revision: 2 })
    reopened.close()
  })
})
