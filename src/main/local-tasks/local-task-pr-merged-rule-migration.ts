import type SyncDatabase from '../sqlite/sync-database'

const MARKER = 'prMergedReviewDefaultApplied'

/** Translate the old enabled rule once; later explicit completed choices remain intact. */
export function migratePrMergedRuleToReview(database: SyncDatabase): void {
  if (database.prepare('SELECT 1 FROM local_task_preferences WHERE key = ?').get(MARKER)) {
    return
  }
  const changed = database
    .prepare(
      `UPDATE local_task_projects
       SET rule_pr_merged_completes = 2, revision = revision + 1
       WHERE rule_pr_merged_completes = 1`
    )
    .run()
  if (changed.changes > 0) {
    database.prepare('UPDATE local_task_meta SET revision = revision + 1 WHERE singleton = 1').run()
  }
  database.prepare('INSERT INTO local_task_preferences (key, value) VALUES (?, ?)').run(MARKER, '1')
}
