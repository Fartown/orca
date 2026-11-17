import type SyncDatabase from '../sqlite/sync-database'

export const LOCAL_TASK_SESSION_COLUMNS = `  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES local_tasks(id) ON DELETE CASCADE,
  host_id TEXT NOT NULL,
  worktree_id TEXT,
  instance_id TEXT,
  surface TEXT NOT NULL,
  tab_id TEXT,
  pane_key TEXT,
  session_id TEXT,
  provider_session TEXT,
  agent TEXT,
  linked_via TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  execution_origin TEXT`

/** Rebuild removes the old global pane constraint while preserving sessions and child rows. */
export function upgradeCrossHostSessionSchema(database: SyncDatabase): void {
  database.exec(`CREATE TABLE local_task_sessions_v8 (
${LOCAL_TASK_SESSION_COLUMNS}
);
INSERT INTO local_task_sessions_v8 (id, task_id, host_id, worktree_id, instance_id, surface,
  tab_id, pane_key, session_id, provider_session, agent, linked_via, opened_at)
  SELECT id, task_id, host_id, worktree_id, instance_id, surface, tab_id, pane_key,
    session_id, provider_session, agent, linked_via, opened_at FROM local_task_sessions;
DROP TABLE local_task_sessions;
ALTER TABLE local_task_sessions_v8 RENAME TO local_task_sessions;`)
}
