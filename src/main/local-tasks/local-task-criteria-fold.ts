import type SyncDatabase from '../sqlite/sync-database'
import { rowString } from './local-tasks-sqlite-row'

const MARKER = 'criteriaFoldedIntoDescription'

export function descriptionWithLegacyCriteria(
  description: string,
  criteria: readonly string[]
): string {
  const items = criteria.filter((item) => item.trim().length > 0)
  if (items.length === 0) {
    return description
  }
  const section = `完成标准\n${items.map((item) => `- ${item}`).join('\n')}`
  return description.endsWith(section)
    ? description
    : `${description.trimEnd()}${description.trim() ? '\n\n' : ''}${section}`
}

/** Preserve old criteria once in the task description without changing the database version. */
export function foldLocalTaskCriteriaIntoDescription(database: SyncDatabase): void {
  if (database.prepare('SELECT 1 FROM local_task_preferences WHERE key = ?').get(MARKER)) {
    return
  }
  const rows = database
    .prepare("SELECT id, description, criteria FROM local_tasks WHERE criteria != '[]'")
    .all()
  const update = database.prepare(
    "UPDATE local_tasks SET description = ?, criteria = '[]', revision = revision + 1 WHERE id = ?"
  )
  for (const row of rows) {
    let criteria: unknown
    try {
      criteria = JSON.parse(rowString(row, 'criteria'))
    } catch {
      criteria = null
    }
    const items = Array.isArray(criteria)
      ? criteria.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        )
      : []
    const description = rowString(row, 'description')
    const folded = descriptionWithLegacyCriteria(description, items)
    update.run(folded, rowString(row, 'id'))
  }
  if (rows.length > 0) {
    database.prepare('UPDATE local_task_meta SET revision = revision + 1 WHERE singleton = 1').run()
  }
  database.prepare('INSERT INTO local_task_preferences (key, value) VALUES (?, ?)').run(MARKER, '1')
}
