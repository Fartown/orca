import type {
  PluginViewReply,
  PluginViewRequest
} from '../../../shared/plugins/view/plugin-view-protocol'
import { projectPluginFocusedWorkspace } from '../../../shared/plugin-workspace-remote/plugin-workspace-remote'
import { useAppStore } from '@/store'
import { getIndexedWorktreeMap } from '@/store/slices/worktrees/listing/worktree-catalog-index'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'

/** The focused worktree as this window lists it, whichever host owns it. */
export function readPluginFocusedWorkspace(
  request: Extract<PluginViewRequest, { kind: 'read-focused-workspace' }>
): PluginViewReply {
  const state = useAppStore.getState()
  const worktree = state.activeWorktreeId
    ? getIndexedWorktreeMap(selectWorktreesByRepo(state)).get(state.activeWorktreeId)
    : undefined
  return {
    requestId: request.requestId,
    ok: true,
    workspace: projectPluginFocusedWorkspace(worktree, state.repos)
  }
}
