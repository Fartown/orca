import type { AppState } from '@/store/types'
import { getAuthoritativelyRemovedWorktreeIds } from '@/store/slices/worktrees/listing/authoritative-worktree-removal-memory'
import {
  selectDetectedWorktreesByRepo,
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspace-record-selectors'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import {
  getRepoWorkspaceCreationTargetHint,
  type WorkspaceCreationTargetHint
} from '@/lib/project-host-workspace-target'
import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import { getProjectHostSetupForRepo } from '../../../shared/project-host-setup-lookup'
import { findFolderWorkspaceCandidateRepos } from '../../../shared/folder-workspace-execution-host'
import { isFolderRepo } from '../../../shared/repo-kind'
import type { Repo } from '../../../shared/repo-types'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import type { Worktree } from '../../../shared/worktree/types'
import type { LocalTaskWorkspaceLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { localTaskLinkWorkspaceId } from '../../../shared/local-tasks/local-task-workspace-match'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import {
  localTaskEndpointForHost,
  localTaskIdEndpoint,
  type LocalTaskEndpointKey
} from './local-task-endpoints'

type LinkPlace = Pick<
  LocalTaskWorkspaceLink,
  'hostId' | 'kind' | 'instanceId' | 'worktreeId' | 'folderWorkspaceId' | 'repoId'
>

export { localTaskLinkWorkspaceId }

export function localTaskWorktreeHostId(
  state: AppState,
  worktree: Pick<Worktree, 'id' | 'hostId'>
): ExecutionHostId {
  return (
    normalizeExecutionHostId(worktree.hostId) ?? getExecutionHostIdForWorktree(state, worktree.id)
  )
}

const instanceIndexes = new WeakMap<AppState['worktreesByRepo'], Map<string, Worktree[]>>()

function worktreesByInstanceId(state: AppState): Map<string, Worktree[]> {
  const worktreesByRepo = selectWorktreesByRepo(state)
  const cached = instanceIndexes.get(worktreesByRepo)
  if (cached) {
    return cached
  }
  const index = new Map<string, Worktree[]>()
  for (const worktrees of Object.values(worktreesByRepo)) {
    for (const worktree of worktrees) {
      if (worktree.instanceId) {
        index.set(worktree.instanceId, [...(index.get(worktree.instanceId) ?? []), worktree])
      }
    }
  }
  instanceIndexes.set(worktreesByRepo, index)
  return index
}

/**
 * Deleted only on a host's own word: an authoritative scan of the repo on that exact host, or the
 * removal it just reported. A fallback listing or a disconnected host proves nothing.
 */
function isProvenRemoved(state: AppState, link: LinkPlace, hostId: ExecutionHostId): boolean {
  const workspaceId = localTaskLinkWorkspaceId(link)
  if (!workspaceId) {
    return false
  }
  if (link.kind === 'folder') {
    // Why local only: a remote host's folder catalog can still be loading.
    return hostId === LOCAL_EXECUTION_HOST_ID
  }
  if (getAuthoritativelyRemovedWorktreeIds(hostId)?.has(workspaceId)) {
    return true
  }
  const repoId = link.repoId ?? getRepoIdFromWorktreeId(workspaceId)
  const listing = selectDetectedWorktreesByRepo(state)?.[repoId]
  if (listing?.authoritative !== true) {
    return false
  }
  const repoHosts = new Set(
    (state.repos ?? []).filter((repo) => repo.id === repoId).map(getRepoExecutionHostId)
  )
  return (
    repoHosts.size === 1 &&
    repoHosts.has(hostId) &&
    !listing.worktrees.some((worktree) => worktree.id === workspaceId)
  )
}

/**
 * Where a linked workspace is now: the store's row (found by host and id, or by its durable
 * instance on another host in contact), `missing` when its host proved it gone, else
 * `unverifiable`. The row reference is the store's own, so selectors stay stable.
 */
export function selectLocalTaskWorkspace(
  state: AppState,
  link: LinkPlace
): Worktree | 'missing' | 'unverifiable' {
  const hostId = normalizeExecutionHostId(link.hostId)
  const workspaceId = localTaskLinkWorkspaceId(link)
  if (hostId && workspaceId) {
    const known = state.getKnownWorktreeById(workspaceId, hostId)
    if (known) {
      return known
    }
  }
  if (link.instanceId && link.kind === 'git-worktree') {
    const moved = (worktreesByInstanceId(state).get(link.instanceId) ?? []).find((candidate) =>
      isLocalTaskHostInContact(state, localTaskWorktreeHostId(state, candidate))
    )
    if (moved) {
      return moved
    }
  }
  if (!hostId || !isLocalTaskHostInContact(state, hostId)) {
    return 'unverifiable'
  }
  return isProvenRemoved(state, link, hostId) ? 'missing' : 'unverifiable'
}

type CatalogState = Pick<AppState, 'repos' | 'projectHostSetups'>

export function orcaProjectIdForRepo(
  state: Pick<CatalogState, 'projectHostSetups'>,
  repo: Repo
): string {
  return getProjectHostSetupForRepo(state.projectHostSetups ?? [], repo).projectId
}

/** Hosts an Orca project is on in this window: its repo rows and its ready host setups. */
export function orcaProjectHostIds(state: CatalogState, orcaProjectId: string): ExecutionHostId[] {
  const hosts = new Set<ExecutionHostId>()
  for (const repo of state.repos) {
    if (orcaProjectIdForRepo(state, repo) === orcaProjectId) {
      hosts.add(getRepoExecutionHostId(repo))
    }
  }
  for (const setup of state.projectHostSetups ?? []) {
    if (setup.projectId === orcaProjectId && setup.setupState === 'ready') {
      hosts.add(setup.hostId)
    }
  }
  return [...hosts]
}

/** The Orca projects a workspace belongs to; a folder workspace's project group can hold several. */
export function orcaProjectIdsForWorktree(state: AppState, worktree: Worktree): Set<string> {
  const scope = parseWorkspaceKey(worktree.id)
  if (scope?.type === 'folder') {
    const repos = findFolderWorkspaceCandidateRepos(
      {
        folderWorkspaces: selectFolderWorkspaces(state),
        projectGroups: state.projectGroups,
        repos: state.repos
      },
      scope.folderWorkspaceId
    )
    return new Set(repos.map((repo) => orcaProjectIdForRepo(state, repo)))
  }
  if (worktree.projectId) {
    return new Set([worktree.projectId])
  }
  const repo = state.repos.find((candidate) => candidate.id === worktree.repoId)
  return new Set(repo ? [orcaProjectIdForRepo(state, repo)] : [])
}

/** Whether a client host id is served by this library's Orca: this app, or that paired server. */
export function localTaskEndpointOwnsHost(endpoint: LocalTaskEndpointKey, hostId: string): boolean {
  return localTaskEndpointForHost(hostId) === endpoint
}

/**
 * Repos a task project can work in, on its own library's hosts (D-008): its linked Orca projects
 * (the default first, then in link order), or every project there when it links none. Within one
 * Orca project the host it last ran on comes first.
 */
export function reposForLocalTaskProject(state: AppState, project: LocalTaskProject): Repo[] {
  const endpoint = localTaskIdEndpoint(project.id)
  const linked = new Set(project.repos)
  const inProject = (orcaProjectId: string): boolean =>
    linked.size === 0 || linked.has(orcaProjectId)
  const lastHost = normalizeExecutionHostId(project.lastExecutionHostId)
  const rank = (repo: Repo): number[] => {
    const orcaProjectId = orcaProjectIdForRepo(state, repo)
    const linkOrder = project.repos.indexOf(orcaProjectId)
    return [
      orcaProjectId === project.defaultRepoId ? 0 : 1,
      linkOrder === -1 ? project.repos.length : linkOrder,
      lastHost !== null && getRepoExecutionHostId(repo) === lastHost ? 0 : 1
    ]
  }
  const repos = state.repos.filter(
    (repo) =>
      inProject(orcaProjectIdForRepo(state, repo)) &&
      localTaskEndpointOwnsHost(endpoint, getRepoExecutionHostId(repo))
  )
  for (const setup of state.projectHostSetups ?? []) {
    if (
      !inProject(setup.projectId) ||
      setup.setupState !== 'ready' ||
      !localTaskEndpointOwnsHost(endpoint, setup.hostId)
    ) {
      continue
    }
    if (
      repos.some(
        (repo) => repo.id === setup.repoId && getRepoExecutionHostId(repo) === setup.hostId
      )
    ) {
      continue
    }
    const catalogProject = state.projects.find((candidate) => candidate.id === setup.projectId)
    repos.push({
      id: setup.repoId,
      path: setup.path,
      displayName: setup.displayName,
      badgeColor: catalogProject?.badgeColor ?? 'gray',
      addedAt: setup.createdAt,
      kind: setup.kind,
      connectionId: setup.connectionId,
      executionHostId: setup.hostId,
      worktreeBasePath: setup.worktreeBasePath,
      hookSettings: setup.hookSettings,
      gitUsername: setup.gitUsername,
      sourceControlAi: setup.sourceControlAi
    })
  }
  const ranks = new Map(repos.map((repo) => [repo, rank(repo)]))
  return repos.sort((left, right) => {
    const a = ranks.get(left) ?? []
    const b = ranks.get(right) ?? []
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  })
}

export function isFolderLocalTaskProject(state: AppState, project: LocalTaskProject): boolean {
  const repos = reposForLocalTaskProject(state, project)
  return repos.length > 0 && repos.every(isFolderRepo)
}

export type LocalTaskStartTarget = {
  repo: Repo
  target: WorkspaceCreationTargetHint
  /** The Orca project the workspace is created in. */
  orcaProjectId: string
}

/** The composer's repo and run location in one Orca project: the last host, when set up there. */
function startTargetIn(
  state: AppState,
  project: LocalTaskProject,
  orcaProjectId: string,
  repos: readonly Repo[]
): LocalTaskStartTarget | null {
  const repo = repos[0]
  if (!repo) {
    return null
  }
  const setups = state.projectHostSetups ?? []
  const base = getRepoWorkspaceCreationTargetHint(repo, setups)
  const lastHost = normalizeExecutionHostId(project.lastExecutionHostId)
  if (!lastHost || lastHost === base.hostId) {
    return { repo, target: base, orcaProjectId }
  }
  const setup = setups.find(
    (candidate) => candidate.projectId === base.projectId && candidate.hostId === lastHost
  )
  if (!setup) {
    return { repo, target: base, orcaProjectId }
  }
  const hostRepo =
    repos.find(
      (candidate) => candidate.id === setup.repoId && getRepoExecutionHostId(candidate) === lastHost
    ) ?? repo
  return {
    repo: hostRepo,
    target: { projectId: setup.projectId, hostId: lastHost, projectHostSetupId: setup.id },
    orcaProjectId
  }
}

/**
 * Where Start can create a workspace (REQ-009): one target per git Orca project the task project
 * can work in, the default first. Folder projects are linked, never created.
 */
export function localTaskStartTargets(
  state: AppState,
  project: LocalTaskProject
): LocalTaskStartTarget[] {
  const byOrcaProject = new Map<string, Repo[]>()
  for (const repo of reposForLocalTaskProject(state, project)) {
    if (!isFolderRepo(repo)) {
      const orcaProjectId = orcaProjectIdForRepo(state, repo)
      byOrcaProject.set(orcaProjectId, [...(byOrcaProject.get(orcaProjectId) ?? []), repo])
    }
  }
  return [...byOrcaProject].flatMap(([orcaProjectId, repos]) => {
    const target = startTargetIn(state, project, orcaProjectId, repos)
    return target ? [target] : []
  })
}

/** The Start target in the chosen Orca project, or the default one. */
export function resolveLocalTaskStartTarget(
  state: AppState,
  project: LocalTaskProject,
  orcaProjectId?: string
): LocalTaskStartTarget | null {
  const targets = localTaskStartTargets(state, project)
  return (
    (orcaProjectId
      ? targets.find((target) => target.orcaProjectId === orcaProjectId)
      : targets[0]) ?? null
  )
}
