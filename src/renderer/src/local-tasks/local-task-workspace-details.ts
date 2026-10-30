import { useAppStore } from '@/store'
import { normalizeExecutionHostId } from '../../../shared/execution-host'

/** `modalData` flag: Orca's workspace details opens on its Local tasks tab. */
export const LOCAL_TASK_DETAILS_TAB_KEY = 'localTaskTab'

/**
 * 关联到任务… from a workspace menu or a session chip (REQ-011): Orca's own workspace details,
 * focused on linked work and on the Local tasks tab, the way the card's "Add reference" opens it.
 */
export function openLocalTaskWorkspaceDetails(target: {
  worktreeId: string
  hostId: string
}): void {
  const state = useAppStore.getState()
  const hostId = normalizeExecutionHostId(target.hostId)
  const worktree = state.getKnownWorktreeById(target.worktreeId, hostId ?? undefined)
  state.openModal('edit-meta', {
    worktreeId: target.worktreeId,
    ...(worktree ? { repoId: worktree.repoId } : {}),
    ...(hostId ? { executionHostId: hostId } : {}),
    focus: 'links',
    [LOCAL_TASK_DETAILS_TAB_KEY]: true
  })
}
