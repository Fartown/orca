import type SyncDatabase from '../sqlite/sync-database'
import type { LocalTaskWorkspaceKind } from '../../shared/local-tasks/local-task-link-types'
import { workspaceIdentityKey } from './local-task-link-rows'
import { rowNullableString, rowString } from './local-tasks-sqlite-row'

export const LOCAL_TASKS_SCHEMA_VERSION = 4

// Why default_repo_id is an Orca project id: since v4 it names one of the project's linked repos.
const PROJECT_COLUMNS = `  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_repo_id TEXT,
  last_execution_host_id TEXT,
  next_number INTEGER NOT NULL,
  rule_start_moves INTEGER NOT NULL,
  rule_pr_merged_completes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL`

// Every table and index at the latest version. All `IF NOT EXISTS`: an upgraded library first gets
// the columns older builds lacked, then this list adds whatever tables and indexes are still missing.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_task_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  task_host_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS local_task_projects (
${PROJECT_COLUMNS}
);
CREATE TABLE IF NOT EXISTS local_task_project_repos (
  project_id TEXT NOT NULL REFERENCES local_task_projects(id) ON DELETE CASCADE,
  orca_project_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (project_id, orca_project_id)
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
  identity_key TEXT NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS local_task_workspaces_identity
  ON local_task_workspaces(identity_key);
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
CREATE UNIQUE INDEX IF NOT EXISTS local_task_sessions_host_session
  ON local_task_sessions(host_id, session_id) WHERE session_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS local_task_attention_state (
  item_key TEXT PRIMARY KEY,
  task_session_id TEXT NOT NULL REFERENCES local_task_sessions(id) ON DELETE CASCADE,
  seen_at INTEGER,
  snoozed_until INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS local_task_attention_state_session
  ON local_task_attention_state(task_session_id);
CREATE TABLE IF NOT EXISTS local_task_pr_triggers (
  task_id TEXT NOT NULL REFERENCES local_tasks(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, provider, pr_number)
);
CREATE TABLE IF NOT EXISTS local_task_mutation_receipts (
  client_operation_id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS local_task_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

function hasColumn(database: SyncDatabase, table: string, column: string): boolean {
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => rowString(row, 'name') === column)
}

function backfillWorkspaceIdentity(database: SyncDatabase): void {
  database.exec(
    "ALTER TABLE local_task_workspaces ADD COLUMN identity_key TEXT NOT NULL DEFAULT ''"
  )
  const update = database.prepare(
    'UPDATE local_task_workspaces SET identity_key = ? WHERE task_id = ?'
  )
  for (const row of database
    .prepare(
      `SELECT task_id, host_id, kind, instance_id, worktree_id, folder_workspace_id
       FROM local_task_workspaces`
    )
    .all()) {
    const kind: LocalTaskWorkspaceKind =
      rowString(row, 'kind') === 'folder' ? 'folder' : 'git-worktree'
    const key = workspaceIdentityKey({
      hostId: rowString(row, 'host_id'),
      kind,
      instanceId: rowNullableString(row, 'instance_id'),
      worktreeId: rowNullableString(row, 'worktree_id'),
      folderWorkspaceId: rowNullableString(row, 'folder_workspace_id')
    })
    update.run(key, rowString(row, 'task_id'))
  }
  // Why: one workspace belongs to one task; the earliest link keeps it, as linkWorkspace would have.
  database.exec(`DELETE FROM local_task_workspaces AS w WHERE EXISTS (
    SELECT 1 FROM local_task_workspaces e WHERE e.identity_key = w.identity_key
      AND (e.linked_at < w.linked_at OR (e.linked_at = w.linked_at AND e.rowid < w.rowid)))`)
}

/**
 * Brings a slice-1 development library (v1, or v2 stamped without slice 2's columns) to the v3
 * structure. Each step checks the live table, so any mix of those builds converges.
 */
function upgradeSliceOneTables(database: SyncDatabase): void {
  if (!hasColumn(database, 'local_task_mutation_receipts', 'method')) {
    database.exec(`ALTER TABLE local_task_mutation_receipts ADD COLUMN method TEXT NOT NULL DEFAULT '';
      ALTER TABLE local_task_mutation_receipts ADD COLUMN params_hash TEXT NOT NULL DEFAULT '';`)
  }
  if (!hasColumn(database, 'local_task_workspaces', 'identity_key')) {
    backfillWorkspaceIdentity(database)
  }
  // Why drop: v1 marks name no session, and a REFERENCES column cannot be added with a default.
  if (!hasColumn(database, 'local_task_attention_state', 'task_session_id')) {
    database.exec('DROP TABLE local_task_attention_state')
  }
  // Why: the schema's session-id index is unique; a later duplicate keeps its row, not the id.
  database.exec(`UPDATE local_task_sessions SET session_id = NULL WHERE session_id IS NOT NULL
    AND rowid NOT IN (SELECT MIN(rowid) FROM local_task_sessions
      WHERE session_id IS NOT NULL GROUP BY host_id, session_id)`)
}

/**
 * v3 → v4 (D-008), lossy as unpublished development libraries allow: a project links any number of
 * Orca projects, and the library holds only host ids its own Orca owns. Replies, links to another
 * Orca's hosts and receipts of the old result shapes go. The caller turned foreign keys off.
 */
function upgradeToHostOwnedLibrary(database: SyncDatabase): void {
  database.exec('DROP TABLE IF EXISTS local_task_pending_replies')
  if (hasColumn(database, 'local_task_projects', 'orca_project_id')) {
    database.exec(`CREATE TABLE local_task_projects_v4 (
${PROJECT_COLUMNS}
);
INSERT INTO local_task_projects_v4 (id, name, default_repo_id, last_execution_host_id, next_number,
  rule_start_moves, rule_pr_merged_completes, created_at, updated_at, revision)
  SELECT id, name, orca_project_id, last_execution_host_id, next_number, rule_start_moves,
    rule_pr_merged_completes, created_at, updated_at, revision FROM local_task_projects;
CREATE TABLE local_task_project_repos (
  project_id TEXT NOT NULL REFERENCES local_task_projects(id) ON DELETE CASCADE,
  orca_project_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (project_id, orca_project_id)
);
INSERT INTO local_task_project_repos (project_id, orca_project_id, position)
  SELECT id, orca_project_id, 0 FROM local_task_projects;
DROP TABLE local_task_projects;
ALTER TABLE local_task_projects_v4 RENAME TO local_task_projects;`)
  }
  const foreignHost = "host_id != 'local' AND host_id NOT LIKE 'ssh:%'"
  database.exec(`DELETE FROM local_task_sessions WHERE ${foreignHost};
DELETE FROM local_task_workspaces WHERE ${foreignHost};
DELETE FROM local_task_mutation_receipts;`)
  // Why by hand: foreign keys are off, so the deleted sessions' marks do not cascade.
  if (hasColumn(database, 'local_task_attention_state', 'task_session_id')) {
    database.exec(`DELETE FROM local_task_attention_state
      WHERE task_session_id NOT IN (SELECT id FROM local_task_sessions)`)
  }
}

/**
 * Caller holds the IMMEDIATE transaction that also bumps `user_version`, with foreign keys off so
 * a rebuilt parent table never cascades into its children; it checks them before COMMIT.
 */
export function applyLocalTasksSchema(database: SyncDatabase, storedVersion: number): void {
  if (storedVersion >= 1 && storedVersion < 3) {
    upgradeSliceOneTables(database)
  }
  if (storedVersion >= 1 && storedVersion < 4) {
    upgradeToHostOwnedLibrary(database)
  }
  database.exec(SCHEMA)
}
