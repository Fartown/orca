import type {
  LocalTaskLinkOrigin,
  LocalTaskLinks,
  LocalTaskSessionLink,
  LocalTaskSessionSurface,
  LocalTaskWorkspaceKind,
  LocalTaskWorkspaceLink
} from '../../shared/local-tasks/local-task-link-types'
import type {
  LocalTaskFailure,
  LocalTaskFailureCode
} from '../../shared/local-tasks/local-task-types'
import { worktreeIdentityKey, worktreeIdsEqual } from '../../shared/worktree/id'
import type { SqliteRow } from '../sqlite/sqlite-statement'
import type { LocalTasksDatabase } from './local-tasks-database'
import { rowNullableString, rowNumber, rowString } from './local-tasks-sqlite-row'

const WORKSPACE_KINDS: readonly LocalTaskWorkspaceKind[] = ['git-worktree', 'folder']
const SURFACES: readonly LocalTaskSessionSurface[] = ['terminal', 'chat']
const ORIGINS: readonly LocalTaskLinkOrigin[] = ['start', 'manual']

const WORKSPACE_COLUMNS = `task_id, host_id, kind, instance_id, worktree_id, folder_workspace_id,
  repo_id, branch_snapshot, name_snapshot, host_label_snapshot, linked_via, linked_at`
const SESSION_COLUMNS = `id, task_id, host_id, worktree_id, instance_id, surface, tab_id, pane_key,
  session_id, provider_session, agent, linked_via, opened_at`

/** Where a workspace lives; enough to tell two links apart. */
export type LocalTaskWorkspacePlace = Pick<
  LocalTaskWorkspaceLink,
  'hostId' | 'kind' | 'instanceId' | 'worktreeId' | 'folderWorkspaceId'
>

export function localTaskRefusal(
  code: LocalTaskFailureCode,
  detail?: string | null
): LocalTaskFailure {
  return detail ? { ok: false, code, detail } : { ok: false, code }
}

/**
 * Persisted only as the unique-index guard; owner lookups compare with `worktreeIdsEqual`, so a
 * later change to path normalization cannot let two tasks claim one workspace.
 */
export function workspaceIdentityKey(place: LocalTaskWorkspacePlace): string {
  return place.kind === 'folder'
    ? `${place.hostId}|folder:${place.folderWorkspaceId ?? ''}`
    : `${place.hostId}|${worktreeIdentityKey(place.worktreeId ?? '')}`
}

export function isSameWorkspace(
  left: LocalTaskWorkspacePlace,
  right: LocalTaskWorkspacePlace
): boolean {
  // Why instance first: a durable instance id is the one identity that survives a host move, so two
  // links that share it are the same workspace even after it is reassigned to another host (D3).
  if (left.instanceId && right.instanceId && left.instanceId === right.instanceId) {
    return true
  }
  if (left.hostId !== right.hostId) {
    return false
  }
  if (left.kind !== right.kind) {
    return false
  }
  return left.kind === 'folder'
    ? left.folderWorkspaceId === right.folderWorkspaceId
    : !!left.worktreeId && !!right.worktreeId && worktreeIdsEqual(left.worktreeId, right.worktreeId)
}

/** The task whose link already names this workspace, other than `exceptTaskId`. */
export function findWorkspaceOwner(
  db: LocalTasksDatabase,
  place: LocalTaskWorkspacePlace,
  exceptTaskId: string
): string | null {
  // Why the instance clause: a workspace moved to another host keeps its durable instance id, so a
  // second task must not claim it there while the first still holds the pre-move host row (D3).
  const rows = db
    .prepare(
      `SELECT ${WORKSPACE_COLUMNS} FROM local_task_workspaces
       WHERE task_id != ? AND (host_id = ? OR (instance_id IS NOT NULL AND instance_id = ?))`
    )
    .all(exceptTaskId, place.hostId, place.instanceId ?? null)
  for (const row of rows) {
    const link = toWorkspaceLink(row)
    if (link && isSameWorkspace(link, place)) {
      return link.taskId
    }
  }
  return null
}

/** Whether a session ran in this workspace; a session that cannot say is taken to be in it. */
export function isSessionInWorkspace(
  session: LocalTaskSessionLink,
  workspace: LocalTaskWorkspacePlace
): boolean {
  return isPlaceInWorkspace(
    { hostId: session.hostId, worktreeId: session.worktreeId, instanceId: session.instanceId },
    workspace
  )
}

/** The host/worktree/instance of a would-be session, as much as the caller knows. */
export type LocalTaskSessionPlace = {
  hostId: string
  worktreeId: string | null
  instanceId: string | null
}

/** Whether a session place belongs to this workspace; an unknowable place is taken to be in it. */
export function isPlaceInWorkspace(
  place: LocalTaskSessionPlace,
  workspace: LocalTaskWorkspacePlace
): boolean {
  if (place.hostId !== workspace.hostId) {
    return false
  }
  if (place.instanceId && workspace.instanceId) {
    return place.instanceId === workspace.instanceId
  }
  if (place.worktreeId && workspace.worktreeId) {
    return worktreeIdsEqual(place.worktreeId, workspace.worktreeId)
  }
  return true
}

