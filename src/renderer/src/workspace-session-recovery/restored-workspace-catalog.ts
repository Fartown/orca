import type { Repo } from '../../../shared/repo-types'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import { restorableWorkspaceIds } from '../../../shared/workspace-session-recovery/restorable-workspaces'
import type { AppState } from '../store/types'
import { selectWorktreesByRepo } from '../store/workspace-record-selectors'
import { buildRuntimeSessionPlaceholders } from '../store/terminals/workspace-terminal-placeholders'

type RecoveryState = Pick<
  AppState,
  | 'repos'
  | 'worktreesByRepo'
  | 'sortEpoch'
  | 'restoredRuntimeHostIdByWorkspaceSessionKey'
  | 'tabsByWorktree'
  | 'unifiedTabsByWorktree'
  | 'openFiles'
  | 'browserTabsByWorktree'
  | 'browserPagesByWorkspace'
  | 'sleepingAgentSessionsByPaneKey'
>

export function reconcileRestoredWorkspaceCatalog(
  state: RecoveryState,
  repos: readonly Repo[],
  hostId: ExecutionHostId
): { repos: readonly Repo[] } & Pick<AppState, 'worktreesByRepo' | 'sortEpoch'> {
  const previousWorktrees = selectWorktreesByRepo(state)
  let worktreesByRepo = previousWorktrees
  if (parseExecutionHostId(hostId)?.kind !== 'runtime') {
    return { repos, worktreesByRepo, sortEpoch: state.sortEpoch }
  }
  const contentIds = restorableWorkspaceIds({
    tabsByWorktree: state.tabsByWorktree,
    unifiedTabs: state.unifiedTabsByWorktree,
    browserTabsByWorktree: state.browserTabsByWorktree,
    browserPagesByWorkspace: state.browserPagesByWorkspace,
    sleepingAgentSessionsByPaneKey: state.sleepingAgentSessionsByPaneKey
  })
  for (const file of state.openFiles) {
    contentIds.add(file.worktreeId)
  }
  const knownRepoIds = new Set(
    repos.filter((repo) => getRepoExecutionHostId(repo) === hostId).map((repo) => repo.id)
  )
  const owners = state.restoredRuntimeHostIdByWorkspaceSessionKey
  const retainedOwners: Record<string, ExecutionHostId> = {}
  const retainedRepoIds = new Set<string>()
  for (const [repoId, rows] of Object.entries(worktreesByRepo)) {
    if (knownRepoIds.has(repoId)) {
      continue
    }
    const retained = rows.filter((row) => {
      const owner = owners[row.id] ?? owners[`worktree:${row.id}`]
      if (row.hostId !== hostId || owner !== hostId) {
        return true
      }
      if (contentIds.has(row.id)) {
        retainedOwners[row.id] = hostId
        retainedRepoIds.add(repoId)
        return true
      }
      return false
    })
    if (retained.length === rows.length) {
      continue
    }
    if (worktreesByRepo === previousWorktrees) {
      worktreesByRepo = { ...worktreesByRepo }
    }
    if (retained.length > 0) {
      worktreesByRepo[repoId] = retained
    } else {
      delete worktreesByRepo[repoId]
    }
  }
  const recoveryRepos = state.repos.filter(
    (repo) => getRepoExecutionHostId(repo) === hostId && retainedRepoIds.has(repo.id)
  )
  const restored = buildRuntimeSessionPlaceholders({
    repos: recoveryRepos.length > 0 ? [...repos, ...recoveryRepos] : repos,
    worktreesByRepo,
    runtimeHostIdByWorkspaceSessionKey: retainedOwners
  })
  return {
    ...restored,
    sortEpoch: state.sortEpoch + (selectWorktreesByRepo(restored) === previousWorktrees ? 0 : 1)
  }
}
