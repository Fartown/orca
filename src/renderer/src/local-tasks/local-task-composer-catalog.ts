import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { ProjectHostSetup } from '../../../shared/project-types'
import type { Repo } from '../../../shared/repo-types'
import type { WorkspaceCreationTargetHint } from '@/lib/project-host-workspace-target'

/** Adds a task's ready host setup only to its own composer, without changing the app catalog. */
export function resolveLocalTaskComposerCatalog(input: {
  catalogRepos: readonly Repo[]
  catalogSetups: readonly ProjectHostSetup[]
  initialRepoId?: string
  initialTaskRepo?: Repo
  initialWorkspaceTarget?: WorkspaceCreationTargetHint | null
}): { repos: readonly Repo[]; projectHostSetups: readonly ProjectHostSetup[] } {
  const { catalogRepos, catalogSetups, initialRepoId, initialTaskRepo, initialWorkspaceTarget } =
    input
  if (!initialTaskRepo) {
    return { repos: catalogRepos, projectHostSetups: catalogSetups }
  }
  const fallbackHostId = getRepoExecutionHostId(initialTaskRepo)
  if (
    initialWorkspaceTarget?.hostId !== fallbackHostId ||
    initialRepoId !== initialTaskRepo.id ||
    catalogRepos.some(
      (repo) => repo.id === initialTaskRepo.id && getRepoExecutionHostId(repo) === fallbackHostId
    )
  ) {
    return { repos: catalogRepos, projectHostSetups: catalogSetups }
  }
  return {
    repos: [...catalogRepos, initialTaskRepo],
    projectHostSetups: catalogSetups.filter(
      (setup) =>
        setup.repoId !== initialTaskRepo.id ||
        setup.hostId === fallbackHostId ||
        catalogRepos.some(
          (repo) => repo.id === setup.repoId && getRepoExecutionHostId(repo) === setup.hostId
        )
    )
  }
}
