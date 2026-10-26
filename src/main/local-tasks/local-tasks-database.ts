import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LocalTaskChangeScope } from '../../shared/local-tasks/local-task-types'
import { getOrcaProfileDirectory } from '../orca-profiles/profile-storage-paths'
import { hardenSqliteDatabaseFiles } from '../sqlite/harden-database-files'
import SyncDatabase, { type SqliteStatement } from '../sqlite/sync-database'
import { applyLocalTasksSchema, LOCAL_TASKS_SCHEMA_VERSION } from './local-tasks-schema'
import { rowNumber, rowString } from './local-tasks-sqlite-row'

export type LocalTasksCommit = { revision: number; scopes: LocalTaskChangeScope[] }

export function getLocalTasksDatabasePath(profileId: string, userDataPath?: string): string {
  return join(
    getOrcaProfileDirectory(profileId, userDataPath),
    'local-tasks',
    'orca-local-tasks.db'
  )
}

export class LocalTasksDatabase {
  private readonly commitListeners = new Set<(commit: LocalTasksCommit) => void>()
  private pendingScopes: Set<LocalTaskChangeScope> | null = null
  private closed = false

  private constructor(
    readonly path: string,
    private readonly database: SyncDatabase,
    readonly readOnly: boolean,
    private readonly persistent: boolean
  ) {}

  static open(profileId: string, userDataPath?: string): LocalTasksDatabase {
    const path = getLocalTasksDatabasePath(profileId, userDataPath)
    ensurePrivateDirectory(dirname(path))
    return LocalTasksDatabase.openConnection(path, true)
  }

  /** Tests: same schema and transaction rules, no file. */
  static openTransient(): LocalTasksDatabase {
    return LocalTasksDatabase.openConnection(':memory:', false)
  }

  private static openConnection(path: string, persistent: boolean): LocalTasksDatabase {
    const probe = new SyncDatabase(path)
    let transferred = false
    try {
      const stored = Number(probe.pragma('user_version', { simple: true }))
      if (stored > LOCAL_TASKS_SCHEMA_VERSION) {
        // Why: a newer Orca wrote this file; reading it must not change a single byte (downgrade safety).
        probe.close()
        transferred = true
        const readOnly = new SyncDatabase(path, { readonly: true, fileMustExist: true })
        return new LocalTasksDatabase(path, readOnly, true, persistent)
      }
      probe.pragma('journal_mode = WAL')
      probe.pragma('synchronous = NORMAL')
      probe.pragma('busy_timeout = 5000')
      probe.pragma('foreign_keys = ON')
      if (Number(probe.pragma('foreign_keys', { simple: true })) !== 1) {
        throw new Error('local tasks: foreign key enforcement could not be enabled')
      }
      if (stored < LOCAL_TASKS_SCHEMA_VERSION) {
        runImmediate(probe, () => {
          applyLocalTasksSchema(probe, stored)
          probe.pragma(`user_version = ${LOCAL_TASKS_SCHEMA_VERSION}`)
        })
      }
      runImmediate(probe, () => {
        probe
          .prepare(
            `INSERT OR IGNORE INTO local_task_meta (singleton, task_host_id, revision, created_at)
             VALUES (1, ?, 0, ?)`
          )
          .run(randomUUID(), Date.now())
      })
      if (persistent) {
        hardenSqliteDatabaseFiles(path)
      }
      transferred = true
      return new LocalTasksDatabase(path, probe, false, persistent)
    } finally {
      if (!transferred) {
        probe.close()
      }
    }
  }

  prepare(sql: string): SqliteStatement {
    this.assertOpen()
    return this.database.prepare(sql)
  }

  /**
   * One IMMEDIATE write transaction. Nested calls join the outer one. Listeners hear the commit
   * only after COMMIT succeeds, with the bumped library revision and every scope the writes touched.
   */
  transaction<T>(operation: () => T): T {
    this.assertOpen()
    if (this.readOnly) {
      throw new Error('local tasks: database is read-only')
    }
    if (this.pendingScopes) {
      return operation()
    }
    const scopes = new Set<LocalTaskChangeScope>()
    this.pendingScopes = scopes
    try {
      const result = runImmediate(this.database, () => {
        const value = operation()
        if (scopes.size > 0) {
          this.prepare(
            'UPDATE local_task_meta SET revision = revision + 1 WHERE singleton = 1'
          ).run()
        }
        return value
      })
      this.pendingScopes = null
      if (this.persistent) {
        hardenSqliteDatabaseFiles(this.path)
      }
      if (scopes.size > 0) {
        this.notify({ revision: this.revision(), scopes: [...scopes] })
      }
      return result
    } finally {
      this.pendingScopes = null
    }
  }

  /** Marks what the current transaction changed; ignored outside one. */
  touch(scope: LocalTaskChangeScope): void {
    this.pendingScopes?.add(scope)
  }

  revision(): number {
    const row = this.prepare('SELECT revision FROM local_task_meta WHERE singleton = 1').get()
    return row ? rowNumber(row, 'revision') : 0
  }

  taskHostId(): string | null {
    const row = this.prepare('SELECT task_host_id FROM local_task_meta WHERE singleton = 1').get()
    return row ? rowString(row, 'task_host_id') : null
  }

  onCommit(listener: (commit: LocalTasksCommit) => void): () => void {
    this.commitListeners.add(listener)
    return () => this.commitListeners.delete(listener)
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.database.close()
    if (this.persistent && !this.readOnly) {
      hardenSqliteDatabaseFiles(this.path)
    }
    this.commitListeners.clear()
    this.closed = true
  }

  private notify(commit: LocalTasksCommit): void {
    for (const listener of this.commitListeners) {
      try {
        listener(commit)
      } catch (error) {
        console.error('[local-tasks] commit listener failed', error)
      }
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('local tasks: database is closed')
    }
  }
}

/** COMMIT sits inside the failure boundary: a failed COMMIT can leave the transaction open. */
function runImmediate<T>(database: SyncDatabase, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    database.exec('COMMIT')
    return result
  } catch (error) {
    if (database.isTransaction) {
      database.exec('ROLLBACK')
    }
    throw error
  }
}

function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') {
    try {
      chmodSync(path, 0o700)
    } catch {
      // Why: best-effort — a mount that rejects chmod must not stop the task library from opening.
    }
  }
}
