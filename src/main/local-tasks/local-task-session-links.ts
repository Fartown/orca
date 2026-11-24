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
import { toLocalTaskOwnedHostId } from '../../shared/local-tasks/local-task-endpoint-ids'
import { localTaskLinkWorkspaceId } from '../../shared/local-tasks/local-task-workspace-match'
import {
  localTaskForeignSessionHostId,
  localTaskSessionHostAliases,
  LocalTaskSessionExecutionOriginSchema
} from '../../shared/local-tasks/local-task-session-origin'
import { parsePaneKey } from '../../shared/workspace-layout/stable-pane-id'
import { worktreeIdsEqual } from '../../shared/worktree/id'
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

function sameExecutionSession(
  existing: LocalTaskSessionLink,
  input: LocalTasksLinksRecordSessionInput,
  hostId: string,
  selfInstallationId?: string | null
): boolean {
  if (
    existing.surface !== input.surface ||
    !localTaskSessionHostAliases(hostId, selfInstallationId).includes(existing.hostId) ||
    (input.worktreeId &&
      existing.worktreeId &&
      !worktreeIdsEqual(input.worktreeId, existing.worktreeId)) ||
    (input.instanceId && existing.instanceId && input.instanceId !== existing.instanceId)
  ) {
    return false
  }
  const oldTab = existing.tabId ?? (existing.paneKey ? parsePaneKey(existing.paneKey)?.tabId : null)
  const newTab = input.tabId ?? (input.paneKey ? parsePaneKey(input.paneKey)?.tabId : null)
  const identities = [
    [existing.sessionId, input.sessionId],
    [existing.paneKey, input.paneKey],
    [oldTab, newTab]
  ]
  return (
    identities.every(([oldId, newId]) => !oldId || !newId || oldId === newId) &&
    identities.some(([oldId, newId]) => Boolean(oldId && oldId === newId))
  )
}

/** Started sessions use the default workspace; manually linked external sessions keep their own. */
export function recordLocalTaskSession(
  db: LocalTasksDatabase,
  input: LocalTasksLinksRecordSessionInput,
  source: LocalTaskEventSource,
  now: number,
  selfInstallationId?: string | null
): SessionResult {
  const task = readLocalTask(db, input.taskId)
  if (!task) {
    return { ok: false, code: 'not_found' }
  }
  const parsedOrigin = input.executionOrigin
    ? LocalTaskSessionExecutionOriginSchema.safeParse(input.executionOrigin)
    : null
  if (parsedOrigin && !parsedOrigin.success) {
    return { ok: false, code: 'invalid_argument' }
  }
  const executionOrigin = parsedOrigin?.success ? parsedOrigin.data : undefined
  const foreignHostId = executionOrigin ? localTaskForeignSessionHostId(executionOrigin) : null
  if (
    executionOrigin &&
    (input.linkedVia !== 'manual' ||
      !input.worktreeId ||
      (input.hostId !== foreignHostId &&
        toLocalTaskOwnedHostId(input.hostId) !== toLocalTaskOwnedHostId(executionOrigin.hostId)))
  ) {
    return { ok: false, code: 'invalid_argument' }
  }
  const hostId = foreignHostId ?? toLocalTaskOwnedHostId(input.hostId)
  if (!hostId) {
    return { ok: false, code: 'host_not_owned' }
  }
  const replacing = input.replacingSessionLinkId
    ? readSessionLink(db, input.replacingSessionLinkId)
    : null
  if (input.replacingSessionLinkId) {
    if (input.linkedVia !== 'manual') {
      return { ok: false, code: 'invalid_argument' }
    }
    if (!replacing) {
      return { ok: false, code: 'not_found' }
    }
    if (!sameExecutionSession(replacing, input, hostId, selfInstallationId)) {
      return { ok: false, code: 'invalid_argument' }
    }
  }
  const workspace = readEffectiveWorkspaceLink(db, task.id)
  const worktreeId = input.worktreeId ?? replacing?.worktreeId ?? null
  const instanceId = input.instanceId ?? replacing?.instanceId ?? null
  if (!workspace && !executionOrigin) {
    return { ok: false, code: 'workspace_required' }
  }
  // Native starts retain workspace ownership checks; explicit external attachments move neither.
  const claimsForeignPlace =
    !executionOrigin &&
    workspace &&
    !isPlaceInWorkspace(
      {
        hostId,
        worktreeId,
        instanceId
      },
      workspace
    )
  if (claimsForeignPlace) {
    return { ok: false, code: 'invalid_argument' }
  }
  const tabId = input.tabId ?? replacing?.tabId ?? null
  const paneKey = input.paneKey ?? replacing?.paneKey ?? null
  const sessionId = input.sessionId ?? replacing?.sessionId ?? null
  const conflict = findSessionConflict(
    db,
    {
      paneKey,
      hostId,
      sessionId,
      tabId
    },
    replacing?.id ?? null,
    selfInstallationId
  )
  if (conflict) {
    return !replacing && conflict.taskId === task.id
      ? { ok: true, session: conflict }
      : localTaskRefusal('session_already_linked', readLocalTask(db, conflict.taskId)?.ref)
  }
  const firstForTask = readTaskSessionLinks(db, [task.id]).length === 0
  if (replacing) {
    const unlinked = unlinkLocalTaskSession(db, replacing.id, source, now)
    if (!unlinked.ok) {
      return unlinked
    }
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO local_task_sessions (id, task_id, host_id, worktree_id, instance_id, surface,
       tab_id, pane_key, session_id, provider_session, agent, linked_via, opened_at, execution_origin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    task.id,
    hostId,
    worktreeId ?? (workspace ? localTaskLinkWorkspaceId(workspace) : null),
    instanceId ?? (executionOrigin ? null : (workspace?.instanceId ?? null)),
    input.surface,
    tabId,
    paneKey,
    sessionId,
    input.providerSession ?? replacing?.providerSession ?? null,
    input.agent ?? replacing?.agent ?? null,
    input.linkedVia,
    now,
    executionOrigin ? JSON.stringify(executionOrigin) : null
  )
  appendLocalTaskEvent(db, {
    taskId: task.id,
    kind: 'session-linked',
    source,
    payload: {
      sessionLinkId: id,
      agent: input.agent ?? replacing?.agent ?? null,
      surface: input.surface,
      hostId,
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
  paneKey: string,
  selfInstallationId?: string | null
): boolean {
  const existing = readSessionLink(db, sessionLinkId)
  if (!existing || existing.executionOrigin || existing.paneKey !== null) {
    return false
  }
  const conflict = findSessionConflict(
    db,
    { paneKey, hostId: existing.hostId, sessionId: null },
    existing.id,
    selfInstallationId
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
