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

export function descriptionWithoutTrackedLegacyCriteria(
  description: string,
  criteria: readonly string[]
): string {
  const section = descriptionWithLegacyCriteria('', criteria)
  if (!section) {
    return description
  }
  if (description === section) {
    return ''
  }
  return description.endsWith(`\n\n${section}`)
    ? description.slice(0, -section.length - 2)
    : description
}

export function readTrackedLegacyCriteria(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : []
  } catch {
    return []
  }
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
    'UPDATE local_tasks SET description = ?, criteria = ?, revision = revision + 1 WHERE id = ?'
  )
  for (const row of rows) {
    const items = readTrackedLegacyCriteria(rowString(row, 'criteria'))
    const description = rowString(row, 'description')
    const folded = descriptionWithLegacyCriteria(description, items)
    update.run(folded, folded === description ? '[]' : JSON.stringify(items), rowString(row, 'id'))
  }
  if (rows.length > 0) {
    database.prepare('UPDATE local_task_meta SET revision = revision + 1 WHERE singleton = 1').run()
  }
  database.prepare('INSERT INTO local_task_preferences (key, value) VALUES (?, ?)').run(MARKER, '1')
}
