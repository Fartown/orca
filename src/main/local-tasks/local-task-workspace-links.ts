import { isLocalTaskOwnedHostId } from '../../shared/local-tasks/local-task-endpoint-ids'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../shared/local-tasks/local-task-link-types'
import type {
  LocalTaskEventSource,
  LocalTaskResult
} from '../../shared/local-tasks/local-task-types'
import type {
  LocalTasksLinksLinkWorkspaceInput,
  LocalTasksLinksResolveWorkspaceInput
} from '../../shared/local-tasks/local-tasks-link-rpc-params'
import type { LocalTasksDatabase } from './local-tasks-database'
import { appendLocalTaskEvent } from './local-task-event-store'
import {
  findWorkspaceOwner,
  isSameWorkspace,
  isSessionInWorkspace,
  localTaskRefusal,
  readTaskSessionLinks,
  readWorkspaceLink,
  workspaceIdentityKey,
  type LocalTaskWorkspacePlace
} from './local-task-link-rows'
import { applyLocalTaskStartRule } from './local-task-rules'
import { readLocalTask, readLocalTaskSubtreeIds } from './local-task-store'

type WorkspaceResult = LocalTaskResult<{ workspace: LocalTaskWorkspaceLink }>

/** Links a task (any level) to one workspace; a workspace belongs to at most one task. */
export function linkLocalTaskWorkspace(
  db: LocalTasksDatabase,
  input: LocalTasksLinksLinkWorkspaceInput,
  source: LocalTaskEventSource,
  now: number
): WorkspaceResult {
  const task = readLocalTask(db, input.taskId)
  if (!task) {
    return { ok: false, code: 'not_found' }
  }
  // Why: this Orca can judge and reach only its own machine and its own SSH targets.
  if (!isLocalTaskOwnedHostId(input.hostId)) {
    return { ok: false, code: 'host_not_owned' }
  }
  const place: LocalTaskWorkspacePlace = {
    hostId: input.hostId,
    kind: input.kind,
    instanceId: input.instanceId ?? null,
    worktreeId: input.worktreeId ?? null,
    folderWorkspaceId: input.kind === 'folder' ? (input.folderWorkspaceId ?? null) : null
  }
  const owner = findWorkspaceOwner(db, place, task.id)
  if (owner) {
    return localTaskRefusal('workspace_already_linked', readLocalTask(db, owner)?.ref)
  }
  const existing = readWorkspaceLink(db, task.id)
  if (existing && isSameWorkspace(existing, place)) {
    return { ok: true, workspace: existing }
  }
  if (existing && !input.replace) {
    return localTaskRefusal('task_has_workspace', existing.nameSnapshot)
  }
  if (existing) {
    removeFamilySessions(db, task.id, existing)
    db.prepare('DELETE FROM local_task_workspaces WHERE task_id = ?').run(task.id)
  }
  db.prepare(
    `INSERT INTO local_task_workspaces (task_id, host_id, kind, identity_key, instance_id,
       worktree_id, folder_workspace_id, repo_id, branch_snapshot, name_snapshot,
       host_label_snapshot, linked_via, linked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    task.id,
    place.hostId,
    place.kind,
    workspaceIdentityKey(place),
    place.instanceId,
    place.worktreeId,
    place.folderWorkspaceId,
    input.repoId ?? null,
    input.branchSnapshot ?? null,
    input.nameSnapshot ?? null,
    input.hostLabelSnapshot ?? null,
    input.linkedVia,
    now
  )
  appendLocalTaskEvent(db, {
    taskId: task.id,
    kind: 'workspace-linked',
    source,
    payload: {
      kind: place.kind,
      hostId: place.hostId,
      name: input.nameSnapshot ?? null,
      branch: input.branchSnapshot ?? null,
      hostLabel: input.hostLabelSnapshot ?? null,
      via: input.linkedVia,
      replaced: existing ? (existing.nameSnapshot ?? '') : null
    },
    now
  })
  db.touch('links')
  applyLocalTaskStartRule(db, task.id, now)
  const workspace = readWorkspaceLink(db, task.id)
  return workspace ? { ok: true, workspace } : { ok: false, code: 'not_found' }
}

/** A client fills in what it learned about a linked workspace: its instance, host or names. */
export function resolveLocalTaskWorkspace(
  db: LocalTasksDatabase,
  input: LocalTasksLinksResolveWorkspaceInput,
  source: LocalTaskEventSource,
  now: number
): WorkspaceResult {
  const existing = readWorkspaceLink(db, input.taskId)
  if (!existing) {
    return { ok: false, code: 'not_found' }
  }
  if (input.hostId !== undefined && !isLocalTaskOwnedHostId(input.hostId)) {
    return { ok: false, code: 'host_not_owned' }
  }
  const next: LocalTaskWorkspaceLink = {
    ...existing,
    hostId: input.hostId ?? existing.hostId,
    instanceId: input.instanceId ?? existing.instanceId,
    worktreeId: input.worktreeId ?? existing.worktreeId,
    branchSnapshot: input.branchSnapshot ?? existing.branchSnapshot,
    nameSnapshot: input.nameSnapshot ?? existing.nameSnapshot,
    hostLabelSnapshot: input.hostLabelSnapshot ?? existing.hostLabelSnapshot
  }
  if (JSON.stringify(next) === JSON.stringify(existing)) {
    return { ok: true, workspace: existing }
  }
  const owner = findWorkspaceOwner(db, next, existing.taskId)
  if (owner) {
    return localTaskRefusal('workspace_already_linked', readLocalTask(db, owner)?.ref)
  }
  db.prepare(
    `UPDATE local_task_workspaces SET host_id = ?, identity_key = ?, instance_id = ?,
       worktree_id = ?, branch_snapshot = ?, name_snapshot = ?, host_label_snapshot = ?
     WHERE task_id = ?`
  ).run(
    next.hostId,
    workspaceIdentityKey(next),
    next.instanceId,
    next.worktreeId,
    next.branchSnapshot,
    next.nameSnapshot,
    next.hostLabelSnapshot,
    existing.taskId
  )
  if (next.hostId !== existing.hostId) {
    appendLocalTaskEvent(db, {
      taskId: existing.taskId,
      kind: 'workspace-host',
      source,
      payload: {
        name: next.nameSnapshot,
        fromHostId: existing.hostId,
        toHostId: next.hostId,
        fromHostLabel: existing.hostLabelSnapshot,
        toHostLabel: next.hostLabelSnapshot
      },
      now
    })
  }
  db.touch('links')
  return { ok: true, workspace: next }
}

/** Drops the link and the family's session links in that workspace; the workspace itself stays. */
export function unlinkLocalTaskWorkspace(
  db: LocalTasksDatabase,
  taskId: string,
  source: LocalTaskEventSource,
  now: number
): LocalTaskResult<object> {
  if (!readLocalTask(db, taskId)) {
    return { ok: false, code: 'not_found' }
  }
  const existing = readWorkspaceLink(db, taskId)
  if (!existing) {
    return { ok: true }
  }
  const removedSessions = removeFamilySessions(db, taskId, existing)
  db.prepare('DELETE FROM local_task_workspaces WHERE task_id = ?').run(taskId)
  appendLocalTaskEvent(db, {
    taskId,
    kind: 'workspace-unlinked',
    source,
    payload: {
      name: existing.nameSnapshot,
      hostId: existing.hostId,
      hostLabel: existing.hostLabelSnapshot,
      removedSessions
    },
    now
  })
  db.touch('links')
  return { ok: true }
}

/**
 * The task's and its descendants' sessions that ran in this workspace. A descendant's sessions in
 * its own workspace, or from an earlier parent's, ran elsewhere and stay.
 */
function removeFamilySessions(
  db: LocalTasksDatabase,
  taskId: string,
  workspace: LocalTaskWorkspaceLink
): number {
  const doomed: LocalTaskSessionLink[] = readTaskSessionLinks(
    db,
    readLocalTaskSubtreeIds(db, taskId)
  ).filter((session) => isSessionInWorkspace(session, workspace))
  const remove = db.prepare('DELETE FROM local_task_sessions WHERE id = ?')
  for (const session of doomed) {
    remove.run(session.id)
  }
  if (doomed.length > 0) {
    db.touch('attention')
  }
  return doomed.length
}
