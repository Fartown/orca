import type SyncDatabase from '../sqlite/sync-database'
import { toLocalTaskOwnedHostId } from '../../shared/local-tasks/local-task-endpoint-ids'
import {
  isPlaceInWorkspace,
  workspaceIdentityKey,
  type LocalTaskWorkspacePlace
} from './local-task-link-rows'
import { rowNullableString, rowString } from './local-tasks-sqlite-row'

type DroppedWorkspace = LocalTaskWorkspacePlace & { taskId: string }

/**
 * v4 → v5: every host id the library stores takes this Orca's one spelling (`local`, `ssh:` with
 * the target encoded), as writes store it since. Two links that become one workspace, or one host
 * session, keep the earliest link; a later workspace link goes with the sessions it held, and marks
 * of removed sessions go too. Foreign keys are off. On a library already spelled so it changes nothing.
 */
export function keepOwnedHostSpellings(database: SyncDatabase): void {
  keepOwnedLastHosts(database)
  removeWorkspaceSessions(database, keepOwnedWorkspaceHosts(database))
  keepOwnedSessionHosts(database)
  database.exec(`DELETE FROM local_task_attention_state
    WHERE task_session_id NOT IN (SELECT id FROM local_task_sessions)`)
}

/** A project's last host stays only in this Orca's own spelling, like the link rows. */
function keepOwnedLastHosts(database: SyncDatabase): void {
  const update = database.prepare(
    'UPDATE local_task_projects SET last_execution_host_id = ? WHERE id = ?'
  )
  for (const row of database
    .prepare(
      'SELECT id, last_execution_host_id FROM local_task_projects WHERE last_execution_host_id IS NOT NULL'
    )
    .all()) {
    const stored = rowString(row, 'last_execution_host_id')
    const owned = toLocalTaskOwnedHostId(stored)
    if (owned !== stored) {
      update.run(owned, rowString(row, 'id'))
    }
  }
}

/** Respells each workspace link and recomputes its identity; returns the later links it removed. */
function keepOwnedWorkspaceHosts(database: SyncDatabase): DroppedWorkspace[] {
  const remove = database.prepare('DELETE FROM local_task_workspaces WHERE task_id = ?')
  const identities = new Set<string>()
  const instances = new Set<string>()
  const kept: { taskId: string; hostId: string; identity: string }[] = []
  const dropped: DroppedWorkspace[] = []
  for (const row of database
    .prepare(
      `SELECT task_id, host_id, kind, instance_id, worktree_id, folder_workspace_id
       FROM local_task_workspaces ORDER BY linked_at, rowid`
    )
    .all()) {
    const taskId = rowString(row, 'task_id')
    const hostId = toLocalTaskOwnedHostId(rowString(row, 'host_id'))
    if (!hostId) {
      remove.run(taskId)
      continue
    }
    const place: LocalTaskWorkspacePlace = {
      hostId,
      kind: rowString(row, 'kind') === 'folder' ? 'folder' : 'git-worktree',
      instanceId: rowNullableString(row, 'instance_id'),
      worktreeId: rowNullableString(row, 'worktree_id'),
      folderWorkspaceId: rowNullableString(row, 'folder_workspace_id')
    }
    const identity = workspaceIdentityKey(place)
    const instance = place.instanceId ? JSON.stringify([hostId, place.instanceId]) : null
    if (identities.has(identity) || (instance !== null && instances.has(instance))) {
      remove.run(taskId)
      dropped.push({ ...place, taskId })
      continue
    }
    identities.add(identity)
    if (instance !== null) {
      instances.add(instance)
    }
    kept.push({ taskId, hostId, identity })
  }
  // Why two passes: a key stored on one row may be the one another row is about to take.
  database.exec(`UPDATE local_task_workspaces SET identity_key = 'respelling|' || task_id`)
  const update = database.prepare(
    'UPDATE local_task_workspaces SET host_id = ?, identity_key = ? WHERE task_id = ?'
  )
  for (const link of kept) {
    update.run(link.hostId, link.identity, link.taskId)
  }
  return dropped
}

/** What unlinking would remove: the task's and inheriting descendants' sessions in that workspace. */
function removeWorkspaceSessions(database: SyncDatabase, dropped: DroppedWorkspace[]): void {
  const family = database.prepare(
    `WITH RECURSIVE family(id) AS (
       SELECT ?
       UNION SELECT t.id FROM local_tasks t JOIN family f ON t.parent_id = f.id
         WHERE t.id NOT IN (SELECT task_id FROM local_task_workspaces)
     ) SELECT s.id, s.host_id, s.worktree_id, s.instance_id
       FROM local_task_sessions s JOIN family f ON s.task_id = f.id`
  )
  const remove = database.prepare('DELETE FROM local_task_sessions WHERE id = ?')
  for (const workspace of dropped) {
    for (const row of family.all(workspace.taskId)) {
      const place = {
        hostId: toLocalTaskOwnedHostId(rowString(row, 'host_id')) ?? '',
        worktreeId: rowNullableString(row, 'worktree_id'),
        instanceId: rowNullableString(row, 'instance_id')
      }
      if (isPlaceInWorkspace(place, workspace)) {
        remove.run(rowString(row, 'id'))
      }
    }
  }
}

/** Respells each session link; a later link to the same host session goes. */
function keepOwnedSessionHosts(database: SyncDatabase): void {
  const remove = database.prepare('DELETE FROM local_task_sessions WHERE id = ?')
  const claimed = new Set<string>()
  const respelled: { id: string; hostId: string }[] = []
  for (const row of database
    .prepare('SELECT id, host_id, session_id FROM local_task_sessions ORDER BY opened_at, rowid')
    .all()) {
    const id = rowString(row, 'id')
    const stored = rowString(row, 'host_id')
    const hostId = toLocalTaskOwnedHostId(stored)
    const sessionId = rowNullableString(row, 'session_id')
    const claim = hostId && sessionId !== null ? JSON.stringify([hostId, sessionId]) : null
    if (!hostId || (claim !== null && claimed.has(claim))) {
      remove.run(id)
      continue
    }
    if (claim !== null) {
      claimed.add(claim)
    }
    if (hostId !== stored) {
      respelled.push({ id, hostId })
    }
  }
  // Why after every removal: a respelled row may take the key a removed duplicate still held.
  const update = database.prepare('UPDATE local_task_sessions SET host_id = ? WHERE id = ?')
  for (const session of respelled) {
    update.run(session.hostId, session.id)
  }
}
