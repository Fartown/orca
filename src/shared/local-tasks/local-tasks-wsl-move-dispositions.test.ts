import { describe, expect, it } from 'vitest'
import SyncDatabase from '../../main/sqlite/sync-database'
import { LocalTasksDatabase } from '../../main/local-tasks/local-tasks-database'
import { LOCAL_TASKS_SCHEMA_VERSION } from '../../main/local-tasks/local-tasks-schema'
import { rowString } from '../../main/local-tasks/local-tasks-sqlite-row'
import { LOCAL_TASKS_SQLITE_TABLE_DISPOSITIONS } from './local-tasks-wsl-move-dispositions'

void SyncDatabase

const SQLITE_TABLE_DISPOSITIONS = Object.fromEntries(LOCAL_TASKS_SQLITE_TABLE_DISPOSITIONS)

const DISPATCHER_TABLES = [
  'local_task_conversations',
  'local_task_proposals',
  'local_task_conversation_watches',
  'local_task_conversation_remote_watches',
  'local_task_conversation_facts'
]

describe('local tasks WSL move table census', () => {
  it('classifies every table in the current library and leaves dispatcher records with their owner', () => {
    const db = LocalTasksDatabase.openTransient()
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'local_task_%'")
        .all()
        .map((row) => rowString(row, 'name'))
      expect(db.prepare('PRAGMA user_version').get()).toMatchObject({
        user_version: LOCAL_TASKS_SCHEMA_VERSION
      })
      expect(tables).toContain('local_tasks')
      for (const table of tables) {
        expect(SQLITE_TABLE_DISPOSITIONS[`local-tasks.${table}`], table).toBeDefined()
      }
      for (const table of DISPATCHER_TABLES) {
        expect(tables).toContain(table)
        expect(SQLITE_TABLE_DISPOSITIONS[`local-tasks.${table}`]).toMatchObject({
          disposition: 'not-applicable',
          item: 52
        })
      }
    } finally {
      db.close()
    }
  })
})
