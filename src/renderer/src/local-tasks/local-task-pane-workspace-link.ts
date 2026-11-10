import { useAppStore } from '@/store'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { LocalTaskWorkspaceLink } from '../../../shared/local-tasks/local-task-link-types'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'
import { useLocalTasksDomain } from './local-tasks-domain-store'

/** A pane's workspace link, matched as the sidebar card matches it: instance, then host and id. */
export function useLocalTaskPaneWorkspaceLink(worktreeId: string): {
  hostId: ExecutionHostId
  link: LocalTaskWorkspaceLink | null
} {
  const hostId = useAppStore((state) => getExecutionHostIdForWorktree(state, worktreeId))
  const instanceId = useAppStore(
    (state) => state.getKnownWorktreeById(worktreeId, hostId)?.instanceId
  )
  const link = useLocalTasksDomain((state) =>
    findLocalTaskLinkForWorkspace(state.links, {
      id: worktreeId,
      hostId,
      ...(instanceId ? { instanceId } : {})
    })
  )
  return { hostId, link }
}
