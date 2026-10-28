import type { ExecutionHostId } from '../../../src/shared/execution-host'
import { projectGroupIdFromRepoId } from '../../../src/shared/folder-workspace-worktree'
import type { LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import type { ServedProjectSections } from '../worktree/project-sections-operations'
import { localTaskOwnerHostId, type LocalTaskEndpoint } from './local-task-endpoint'

/** One Orca project's checkout on the library's host, as the paired host's catalog lists it. */
export type LocalTaskSetup = {
  /** As the phone's lists name the host: `runtime:E` for a server's checkout. */
  hostId: ExecutionHostId
  /** As the library's owner names it (`local`, `ssh:{t}`); what links and launches record. */
  ownerHostId: string
  orcaProjectId: string
  repoId: string
  /** A folder project has no git repo: nothing is created for it, only linked. */
  kind: 'git' | 'folder'
  label: string
  /** The project group its folder workspaces file under, when the repo has one. */
  projectGroupId: string | null
}

/**
 * The checkouts on the library's own host of the given Orca projects, in that order; every project
 * on the host when the list is empty, for a project without repos (REQ-001, REQ-009).
 */
export function localTaskSetupsFor(
  catalog: ServedProjectSections,
  endpoint: LocalTaskEndpoint,
  orcaProjectIds: readonly string[]
): LocalTaskSetup[] {
  const groupByRepo = new Map(catalog.repos.map((repo) => [repo.id, repo.projectGroupId ?? null]))
  const rank = new Map(orcaProjectIds.map((id, index) => [id, index]))
  return catalog.setups
    .flatMap((setup): LocalTaskSetup[] => {
      const hostId = setup.executionHostId ?? setup.hostId
      const ownerHostId = localTaskOwnerHostId(endpoint, hostId)
      if (ownerHostId === null || (rank.size > 0 && !rank.has(setup.projectId))) {
        return []
      }
      return [
        {
          hostId,
          ownerHostId,
          orcaProjectId: setup.projectId,
          repoId: setup.repoId,
          kind: setup.kind === 'folder' ? 'folder' : 'git',
          label: setup.displayName,
          projectGroupId: groupByRepo.get(setup.repoId) ?? null
        }
      ]
    })
    .sort((a, b) => (rank.get(a.orcaProjectId) ?? 0) - (rank.get(b.orcaProjectId) ?? 0))
}

/**
 * Where Start creates by default: the default repo on the host it last ran on, else the default
 * repo, else the last host, else the first git checkout. Folder checkouts are never a Start target.
 */
export function pickLocalTaskStartSetup(
  setups: readonly LocalTaskSetup[],
  project: Pick<LocalTaskProject, 'lastExecutionHostId' | 'defaultRepoId'>
): LocalTaskSetup | null {
  const git = setups.filter((setup) => setup.kind === 'git')
  const isDefault = (setup: LocalTaskSetup) => setup.orcaProjectId === project.defaultRepoId
  const ranLast = (setup: LocalTaskSetup) => setup.ownerHostId === project.lastExecutionHostId
  return (
    git.find((setup) => isDefault(setup) && ranLast(setup)) ??
    git.find(isDefault) ??
    git.find(ranLast) ??
    git[0] ??
    null
  )
}

/** The Orca project a workspace row's repository belongs to, folder groups included. */
export function localTaskOrcaProjectForRepo(
  catalog: ServedProjectSections,
  repoId: string
): string | null {
  const folderGroup = projectGroupIdFromRepoId(repoId)
  const repoIds = folderGroup
    ? new Set(
        catalog.repos.filter((repo) => repo.projectGroupId === folderGroup).map((repo) => repo.id)
      )
    : new Set([repoId])
  return catalog.setups.find((setup) => repoIds.has(setup.repoId))?.projectId ?? null
}
