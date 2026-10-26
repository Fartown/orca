import type SyncDatabase from '../sqlite/sync-database'

export const LOCAL_TASKS_SCHEMA_VERSION = 1

// Why one statement list: workspace, session and attention tables ship now so slice 2 adds no migration.
const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS local_task_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  task_host_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS local_task_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  orca_project_id TEXT NOT NULL UNIQUE,
  default_repo_id TEXT,
  last_execution_host_id TEXT,
  next_number INTEGER NOT NULL,
  rule_start_moves INTEGER NOT NULL,
  rule_pr_merged_completes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS local_task_project_prefixes (
  prefix TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES local_task_projects(id) ON DELETE CASCADE,
  is_current INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS local_task_project_prefixes_project
  ON local_task_project_prefixes(project_id);
CREATE TABLE IF NOT EXISTS local_task_statuses (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES local_task_projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS local_task_statuses_project ON local_task_statuses(project_id);
CREATE TABLE IF NOT EXISTS local_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES local_task_projects(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  criteria TEXT NOT NULL,
  status_id TEXT NOT NULL REFERENCES local_task_statuses(id),
  priority INTEGER NOT NULL,
  parent_id TEXT REFERENCES local_tasks(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  UNIQUE (project_id, number)
);
CREATE INDEX IF NOT EXISTS local_tasks_parent ON local_tasks(parent_id);
CREATE TABLE IF NOT EXISTS local_task_aliases (
  alias TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES local_tasks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS local_task_labels (
  task_id TEXT NOT NULL REFERENCES local_tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  PRIMARY KEY (task_id, label)
);
CREATE TABLE IF NOT EXISTS local_task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES local_tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  body TEXT,
  payload TEXT,
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE INDEX IF NOT EXISTS local_task_events_task ON local_task_events(task_id, created_at);
CREATE TABLE IF NOT EXISTS local_task_workspaces (
  task_id TEXT PRIMARY KEY REFERENCES local_tasks(id) ON DELETE CASCADE,
  host_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  instance_id TEXT,
  worktree_id TEXT,
  folder_workspace_id TEXT,
  repo_id TEXT,
  branch_snapshot TEXT,
  name_snapshot TEXT,
  host_label_snapshot TEXT,
  linked_via TEXT NOT NULL,
  linked_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS local_task_workspaces_instance
  ON local_task_workspaces(host_id, instance_id) WHERE instance_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS local_task_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES local_tasks(id) ON DELETE CASCADE,
  host_id TEXT NOT NULL,
  worktree_id TEXT,
  instance_id TEXT,
  surface TEXT NOT NULL,
  tab_id TEXT,
  pane_key TEXT UNIQUE,
  session_id TEXT,
  provider_session TEXT,
  agent TEXT,
  linked_via TEXT NOT NULL,
  opened_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS local_task_sessions_task ON local_task_sessions(task_id);
CREATE TABLE IF NOT EXISTS local_task_attention_state (
  item_key TEXT PRIMARY KEY,
  seen_at INTEGER,
  snoozed_until INTEGER
);
CREATE TABLE IF NOT EXISTS local_task_pending_replies (
  id TEXT PRIMARY KEY,
  task_session_id TEXT NOT NULL REFERENCES local_task_sessions(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  text TEXT NOT NULL,
  state TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE TABLE IF NOT EXISTS local_task_mutation_receipts (
  client_operation_id TEXT PRIMARY KEY,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS local_task_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/** Caller holds the IMMEDIATE transaction that also bumps `user_version`. */
export function applyLocalTasksSchema(database: SyncDatabase, storedVersion: number): void {
  if (storedVersion < 1) {
    database.exec(SCHEMA_V1)
  }
}
