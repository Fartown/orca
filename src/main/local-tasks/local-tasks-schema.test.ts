import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import SyncDatabase from '../sqlite/sync-database'
import { workspaceIdentityKey } from './local-task-link-rows'
import { getLocalTasksDatabasePath, LocalTasksDatabase } from './local-tasks-database'
import { LOCAL_TASKS_SCHEMA_VERSION } from './local-tasks-schema'
import { LocalTasksService } from './local-tasks-service'

// The library exactly as the slice-1 build created it (commit 6971551474), frozen here.
const SLICE_1_SCHEMA = `
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

// Two tasks a slice-1 build linked to one worktree, and a seen mark that names no session.
const SLICE_1_ROWS = `
INSERT INTO local_task_projects VALUES ('p', 'Shop', 'orca-shop', NULL, NULL, 3, 1, 1, 1, 1, 0);
INSERT INTO local_task_project_prefixes VALUES ('SHOP', 'p', 1, 1);
INSERT INTO local_task_statuses VALUES ('todo', 'p', 'unstarted', 'Todo', 'gray', 0),
  ('doing', 'p', 'started', 'Doing', 'yellow', 0);
INSERT INTO local_tasks VALUES ('t1', 'p', 1, 'One', '', '[]', 'todo', 0, NULL, 1, 1, 0);
INSERT INTO local_tasks VALUES ('t2', 'p', 2, 'Two', '', '[]', 'todo', 0, NULL, 1, 1, 0);
INSERT INTO local_task_workspaces (task_id, host_id, kind, worktree_id, linked_via, linked_at)
  VALUES ('t1', 'local', 'git-worktree', 'repo::/work/shop', 'start', 1),
         ('t2', 'local', 'git-worktree', 'repo::/work/shop', 'manual', 2);
INSERT INTO local_task_attention_state (item_key, seen_at) VALUES ('tab:leaf@1', 1);
`

const SHOP_WORKTREE = 'repo::/work/shop'
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function sliceOneLibrary(stampedVersion: number): string {
  const directory = mkdtempSync(join(tmpdir(), 'local-tasks-schema-'))
  directories.push(directory)
  const path = getLocalTasksDatabasePath('profile', directory)
  mkdirSync(dirname(path), { recursive: true })
  const old = new SyncDatabase(path)
  old.exec(SLICE_1_SCHEMA)
  old.exec(SLICE_1_ROWS)
  if (stampedVersion === 2) {
    // What the v2 build did to it: receipt columns only, then stamped 2.
    old.exec(`ALTER TABLE local_task_mutation_receipts ADD COLUMN method TEXT NOT NULL DEFAULT '';
      ALTER TABLE local_task_mutation_receipts ADD COLUMN params_hash TEXT NOT NULL DEFAULT '';`)
  }
  old.pragma(`user_version = ${stampedVersion}`)
  old.close()
  return directory
}

// What the slice-2 build (v3) left: one Orca project per task project, replies, a paired server's links.
const SLICE_2_ROWS = `
INSERT INTO local_task_sessions (id, task_id, host_id, worktree_id, surface, tab_id, pane_key,
  linked_via, opened_at)
  VALUES ('s-local', 't1', 'local', 'repo::/work/shop', 'terminal', 'tab-1', 'tab-1:leaf-1', 'start', 1),
         ('s-server', 't2', 'runtime:env-1', NULL, 'host-published', 'web-terminal-x', NULL, 'start', 1);
INSERT INTO local_task_workspaces (task_id, host_id, kind, identity_key, worktree_id, linked_via, linked_at)
  VALUES ('t2', 'runtime:env-1', 'git-worktree', 'runtime:env-1|srv', 'repo::/srv/shop', 'start', 2);
INSERT INTO local_task_attention_state (item_key, task_session_id, seen_at, created_at)
  VALUES ('tab-1:leaf-1@5', 's-local', 5, 5), ('server@5', 's-server', 5, 5);
INSERT INTO local_task_pending_replies (id, task_session_id, item_key, text, state, source, created_at)
  VALUES ('r', 's-local', 'tab-1:leaf-1@5', 'Go', 'waiting', 'mobile', 1);