export function readLocalTaskLinks(db: LocalTasksDatabase): LocalTaskLinks {
  return {
    workspaces: db
      .prepare(`SELECT ${WORKSPACE_COLUMNS} FROM local_task_workspaces ORDER BY linked_at`)
      .all()
      .flatMap((row) => {
        const link = toWorkspaceLink(row)
        return link ? [link] : []
      }),
    sessions: readSessionRows(
      db,
      `SELECT ${SESSION_COLUMNS} FROM local_task_sessions ORDER BY opened_at`
    )
  }
}

export function readWorkspaceLink(
  db: LocalTasksDatabase,
  taskId: string
): LocalTaskWorkspaceLink | null {
  const row = db
    .prepare(`SELECT ${WORKSPACE_COLUMNS} FROM local_task_workspaces WHERE task_id = ?`)
    .get(taskId)
  return row ? toWorkspaceLink(row) : null
}

export function readSessionLink(
  db: LocalTasksDatabase,
  sessionLinkId: string
): LocalTaskSessionLink | null {
  return (
    readSessionRows(
      db,
      `SELECT ${SESSION_COLUMNS} FROM local_task_sessions WHERE id = ?`,
      sessionLinkId
    )[0] ?? null
  )
}

export function readTaskSessionLinks(
  db: LocalTasksDatabase,
  taskIds: string[]
): LocalTaskSessionLink[] {
  return taskIds.flatMap((taskId) =>
    readSessionRows(
      db,
      `SELECT ${SESSION_COLUMNS} FROM local_task_sessions WHERE task_id = ?`,
      taskId
    )
  )
}

/** A link already holding this pane or host session, other than `exceptId`. */
export function findSessionConflict(
  db: LocalTasksDatabase,
  claim: {
    paneKey: string | null
    hostId: string
    sessionId: string | null
    /** A terminal recorded by tab before its pane key resolves; two such records on one tab clash. */
    tabId?: string | null
  },
  exceptId: string | null
): LocalTaskSessionLink | null {
  const candidates = [
    ...(claim.paneKey
      ? readSessionRows(
          db,
          `SELECT ${SESSION_COLUMNS} FROM local_task_sessions WHERE pane_key = ?`,
          claim.paneKey
        )
      : []),
    ...(claim.sessionId
      ? readSessionRows(
          db,
          `SELECT ${SESSION_COLUMNS} FROM local_task_sessions WHERE host_id = ? AND session_id = ?`,
          claim.hostId,
          claim.sessionId
        )
      : []),
    // Why pane_key IS NULL: once a pane key lands the pane_key index owns dedup; this only closes the
    // window where a terminal tab is recorded for two tasks before either resolves its pane (D5).
    ...(claim.tabId && !claim.paneKey
      ? readSessionRows(
          db,
          `SELECT ${SESSION_COLUMNS} FROM local_task_sessions
           WHERE host_id = ? AND tab_id = ? AND pane_key IS NULL`,
          claim.hostId,
          claim.tabId
        )
      : [])
  ]
  return candidates.find((session) => session.id !== exceptId) ?? null
}

function readSessionRows(
  db: LocalTasksDatabase,
  sql: string,
  ...params: string[]
): LocalTaskSessionLink[] {
  return db
    .prepare(sql)
    .all(...params)
    .flatMap((row) => {
      const link = toSessionLink(row)
      return link ? [link] : []
    })
}

function toWorkspaceLink(row: SqliteRow): LocalTaskWorkspaceLink | null {
  const kind = WORKSPACE_KINDS.find((candidate) => candidate === rowString(row, 'kind'))
  const linkedVia = ORIGINS.find((candidate) => candidate === rowString(row, 'linked_via'))
  if (!kind || !linkedVia) {
    return null
  }
  return {
    taskId: rowString(row, 'task_id'),
    hostId: rowString(row, 'host_id'),
    kind,
    instanceId: rowNullableString(row, 'instance_id'),
    worktreeId: rowNullableString(row, 'worktree_id'),
    folderWorkspaceId: rowNullableString(row, 'folder_workspace_id'),
    repoId: rowNullableString(row, 'repo_id'),
    branchSnapshot: rowNullableString(row, 'branch_snapshot'),
    nameSnapshot: rowNullableString(row, 'name_snapshot'),
    hostLabelSnapshot: rowNullableString(row, 'host_label_snapshot'),
    linkedVia,
    linkedAt: rowNumber(row, 'linked_at')
  }
}

function toSessionLink(row: SqliteRow): LocalTaskSessionLink | null {
  const surface = SURFACES.find((candidate) => candidate === rowString(row, 'surface'))
  const linkedVia = ORIGINS.find((candidate) => candidate === rowString(row, 'linked_via'))
  if (!surface || !linkedVia) {
    return null
  }
  return {
    id: rowString(row, 'id'),
    taskId: rowString(row, 'task_id'),
    hostId: rowString(row, 'host_id'),
    worktreeId: rowNullableString(row, 'worktree_id'),
    instanceId: rowNullableString(row, 'instance_id'),
    surface,
    tabId: rowNullableString(row, 'tab_id'),
    paneKey: rowNullableString(row, 'pane_key'),
    sessionId: rowNullableString(row, 'session_id'),
    providerSession: rowNullableString(row, 'provider_session'),
    agent: rowNullableString(row, 'agent'),
    linkedVia,
    openedAt: rowNumber(row, 'opened_at')
  }
}
