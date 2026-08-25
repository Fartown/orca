import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { AuthorityHostPartitionKey } from '../../shared/issues/types'
import { getOrcaProfileDirectory } from '../orca-profiles/profile-storage-paths'
import SyncDatabase, { type SqliteStatement } from '../sqlite/sync-database'
import {
  ensureIssueDatabaseDirectory,
  hardenIssueDatabaseFiles
} from './issue-database-file-permissions'
import { migrateIssueDatabase, type IssueDatabaseMigrationHooks } from './issue-database-migrations'
import type { IssueHostRevisions } from './issue-host-state'

const ISSUE_DATABASE_DIRECTORY_NAME = 'issues'
const ISSUE_DATABASE_FILE_NAME = 'orca-issues.db'

export type OpenIssueDatabaseOptions = {
  profileId: string
  userDataPath?: string
  migrationHooks?: IssueDatabaseMigrationHooks
}

export type OpenTransientIssueDatabaseOptions = {
  logicalPath: string
  migrationHooks?: IssueDatabaseMigrationHooks
}

export type IssueFactsChanged = IssueHostRevisions & {
  authorityId: string
  hostPartitionKey: AuthorityHostPartitionKey
}

export function getIssueDatabasePath(profileId: string, userDataPath?: string): string {
  return join(
    getOrcaProfileDirectory(profileId, userDataPath),
    ISSUE_DATABASE_DIRECTORY_NAME,
    ISSUE_DATABASE_FILE_NAME
  )
}

export class IssueDatabase {
  readonly path: string
  private readonly database: SyncDatabase.Database
  private readonly persistent: boolean
  private readonly factsChangedListeners = new Set<(change: IssueFactsChanged) => void>()
  private pendingFactsChanges = new Map<AuthorityHostPartitionKey, IssueHostRevisions>()
  private writeTransactionActive = false
  private closed = false

  private constructor(path: string, database: SyncDatabase.Database, persistent: boolean) {
    this.path = path
    this.database = database
    this.persistent = persistent
  }

  static open(options: OpenIssueDatabaseOptions): IssueDatabase {
    const path = getIssueDatabasePath(options.profileId, options.userDataPath)
    ensureIssueDatabaseDirectory(path)
    return IssueDatabase.openConnection(path, path, true, options.migrationHooks)
  }

  static openTransient(options: OpenTransientIssueDatabaseOptions): IssueDatabase {
    return IssueDatabase.openConnection(
      ':memory:',
      options.logicalPath,
      false,
      options.migrationHooks
    )
  }

  private static openConnection(
    connectionPath: string,
    logicalPath: string,
    persistent: boolean,
    migrationHooks?: IssueDatabaseMigrationHooks
  ): IssueDatabase {
    const database = new SyncDatabase(connectionPath)
    try {
      configureConnection(database)
      migrateIssueDatabase(database, migrationHooks)
      ensureAuthorityMetadata(database)
      if (persistent) {
        hardenIssueDatabaseFiles(logicalPath)
      }
      return new IssueDatabase(logicalPath, database, persistent)
    } catch (error) {
      database.close()
      if (persistent) {
        hardenIssueDatabaseFiles(logicalPath)
      }
      throw error
    }
  }

  prepare(sql: string): SqliteStatement {
    this.assertOpen()
    return this.database.prepare(sql)
  }

  exec(sql: string): void {
    this.assertOpen()
    this.database.exec(sql)
  }

  pragma(sql: string, options?: { simple?: boolean }): unknown {
    this.assertOpen()
    return this.database.pragma(sql, options)
  }

  transaction<T>(operation: () => T): T {
    this.assertOpen()
    if (this.writeTransactionActive) {
      return operation()
    }
    this.database.exec('BEGIN IMMEDIATE')
    this.writeTransactionActive = true
    this.pendingFactsChanges.clear()
    try {
      const result = operation()
      this.database.exec('COMMIT')
      this.writeTransactionActive = false
      const changes = [...this.pendingFactsChanges.entries()]
      this.pendingFactsChanges.clear()
      if (this.persistent) {
        hardenIssueDatabaseFiles(this.path)
      }
      for (const [hostPartitionKey, revisions] of changes) {
        this.notifyFactsChanged(hostPartitionKey, revisions)
      }
      return result
    } catch (error) {
      this.pendingFactsChanges.clear()
      this.writeTransactionActive = false
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  readTransaction<T>(operation: () => T): T {
    this.assertOpen()
    this.database.exec('BEGIN')
    try {
      const result = operation()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  getAuthorityId(): string {
    const row = this.prepare(
      'SELECT authority_id FROM issue_authority_meta WHERE singleton = 1'
    ).get() as { authority_id: string } | undefined
    if (!row) {
      throw new Error('Issue database authority metadata is missing.')
    }
    return row.authority_id
  }

  onFactsChanged(listener: (change: IssueFactsChanged) => void): () => void {
    this.factsChangedListeners.add(listener)
    return () => this.factsChangedListeners.delete(listener)
  }

  recordFactsChanged(
    hostPartitionKey: AuthorityHostPartitionKey,
    revisions: IssueHostRevisions
  ): void {
    if (this.writeTransactionActive) {
      this.pendingFactsChanges.set(hostPartitionKey, revisions)
      return
    }
    this.notifyFactsChanged(hostPartitionKey, revisions)
  }

  close(): void {
    if (this.closed) {
      return
    }
    if (this.persistent) {
      hardenIssueDatabaseFiles(this.path)
    }
    this.database.close()
    if (this.persistent) {
      hardenIssueDatabaseFiles(this.path)
    }
    this.factsChangedListeners.clear()
    this.closed = true
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('Issue database is closed.')
    }
  }

  private notifyFactsChanged(
    hostPartitionKey: AuthorityHostPartitionKey,
    revisions: IssueHostRevisions
  ): void {
    const change = { authorityId: this.getAuthorityId(), hostPartitionKey, ...revisions }
    for (const listener of this.factsChangedListeners) {
      try {
        listener(change)
      } catch (error) {
        console.error('[issues] facts change listener failed', error)
      }
    }
  }
}

function configureConnection(database: SyncDatabase.Database): void {
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = NORMAL')
  database.pragma('busy_timeout = 5000')
  database.pragma('foreign_keys = ON')
  if (Number(database.pragma('foreign_keys', { simple: true })) !== 1) {
    throw new Error('Issue database foreign key enforcement could not be enabled.')
  }
}

function ensureAuthorityMetadata(database: SyncDatabase.Database): void {
  database.exec('BEGIN IMMEDIATE')
  try {
    database
      .prepare(
        `INSERT OR IGNORE INTO issue_authority_meta (singleton, authority_id, created_at)
         VALUES (1, ?, ?)`
      )
      .run(randomUUID(), Date.now())
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
