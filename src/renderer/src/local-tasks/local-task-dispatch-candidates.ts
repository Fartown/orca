import type { AppState } from '@/store/types'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo,
  getFolderWorkspaceWorktree
} from '@/store/workspace-record-selectors'
import { selectLocalTaskHostLabel } from '@/local-tasks/local-task-host-label'
import { getRepoExecutionHostId, normalizeExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import { isFolderRepo } from '../../../shared/repo-kind'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import {
  localTaskClientId,
  localTaskEndpointForHost,
  localTaskIdEndpoint,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import { findLocalTaskEffectiveWorkspace } from './local-task-link-selectors'
import {
  localTaskWorktreeHostId,
  orcaProjectIdForRepo,
  reposForLocalTaskProject
} from './local-task-workspace-resolution'

export type LocalTaskDispatchCandidate =
  | {
      kind: 'workspace'
      id: string
      label: string
      detail: string
      hostId: string
      available: boolean
      worktree: Worktree
    }
  | {
      kind: 'repo'
      id: string
      label: string
      detail: string
      hostId: string
      available: boolean
      repo: Repo
      orcaProjectId: string
    }
  | {
      kind: 'task'
      id: string
      label: string
      detail: string
      hostId: string | null
      available: boolean
      task: LocalTask
      /** The workspace it works in, its own or an ancestor's; null before it has one. */
      workspaceName: string | null
    }
  | { kind: 'host'; id: string; label: string; detail: string; hostId: string; available: boolean }

export function localTaskDispatchCandidates(
  state: AppState,
  tasks: readonly LocalTask[],
  hostOptions: readonly { id: string; label: string; detail: string }[],
  links: LocalTaskLinks,
  writableEndpoints: readonly LocalTaskEndpointKey[]
): LocalTaskDispatchCandidate[] {
  const worktrees = [
    ...Object.values(selectWorktreesByRepo(state)).flat(),
    ...selectFolderWorkspaces(state).map((folder) => getFolderWorkspaceWorktree(folder))
  ]
  const workspaceRows: LocalTaskDispatchCandidate[] = worktrees
    .filter((worktree) => !worktree.isArchived && !worktree.isBare)
    .map((worktree) => {
      const hostId = localTaskWorktreeHostId(state, worktree)
      return {
        kind: 'workspace',
        id: `workspace:${hostId}:${worktree.id}`,
        label: worktree.displayName,
        detail: selectLocalTaskHostLabel(state, hostId),
        hostId,
        available: isLocalTaskHostInContact(state, hostId),
        worktree
      }
    })
  const endpoints = new Set([
    ...writableEndpoints,
    ...tasks.map((task) => localTaskIdEndpoint(task.id)),
    ...hostOptions
      .map((host) => localTaskEndpointForHost(host.id))
      .filter((id): id is LocalTaskEndpointKey => id !== null)
  ])
  const repos = new Map<string, Repo>()
  for (const repo of state.repos) {
    repos.set(`${getRepoExecutionHostId(repo)}:${repo.id}`, repo)
  }
  for (const endpoint of endpoints) {
    const catalog: LocalTaskProject = {
      id: localTaskClientId(endpoint, 'dispatch-catalog'),
      name: '',
      prefix: '',
      aliases: [],
      repos: [],
      defaultRepoId: null,
      lastExecutionHostId: null,
      rules: { startMovesToInProgress: false, prMergedCompletes: false },
      statuses: [],
      createdAt: 0,
      updatedAt: 0,
      revision: 0
    }
    for (const repo of reposForLocalTaskProject(state, catalog)) {
      repos.set(`${getRepoExecutionHostId(repo)}:${repo.id}`, repo)
    }
  }
  const repoRows: LocalTaskDispatchCandidate[] = [...repos.values()]
    .filter((repo) => !isFolderRepo(repo))
    .map((repo) => {
      const hostId = getRepoExecutionHostId(repo)
      return {
        kind: 'repo',
        id: `repo:${hostId}:${repo.id}`,
        label: repo.displayName,
        detail: selectLocalTaskHostLabel(state, hostId),
        hostId,
        available: isLocalTaskHostInContact(state, hostId),
        repo,
        orcaProjectId: orcaProjectIdForRepo(state, repo)
      }
    })
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  const taskRows: LocalTaskDispatchCandidate[] = tasks.map((task) => {
    const workspace = findLocalTaskEffectiveWorkspace(links, task, tasksById)
    const hostId = workspace?.hostId ?? null
    const displayHostId = hostId ? normalizeExecutionHostId(hostId) : null
    return {
      kind: 'task',
      id: `task:${task.id}`,
      label: `${task.ref} ${task.title}`,
      detail: displayHostId ? selectLocalTaskHostLabel(state, displayHostId) : '',
      hostId,
      available:
        writableEndpoints.includes(localTaskIdEndpoint(task.id)) &&
        hostId !== null &&
        isLocalTaskHostInContact(state, hostId),
      task,
      workspaceName: workspace
        ? ((workspace.worktreeId
            ? state.getKnownWorktreeById(workspace.worktreeId)?.displayName
            : undefined) ??
          workspace.nameSnapshot ??
          null)
        : null
    }
  })
  const hostRows: LocalTaskDispatchCandidate[] = hostOptions.map((host) => ({
    kind: 'host',
    id: `host:${host.id}`,
    label: host.label,
    detail: host.detail,
    hostId: host.id,
    available: isLocalTaskHostInContact(state, host.id)
  }))
  return [...workspaceRows, ...repoRows, ...taskRows, ...hostRows]
}

/** Picked targets as the live list has them now: a pick is a snapshot, and its host may drop. */
export function liveLocalTaskDispatchTargets(
  targets: readonly LocalTaskDispatchCandidate[],
  candidates: readonly LocalTaskDispatchCandidate[]
): LocalTaskDispatchCandidate[] {
  return targets.map(
    (target) =>
      candidates.find((candidate) => candidate.id === target.id) ?? { ...target, available: false }
  )
}
