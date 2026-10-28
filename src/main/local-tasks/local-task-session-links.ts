import { randomUUID } from 'node:crypto'
import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../shared/local-tasks/local-task-link-types'
import type {
  LocalTaskEventSource,
  LocalTaskResult
} from '../../shared/local-tasks/local-task-types'
import type { LocalTasksLinksRecordSessionInput } from '../../shared/local-tasks/local-tasks-link-rpc-params'
import { isLocalTaskOwnedHostId } from '../../shared/local-tasks/local-task-endpoint-ids'
import type { LocalTasksDatabase } from './local-tasks-database'
import { appendLocalTaskEvent } from './local-task-event-store'
import {
  findSessionConflict,
  isPlaceInWorkspace,
  localTaskRefusal,
  readSessionLink,
  readTaskSessionLinks,
  readWorkspaceLink
} from './local-task-link-rows'
import { applyLocalTaskStartRule } from './local-task-rules'
import { readLocalTask, readLocalTaskLineageIds } from './local-task-store'

type SessionResult = LocalTaskResult<{ session: LocalTaskSessionLink }>

/** The workspace a task works in: its own, else the nearest ancestor's (REQ-009). */
export function readEffectiveWorkspaceLink(
  db: LocalTasksDatabase,
  taskId: string
): LocalTaskWorkspaceLink | null {
  for (const id of readLocalTaskLineageIds(db, taskId)) {
    const workspace = readWorkspaceLink(db, id)
    if (workspace) {
      return workspace
    }
  }
  return null
}

/** Records a session opened for a task; it runs in the task's effective workspace. */
export function recordLocalTaskSession(
  db: LocalTasksDatabase,
  input: LocalTasksLinksRecordSessionInput,
  source: LocalTaskEventSource,
  now: number
): SessionResult {
  const task = readLocalTask(db, input.taskId)
  if (!task) {
    return { ok: false, code: 'not_found' }
  }
  if (!isLocalTaskOwnedHostId(input.hostId)) {
    return { ok: false, code: 'host_not_owned' }
  }
  const workspace = readEffectiveWorkspaceLink(db, task.id)
  if (!workspace) {
    return { ok: false, code: 'workspace_required' }
  }
  // Why: a session the task shows must run in its effective workspace. A host/worktree/instance that
  // is none of the workspace's is rejected, so a mismatched caller cannot attach foreign work (D4).
  // A reparented task's existing sessions keep their own rows, never recorded anew here.
  const inWorkspaceHost = input.hostId === workspace.hostId
  const claimsForeignPlace = !isPlaceInWorkspace(
    {
      hostId: input.hostId,
      worktreeId: input.worktreeId ?? null,
      instanceId: input.instanceId ?? null
    },
    workspace
  )
  if (claimsForeignPlace) {
    return { ok: false, code: 'invalid_argument' }
  }
  const conflict = findSessionConflict(
    db,
    {
      paneKey: input.paneKey ?? null,
      hostId: input.hostId,
      sessionId: input.sessionId ?? null,
      tabId: input.tabId ?? null
    },
    null
  )
  if (conflict) {
    return conflict.taskId === task.id
      ? { ok: true, session: conflict }
      : localTaskRefusal('session_already_linked', readLocalTask(db, conflict.taskId)?.ref)
  }
  const firstForTask = readTaskSessionLinks(db, [task.id]).length === 0
  const id = randomUUID()
  db.prepare(
    `INSERT INTO local_task_sessions (id, task_id, host_id, worktree_id, instance_id, surface,
       tab_id, pane_key, session_id, provider_session, agent, linked_via, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    task.id,
    input.hostId,
    input.worktreeId ?? (inWorkspaceHost ? workspace.worktreeId : null),
    input.instanceId ?? (inWorkspaceHost ? workspace.instanceId : null),
    input.surface,
    input.tabId ?? null,
    input.paneKey ?? null,
    input.sessionId ?? null,
    input.providerSession ?? null,
    input.agent ?? null,
    input.linkedVia,
    now
  )
  appendLocalTaskEvent(db, {
    taskId: task.id,
    kind: 'session-linked',
    source,
    payload: {
      sessionLinkId: id,
      agent: input.agent ?? null,
      surface: input.surface,
      hostId: input.hostId,
      via: input.linkedVia
    },
    now
  })
  db.touch('links')
  if (firstForTask) {
    applyLocalTaskStartRule(db, task.id, now)
  }
  const session = readSessionLink(db, id)
  return session ? { ok: true, session } : { ok: false, code: 'not_found' }
}

/**
 * The host fills in a pane key it found for a session recorded by tab or session id alone. False
 * when the link is gone, already has one, or another link holds that pane.
 */
export function claimLocalTaskSessionPane(
  db: LocalTasksDatabase,
  sessionLinkId: string,
  paneKey: string
): boolean {
  const existing = readSessionLink(db, sessionLinkId)
  if (!existing || existing.paneKey !== null) {
    return false
  }
  const conflict = findSessionConflict(
    db,
    { paneKey, hostId: existing.hostId, sessionId: null },
    existing.id
  )
  if (conflict) {
    return false
  }
  db.prepare('UPDATE local_task_sessions SET pane_key = ? WHERE id = ?').run(paneKey, existing.id)
  db.touch('links')
  return true
}

/** Forgets the link only; the session keeps running on its host. */
export function unlinkLocalTaskSession(
  db: LocalTasksDatabase,
  sessionLinkId: string,
  source: LocalTaskEventSource,
  now: number
): LocalTaskResult<object> {
  const existing = readSessionLink(db, sessionLinkId)
  if (!existing) {
    return { ok: false, code: 'not_found' }
  }
  db.prepare('DELETE FROM local_task_sessions WHERE id = ?').run(existing.id)
  appendLocalTaskEvent(db, {
    taskId: existing.taskId,
    kind: 'session-unlinked',
    source,
    payload: { sessionLinkId: existing.id, agent: existing.agent, surface: existing.surface },
    now
  })
  db.touch('links')
  db.touch('attention')
  return { ok: true }
}
