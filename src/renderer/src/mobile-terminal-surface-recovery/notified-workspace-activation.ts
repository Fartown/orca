import { activateAndRevealWorkspace, activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'

export async function refreshNotifiedWorkspaceCatalog(
  workspaceId: string,
  repoId: string,
  executionHostId?: ExecutionHostId
): Promise<void> {
  const state = useAppStore.getState()
  if (parseWorkspaceKey(workspaceId)?.type === 'folder') {
    await state.fetchReposForAllHosts()
  } else {
    await (executionHostId
      ? state.fetchWorktrees(repoId, { executionHostId })
      : state.fetchWorktrees(repoId))
  }
}

export function activateNotifiedWorkspace(
  workspaceId: string,
  options: Parameters<typeof activateAndRevealWorktree>[1]
): ReturnType<typeof activateAndRevealWorktree> {
  return parseWorkspaceKey(workspaceId)?.type === 'folder'
    ? activateAndRevealWorkspace(workspaceId, options)
    : activateAndRevealWorktree(workspaceId, options)
}
