import { randomUUID } from 'node:crypto'
import {
  DEFAULT_LOCAL_TASK_STATUSES,
  normalizeLocalTaskPrefix
} from '../../shared/local-tasks/local-task-model'
import { toLocalTaskOwnedHostId } from '../../shared/local-tasks/local-task-endpoint-ids'
import type { LocalTaskProject, LocalTaskResult } from '../../shared/local-tasks/local-task-types'
import type {
  LocalTasksProjectsCreateInput,
  LocalTasksProjectsUpdateInput
} from '../../shared/local-tasks/local-tasks-rpc-params'
import type { LocalTasksDatabase } from './local-tasks-database'
import {
  applyProjectPrefixChange,
  checkProjectPrefixChange,
  prefixOwnerName
} from './local-task-project-prefixes'
import { readLocalTaskProject } from './local-task-project-store'

export function createLocalTaskProject(
  db: LocalTasksDatabase,
  input: LocalTasksProjectsCreateInput,
  now: number
): LocalTaskResult<{ project: LocalTaskProject }> {
  const prefix = normalizeLocalTaskPrefix(input.prefix)
  if (!prefix) {
    return { ok: false, code: 'prefix_invalid' }
  }
  const prefixOwner = prefixOwnerName(db, prefix)
  if (prefixOwner !== null) {
    return { ok: false, code: 'prefix_taken', detail: prefixOwner }
  }
  const repos = input.repos ?? []
  const defaultRepoId = resolveDefaultRepo(repos, input.defaultRepoId, null)
  if (defaultRepoId === undefined) {
    return { ok: false, code: 'invalid_argument' }
  }
  const lastExecutionHostId = ownedLastHost(input.lastExecutionHostId ?? null)
  if (lastExecutionHostId === undefined) {
    return { ok: false, code: 'host_not_owned' }
  }
  const projectId = randomUUID()
  db.prepare(
    `INSERT INTO local_task_projects (id, name, default_repo_id, last_execution_host_id,
       next_number, rule_start_moves, rule_pr_merged_completes, created_at, updated_at, revision)
     VALUES (?, ?, ?, ?, 1, 1, 1, ?, ?, 0)`
  ).run(projectId, input.name, defaultRepoId, lastExecutionHostId, now, now)
  writeProjectRepos(db, projectId, repos)
  db.prepare(
    'INSERT INTO local_task_project_prefixes (prefix, project_id, is_current, created_at) VALUES (?, ?, 1, ?)'
  ).run(prefix, projectId, now)
  const insertStatus = db.prepare(
    'INSERT INTO local_task_statuses (id, project_id, category, name, color, position) VALUES (?, ?, ?, ?, ?, 0)'
  )
  for (const status of DEFAULT_LOCAL_TASK_STATUSES) {
    const name = input.statusNames?.[status.category] ?? status.name
    insertStatus.run(randomUUID(), projectId, status.category, name, status.color)
  }
  db.touch('projects')
  const project = readLocalTaskProject(db, projectId)
  if (!project) {
    throw new Error('local tasks: created project is missing')
  }
  return { ok: true, project }
}