`

function libraryAt(stampedVersion: number): string {
  const directory = sliceOneLibrary(stampedVersion)
  if (stampedVersion === 3) {
    // Opening it once as v3 would need the v3 build; its upgrade of a slice-1 file is the same steps.
    const path = getLocalTasksDatabasePath('profile', directory)
    const old = new SyncDatabase(path)
    old.exec(`ALTER TABLE local_task_mutation_receipts ADD COLUMN method TEXT NOT NULL DEFAULT '';
      ALTER TABLE local_task_mutation_receipts ADD COLUMN params_hash TEXT NOT NULL DEFAULT '';
      ALTER TABLE local_task_workspaces ADD COLUMN identity_key TEXT NOT NULL DEFAULT '';
      DELETE FROM local_task_workspaces WHERE task_id = 't2';
      DROP TABLE local_task_attention_state;
      CREATE TABLE local_task_attention_state (
        item_key TEXT PRIMARY KEY,
        task_session_id TEXT NOT NULL REFERENCES local_task_sessions(id) ON DELETE CASCADE,
        seen_at INTEGER, snoozed_until INTEGER, created_at INTEGER NOT NULL);
      ALTER TABLE local_task_pending_replies ADD COLUMN source TEXT NOT NULL DEFAULT 'desktop';`)
    old.prepare("UPDATE local_task_workspaces SET identity_key = ? WHERE task_id = 't1'").run(
      workspaceIdentityKey({
        hostId: 'local',
        kind: 'git-worktree',
        instanceId: null,
        worktreeId: SHOP_WORKTREE,
        folderWorkspaceId: null
      })
    )
    old.exec(SLICE_2_ROWS)
    old.pragma('user_version = 3')
    old.close()
  }
  return directory
}

describe('local tasks schema upgrade', () => {
  it.each([1, 2, 3])('brings a library stamped v%i to the host-owned model', (stamped) => {
    const db = LocalTasksDatabase.open('profile', libraryAt(stamped))
    const service = new LocalTasksService(db, () => 1_000_000)
    const work = service.execution
    expect(db.prepare('PRAGMA user_version').get()).toEqual({
      user_version: LOCAL_TASKS_SCHEMA_VERSION
    })
    // The project's one Orca project became its first and default repo; its tasks and statuses stayed.
    expect(service.listProjects().projects).toMatchObject([
      { id: 'p', prefix: 'SHOP', repos: ['orca-shop'], defaultRepoId: 'orca-shop' }
    ])
    expect(service.listTasks().tasks.map((task) => task.ref)).toEqual(['SHOP-1', 'SHOP-2'])
    // Only links to this Orca's own hosts remain; the earlier of two links to one worktree wins.
    expect(work.listLinks().workspaces.map((link) => [link.taskId, link.hostId])).toEqual([
      ['t1', 'local']
    ])
    expect(db.prepare('SELECT identity_key FROM local_task_workspaces').all()).toEqual([
      {
        identity_key: workspaceIdentityKey({
          hostId: 'local',
          kind: 'git-worktree',
          instanceId: null,
          worktreeId: SHOP_WORKTREE,
          folderWorkspaceId: null
        })
      }
    ])
    expect(work.listLinks().sessions.map((session) => session.id)).toEqual(
      stamped === 3 ? ['s-local'] : []
    )
    expect(
      db.prepare('SELECT item_key FROM local_task_attention_state ORDER BY item_key').all()
    ).toEqual(stamped === 3 ? [{ item_key: 'tab-1:leaf-1@5' }] : [])
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'local_task_pending_replies'").all()
    ).toEqual([])
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })

    // The old one-project-per-repo rule is gone, and the library still cascades.
    expect(
      service.createProject({
        clientOperationId: 'again',
        name: 'Shop again',
        prefix: 'AGAIN',
        repos: ['orca-shop']
      })
    ).toMatchObject({ ok: true })
    const link = (taskId: string, worktreeId: string, clientOperationId: string) =>
      work.linkWorkspace(
        {
          clientOperationId,
          taskId,
          hostId: 'local',
          kind: 'git-worktree',
          worktreeId,
          nameSnapshot: 'shop',
          linkedVia: 'manual'
        },
        'desktop'
      )
    expect(link('t2', SHOP_WORKTREE, 'link-taken')).toMatchObject({
      ok: false,
      code: 'workspace_already_linked'
    })
    expect(link('t2', 'repo::/work/shop-2', 'link-free')).toMatchObject({ ok: true })
    expect(service.removeProject({ clientOperationId: 'remove', projectId: 'p' })).toEqual({
      ok: true
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM local_task_statuses').get()).toEqual({
      count: 6
    })
    db.close()
  })
})