export function updateLocalTaskProject(
  db: LocalTasksDatabase,
  input: LocalTasksProjectsUpdateInput,
  now: number
): LocalTaskResult<{ project: LocalTaskProject }> {
  const project = readLocalTaskProject(db, input.projectId)
  if (!project) {
    return { ok: false, code: 'not_found' }
  }
  if (input.expectedRevision !== undefined && input.expectedRevision !== project.revision) {
    return { ok: false, code: 'stale' }
  }
  // Why every check before the first write: a refused update must leave the project as it was.
  const prefixChange =
    input.prefix === undefined ? null : checkProjectPrefixChange(db, project, input.prefix)
  if (prefixChange && !prefixChange.ok) {
    return prefixChange
  }
  const rules = { ...project.rules, ...input.rules }
  const name = input.name ?? project.name
  const repos = input.repos ?? project.repos
  const reposChanged = repos.join('\n') !== project.repos.join('\n')
  const defaultRepoId = resolveDefaultRepo(repos, input.defaultRepoId, project.defaultRepoId)
  if (defaultRepoId === undefined) {
    return { ok: false, code: 'invalid_argument' }
  }
  const lastExecutionHostId =
    input.lastExecutionHostId === undefined
      ? project.lastExecutionHostId
      : ownedLastHost(input.lastExecutionHostId)
  if (lastExecutionHostId === undefined) {
    return { ok: false, code: 'host_not_owned' }
  }
  if (
    !prefixChange &&
    name === project.name &&
    rules.startMovesToInProgress === project.rules.startMovesToInProgress &&
    rules.prMergedCompletes === project.rules.prMergedCompletes &&
    !reposChanged &&
    defaultRepoId === project.defaultRepoId &&
    lastExecutionHostId === project.lastExecutionHostId
  ) {
    return { ok: true, project }
  }
  if (prefixChange) {
    applyProjectPrefixChange(db, project.id, prefixChange, now)
  }
  if (reposChanged) {
    writeProjectRepos(db, project.id, repos)
  }
  db.prepare(
    `UPDATE local_task_projects
     SET name = ?, rule_start_moves = ?, rule_pr_merged_completes = ?, default_repo_id = ?,
         last_execution_host_id = ?, updated_at = ?, revision = revision + 1
     WHERE id = ?`
  ).run(
    name,
    rules.startMovesToInProgress ? 1 : 0,
    rules.prMergedCompletes ? 1 : 0,
    defaultRepoId,
    lastExecutionHostId,
    now,
    project.id
  )
  db.touch('projects')
  if (prefixChange) {
    db.touch('tasks')
  }
  const updated = readLocalTaskProject(db, project.id)
  return updated ? { ok: true, project: updated } : { ok: false, code: 'not_found' }
}

export function removeLocalTaskProject(
  db: LocalTasksDatabase,
  projectId: string
): LocalTaskResult<object> {
  if (!readLocalTaskProject(db, projectId)) {
    return { ok: false, code: 'not_found' }
  }
  // Why: the project's tasks may own workspace/session links that cascade away; the link and
  // attention caches read those scopes and must be told, or a deleted project's chips linger.
  const hadLinks =
    db
      .prepare(
        `SELECT 1 FROM local_task_workspaces w JOIN local_tasks t ON t.id = w.task_id
         WHERE t.project_id = ? LIMIT 1`
      )
      .get(projectId) !== undefined ||
    db
      .prepare(
        `SELECT 1 FROM local_task_sessions s JOIN local_tasks t ON t.id = s.task_id
         WHERE t.project_id = ? LIMIT 1`
      )
      .get(projectId) !== undefined
  // Why: tasks first — they reference statuses, which the project row cascades away.
  db.prepare('DELETE FROM local_tasks WHERE project_id = ?').run(projectId)
  db.prepare('DELETE FROM local_task_projects WHERE id = ?').run(projectId)
  db.touch('projects')
  db.touch('tasks')
  if (hadLinks) {
    db.touch('links')
    db.touch('attention')
  }
  return { ok: true }
}

/** A last host as stored; undefined when it is no host this Orca owns. */
function ownedLastHost(requested: string | null): string | null | undefined {
  return requested === null ? null : (toLocalTaskOwnedHostId(requested) ?? undefined)
}

/**
 * The default after a write: the one asked for when it is listed, the current one while it stays
 * listed, else the first. `undefined` when the one asked for is not listed (or missing while some are).
 */
function resolveDefaultRepo(
  repos: readonly string[],
  requested: string | null | undefined,
  current: string | null
): string | null | undefined {
  if (requested !== undefined && requested !== null) {
    return repos.includes(requested) ? requested : undefined
  }
  if (requested === null && repos.length > 0) {
    return undefined
  }
  if (current !== null && repos.includes(current)) {
    return current
  }
  return repos[0] ?? null
}

function writeProjectRepos(db: LocalTasksDatabase, projectId: string, repos: readonly string[]) {
  db.prepare('DELETE FROM local_task_project_repos WHERE project_id = ?').run(projectId)
  const insert = db.prepare(
    'INSERT INTO local_task_project_repos (project_id, orca_project_id, position) VALUES (?, ?, ?)'
  )
  for (const [position, repo] of repos.entries()) {
    insert.run(projectId, repo, position)
  }
}
